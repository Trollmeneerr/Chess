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
      'SELECT id, username, avatar_id, elo_rating, puzzles_solved, bots_defeated, created_at FROM users WHERE username = ?',
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
      'SELECT username, avatar_id, elo_rating, puzzles_solved, bots_defeated FROM users ORDER BY elo_rating DESC LIMIT 20'
    );
    res.json({ players });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

module.exports = router;
