/**
 * Game Routes — Create/join matches, game history
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { toIsoUtc } = require('../utils/time');

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

const { getBotByElo } = require('../engine/bots');

// GET /api/games/history/me — Get current user's game history with full opponent and analysis metadata
router.get('/history/me', authMiddleware, async (req, res) => {
  try {
    const games = await db.all(
      `SELECT g.id, g.invite_code, g.white_id, g.black_id, g.game_type, g.time_control, 
              g.bot_elo, g.pgn, g.result, g.analysis_json, g.created_at,
              w.username AS white_username, w.avatar_id AS white_avatar, w.elo_rating AS white_elo,
              b.username AS black_username, b.avatar_id AS black_avatar, b.elo_rating AS black_elo
       FROM games g
       LEFT JOIN users w ON g.white_id = w.id
       LEFT JOIN users b ON g.black_id = b.id
       WHERE (g.white_id = ? OR g.black_id = ?) AND g.result IS NOT NULL AND g.game_type IN ('pvp', 'bot')
       ORDER BY g.created_at DESC LIMIT 50`,
      [req.user.id, req.user.id]
    );

    const formatted = games.map(g => {
      const isWhite = g.white_id === req.user.id;
      let outcome = 'draw';
      let opponentName = 'Unknown';
      let opponentAvatar = 1;
      let opponentElo = null;

      if (g.game_type === 'bot') {
        const bot = getBotByElo(g.bot_elo);
        opponentName = bot?.name || 'AI Bot';
        opponentAvatar = bot?.avatar || 1;
        opponentElo = bot?.elo || g.bot_elo;
      } else {
        if (isWhite) {
          opponentName = g.black_username || 'Opponent';
          opponentAvatar = g.black_avatar || 1;
          opponentElo = g.black_elo;
        } else {
          opponentName = g.white_username || 'Opponent';
          opponentAvatar = g.white_avatar || 1;
          opponentElo = g.white_elo;
        }
      }

      if (g.result === '1-0') outcome = isWhite ? 'win' : 'loss';
      else if (g.result === '0-1') outcome = isWhite ? 'loss' : 'win';
      else outcome = 'draw';

      let moveCount = 0;
      if (g.pgn) {
        const matches = g.pgn.match(/\d+\.\s/g);
        if (matches) moveCount = matches.length;
      }

      let whiteAccuracy = null;
      let blackAccuracy = null;
      if (g.analysis_json) {
        try {
          const parsed = typeof g.analysis_json === 'string' ? JSON.parse(g.analysis_json) : g.analysis_json;
          whiteAccuracy = parsed.whiteAccuracy;
          blackAccuracy = parsed.blackAccuracy;
        } catch (e) {}
      }

      return {
        id: g.id,
        invite_code: g.invite_code,
        game_type: g.game_type,
        time_control: g.time_control || 'rapid',
        user_color: isWhite ? 'white' : 'black',
        outcome,
        result: g.result,
        opponent_name: opponentName,
        opponent_avatar: opponentAvatar,
        opponent_elo: opponentElo,
        move_count: moveCount,
        has_analysis: Boolean(g.analysis_json),
        white_accuracy: whiteAccuracy,
        black_accuracy: blackAccuracy,
        pgn: g.pgn,
        created_at: toIsoUtc(g.created_at)
      };
    });

    res.json({ games: formatted });
  } catch (err) {
    console.error('[Games] History error:', err);
    res.status(500).json({ error: 'Failed to get game history' });
  }
});

module.exports = router;
