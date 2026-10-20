/**
 * Auth Routes — Registration & Login
 */
const express = require('express');
const router = express.Router();
const argon2 = require('argon2');
const db = require('../db');
const { generateToken, authMiddleware } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, avatar_id } = req.body;

    // Validate username
    if (!username || username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
    }

    // Validate password
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if username taken
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Hash password with Argon2id
    const password_hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1
    });

    // Insert user
    const avatarId = parseInt(avatar_id) || Math.floor(Math.random() * 16) + 1;
    const tzId = (timezone_id && typeof timezone_id === 'string' && timezone_id.trim()) ? timezone_id.trim() : 'UTC';
    const result = await db.insert(
      'INSERT INTO users (username, password_hash, avatar_id, timezone_id) VALUES (?, ?, ?, ?)',
      [username, password_hash, avatarId, tzId]
    );

    const user = { id: result.lastInsertRowid, username, avatar_id: avatarId, timezone_id: tzId };
    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      user: { id: user.id, username, avatar_id: avatarId, timezone_id: tzId, elo_rating: 800 },
      token
    });
  } catch (err) {
    console.error('[Auth] Registration error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        avatar_id: user.avatar_id,
        avatar_custom: user.avatar_custom,
        timezone_id: user.timezone_id || 'UTC',
        elo_rating: user.elo_rating,
        puzzles_solved: user.puzzles_solved,
        bots_defeated: user.bots_defeated
      },
      token
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// GET /api/auth/me — get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, username, avatar_id, avatar_custom, timezone_id, elo_rating, puzzles_solved, bots_defeated, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
