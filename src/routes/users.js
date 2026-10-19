/**
 * User Routes — Profile and leaderboard
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

// GET /api/users/profile/:username
router.get('/profile/:username', async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, username, avatar_id, elo_rating, puzzles_solved, bots_defeated, created_at FROM users WHERE username = ?',
      [req.params.username]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// GET /api/users/leaderboard — Top 20 players by ELO
router.get('/leaderboard', async (req, res) => {
  try {
    const players = await db.all(
      'SELECT username, avatar_id, elo_rating, puzzles_solved, bots_defeated FROM users ORDER BY elo_rating DESC LIMIT 20'
    );
    res.json({ players });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

module.exports = router;
