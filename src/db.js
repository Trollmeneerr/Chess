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
  const dbHost = (process.env.DB_HOST || '').trim();
  const dbPort = parseInt(process.env.DB_PORT || '3306', 10);
  const dbName = (process.env.DB_DATABASE || '').trim();
  const dbUser = (process.env.DB_USERNAME || '').trim();
  const dbPass = process.env.DB_PASSWORD || '';
  const dbSsl = process.env.DB_SSL === 'true' || process.env.DB_SSL === '1';

  console.log('[DB] Checking database configuration...');
  if (dbHost && dbName && dbUser) {
    if (dbHost === 'localhost' || dbHost === '127.0.0.1') {
      console.warn('[DB] Notice: DB_HOST is set to localhost/127.0.0.1.');
      console.warn('[DB] If running in a Pelican/Pterodactyl container, connect using your Docker gateway (e.g. 172.18.0.1) or host IP.');
    }

    // MySQL mode
    try {
      console.log(`[DB] Attempting MySQL connection to ${dbUser}@${dbHost}:${dbPort}/${dbName}...`);
      const mysql = require('mysql2/promise');
      db = await mysql.createPool({
        host: dbHost,
        port: dbPort,
        database: dbName,
        user: dbUser,
        password: dbPass,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 15000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        ssl: dbSsl ? { rejectUnauthorized: false } : undefined
      });

      // Test connection
      await db.query('SELECT 1');
      isMySQL = true;
      console.log('[DB] ✓ Successfully connected to MySQL/MariaDB');

      // Create tables using query() instead of execute() to avoid ER_UNSUPPORTED_PS (error 1295)
      await db.query(SCHEMA.users_mysql);
      await db.query(SCHEMA.games_mysql);
      await db.query(SCHEMA.puzzles_mysql);
      await db.query(SCHEMA.user_puzzle_history_mysql);
      await db.query(SCHEMA.bot_win_log_mysql);
      console.log('[DB] ✓ MySQL schema initialized');

      await runMigrations();
      await seedStarterPuzzles();
      return;
    } catch (err) {
      console.error(`[DB] ✗ MySQL connection failed [Code: ${err.code || 'UNKNOWN'}]:`, err.message);
      if (err.code === 'ECONNREFUSED') {
        console.error(`[DB] -> Connection refused at ${dbHost}:${dbPort}.`);
        console.error('[DB] -> Step 1: Ensure MySQL/MariaDB service is running on the host.');
        console.error('[DB] -> Step 2: Ensure bind-address is 0.0.0.0 in /etc/mysql/mariadb.conf.d/50-server.cnf (not 127.0.0.1).');
        console.error('[DB] -> Step 3: Ensure DB_HOST is 172.18.0.1 (Docker gateway) or node IP, not localhost.');
      } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error(`[DB] -> Access denied for user "${dbUser}".`);
        console.error('[DB] -> Step 1: Verify DB_USERNAME and DB_PASSWORD match the credentials in Pelican Panel -> Databases tab.');
        console.error('[DB] -> Step 2: Ensure user has host permissions from "%" or "172.18.%" (not just localhost).');
      } else if (err.code === 'ER_BAD_DB_ERROR') {
        console.error(`[DB] -> Database "${dbName}" does not exist in MySQL.`);
        console.error(`[DB] -> Create this database in Pelican Panel or run: CREATE DATABASE \`${dbName}\`;`);
      } else if (err.code === 'ETIMEDOUT' || err.code === 'EHOSTUNREACH') {
        console.error(`[DB] -> Network timeout reaching ${dbHost}:${dbPort}. Check firewall rules for the Docker network.`);
      }
      console.warn('[DB] Falling back to SQLite database...');
    }
  } else {
    console.log('[DB] Notice: MySQL credentials not configured (DB_HOST, DB_DATABASE, DB_USERNAME). Defaulting to SQLite.');
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
  await runMigrations();
  await seedStarterPuzzles();
}

