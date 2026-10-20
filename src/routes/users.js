/**
 * User Routes — Profile, Game History, and Leaderboard
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { getBotByElo } = require('../engine/bots');

// GET /api/users/profile/:username — Detailed profile with match history and stats
router.get('/profile/:username', optionalAuth, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, username, avatar_id, avatar_custom, timezone_id, elo_rating, puzzles_solved, bots_defeated, created_at FROM users WHERE username = ?',
      [req.params.username]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Fetch games for this user (both PvP and PvE)
    const games = await db.all(
      `SELECT g.id, g.invite_code, g.white_id, g.black_id, g.game_type, g.time_control, 
              g.bot_elo, g.pgn, g.result, g.created_at,
              w.username AS white_username, w.avatar_id AS white_avatar, w.elo_rating AS white_elo,
              b.username AS black_username, b.avatar_id AS black_avatar, b.elo_rating AS black_elo
       FROM games g
       LEFT JOIN users w ON g.white_id = w.id
       LEFT JOIN users b ON g.black_id = b.id
       WHERE (g.white_id = ? OR g.black_id = ?) AND g.result IS NOT NULL
       ORDER BY g.created_at DESC LIMIT 50`,
      [user.id, user.id]
    );

    let wins = 0;
    let losses = 0;
    let draws = 0;

    const recentGames = games.map(g => {
      const isWhite = g.white_id === user.id;
      let outcome = 'draw';
      let opponentName = 'Unknown';
      let opponentAvatar = 1;
      let opponentElo = null;

      if (g.game_type === 'bot') {
        const bot = getBotByElo(g.bot_elo);
        opponentName = bot.name;
        opponentAvatar = bot.avatar;
        opponentElo = bot.elo;
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

      if (g.result === '1-0') {
        outcome = isWhite ? 'win' : 'loss';
      } else if (g.result === '0-1') {
        outcome = isWhite ? 'loss' : 'win';
      } else {
        outcome = 'draw';
      }

      if (outcome === 'win') wins++;
      else if (outcome === 'loss') losses++;
      else draws++;

      // Count moves in PGN
      let moveCount = 0;
      if (g.pgn) {
        const matches = g.pgn.match(/\d+\.\s/g);
        if (matches) moveCount = matches.length;
      }

      // Calculate rating change
      let eloChange = 0;
      if (g.game_type === 'bot') {
        if (outcome === 'win') {
          eloChange = g.bot_elo > (user.elo_rating || 800)
            ? Math.min(25, 5 + Math.round((g.bot_elo - (user.elo_rating || 800)) * 0.04))
            : 5;
        } else {
          eloChange = 0;
        }
      } else {
        const userRating = isWhite ? (g.white_elo || user.elo_rating || 800) : (g.black_elo || user.elo_rating || 800);
        const oppRating = isWhite ? (g.black_elo || 800) : (g.white_elo || 800);
        const expected = 1 / (1 + Math.pow(10, (oppRating - userRating) / 400));
        const actual = outcome === 'win' ? 1 : (outcome === 'draw' ? 0.5 : 0);
        eloChange = Math.round(32 * (actual - expected));
      }

      return {
        id: g.id,
        invite_code: g.invite_code,
        game_type: g.game_type,
        time_control: g.time_control || 'rapid',
        user_color: isWhite ? 'white' : 'black',
        outcome,
        result: g.result,
        elo_change: eloChange,
        opponent_name: opponentName,
        opponent_avatar: opponentAvatar,
        opponent_elo: opponentElo,
        move_count: moveCount,
        pgn: g.pgn,
        created_at: g.created_at
      };
    });

    const totalGames = wins + losses + draws;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

    // Fetch defeated bosses
    const botWins = await db.all(
      'SELECT DISTINCT bot_elo FROM bot_win_log WHERE user_id = ? ORDER BY bot_elo ASC',
      [user.id]
    );
    const defeatedBosses = botWins.map(b => b.bot_elo);

    res.json({
      user,
      stats: {
        total_games: totalGames,
        wins,
        losses,
        draws,
        win_rate: winRate,
        defeated_bosses: defeatedBosses
      },
      recent_games: recentGames,
      is_current_user: req.user ? req.user.id === user.id : false
    });
  } catch (err) {
    console.error('[Users] Profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// GET /api/users/leaderboard — Top 20 players by ELO
router.get('/leaderboard', async (req, res) => {
  try {
    const players = await db.all(
      'SELECT username, avatar_id, avatar_custom, elo_rating, puzzles_solved, bots_defeated FROM users ORDER BY elo_rating DESC LIMIT 20'
    );
    res.json({ players });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// POST /api/users/avatar — Update user avatar selector or custom upload
router.post('/avatar', authMiddleware, async (req, res) => {
  try {
    const { avatar_id, avatar_custom } = req.body;
    const userId = req.user.id;

    if (avatar_id !== undefined && avatar_custom !== undefined) {
      await db.run('UPDATE users SET avatar_id = ?, avatar_custom = ? WHERE id = ?', [avatar_id, avatar_custom, userId]);
    } else if (avatar_id !== undefined) {
      await db.run('UPDATE users SET avatar_id = ? WHERE id = ?', [avatar_id, userId]);
    } else if (avatar_custom !== undefined) {
      await db.run('UPDATE users SET avatar_custom = ? WHERE id = ?', [avatar_custom, userId]);
    }

    const updated = await db.get(
      'SELECT id, username, avatar_id, avatar_custom, timezone_id, elo_rating, puzzles_solved, bots_defeated FROM users WHERE id = ?',
      [userId]
    );
    res.json({ success: true, user: updated });
  } catch (err) {
    console.error('[Users] Update avatar error:', err);
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

// POST /api/users/timezone — Update user timezone
router.post('/timezone', authMiddleware, async (req, res) => {
  try {
    const { timezone_id } = req.body;
    if (!timezone_id || typeof timezone_id !== 'string') {
      return res.status(400).json({ error: 'timezone_id is required' });
    }
    const cleanTz = timezone_id.trim();
    try {
      Intl.DateTimeFormat(undefined, { timeZone: cleanTz });
    } catch (e) {
      return res.status(400).json({ error: 'Invalid IANA timezone identifier' });
    }
    await db.run('UPDATE users SET timezone_id = ? WHERE id = ?', [cleanTz, req.user.id]);
    res.json({ success: true, timezone_id: cleanTz });
  } catch (err) {
    console.error('[Users] Error updating timezone:', err);
    res.status(500).json({ error: 'Failed to update timezone' });
  }
});

// GET /api/users/search?q=query — Search users
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 1) {
      return res.json({ users: [] });
    }
    const currentUserId = req.user ? req.user.id : -1;
    const users = await db.all(
      `SELECT id, username, avatar_id, avatar_custom, elo_rating 
       FROM users 
       WHERE username LIKE ? AND id != ? 
       ORDER BY elo_rating DESC LIMIT 20`,
      [`%${q}%`, currentUserId]
    );
    res.json({ users });
  } catch (err) {
    console.error('[Users] Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/users/friends — List friends and pending requests
router.get('/friends', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Accepted friends
    const friends = await db.all(
      `SELECT u.id, u.username, u.avatar_id, u.avatar_custom, u.elo_rating, f.created_at AS friendship_date
       FROM friends f
       JOIN users u ON f.friend_id = u.id
       WHERE f.user_id = ?
       ORDER BY u.username ASC`,
      [userId]
    );

    // Incoming pending requests
    const incoming = await db.all(
      `SELECT fr.id AS request_id, u.id AS sender_id, u.username, u.avatar_id, u.avatar_custom, u.elo_rating, fr.created_at
       FROM friend_requests fr
       JOIN users u ON fr.sender_id = u.id
       WHERE fr.receiver_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [userId]
    );

    // Outgoing pending requests
    const outgoing = await db.all(
      `SELECT fr.id AS request_id, u.id AS receiver_id, u.username, u.avatar_id, u.avatar_custom, u.elo_rating, fr.created_at
       FROM friend_requests fr
       JOIN users u ON fr.receiver_id = u.id
       WHERE fr.sender_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [userId]
    );

    res.json({ friends, incoming, outgoing });
  } catch (err) {
    console.error('[Users] Get friends error:', err);
    res.status(500).json({ error: 'Failed to retrieve friends list' });
  }
});

// POST /api/users/friends/request — Send friend request
router.post('/friends/request', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { target_username, target_id } = req.body;

    let target = null;
    if (target_id) {
      target = await db.get('SELECT id, username FROM users WHERE id = ?', [target_id]);
    } else if (target_username) {
      target = await db.get('SELECT id, username FROM users WHERE username = ?', [target_username]);
    }

    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.id === userId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    // Check if already friends
    const isFriend = await db.get('SELECT id FROM friends WHERE user_id = ? AND friend_id = ?', [userId, target.id]);
    if (isFriend) {
      return res.status(400).json({ error: 'Already friends' });
    }

    // Check if reciprocal request exists -> auto-accept
    const reciprocal = await db.get(
      'SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = "pending"',
      [target.id, userId]
    );
    if (reciprocal) {
      await db.run('DELETE FROM friend_requests WHERE id = ?', [reciprocal.id]);
      try {
        await db.insert('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)', [userId, target.id]);
      } catch (e) {}
      try {
        await db.insert('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)', [target.id, userId]);
      } catch (e) {}
      return res.json({ success: true, message: `Connected! You and ${target.username} are now friends.` });
    }

    // Check if request already sent
    const existing = await db.get(
      'SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ?',
      [userId, target.id]
    );
    if (existing) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    await db.insert('INSERT INTO friend_requests (sender_id, receiver_id, status) VALUES (?, ?, "pending")', [userId, target.id]);
    res.json({ success: true, message: `Friend request sent to ${target.username}` });
  } catch (err) {
    console.error('[Users] Friend request error:', err);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// POST /api/users/friends/accept — Accept friend request
router.post('/friends/accept', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { request_id, sender_id } = req.body;

    let reqRow = null;
    if (request_id) {
      reqRow = await db.get('SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?', [request_id, userId]);
    } else if (sender_id) {
      reqRow = await db.get(
        'SELECT * FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = "pending"',
        [sender_id, userId]
      );
    }

    if (!reqRow) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    const otherId = reqRow.sender_id;
    await db.run('DELETE FROM friend_requests WHERE id = ?', [reqRow.id]);

    try {
      await db.insert('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)', [userId, otherId]);
    } catch (e) {}
    try {
      await db.insert('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)', [otherId, userId]);
    } catch (e) {}

    res.json({ success: true, message: 'Friend request accepted' });
  } catch (err) {
    console.error('[Users] Accept friend error:', err);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// POST /api/users/friends/decline — Decline friend request
router.post('/friends/decline', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { request_id, sender_id } = req.body;

    if (request_id) {
      await db.run('DELETE FROM friend_requests WHERE id = ? AND receiver_id = ?', [request_id, userId]);
    } else if (sender_id) {
      await db.run('DELETE FROM friend_requests WHERE sender_id = ? AND receiver_id = ?', [sender_id, userId]);
    }
    res.json({ success: true, message: 'Friend request declined' });
  } catch (err) {
    console.error('[Users] Decline friend error:', err);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// POST /api/users/friends/remove — Remove friend
router.post('/friends/remove', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { friend_id } = req.body;
    if (!friend_id) return res.status(400).json({ error: 'friend_id required' });

    await db.run(
      'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [userId, friend_id, friend_id, userId]
    );
    res.json({ success: true, message: 'Friend removed' });
  } catch (err) {
    console.error('[Users] Remove friend error:', err);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

module.exports = router;
