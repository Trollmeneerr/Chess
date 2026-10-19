/**
 * Game Routes — Create/join matches, game history
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

// POST /api/games/create — Create a new PvP or Bot match
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { game_type, time_control, color_preference, bot_elo } = req.body;
    const inviteCode = 'inv_' + uuidv4().replace(/-/g, '').substring(0, 8);

    let whiteId = null;
    let blackId = null;

    if (game_type === 'bot') {
      // Bot game: player is always one color, bot is the other
      const preferredColor = color_preference || 'random';
      const isWhite = preferredColor === 'white' || (preferredColor === 'random' && Math.random() > 0.5);
      whiteId = isWhite ? req.user.id : null;
      blackId = isWhite ? null : req.user.id;
    } else {
      // PvP: creator picks side or random
      const preferredColor = color_preference || 'random';
      if (preferredColor === 'white') whiteId = req.user.id;
      else if (preferredColor === 'black') blackId = req.user.id;
      else {
        if (Math.random() > 0.5) whiteId = req.user.id;
        else blackId = req.user.id;
      }
    }

    const result = await db.insert(
      'INSERT INTO games (invite_code, white_id, black_id, game_type, time_control, bot_elo) VALUES (?, ?, ?, ?, ?, ?)',
      [inviteCode, whiteId, blackId, game_type || 'pvp', time_control || 'rapid', bot_elo || null]
    );

    res.json({
      game_id: result.lastInsertRowid,
      invite_code: inviteCode,
      white_id: whiteId,
      black_id: blackId,
      game_type: game_type || 'pvp',
      time_control: time_control || 'rapid'
    });
  } catch (err) {
    console.error('[Games] Create error:', err);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// GET /api/games/:inviteCode — Get game info by invite code
router.get('/:inviteCode', optionalAuth, async (req, res) => {
  try {
    const game = await db.get('SELECT * FROM games WHERE invite_code = ?', [req.params.inviteCode]);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Get player names
    let whiteName = null, blackName = null;
    if (game.white_id) {
      const w = await db.get('SELECT username, avatar_id, elo_rating FROM users WHERE id = ?', [game.white_id]);
      if (w) whiteName = w;
    }
    if (game.black_id) {
      const b = await db.get('SELECT username, avatar_id, elo_rating FROM users WHERE id = ?', [game.black_id]);
      if (b) blackName = b;
    }

    res.json({
      ...game,
      white_player: whiteName,
      black_player: blackName,
      is_current_user_white: req.user ? game.white_id === req.user.id : false,
      is_current_user_black: req.user ? game.black_id === req.user.id : false
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get game' });
  }
});

// POST /api/games/:inviteCode/join — Join a PvP game
router.post('/:inviteCode/join', authMiddleware, async (req, res) => {
  try {
    const game = await db.get('SELECT * FROM games WHERE invite_code = ?', [req.params.inviteCode]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.result) return res.status(400).json({ error: 'Game already finished' });

    // Check if user is already in the game
    if (game.white_id === req.user.id || game.black_id === req.user.id) {
      return res.json({ game, status: 'already_joined' });
    }

    // Fill the empty slot
    if (!game.white_id) {
      await db.run('UPDATE games SET white_id = ? WHERE invite_code = ?', [req.user.id, req.params.inviteCode]);
    } else if (!game.black_id) {
      await db.run('UPDATE games SET black_id = ? WHERE invite_code = ?', [req.user.id, req.params.inviteCode]);
    } else {
      return res.status(400).json({ error: 'Game is full' });
    }

    const updated = await db.get('SELECT * FROM games WHERE invite_code = ?', [req.params.inviteCode]);
    res.json({ game: updated, status: 'joined' });
  } catch (err) {
    console.error('[Games] Join error:', err);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// POST /api/games/:inviteCode/save — Save finished game
router.post('/:inviteCode/save', authMiddleware, async (req, res) => {
  try {
    const { pgn, result, analysis_json } = req.body;
    await db.run(
      'UPDATE games SET pgn = ?, result = ?, analysis_json = ? WHERE invite_code = ?',
      [pgn, result, analysis_json ? JSON.stringify(analysis_json) : null, req.params.inviteCode]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save game' });
  }
});

// GET /api/games/history/me — Get current user's game history
router.get('/history/me', authMiddleware, async (req, res) => {
  try {
    const games = await db.all(
      'SELECT * FROM games WHERE (white_id = ? OR black_id = ?) AND result IS NOT NULL ORDER BY created_at DESC LIMIT 50',
      [req.user.id, req.user.id]
    );
    res.json({ games });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get game history' });
  }
});

module.exports = router;
