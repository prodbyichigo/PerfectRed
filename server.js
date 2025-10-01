const express = require('express');
const path = require('path');
const fs = require('fs');
const AdmZip = require("adm-zip");
const os = require('os');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const videoPlayer = require('./public/player.js');
const cookieParser = require('cookie-parser');

// ============================================================
// CONFIGURATION
// ============================================================
const PORT = 3000;
const HOST = '0.0.0.0';
const VERSION = 'v0.0.1';
const MEDIA_EXTENSIONS = ['.txt', '.cbz', '.epub', '.pdf', '.jpg', '.png', '.jpeg', '.gif', '.zip', '.webm'];

// ============================================================
// APP INITIALIZATION
// ============================================================
const app = express();
const startTime = Date.now();

app.set('view engine', 'ejs');
app.use(express.static("views"));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/manga', express.static(path.join(__dirname, 'data')));
app.use(cookieParser());

app.locals.version = VERSION;

//
// THEME SHIT
//
function setCookie(name, value, days = 365) {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "expires=" + date.toUTCString();
  document.cookie = name + "=" + value + ";" + expires + ";path=/";
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length);
  }
  return null;
}

// Theme management
function setTheme(themeName) {
  document.body.setAttribute('data-theme', themeName);
  setCookie('theme', themeName, 365); // Save for 1 year
  updateActiveTheme();
}

function loadTheme() {
  const savedTheme = getCookie('theme') || 'dark';
  document.body.setAttribute('data-theme', savedTheme);
  updateActiveTheme();
}

function updateActiveTheme() {
  const currentTheme = document.body.getAttribute('data-theme');
  document.querySelectorAll('.theme-option').forEach(option => {
    option.classList.toggle('active', 
      option.getAttribute('data-theme') === currentTheme);
  });
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get the network IP address of the server
 */
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

/**
 * Calculate server uptime in a readable format
 */
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

/**
 * Load and cache the favicon as base64
 */
function loadFavicon() {
    const faviconPath = path.join(__dirname, 'public', 'favicon.png');
    return fs.readFileSync(faviconPath).toString('base64');
}

/**
 * Enhanced getLibraryContent to separate manga and anime folders
 */
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
            
            // Check if folder contains webm files (anime) or other media (manga)
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

    // Natural sort
    mangaFolders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    animeFolders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    return { mangaFolders, animeFolders, files };
}

/**
 * Updated Library route
 */
app.get('/library', (req, res) => {
    const folderPath = req.query.folder || '';
    const content = getLibraryContent(folderPath);

    // Add cover images to folders
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

//
// Styles
//

app.get('/api/theme', (req, res) => {
    const theme = req.cookies.theme || 'dark';
    res.json({ theme });
});

// Set theme
app.post('/api/theme', (req, res) => {
    const { theme } = req.body;
    if (!theme) return res.status(400).json({ error: 'Theme required' });

    res.cookie('theme', theme, { maxAge: 365*24*60*60*1000, httpOnly: false });
    res.json({ success: true, theme });
});

/**
 * Find cover image for a folder (from images or archive files)
 */
function findFolderCover(folderPath) {
    const folderFullPath = path.join(__dirname, 'data', folderPath);
    const filesInFolder = fs.existsSync(folderFullPath)
        ? fs.readdirSync(folderFullPath)
        : [];

    // Try to find a direct image file
    let coverFile = filesInFolder.find(f =>
        ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(f).toLowerCase())
    );

    // If no image, try first image inside CBZ/ZIP
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

/**
 * Generate breadcrumb navigation from folder path
 */
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

// Cache favicon on startup
const faviconBase64 = loadFavicon();

// ============================================================
// ROUTES
// ============================================================

/**
 * Home page
 */
app.get('/', (req, res) => {
    res.render('index', { faviconBase64 });
});

/**
 * Reader page
 */
app.get('/reader', (req, res) => {
    res.render('reader', { faviconBase64 });
});

/**
 * Player
 */

app.get('/player', (req, res) => {
       res.render('player', { faviconBase64 });
});

/**
 * Settings page
 */
app.get('/settings', (req, res) => {
    res.render('settings', { faviconBase64 });
});

/**
 * API endpoint for server uptime
 */
app.get('/api/uptime', (req, res) => {
    res.json(getUptime());
});

/**
 * API endpoint for folder contents (JSON)
 */
app.get('/api/folder', (req, res) => {
    try {
        const folderPath = req.query.path || '';
        const content = getLibraryContent(folderPath);
        res.json(content);
    } catch (error) {
        console.error('Error fetching folder contents:', error);
        res.status(500).json({ error: 'Failed to fetch folder contents' });
    }
});

/**
 * File serving middleware with security checks
 */
app.use('/file', (req, res) => {
    try {
        const fileRelativePath = req.path.substring(1);
        
        // Validate file path
        if (!fileRelativePath || fileRelativePath.trim() === '' || fileRelativePath === '/') {
            return res.status(400).send('Invalid file path');
        }

        const decodedPath = decodeURIComponent(fileRelativePath);
        const dataDir = path.join(__dirname, 'data');
        const filePath = path.resolve(dataDir, decodedPath);

        // Security: prevent directory traversal
        if (!filePath.startsWith(path.resolve(dataDir))) {
            return res.status(403).send('Access denied');
        }

        // Check file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }

        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            return res.status(400).send('Invalid file');
        }

        // Validate file extension
        const ext = path.extname(filePath).toLowerCase();
        if (!MEDIA_EXTENSIONS.includes(ext)) {
            return res.status(403).send('File type not allowed');
        }

        // Serve text files with UTF-8 encoding
        if (ext === '.txt') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.send(fs.readFileSync(filePath, 'utf8'));
        } else {
            res.sendFile(filePath);
        }
    } catch (error) {
        console.error('File serving error:', error);
        res.status(500).send('Internal server error');
    }
});

// ============================================================
// USERS
// ============================================================

// Login page
app.get('/login', (req, res) => {
    res.render('login', { faviconBase64 });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.username === username);

    if (!user) return res.send('Invalid username or password');

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send('Invalid username or password');

    req.session.user = username;
    res.redirect('/dashboard');
});
app.use(express.urlencoded({ extended: true })); // for form data
app.use(express.json()); // if you want JSON parsing too
app.use(session({
    secret: 'local-secret-key',  // change if you want
    resave: false,
    saveUninitialized: false
}));

function loadUsers() {
    const usersPath = path.join(__dirname, 'private', 'users.json');
    if (!fs.existsSync(usersPath)) return [];
    return JSON.parse(fs.readFileSync(usersPath, 'utf8'));
}

function saveUsers(users) {
    const usersPath = path.join(__dirname, 'private', 'users.json');
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}


// ============================================================
// SERVER STARTUP
// ============================================================

const networkIP = getNetworkIP();

app.listen(PORT, HOST, () => {
    console.log('+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=');
    console.log(`= Access on server: http://localhost:${PORT}                =`);
    console.log(`+ Access on devices on network: http://${networkIP}:${PORT} +`);
    console.log("= Running PerfectRed", VERSION, "                             =")
    console.log('+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=');
});