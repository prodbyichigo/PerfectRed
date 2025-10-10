const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'private');
const DB_PATH = path.join(DB_DIR, 'perfectred.db');

const startedSeries = {};

if (!fs.existsSync(DB_DIR)) {
  console.log(`+ [Database] Directory not found. Creating: ${DB_DIR}`);
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log('+ [Database] Directory created successfully');
  } catch (err) {
    console.error('+ [Database] Failed to create directory:', err);
    throw err;
  }
} else {
  console.log(`+ [Database] Directory exists: ${DB_DIR}`);
}

// Check if database file exists
const dbExists = fs.existsSync(DB_PATH);
if (!dbExists) {
  console.log(`+ [Database] Database file not found. Will create new database at: ${DB_PATH}`);
} else {
  console.log(`+ [Database] Database file found: ${DB_PATH}`);
}

let db;
try {
  db = new Database(DB_PATH);
  if (!dbExists) {
    console.log('+ [Database] New database file created successfully');
  }
  console.log('+ [Database] Database connection established');
} catch (err) {
  console.error('+ [Database] Failed to open/create database:', err);
  throw err;
}

// Enable WAL mode for better concurrent access
try {
  db.pragma('journal_mode = WAL');
  console.log('+ [Database] WAL mode enabled');
} catch (err) {
  console.error('+ [Database] Failed to enable WAL mode:', err);
}

// ============================================================
// MIGRATION: Fix statistics table
// ============================================================
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='statistics'").all();
  
  if (tables.length > 0) {
    // Table exists, check if it has the right columns
    const columns = db.prepare("PRAGMA table_info(statistics)").all();
    const hasUsername = columns.some(col => col.name === 'username');
    
    if (!hasUsername) {
      console.log('+ [Database] Migrating statistics table...');
      db.exec(`
        DROP TABLE IF EXISTS statistics;
      `);
      console.log('+ [Database] Old statistics table dropped');
    }
  }
} catch (err) {
  console.error('+ [Database] Migration check failed:', err);
}

