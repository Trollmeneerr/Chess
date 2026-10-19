/**
 * Database Layer — MySQL with SQLite fallback
 */
const path = require('path');
const fs = require('fs');

let db = null;
let isMySQL = false;

const SCHEMA = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(20) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_id INTEGER DEFAULT 1,
      elo_rating INTEGER DEFAULT 800,
      puzzles_solved INTEGER DEFAULT 0,
      bots_defeated INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  users_mysql: `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(20) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_id INT DEFAULT 1,
      elo_rating INT DEFAULT 800,
      puzzles_solved INT DEFAULT 0,
      bots_defeated INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,
  games: `
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invite_code VARCHAR(20) UNIQUE,
      white_id INTEGER,
      black_id INTEGER,
      game_type VARCHAR(10) DEFAULT 'pvp',
      time_control VARCHAR(20) DEFAULT 'rapid',
      bot_elo INTEGER,
      pgn TEXT,
      result VARCHAR(20),
      analysis_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  games_mysql: `
    CREATE TABLE IF NOT EXISTS games (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invite_code VARCHAR(20) UNIQUE,
      white_id INT,
      black_id INT,
      game_type VARCHAR(10) DEFAULT 'pvp',
      time_control VARCHAR(20) DEFAULT 'rapid',
      bot_elo INT,
      pgn TEXT,
      result VARCHAR(20),
      analysis_json LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,
  puzzles: `
    CREATE TABLE IF NOT EXISTS puzzles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      puzzle_id VARCHAR(20) UNIQUE,
      fen TEXT NOT NULL,
      moves TEXT NOT NULL,
      rating INTEGER DEFAULT 1200,
      themes TEXT,
      popularity INTEGER DEFAULT 0
    )
  `,
  puzzles_mysql: `
    CREATE TABLE IF NOT EXISTS puzzles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      puzzle_id VARCHAR(20) UNIQUE,
      fen TEXT NOT NULL,
      moves TEXT NOT NULL,
      rating INT DEFAULT 1200,
      themes TEXT,
      popularity INT DEFAULT 0
    )
  `,
  user_puzzle_history: `
    CREATE TABLE IF NOT EXISTS user_puzzle_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      puzzle_id VARCHAR(20) NOT NULL,
      solved INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      solved_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  user_puzzle_history_mysql: `
    CREATE TABLE IF NOT EXISTS user_puzzle_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      puzzle_id VARCHAR(20) NOT NULL,
      solved TINYINT DEFAULT 0,
      attempts INT DEFAULT 0,
      solved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,
  bot_win_log: `
    CREATE TABLE IF NOT EXISTS bot_win_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      bot_elo INTEGER NOT NULL,
      won_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  bot_win_log_mysql: `
    CREATE TABLE IF NOT EXISTS bot_win_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      bot_elo INT NOT NULL,
      won_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
};

async function initialize() {
  const dbHost = process.env.DB_HOST;
  const dbPort = process.env.DB_PORT || 3306;
  const dbName = process.env.DB_DATABASE;
  const dbUser = process.env.DB_USERNAME;
  const dbPass = process.env.DB_PASSWORD;

  if (dbHost && dbName && dbUser) {
    // MySQL mode
    try {
      const mysql = require('mysql2/promise');
      db = await mysql.createPool({
        host: dbHost,
        port: parseInt(dbPort),
        database: dbName,
        user: dbUser,
        password: dbPass || '',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 5000
      });
      // Test connection
      await db.execute('SELECT 1');
      isMySQL = true;
      console.log('[DB] Connected to MySQL/MariaDB');

      // Create tables
      await db.execute(SCHEMA.users_mysql);
      await db.execute(SCHEMA.games_mysql);
      await db.execute(SCHEMA.puzzles_mysql);
      await db.execute(SCHEMA.user_puzzle_history_mysql);
      await db.execute(SCHEMA.bot_win_log_mysql);
      console.log('[DB] MySQL tables ready');
      await seedStarterPuzzles();
      return;
    } catch (err) {
      console.warn('[DB] MySQL connection failed, falling back to SQLite:', err.message);
    }
  }

  // SQLite fallback
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'chess.sqlite');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  isMySQL = false;
  console.log('[DB] Using SQLite at', dbPath);

  // Create tables
  db.exec(SCHEMA.users);
  db.exec(SCHEMA.games);
  db.exec(SCHEMA.puzzles);
  db.exec(SCHEMA.user_puzzle_history);
  db.exec(SCHEMA.bot_win_log);
  console.log('[DB] SQLite tables ready');
  await seedStarterPuzzles();
}

async function seedStarterPuzzles() {
  try {
    const existing = await get('SELECT COUNT(*) as count FROM puzzles');
    if (existing && existing.count > 0) return;

    const { STARTER_PUZZLES } = require('./engine/starter-puzzles');
    console.log(`[DB] Seeding ${STARTER_PUZZLES.length} starter puzzles...`);
    for (const p of STARTER_PUZZLES) {
      await insert(
        'INSERT INTO puzzles (puzzle_id, fen, moves, rating, themes) VALUES (?, ?, ?, ?, ?)',
        [p.puzzle_id, p.fen, p.moves, p.rating, p.themes]
      );
    }
    console.log('[DB] Starter puzzles seeded successfully');
  } catch (err) {
    console.error('[DB] Failed to seed starter puzzles:', err.message);
  }
}

function formatSql(sql) {
  if (isMySQL) {
    return sql.replace(/ORDER BY RANDOM\(\)/gi, 'ORDER BY RAND()');
  }
  return sql;
}

// Unified query interface
async function run(sql, params = []) {
  const formatted = formatSql(sql);
  if (isMySQL) {
    const [result] = await db.execute(formatted, params);
    return result;
  } else {
    const stmt = db.prepare(formatted);
    if (formatted.trim().toUpperCase().startsWith('SELECT') || formatted.trim().toUpperCase().startsWith('WITH')) {
      return stmt.all(...params);
    } else {
      return stmt.run(...params);
    }
  }
}

async function get(sql, params = []) {
  const formatted = formatSql(sql);
  if (isMySQL) {
    const [rows] = await db.execute(formatted, params);
    return rows[0] || null;
  } else {
    const stmt = db.prepare(formatted);
    return stmt.get(...params) || null;
  }
}

async function all(sql, params = []) {
  const formatted = formatSql(sql);
  if (isMySQL) {
    const [rows] = await db.execute(formatted, params);
    return rows;
  } else {
    const stmt = db.prepare(formatted);
    return stmt.all(...params);
  }
}

async function insert(sql, params = []) {
  const formatted = formatSql(sql);
  if (isMySQL) {
    const [result] = await db.execute(formatted, params);
    return { lastInsertRowid: result.insertId, changes: result.affectedRows };
  } else {
    const stmt = db.prepare(formatted);
    const result = stmt.run(...params);
    return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
  }
}

module.exports = { initialize, run, get, all, insert, getIsMySQL: () => isMySQL };