async function runMigrations() {
  try {
    if (isMySQL) {
      // 1. Check games table for analysis_json column
      try {
        const [cols] = await db.query("SHOW COLUMNS FROM games LIKE 'analysis_json'");
        if (!cols || cols.length === 0) {
          console.log('[DB] Running migration: Adding analysis_json column to MySQL games table...');
          await db.query('ALTER TABLE games ADD COLUMN analysis_json LONGTEXT NULL');
        }
      } catch (e) {
        console.warn('[DB] Migration note (games.analysis_json):', e.message);
      }

      // 2. Check users table for avatar_id column
      try {
        const [cols] = await db.query("SHOW COLUMNS FROM users LIKE 'avatar_id'");
        if (!cols || cols.length === 0) {
          console.log('[DB] Running migration: Adding avatar_id column to MySQL users table...');
          await db.query('ALTER TABLE users ADD COLUMN avatar_id INT DEFAULT 1');
        }
      } catch (e) {
        console.warn('[DB] Migration note (users.avatar_id):', e.message);
      }
    } else {
      // SQLite migrations
      try {
        const pragma = db.pragma('table_info(games)');
        const hasAnalysis = pragma.some(col => col.name === 'analysis_json');
        if (!hasAnalysis) {
          console.log('[DB] Running migration: Adding analysis_json column to SQLite games table...');
          db.exec('ALTER TABLE games ADD COLUMN analysis_json TEXT');
        }
      } catch (e) {
        console.warn('[DB] SQLite migration note (games.analysis_json):', e.message);
      }

      try {
        const pragma = db.pragma('table_info(users)');
        const hasAvatar = pragma.some(col => col.name === 'avatar_id');
        if (!hasAvatar) {
          console.log('[DB] Running migration: Adding avatar_id column to SQLite users table...');
          db.exec('ALTER TABLE users ADD COLUMN avatar_id INTEGER DEFAULT 1');
        }
      } catch (e) {
        console.warn('[DB] SQLite migration note (users.avatar_id):', e.message);
      }
    }
    console.log('[DB] Schema and migration checks complete');
  } catch (err) {
    console.warn('[DB] Schema migration check warning:', err.message);
  }
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
    return sql
      .replace(/ORDER BY RANDOM\(\)/gi, 'ORDER BY RAND()')
      .replace(/INSERT OR IGNORE INTO/gi, 'INSERT IGNORE INTO');
  }
  return sql;
}

// Unified query interface
async function run(sql, params = []) {
  const formatted = formatSql(sql);
  const cleanParams = (params || []).map(p => (p === undefined ? null : p));
  if (isMySQL) {
    const [result] = await db.query(formatted, cleanParams);
    return result;
  } else {
    const stmt = db.prepare(formatted);
    if (formatted.trim().toUpperCase().startsWith('SELECT') || formatted.trim().toUpperCase().startsWith('WITH')) {
      return stmt.all(...cleanParams);
    } else {
      return stmt.run(...cleanParams);
    }
  }
}

async function get(sql, params = []) {
  const formatted = formatSql(sql);
  const cleanParams = (params || []).map(p => (p === undefined ? null : p));
  if (isMySQL) {
    const [rows] = await db.query(formatted, cleanParams);
    return rows[0] || null;
  } else {
    const stmt = db.prepare(formatted);
    return stmt.get(...cleanParams) || null;
  }
}

async function all(sql, params = []) {
  const formatted = formatSql(sql);
  const cleanParams = (params || []).map(p => (p === undefined ? null : p));
  if (isMySQL) {
    const [rows] = await db.query(formatted, cleanParams);
    return rows;
  } else {
    const stmt = db.prepare(formatted);
    return stmt.all(...cleanParams);
  }
}

async function insert(sql, params = []) {
  const formatted = formatSql(sql);
  const cleanParams = (params || []).map(p => (p === undefined ? null : p));
  if (isMySQL) {
    const [result] = await db.query(formatted, cleanParams);
    return { lastInsertRowid: result.insertId, changes: result.affectedRows };
  } else {
    const stmt = db.prepare(formatted);
    const result = stmt.run(...cleanParams);
    return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
  }
}

module.exports = { initialize, run, get, all, insert, getIsMySQL: () => isMySQL };
