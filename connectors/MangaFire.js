const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');
const fs = require('fs').promises;
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

class MangaFireDownloader {
    constructor() {
        this.baseUrl = 'https://mangafire.to';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://mangafire.to/'
        };
        this.idRegex = /manga\/[^.]+\.(\w+)/;
    }

    // Helper: Wait/delay function
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Helper: Fetch and parse HTML
    async fetchHTML(url) {
        const response = await fetch(url, { headers: this.headers });
        const html = await response.text();
        const dom = new JSDOM(html);
        return dom.window.document;
    }

    // Helper: Fetch JSON
    async fetchJSON(url) {
        const response = await fetch(url, { headers: this.headers });
        return await response.json();
    }

    // Search for manga by name
    async searchManga(searchTerm) {
        const results = [];
        const url = `${this.baseUrl}/filter?keyword=${encodeURIComponent(searchTerm)}`;
        const doc = await this.fetchHTML(url);
        const mangaLinks = doc.querySelectorAll('div.info > a');
        
        mangaLinks.forEach(link => {
            results.push({
                id: link.getAttribute('href'),
                title: link.textContent.trim(),
                url: `${this.baseUrl}${link.getAttribute('href')}`
            });
        });
        
        return results;
    }

    // Get manga details
    async getMangaDetails(mangaPath) {
        const url = `${this.baseUrl}${mangaPath}`;
        const doc = await this.fetchHTML(url);
        const title = doc.querySelector('div.info h1[itemprop="name"]')?.textContent.trim();
        
        return {
            id: mangaPath,
            title: title,
            url: url
        };
    }

    // Get all chapters for a manga
    async getChapters(mangaPath) {
        const id = mangaPath.match(this.idRegex)[1];
        const mangaUrl = `${this.baseUrl}${mangaPath}`;
        const doc = await this.fetchHTML(mangaUrl);
        
        // Get available languages
        const languageElements = doc.querySelectorAll('section.m-list div.dropdown-menu a');
        const languages = [...new Set(
            Array.from(languageElements).map(el => el.dataset.code.toLowerCase())
        )];

        const chapterList = [];
        const types = ['chapter', 'volume'];

        for (const language of languages) {
            for (const type of types) {
                const url = `${this.baseUrl}/ajax/read/${id}/${type}/${language}`;
                try {
                    const data = await this.fetchJSON(url);
                    const dom = new JSDOM(data.result.html);
                    const chapterNodes = dom.window.document.querySelectorAll('a');
                    
                    Array.from(chapterNodes)
                        .filter(anchor => anchor.pathname.includes(`/${type}-`))
                        .forEach(chapter => {
                            chapterList.push({
                                id: chapter.dataset.id,
                                type: type,
                                title: chapter.textContent.trim(),
                                language: language,
                                url: `${this.baseUrl}${chapter.pathname}`
                            });
                        });
                } catch (error) {
                    console.log(`No ${type}s found for language: ${language}`);
                }
            }
        }
        
        return chapterList;
    }

    // Get pages/images for a chapter
    async getPages(chapterId, chapterType) {
        const url = `${this.baseUrl}/ajax/read/${chapterType}/${chapterId}`;
        const data = await this.fetchJSON(url);
        return data.result.images;
    }

    // Reverse scrambled image
    async reverseImage(imageUrl, scrambleLevel) {
        const image = await loadImage(imageUrl);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, image.width, image.height);

        const f = 5;
        const s = Math.min(200, Math.ceil(image.width / f));
        const h = Math.min(200, Math.ceil(image.height / f));
        const W = Math.ceil(image.width / s) - 1;
        const d = Math.ceil(image.height / h) - 1;
        
        for (let y = 0; y <= d; y++) {
            for (let m = 0; m <= W; m++) {
                let x = m;
                let l = y;
                
                if (m < W) {
                    x = (W - m + scrambleLevel) % W;
                }
                if (y < d) {
                    l = (d - y + scrambleLevel) % d;
                }

                ctx.drawImage(
                    image,
                    x * s,
                    l * h,
                    Math.min(s, image.width - m * s),
                    Math.min(h, image.height - y * h),
                    m * s,
                    y * h,
                    Math.min(s, image.width - m * s),
                    Math.min(h, image.height - y * h)
                );
            }
        }
        
        return canvas;
    }

    // Download a single page
    async downloadPage(imageData, outputPath) {
        const [imageUrl, , scrambleLevel] = imageData;
        
        if (scrambleLevel < 1) {
            // Direct download - no scrambling
            const response = await fetch(imageUrl, { headers: this.headers });
            const buffer = await response.buffer();
            await fs.writeFile(outputPath, buffer);
        } else {
            // Reverse scrambled image
            const canvas = await this.reverseImage(imageUrl, scrambleLevel);
            const buffer = canvas.toBuffer('image/png');
            await fs.writeFile(outputPath, buffer);
        }
    }

    // Download entire chapter
    async downloadChapter(chapterId, chapterType, outputDir) {
        console.log(`Downloading chapter ${chapterId}...`);
        
        const pages = await this.getPages(chapterId, chapterType);
        await fs.mkdir(outputDir, { recursive: true });
        
        for (let i = 0; i < pages.length; i++) {
            const outputPath = path.join(outputDir, `page_${String(i + 1).padStart(3, '0')}.png`);
            console.log(`  Downloading page ${i + 1}/${pages.length}...`);
            
            try {
                await this.downloadPage(pages[i], outputPath);
            } catch (error) {
                console.error(`  Error downloading page ${i + 1}:`, error.message);
            }
            
            await this.wait(500); // Rate limiting
        }
        
        console.log(`Chapter downloaded to: ${outputDir}`);
    }

    // Download multiple chapters
    async downloadManga(mangaPath, outputBaseDir, options = {}) {
        const { language = 'en', startChapter = 1, endChapter = null } = options;
        
        const manga = await this.getMangaDetails(mangaPath);
        console.log(`Downloading: ${manga.title}`);
        
        const chapters = await this.getChapters(mangaPath);
        const filteredChapters = chapters
            .filter(ch => ch.language === language)
            .slice(startChapter - 1, endChapter || chapters.length);
        
        console.log(`Found ${filteredChapters.length} chapters`);
        
        for (const chapter of filteredChapters) {
            const chapterDir = path.join(outputBaseDir, manga.title, chapter.title);
            await this.downloadChapter(chapter.id, chapter.type, chapterDir);
            await this.wait(1000); // Rate limiting between chapters
        }
    }
}

// Usage Example:
/*
const MangaFireDownloader = require('./mangafire-downloader');
const downloader = new MangaFireDownloader();

// Search for manga
downloader.searchManga('one piece').then(results => {
    console.log(results);
});

// Download chapters
downloader.downloadManga(
    '/manga/one-piece.abcd',
    './downloads',
    { language: 'en', startChapter: 1, endChapter: 5 }
).then(() => {
    console.log('Download complete!');
});
*/

module.exports = MangaFireDownloader;