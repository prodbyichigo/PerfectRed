require('dotenv').config({ silent: true });
const express = require('express');
const path = require('path');
const fs = require('fs');
const AdmZip = require("adm-zip");
const os = require('os');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const db = require('./database/database.js');
const MangaDex = require('./api/mangadex.js'); 
const SQLiteStore = require('connect-sqlite3')(session); 
const mangadex = new MangaDex(); 
const readline = require('readline');
const stdcout = require('./lib/stdcout.js')

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================
function checkAuthenticated(req, res, next) { 
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  next();
}

function apiAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ success: false, error: 'Not authenticated' });
}

const initialisePassport = require('./database/passport-config.js');
const { privateDecrypt } = require('crypto');
const { configDotenv } = require('dotenv');

initialisePassport(
  passport,
  username => db.getUserByUsername(username),
  id => db.getUserById(id)
);

// ============================================================
// CONFIGURATION
// ============================================================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const VERSION = 'v0.0.2B';
const MEDIA_EXTENSIONS = ['.txt', '.cbz', '.epub', '.pdf', '.jpg', '.png', '.jpeg', '.gif', '.zip', '.webm'];
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-in-production'; 

if (SESSION_SECRET === 'change-this-secret-in-production') {
  console.warn('⚠️  WARNING: Using default session secret. Set SESSION_SECRET in .env file!');
}

// ============================================================
// APP INITIALIZATION
// ============================================================
const app = express();
const startTime = Date.now();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.use(express.static("views"));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/manga', express.static(path.join(__dirname, 'data')));
app.use(cookieParser());

const PRIVATE_DIR = path.join(__dirname, 'database/private');
if (!fs.existsSync(PRIVATE_DIR)) {
  console.log('[APP] Creating private directory for sessions...');
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
}
app.use(session({
  store: new SQLiteStore({ 
    db: 'sessions.db',
    dir: './database/private',
    table: 'sessions'
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.locals.version = VERSION;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function getNetworkIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

function getUptime() {
    const uptimeMs = Date.now() - startTime;
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    return {
        days: days,
        hours: hours % 24,
        minutes: minutes % 60,
        seconds: seconds % 60,
        totalSeconds: seconds,
        startTime: startTime
    };
}

function loadFavicon() {
    const faviconPath = path.join(__dirname, 'public', 'favicon.png');
    return fs.readFileSync(faviconPath).toString('base64');
}

function getLibraryContent(folderPath = '') {
    const baseDir = path.join(__dirname, 'data', folderPath);
    
    if (!fs.existsSync(baseDir)) {
        return { mangaFolders: [], animeFolders: [], files: [] };
    }

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const mangaFolders = [];
    const animeFolders = [];
    const files = [];

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const folderFullPath = path.join(baseDir, entry.name);
            const folderFiles = fs.existsSync(folderFullPath)
                ? fs.readdirSync(folderFullPath)
                : [];
            
            const hasWebm = folderFiles.some(f => 
                path.extname(f).toLowerCase() === '.webm'
            );
            
            const mediaFiles = folderFiles.filter(f => 
                MEDIA_EXTENSIONS.includes(path.extname(f).toLowerCase())
            );
            
            const folderData = {
                name: entry.name,
                path: folderPath ? `${folderPath}/${entry.name}` : entry.name,
                fileCount: mediaFiles.length
            };
            
            if (hasWebm) {
                animeFolders.push(folderData);
            } else if (mediaFiles.length > 0) {
                mangaFolders.push(folderData);
            }
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (MEDIA_EXTENSIONS.includes(ext)) {
                files.push({
                    name: entry.name,
                    path: folderPath ? `${folderPath}/${entry.name}` : entry.name,
                    type: ext
                });
            }
        }
    }

    mangaFolders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    animeFolders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    return { mangaFolders, animeFolders, files };
}

function findFolderCover(folderPath) {
    const folderFullPath = path.join(__dirname, 'data', folderPath);
    const filesInFolder = fs.existsSync(folderFullPath)
        ? fs.readdirSync(folderFullPath)
        : [];

    let coverFile = filesInFolder.find(f =>
        ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(f).toLowerCase())
    );

    if (!coverFile) {
        const archiveFile = filesInFolder.find(f => 
            ['.zip', '.cbz'].includes(path.extname(f).toLowerCase())
        );
        
        if (archiveFile) {
            const zipPath = path.join(folderFullPath, archiveFile);
            try {
                const zip = new AdmZip(zipPath);
                const firstImageEntry = zip.getEntries().find(e =>
                    ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(e.entryName).toLowerCase())
                );
                
                if (firstImageEntry) {
                    return `/manga-zip/${folderPath}/${archiveFile}/${firstImageEntry.entryName}`;
                }
            } catch (err) {
                console.error('Error reading archive:', zipPath, err);
            }
        }
    }

    return coverFile 
        ? (coverFile.startsWith('/') ? coverFile : `/manga/${folderPath}/${coverFile}`) 
        : null;
}

function generateBreadcrumbs(folderPath) {
    const breadcrumbs = [];
    
    if (folderPath) {
        const parts = folderPath.split('/');
        let currentPath = '';
        
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            breadcrumbs.push({ name: part, path: currentPath });
        }
    }
    
    return breadcrumbs;
}

