/**
 * Admin CLI — Password Reset Tool
 * Usage: npm run reset-pass <username> <new_password>
 *   or:  node src/cli/reset-password.js <username> <new_password>
 */
const argon2 = require('argon2');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npm run reset-pass <username> <new_password>');
    console.log('       node src/cli/reset-password.js <username> <new_password>');
    process.exit(1);
  }

  const [username, newPassword] = args;

  if (newPassword.length < 6) {
    console.error('Error: Password must be at least 6 characters');
    process.exit(1);
  }

  // Initialize DB
  const db = require('../db');
  await db.initialize();

  // Find user
  const user = await db.get('SELECT id, username FROM users WHERE username = ?', [username]);
  if (!user) {
    console.error(`Error: User "${username}" not found`);
    process.exit(1);
  }

  // Hash new password
  const password_hash = await argon2.hash(newPassword, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1
  });

  // Update password
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, user.id]);

  console.log(`✓ Password reset successfully for user: ${user.username}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
