const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const server = require('../server');

let mainWindow;
let tray;

app.setName('PerfectRed');
if (process.platform === 'darwin') {
  app.dock.setIcon(path.join(__dirname, '..', 'public', 'favicon.png'));
}

// Determine base icon path based on platform
function getIconPath() {
  const iconsDir = path.join(__dirname, '..', 'public');
  
  // Platform-specific icon preferences
  if (process.platform === 'darwin') {
    // macOS prefers .icns
    const icnsPath = path.join(iconsDir, 'favicon.icns');
    if (fs.existsSync(icnsPath)) return icnsPath;
  } else if (process.platform === 'win32') {
    // Windows prefers .ico
    const icoPath = path.join(iconsDir, 'favicon.ico');
    if (fs.existsSync(icoPath)) return icoPath;
  }
  
  // Fallback to PNG (works everywhere)
  const pngPath = path.join(iconsDir, 'favicon.png');
  if (fs.existsSync(pngPath)) return pngPath;
  
  console.warn('No suitable icon found');
  return null;
}

function getTrayIconPath() {
  const iconsDir = path.join(__dirname, '..', 'public');
  
  if (process.platform === 'darwin') {
    // macOS tray icons should be Template images for proper dark mode support
    const templatePath = path.join(iconsDir, 'tray-icon-Template.png');
    if (fs.existsSync(templatePath)) return templatePath;
  }
  
  // Use smaller tray icon if available
  const trayPath = path.join(iconsDir, 'tray-icon.png');
  if (fs.existsSync(trayPath)) return trayPath;
  
  // Fallback to main icon
  return getIconPath();
}

function waitForServer() {
  return new Promise((resolve) => {
    if (server.listening) {
      resolve();
    } else {
      server.once('listening', resolve);
    }
  });
}

function createTray(iconPath) {
  if (!iconPath) return;
  
  try {
    let trayIconPath = getTrayIconPath();
    
    if (process.platform === 'darwin' && trayIconPath) {
      // macOS tray icons should be 22x22 with @2x for retina
      const image = nativeImage.createFromPath(trayIconPath);
      if (!image.isEmpty()) {
        const resized = image.resize({ width: 22, height: 22 });
        tray = new Tray(resized);
        tray.setTitle('PerfectRed'); // Show text in menu bar
      }
    } else if (trayIconPath) {
      tray = new Tray(trayIconPath);
    }
    
    if (tray) {
      tray.setToolTip('PerfectRed');
      
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Show PerfectRed',
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.focus();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
        }
      ]);
      
      tray.setContextMenu(contextMenu);
      
      // Double-click to show window (Windows/Linux)
      tray.on('double-click', () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
    }
  } catch (error) {
    console.error('Failed to create tray:', error);
  }
}

async function createWindow() {
  try {
    await waitForServer();
    
    const iconPath = getIconPath();
    
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'PerfectRed',
      icon: iconPath,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      show: false // Don't show until ready
    });
    
    // Show window when ready to prevent flashing
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
    
    // Create tray icon
    createTray(iconPath);
    
    // Handle navigation
    mainWindow.webContents.on('will-navigate', (event, url) => {
      // Prevent navigation away from localhost
      if (!url.startsWith('http://localhost:3000')) {
        event.preventDefault();
      }
    });
    
    // Error handling
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load:', errorCode, errorDescription);
    });
    
    // Console mirroring for debugging
    if (!app.isPackaged) {
      mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer] ${message}`);
      });
    }
    
    // Handle window close
    mainWindow.on('close', (event) => {
      if (process.platform === 'darwin' && !app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });
    
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    
    await mainWindow.loadURL('http://localhost:3000');
    
  } catch (error) {
    console.error('Error creating window:', error);
    app.quit();
  }
}

// App lifecycle events
app.on('ready', async () => {
  try {
    await createWindow();
  } catch (error) {
    console.error('Failed to create window:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Close server
  if (server && typeof server.close === 'function') {
    server.close();
  }
  
  // Quit on all platforms except macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOS: recreate window when dock icon is clicked
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});