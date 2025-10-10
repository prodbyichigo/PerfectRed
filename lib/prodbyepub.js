class EPUBReader {
  constructor() {
    this.zip = null;
    this.metadata = {};
    this.manifest = {};
    this.spine = [];
    this.toc = [];
    this.currentChapterIndex = 0;
    this.rootPath = '';
  }

  async loadEPUB(file) {
    const JSZip = window.JSZip;
    if (!JSZip) {
      throw new Error('JSZip library required. Include: https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }

    try {
      this.zip = await JSZip.loadAsync(file);
      await this.parseContainer();
      await this.parseOPF();
      return this.metadata;
    } catch (error) {
      throw new Error(`Failed to load EPUB: ${error.message}`);
    }
  }

  async parseContainer() {
    const containerXML = await this.zip.file('META-INF/container.xml').async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(containerXML, 'text/xml');
    const rootfile = doc.querySelector('rootfile');
    this.opfPath = rootfile.getAttribute('full-path');
    this.rootPath = this.opfPath.substring(0, this.opfPath.lastIndexOf('/') + 1);
  }

  async parseOPF() {
    const opfContent = await this.zip.file(this.opfPath).async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(opfContent, 'text/xml');

    // Parse metadata
    const metadata = doc.querySelector('metadata');
    this.metadata = {
      title: metadata.querySelector('title')?.textContent || 'Unknown',
      author: metadata.querySelector('creator')?.textContent || 'Unknown',
      language: metadata.querySelector('language')?.textContent || 'en',
      publisher: metadata.querySelector('publisher')?.textContent || '',
      date: metadata.querySelector('date')?.textContent || ''
    };

    // Parse manifest
    const manifestItems = doc.querySelectorAll('manifest item');
    manifestItems.forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type');
      this.manifest[id] = { href, mediaType };
    });

    // Parse spine
    const spineItems = doc.querySelectorAll('spine itemref');
    spineItems.forEach(item => {
      const idref = item.getAttribute('idref');
      if (this.manifest[idref]) {
        this.spine.push({
          id: idref,
          href: this.manifest[idref].href
        });
      }
    });

    // Parse TOC if available
    await this.parseTOC(doc);
  }

  async parseTOC(opfDoc) {
    try {
      const tocId = opfDoc.querySelector('spine')?.getAttribute('toc');
      if (tocId && this.manifest[tocId]) {
        const tocPath = this.rootPath + this.manifest[tocId].href;
        const tocContent = await this.zip.file(tocPath).async('string');
        const parser = new DOMParser();
        const tocDoc = parser.parseFromString(tocContent, 'text/xml');
        
        const navPoints = tocDoc.querySelectorAll('navPoint');
        navPoints.forEach(point => {
          const label = point.querySelector('navLabel text')?.textContent;
          const src = point.querySelector('content')?.getAttribute('src');
          if (label && src) {
            this.toc.push({ label, src: src.split('#')[0] });
          }
        });
      }
    } catch (error) {
      console.warn('Could not parse TOC:', error);
    }
  }

  async getChapter(index) {
    if (index < 0 || index >= this.spine.length) {
      throw new Error('Chapter index out of bounds');
    }

    const chapter = this.spine[index];
    const path = this.rootPath + chapter.href;
    const content = await this.zip.file(path).async('string');
    
    this.currentChapterIndex = index;
    return this.processChapterContent(content, path);
  }

  processChapterContent(html, chapterPath) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Fix relative paths for images and stylesheets
    const basePath = chapterPath.substring(0, chapterPath.lastIndexOf('/') + 1);
    
    doc.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http')) {
        img.setAttribute('data-epub-src', this.rootPath + basePath + src);
      }
    });

    doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('http')) {
        link.setAttribute('data-epub-href', this.rootPath + basePath + href);
      }
    });

    return doc.body.innerHTML;
  }

  async getResource(path) {
    const fullPath = this.rootPath + path;
    const file = this.zip.file(fullPath);
    if (!file) return null;

    const content = await file.async('base64');
    const ext = path.split('.').pop().toLowerCase();
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'css': 'text/css'
    };

    return `data:${mimeTypes[ext] || 'application/octet-stream'};base64,${content}`;
  }

  async nextChapter() {
    if (this.currentChapterIndex < this.spine.length - 1) {
      return await this.getChapter(this.currentChapterIndex + 1);
    }
    return null;
  }

  async previousChapter() {
    if (this.currentChapterIndex > 0) {
      return await this.getChapter(this.currentChapterIndex - 1);
    }
    return null;
  }

  getTableOfContents() {
    return this.toc.length > 0 ? this.toc : this.spine.map((ch, i) => ({
      label: `Chapter ${i + 1}`,
      src: ch.href
    }));
  }

  getMetadata() {
    return this.metadata;
  }

  getProgress() {
    return {
      current: this.currentChapterIndex + 1,
      total: this.spine.length,
      percentage: ((this.currentChapterIndex + 1) / this.spine.length * 100).toFixed(1)
    };
  }

  hasNextChapter() {
    return this.currentChapterIndex < this.spine.length - 1;
  }

  hasPreviousChapter() {
    return this.currentChapterIndex > 0;
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EPUBReader;
}
// Usage example:
/*
const reader = new EPUBReader();

// Load EPUB file (from input element)
document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  
  try {
    const metadata = await reader.loadEPUB(file);
    console.log('Book loaded:', metadata);
    
    // Display first chapter
    const content = await reader.getChapter(0);
    document.getElementById('content').innerHTML = content;
    
    // Load images
    const imgs = document.querySelectorAll('img[data-epub-src]');
    for (const img of imgs) {
      const src = img.getAttribute('data-epub-src');
      const dataUrl = await reader.getResource(src);
      if (dataUrl) img.src = dataUrl;
    }
    
    // Get table of contents
    const toc = reader.getTableOfContents();
    console.log('TOC:', toc);
    
  } catch (error) {
    console.error('Error loading EPUB:', error);
  }
});

// Navigation
document.getElementById('nextBtn').addEventListener('click', async () => {
  if (reader.hasNextChapter()) {
    const content = await reader.nextChapter();
    document.getElementById('content').innerHTML = content;
  }
});
*/