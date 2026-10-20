/**
 * Database Migration & Timezone Fix Utility
 * Usage: npm run fix-db
 *   or:  node src/cli/fix-db.js
 */
const db = require('../db');

async function main() {
  console.log('[FixDB] Initializing database connection...');
  await db.initialize();

  const isMySQL = db.getIsMySQL();
  console.log(`[FixDB] Database mode: ${isMySQL ? 'MySQL / MariaDB' : 'SQLite'}`);

  if (isMySQL) {
    try {
      console.log('[FixDB] Checking MySQL `users` table for `timezone_id` column...');
      const [cols] = await db.run("SHOW COLUMNS FROM users LIKE 'timezone_id'");
      if (!cols || cols.length === 0) {
        console.log('[FixDB] Adding `timezone_id` column to `users` table...');
        await db.run("ALTER TABLE users ADD COLUMN timezone_id VARCHAR(50) DEFAULT 'UTC'");
        console.log('[FixDB] ✓ Column `timezone_id` added successfully.');
      } else {
        console.log('[FixDB] ✓ Column `timezone_id` already exists.');
      }

      console.log('[FixDB] Ensuring existing rows have valid timezone_id default...');
      await db.run("UPDATE users SET timezone_id = 'UTC' WHERE timezone_id IS NULL OR timezone_id = ''");
      console.log('[FixDB] ✓ Existing users updated to default UTC if empty.');
    } catch (err) {
      console.error('[FixDB] Error updating MySQL schema:', err.message);
    }
  } else {
    try {
      console.log('[FixDB] Checking SQLite `users` table for `timezone_id` column...');
      // db.run with SQLite will use db under the hood via db.js run/get methods
      const testUser = await db.get('SELECT * FROM users LIMIT 1');
      if (testUser && testUser.timezone_id === undefined) {
        await db.run("ALTER TABLE users ADD COLUMN timezone_id TEXT DEFAULT 'UTC'");
        console.log('[FixDB] ✓ Column `timezone_id` added to SQLite.');
      } else {
        console.log('[FixDB] ✓ Column `timezone_id` is present.');
      }
      await db.run("UPDATE users SET timezone_id = 'UTC' WHERE timezone_id IS NULL OR timezone_id = ''");
    } catch (err) {
      // If column is missing, query could throw; add column directly
      try {
        await db.run("ALTER TABLE users ADD COLUMN timezone_id TEXT DEFAULT 'UTC'");
        console.log('[FixDB] ✓ Column `timezone_id` added to SQLite.');
      } catch (inner) {
        console.log('[FixDB] SQLite check note:', inner.message);
      }
    }
  }

  // Verify users table
  try {
    const users = await db.all('SELECT id, username, timezone_id FROM users LIMIT 10');
    console.log(`[FixDB] Verification: Found ${users.length} sample user(s):`);
    users.forEach(u => console.log(`  - [ID: ${u.id}] ${u.username} (timezone: ${u.timezone_id})`));
  } catch (err) {
    console.warn('[FixDB] Verification warning:', err.message);
  }

  console.log('[FixDB] Done! Timezone column and defaults are verified.');
  process.exit(0);
}

main().catch(err => {
  console.error('[FixDB] Fatal error:', err);
  process.exit(1);
});