function getMimeType(ext) {
    const types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webm': 'video/webm',
        '.pdf': 'application/pdf',
        '.cbz': 'application/x-cbz',
        '.zip': 'application/zip',
        '.epub': 'application/epub+zip',
        '.txt': 'text/plain; charset=utf-8'
    };
    return types[ext] || 'application/octet-stream';
}

const faviconBase64 = loadFavicon();

// ============================================================
// AUTHENTICATION ROUTES
// ============================================================

app.get('/login', checkNotAuthenticated, (req, res) => {
  res.render('login', { faviconBase64 });
});

app.post('/login', checkNotAuthenticated,
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: false 
  })
);

app.get('/register', checkNotAuthenticated, (req, res) => {
  res.render('register', { faviconBase64 });
});

app.post('/register', checkNotAuthenticated, async (req, res) => {
  try {
    const hashedPass = await bcrypt.hash(req.body.password, 10);
    const result = db.createUser(Date.now().toString(), req.body.username, hashedPass);
    
    if (result.success) {
      res.redirect('/login');
    } else {
      res.redirect('/register');
    }
  } catch {
    res.redirect('/register');
  }
});

app.post('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

// ============================================================
// PAGE ROUTES
// ============================================================

app.get('/', checkAuthenticated, (req, res) => {
  res.render('index', { faviconBase64 });
});

app.get('/reader', checkAuthenticated, (req, res) => {
    const { series, chapter, file, name } = req.query;
    
    res.render('reader', {
        faviconBase64,
        seriesId: series || null,
        chapter: chapter || null,
        file: file || null,
        fileName: name || null
    });
});

app.get('/player', checkAuthenticated, (req, res) => {
  const { file, name } = req.query;
  
  res.render('player', {
    faviconBase64,
    version: VERSION,
    filePath: file || null,
    fileName: name || null
  });
});

app.get('/settings', checkAuthenticated, (req, res) => {
  res.render('settings', { faviconBase64, username: req.user.username });
});

app.get('/statistics', checkAuthenticated, (req, res) => {
  res.render('statistics', { faviconBase64 });
});

app.get('/webscrape', checkAuthenticated, async (req, res) => {
  try {
    const popularManga = await mangadex.fetchPopularManga(50);
    res.render('webscrape', { 
      manga: popularManga,
      version: Date.now()
    });
  } catch (error) {
    console.error('Error fetching manga:', error);
    res.status(500).send('Error loading manga data');
  }
});

app.get('/library', checkAuthenticated, (req, res) => {
    const folderPath = req.query.folder || '';
    const content = getLibraryContent(folderPath);

    const mangaFoldersWithCovers = content.mangaFolders.map(folder => ({
        ...folder,
        cover: findFolderCover(folder.path)
    }));
    
    const animeFoldersWithCovers = content.animeFolders.map(folder => ({
        ...folder,
        cover: findFolderCover(folder.path)
    }));

    const breadcrumbs = generateBreadcrumbs(folderPath);

    res.render('library', {
        mangaFolders: mangaFoldersWithCovers,
        animeFolders: animeFoldersWithCovers,
        files: content.files,
        currentFolder: folderPath,
        breadcrumbs,
        faviconBase64
    });
});

// ============================================================
// API ROUTES - STATISTICS
// ============================================================
app.get('/api/statistics/manga', apiAuthenticated, (req, res) => {
  try {
    const manga = db.getMangaStatistics(req.user.id);
    res.json({ success: true, manga });
  } catch (err) {
    console.error('Error getting manga statistics:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get('/api/statistics', apiAuthenticated, (req, res) => {
  try {
    const stats = db.getStatistics(req.user.username);
    
    if (!stats) {
      return res.json({ 
        success: true, 
        statistics: { 
          username: req.user.username,
          minutes_spent_reading: 0, 
          pages_read: 0 
        } 
      });
    }
    
    res.json({ success: true, statistics: stats });
  } catch (err) {
    console.error('Error getting statistics:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/statistics', apiAuthenticated, (req, res) => {
  try {
    const { minutes, pages } = req.body;
    
    if (minutes === undefined || pages === undefined) {
      return res.status(400).json({ success: false, error: 'Missing minutes or pages' });
    }
    
    if (typeof minutes !== 'number' || typeof pages !== 'number' || minutes < 0 || pages < 0) {
      return res.status(400).json({ success: false, error: 'Invalid values for minutes or pages' });
    }
    
    const result = db.saveStatistics(req.user.username, minutes, pages);
    res.json(result);
  } catch (err) {
    console.error('Error saving statistics:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/statistics', apiAuthenticated, (req, res) => {
  try {
    const result = db.deleteStatistics(req.user.username);
    res.json(result);
  } catch (err) {
    console.error('Error deleting statistics:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// API ROUTES - PROGRESS TRACKING
// ============================================================

app.get('/api/progress/reading', apiAuthenticated, (req, res) => {
  try {
    const progress = db.getReadingProgress(req.user.id, 20);
    res.json({ success: true, progress });
  } catch (err) {
    console.error('Error getting reading progress:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/progress/reading', apiAuthenticated, (req, res) => {
  try {
    const { filePath, fileName, currentPage, totalPages, fileType } = req.body;
    
    if (!filePath || !fileName || currentPage === undefined || !totalPages) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const result = db.saveReadingProgress(
      req.user.id,
      filePath,
      fileName,
      currentPage,
      totalPages,
      fileType || 'cbz'
    );
    
    res.json(result);
  } catch (err) {
    console.error('Error saving reading progress:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/progress/reading', apiAuthenticated, (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'Missing filePath' });
    }
    
    const result = db.deleteReadingProgress(req.user.id, filePath);
    res.json(result);
  } catch (err) {
    console.error('Error deleting reading progress:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/progress/video', apiAuthenticated, (req, res) => {
  try {
    const progress = db.getVideoProgress(req.user.id, 20);
    res.json({ success: true, progress });
  } catch (err) {
    console.error('Error getting video progress:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/progress/video', apiAuthenticated, (req, res) => {
  try {
    const { filePath, fileName, currentTime, duration } = req.body;
    
    if (!filePath || !fileName || currentTime === undefined || !duration) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const result = db.saveVideoProgress(
      req.user.id,
      filePath,
      fileName,
      currentTime,
      duration
    );
    
    res.json(result);
  } catch (err) {
    console.error('Error saving video progress:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/progress/video', apiAuthenticated, (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'Missing filePath' });
    }
    
    const result = db.deleteVideoProgress(req.user.id, filePath);
    res.json(result);
  } catch (err) {
    console.error('Error deleting video progress:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/video-progress/:filePath', apiAuthenticated, (req, res) => {
  try {
    const filePath = decodeURIComponent(req.params.filePath);
    const progress = db.getVideoProgressForFile(req.user.id, filePath);
    
    if (!progress) {
      return res.json({ success: true, current_time: 0, duration: 0 });
    }
    
    res.json({ success: true, ...progress });
  } catch (err) {
    console.error('Error getting video progress:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// API ROUTES - LIBRARY
// ============================================================

app.get('/api/library', apiAuthenticated, (req, res) => {
  try {
    function getAllFiles(dirPath, arrayOfFiles = []) {
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
          getAllFiles(fullPath, arrayOfFiles);
        } else {
          const ext = path.extname(file.name).toLowerCase();
          if (MEDIA_EXTENSIONS.includes(ext)) {
            const relativePath = path.relative(path.join(__dirname, 'data'), fullPath);
            arrayOfFiles.push({
              name: file.name,
              path: relativePath.replace(/\\/g, '/')
            });
          }
        }
      }
      
      return arrayOfFiles;
    }
    
    const dataDir = path.join(__dirname, 'data');
    const allFiles = getAllFiles(dataDir);
    
    allFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    
    res.json({ 
      success: true, 
      files: allFiles 
    });
  } catch (err) {
    console.error('Error getting library files:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/folder', apiAuthenticated, (req, res) => {
    try {
        const folderPath = req.query.path || '';
        const content = getLibraryContent(folderPath);
        res.json(content);
    } catch (error) {
        console.error('Error fetching folder contents:', error);
        res.status(500).json({ error: 'Failed to fetch folder contents' });
    }
});

app.get('/api/folder-contents', apiAuthenticated, (req, res) => {
  try {
    const folderPath = req.query.folder || '';
    const content = getLibraryContent(folderPath);
    res.json({ success: true, ...content });
  } catch (err) {
    console.error('Error getting folder contents:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// API ROUTES - MANGADEX
// ============================================================

// app.get('/api/mangadex/fetch', apiAuthenticated, async (req, res) => {
//     const { series, chapter } = req.query;
//     if (!series || !chapter) {
//         return res.status(400).json({ success: false, error: 'Series and chapter required' });
//     }

//     try {
//         const fetch = (await import('node-fetch')).default;
        
//         const chaptersRes = await fetch(
//             `https://api.mangadex.org/chapter?manga=${series}&translatedLanguage[]=en&limit=100&order[chapter]=asc&offset=0`
//         );
        
//         if (!chaptersRes.ok) {
//             const errorText = await chaptersRes.text();
//             console.error('MangaDex chapters API error:', errorText);
//             return res.status(chaptersRes.status).json({ 
//                 success: false, 
//                 error: `MangaDex API error: ${chaptersRes.statusText}` 
//             });
//         }

//         const chaptersData = await chaptersRes.json();
//         const chapterObj = chaptersData.data.find(ch => ch.attributes.chapter === chapter);
        
//         if (!chapterObj && chaptersData.total > 100) {
//             const offset = 100;
//             const moreChaptersRes = await fetch(
//                 `https://api.mangadex.org/chapter?manga=${series}&translatedLanguage[]=en&limit=100&order[chapter]=asc&offset=${offset}`
//             );
            
//             if (moreChaptersRes.ok) {
//                 const moreChaptersData = await moreChaptersRes.json();
//                 const foundChapter = moreChaptersData.data.find(ch => ch.attributes.chapter === chapter);
//                 if (foundChapter) {
//                     return await fetchChapterImages(foundChapter, chapter, res);
//                 }
//             }
//         }
        
//         if (!chapterObj) {
//             return res.status(404).json({ 
//                 success: false, 
//                 error: `Chapter ${chapter} not found for this manga` 
//             });
//         }

//         await fetchChapterImages(chapterObj, chapter, res);

//     } catch (err) {
//         console.error('Error fetching MangaDex chapter:', err);
//         res.status(500).json({ success: false, error: err.message });
//     }
// });

// async function fetchChapterImages(chapterObj, chapter, res) {
//   const fetch = (await import('node-fetch')).default;

//   const chapterId = chapterObj.id;
//   const atHomeRes = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`);

//   if (!atHomeRes.ok) {
//     const errorText = await atHomeRes.text();
//     console.error('MangaDex at-home API error:', errorText);
//     return res.status(atHomeRes.status).json({
//       success: false,
//       error: `MangaDex at-home API error: ${atHomeRes.statusText}`
//     });
//   }

//   const atHomeData = await atHomeRes.json();

//   return res.json({
//     baseUrl: atHomeData.baseUrl,
//     chapter: atHomeData.chapter
//   });
// }

app.get('/api/library/last-chapter/:seriesId', apiAuthenticated, (req, res) => {
    const { seriesId } = req.params;
    if (!seriesId) return res.status(400).json({ success: false, error: 'Series ID required' });

    try {
        const started = db.getStartedSeries(req.user.id);
        const series = started.find(s => s.seriesId === seriesId);

        if (!series) return res.json({ success: true, chapter: null });

        const lastChapter = db.getReadingProgress(req.user.id, seriesId);
        res.json({ success: true, chapter: lastChapter || null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/mangadex/chapters/:seriesId', apiAuthenticated, async (req, res) => {
    const { seriesId } = req.params;
    if (!seriesId) return res.status(400).json({ success: false, error: 'Series ID required' });

    try {
        const chapters = await mangadex.fetchChapters(seriesId);
        res.json({ success: true, chapters });
    } catch (err) {
        console.error('Error fetching chapters:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/library/start-series', apiAuthenticated, (req, res) => {
    const { seriesId, title } = req.body;
    if (!seriesId || !title) return res.status(400).json({ success: false, error: 'seriesId and title required' });

    try {
        const result = db.addStartedSeries(req.user.id, seriesId, title);
        res.json(result);
    } catch (err) {
        console.error('Error saving started series:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/library/started-series', apiAuthenticated, (req, res) => {
    try {
        const series = db.getStartedSeries(req.user.id);
        res.json({ success: true, series });
    } catch (err) {
        console.error('Error fetching started series:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// API ROUTES - OTHER
// ============================================================

app.get('/api/theme', (req, res) => {
    const theme = req.cookies.theme || 'dark';
    res.json({ theme });
});

app.post('/api/theme', (req, res) => {
    const { theme } = req.body;
    if (!theme) return res.status(400).json({ error: 'Theme required' });
    res.cookie('theme', theme, { maxAge: 365*24*60*60*1000, httpOnly: false });
    res.json({ success: true, theme });
});

app.get('/api/uptime', (req, res) => {
    try {
        res.json(getUptime());
    } catch (err) {
        console.error('Error getting uptime:', err);
        res.status(500).json({ error: 'Failed to get uptime' });
    }
});

// ============================================================
// FILE SERVING
// ============================================================

app.use('/file', (req, res) => {
    try {
        const fileRelativePath = req.path.substring(1);
        if (!fileRelativePath || fileRelativePath.trim() === '' || fileRelativePath === '/') {
            return res.status(400).send('Invalid file path');
        }

        const decodedPath = decodeURIComponent(fileRelativePath);
        const dataDir = path.join(__dirname, 'data');
        const filePath = path.resolve(dataDir, decodedPath);

        if (!filePath.startsWith(path.resolve(dataDir))) {
            return res.status(403).send('Access denied');
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }

        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            return res.status(400).send('Invalid file');
        }

        const ext = path.extname(filePath).toLowerCase();
        
        if (!MEDIA_EXTENSIONS.includes(ext)) {
            return res.status(403).send('File type not allowed');
        }

        const fileSize = stats.size;
        const range = req.headers.range;

        if (ext === '.txt') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            return res.sendFile(filePath);
        }

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': getMimeType(ext),
                'Cache-Control': 'public, max-age=31536000'
            });
            file.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': getMimeType(ext),
                'Cache-Control': 'public, max-age=31536000',
                'Accept-Ranges': 'bytes'
            });
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (error) {
        console.error('File serving error:', error);
        res.status(500).send('Internal server error');
    }
});

function appData() {
    const networkIP = getNetworkIP();
    const users = db.getAllUsers();
    stdcout(`+ [Server] Access on server: http://localhost:${PORT}`, 'Blue')
    stdcout(`+ [Server] Access on devices on network: http://${networkIP}:${PORT}`, 'Blue');
    stdcout(`+ [Server] Running PerfectRed ${VERSION}`, 'Blue');
    stdcout(`+ [Server] Users in database: ${users.length}`, 'Blue');
    users.forEach(u => stdcout(`+ [User] ${u.username}`, 'Blue'));
};

const server = app.listen(PORT, HOST, () => {
  console.clear();
  appData();
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on("line", (input) => {
  const args = input.trim().split(" ");
  const command = args[0].toLowerCase();
  const params = args.slice(1);

  switch (command) {
    case "adduser":
      console.log(`Adding user: ${params[0]} (${params[1]} years old)`);
      break;

    case "deleteuser":
      const c_id = db.getIDbyUsername(params[0]);
      console.log("This one?", c_id);
      console.log("Deleting...", db.deleteUser(c_id));
      console.log(params[0], "deleted")
      break;

    case "users":
      db.getAllUsers().forEach(user => {
        console.log('+ [Database]', user.username);
      })
      break;
  
    case "clear":
      console.clear();
      appData();
      break;

    case "exit":
      console.log("Exiting...");
      rl.close();
      process.exit(0);
      break;

    default:
      console.log(`Unknown command: ${command}`);
  }
});


// Only export for Electron
if (require.main !== module) {
  module.exports = server;
}