// ============================================================
// CREATE TABLES
// ============================================================

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS statistics (
      username TEXT UNIQUE NOT NULL,
      minutes_spent_reading INTEGER NOT NULL,
      pages_read INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      current_page INTEGER NOT NULL,
      total_pages INTEGER NOT NULL,
      file_type TEXT DEFAULT 'cbz',
      progress INTEGER NOT NULL,
      last_read DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, file_path)
    );

    CREATE TABLE IF NOT EXISTS video_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      current_time REAL NOT NULL,
      duration REAL NOT NULL,
      progress INTEGER NOT NULL,
      last_watched DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, file_path)
    );
    CREATE TABLE IF NOT EXISTS manga_statistics (
      user_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      pages_read INTEGER DEFAULT 0,
      minutes_spent INTEGER DEFAULT 0,
      last_read TEXT,
      PRIMARY KEY (user_id, file_path),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_reading_user_lastread ON reading_progress(user_id, last_read DESC);
    CREATE INDEX IF NOT EXISTS idx_video_user_lastwatched ON video_progress(user_id, last_watched DESC);
  `);
  console.log('+ [Database] Tables and indexes created/verified successfully');
} catch (err) {
  console.error('+ [Database] Failed to create tables:', err);
  throw err;
}

// ============================================================
// STATISTICS FUNCTIONS
// ============================================================

const statisticsQueries = {
  getByUser: db.prepare('SELECT * FROM statistics WHERE username = ?'),
  upsert: db.prepare(`
    INSERT INTO statistics (username, minutes_spent_reading, pages_read)
    VALUES (?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      minutes_spent_reading = minutes_spent_reading + excluded.minutes_spent_reading,
      pages_read = pages_read + excluded.pages_read
  `),
  delete: db.prepare('DELETE FROM statistics WHERE username = ?')
};

function getStatistics(username) {
  return statisticsQueries.getByUser.get(username);
}

function saveStatistics(username, minutes, pages) {
  try {
    statisticsQueries.upsert.run(username, minutes, pages);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteStatistics(username) {
  try {
    statisticsQueries.delete.run(username);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// USER FUNCTIONS
// ============================================================

const userQueries = {
  getAll: db.prepare('SELECT * FROM users'),
  getById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  create: db.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)'),
  delete: db.prepare('DELETE FROM users WHERE id = ?')
};

function getAllUsers() {
  return userQueries.getAll.all();
}

function getIDbyUsername(username) {
  const user = userQueries.getByUsername.get(username);
  return user ? user.id : null; 
}


function getUserById(id) {
  return userQueries.getById.get(id);
}

function getUserByUsername(username) {
  return userQueries.getByUsername.get(username);
}

function createUser(id, username, password) {
  try {
    userQueries.create.run(id, username, password);
    console.log('Successfully created', username)
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteUser(id) {
  try {
    userQueries.delete.run(id);
    return { success: true };
  }
  catch (err) {
    console.log(err)
  }
}

function addStartedSeries(userId, seriesId, title) {
  if (!startedSeries[userId]) startedSeries[userId] = [];
  if (!startedSeries[userId].some(s => s.seriesId === seriesId)) {
    startedSeries[userId].push({ seriesId, title });
  }
  return { success: true };
}

function getStartedSeries(userId) {
  return startedSeries[userId] || [];
}

// ============================================================
// READING PROGRESS FUNCTIONS
// ============================================================

const mangaStatisticsQueries = {
  getByUser: db.prepare(`
    SELECT file_path, file_name, pages_read, minutes_spent, last_read
    FROM manga_statistics
    WHERE user_id = ?
    ORDER BY pages_read DESC
  `),
  upsert: db.prepare(`
    INSERT INTO manga_statistics (user_id, file_path, file_name, pages_read, minutes_spent, last_read)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, file_path) DO UPDATE SET
      pages_read = pages_read + excluded.pages_read,
      minutes_spent = minutes_spent + excluded.minutes_spent,
      last_read = datetime('now')
  `)
};

function saveMangaStatistics(userId, filePath, fileName, pagesRead, minutesSpent) {
  try {
    mangaStatisticsQueries.upsert.run(userId, filePath, fileName, pagesRead, minutesSpent);
    return { success: true };
  } catch (err) {
    console.error('Error saving manga statistics:', err);
    return { success: false, error: err.message };
  }
}

function getMangaStatistics(userId) {
  try {
    return mangaStatisticsQueries.getByUser.all(userId);
  } catch (err) {
    console.error('Error getting manga statistics:', err);
    return [];
  }
}
const readingQueries = {
  getByUser: db.prepare(`
    SELECT * FROM reading_progress 
    WHERE user_id = ? 
    ORDER BY last_read DESC 
    LIMIT ?
  `),
  getByUserAndFile: db.prepare('SELECT * FROM reading_progress WHERE user_id = ? AND file_path = ?'),
  upsert: db.prepare(`
    INSERT INTO reading_progress (user_id, file_path, file_name, current_page, total_pages, file_type, progress, last_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(user_id, file_path) DO UPDATE SET
      current_page = excluded.current_page,
      total_pages = excluded.total_pages,
      progress = excluded.progress,
      last_read = datetime('now', 'localtime')
  `),
  delete: db.prepare('DELETE FROM reading_progress WHERE user_id = ? AND file_path = ?')
};

function getReadingProgress(userId, limit = 20) {
  return readingQueries.getByUser.all(userId, limit);
}

function getReadingProgressForFile(userId, filePath) {
  return readingQueries.getByUserAndFile.get(userId, filePath);
}

function saveReadingProgress(userId, filePath, fileName, currentPage, totalPages, fileType = 'cbz') {
  try {
    const progress = Math.round((currentPage / totalPages) * 100);
    readingQueries.upsert.run(userId, filePath, fileName, currentPage, totalPages, fileType, progress);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteReadingProgress(userId, filePath) {
  try {
    readingQueries.delete.run(userId, filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// VIDEO PROGRESS FUNCTIONS
// ============================================================

const videoQueries = {
  getByUser: db.prepare(`
    SELECT * FROM video_progress 
    WHERE user_id = ? 
    ORDER BY last_watched DESC 
    LIMIT ?
  `),
  getByUserAndFile: db.prepare('SELECT * FROM video_progress WHERE user_id = ? AND file_path = ?'),
  upsert: db.prepare(`
    INSERT INTO video_progress (user_id, file_path, file_name, current_time, duration, progress, last_watched)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(user_id, file_path) DO UPDATE SET
      current_time = excluded.current_time,
      duration = excluded.duration,
      progress = excluded.progress,
      last_watched = datetime('now', 'localtime')
  `),
  delete: db.prepare('DELETE FROM video_progress WHERE user_id = ? AND file_path = ?')
};

function getVideoProgress(userId, limit = 20) {
  return videoQueries.getByUser.all(userId, limit);
}

function getVideoProgressForFile(userId, filePath) {
  return videoQueries.getByUserAndFile.get(userId, filePath);
}

function saveVideoProgress(userId, filePath, fileName, currentTime, duration) {
  try {
    const progress = Math.round((currentTime / duration) * 100);
    videoQueries.upsert.run(userId, filePath, fileName, currentTime, duration, progress);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteVideoProgress(userId, filePath) {
  try {
    videoQueries.delete.run(userId, filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// EXPORTS
// ===========================================================

module.exports = {
  db,
  // User functions
  getAllUsers,
  getUserById,
  getUserByUsername,
  createUser,
  deleteUser,
  getIDbyUsername,
  // Reading progress
  getReadingProgress,
  getReadingProgressForFile,
  saveReadingProgress,
  deleteReadingProgress,
  // Video progress
  getVideoProgress,
  getVideoProgressForFile,
  saveVideoProgress,
  deleteVideoProgress,
  // Statistics
  getStatistics,
  saveStatistics,
  deleteStatistics,
  // Manga Statistics (NEW)
  saveMangaStatistics,
  getMangaStatistics,
  // MangaDex BULLSHIT
  addStartedSeries,
  getStartedSeries
};