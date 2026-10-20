/**
 * Puzzle Routes — Fetch and solve puzzles
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

const PUZZLE_ELO_REWARD = parseInt(process.env.PUZZLE_ELO_REWARD) || 1;

// Difficulty ranges
const DIFFICULTY_RANGES = {
  easy: { min: 400, max: 900 },
  medium: { min: 900, max: 1400 },
  hard: { min: 1400, max: 1900 },
  master: { min: 1900, max: 3500 },
  adaptive: null // computed from user ELO
};

// GET /api/puzzles/random — Get a random puzzle
router.get('/random', optionalAuth, async (req, res) => {
  try {
    const difficulty = req.query.difficulty || 'medium';
    let minRating, maxRating;

    if (difficulty === 'adaptive' && req.user) {
      const user = await db.get('SELECT elo_rating FROM users WHERE id = ?', [req.user.id]);
      minRating = (user?.elo_rating || 800) - 100;
      maxRating = (user?.elo_rating || 800) + 100;
    } else {
      const range = DIFFICULTY_RANGES[difficulty] || DIFFICULTY_RANGES.medium;
      minRating = range.min;
      maxRating = range.max;
    }

    // Get a random puzzle the user hasn't solved (if authenticated)
    let puzzle;
    if (req.user) {
      puzzle = await db.get(
        `SELECT p.* FROM puzzles p
         WHERE p.rating BETWEEN ? AND ?
         AND p.puzzle_id NOT IN (SELECT puzzle_id FROM user_puzzle_history WHERE user_id = ? AND solved = 1)
         ORDER BY RANDOM() LIMIT 1`,
        [minRating, maxRating, req.user.id]
      );
    }

    // If no unsolved puzzle found or not authenticated, just get a random one
    if (!puzzle) {
      puzzle = await db.get(
        'SELECT * FROM puzzles WHERE rating BETWEEN ? AND ? ORDER BY RANDOM() LIMIT 1',
        [minRating, maxRating]
      );
    }

    if (!puzzle) {
      return res.status(404).json({ error: 'No puzzles found for this difficulty range' });
    }

    // Don't send the solution moves to the client initially
    res.json({
      puzzle_id: puzzle.puzzle_id,
      fen: puzzle.fen,
      rating: puzzle.rating,
      themes: puzzle.themes,
      // The first move is the "setup" move that the opponent just played
      // Remaining moves are the solution
      total_moves: puzzle.moves.split(' ').length
    });
  } catch (err) {
    console.error('[Puzzles] Error fetching puzzle:', err);
    res.status(500).json({ error: 'Failed to fetch puzzle' });
  }
});

// GET /api/puzzles/:puzzleId/solution — Get puzzle solution (for hint/reveal)
router.get('/:puzzleId/solution', optionalAuth, async (req, res) => {
  try {
    const puzzle = await db.get('SELECT * FROM puzzles WHERE puzzle_id = ?', [req.params.puzzleId]);
    if (!puzzle) return res.status(404).json({ error: 'Puzzle not found' });

    res.json({
      puzzle_id: puzzle.puzzle_id,
      moves: puzzle.moves,
      fen: puzzle.fen,
      rating: puzzle.rating,
      themes: puzzle.themes
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get puzzle solution' });
  }
});

// GET /api/puzzles/verified — Get verified multi-move puzzles list
router.get('/verified', optionalAuth, async (req, res) => {
  try {
    const puzzles = await db.all('SELECT puzzle_id as id, fen, moves, rating, themes, popularity FROM puzzles ORDER BY rating ASC');
    res.json(puzzles.map(p => ({
      ...p,
      moves: p.moves.trim().split(/\s+/)
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch verified puzzles' });
  }
});

// POST /api/puzzles/:puzzleId/attempt — Submit a puzzle attempt
router.post('/:puzzleId/attempt', authMiddleware, async (req, res) => {
  try {
    const { solved, used_solution } = req.body;
    const puzzleId = req.params.puzzleId;

    // Get puzzle info
    const puzzle = await db.get('SELECT * FROM puzzles WHERE puzzle_id = ?', [puzzleId]);
    if (!puzzle) return res.status(404).json({ error: 'Puzzle not found' });

    // Record attempt
    const existing = await db.get(
      'SELECT * FROM user_puzzle_history WHERE user_id = ? AND puzzle_id = ?',
      [req.user.id, puzzleId]
    );

    if (existing) {
      await db.run(
        'UPDATE user_puzzle_history SET solved = ?, attempts = attempts + 1 WHERE user_id = ? AND puzzle_id = ?',
        [solved ? 1 : existing.solved, req.user.id, puzzleId]
      );
    } else {
      await db.insert(
        'INSERT INTO user_puzzle_history (user_id, puzzle_id, solved, attempts) VALUES (?, ?, ?, 1)',
        [req.user.id, puzzleId, solved ? 1 : 0]
      );
    }

    // Award ELO based on reward system (+1 on perfect solve, 0 on 1 mistake/hint, -1 on 2+ mistakes/hints)
    let eloChange = 0;
    if (req.body.reward !== undefined) {
      eloChange = parseInt(req.body.reward) || 0;
      if (solved && eloChange >= 0) {
        await db.run(
          'UPDATE users SET elo_rating = MAX(0, elo_rating + ?), puzzles_solved = puzzles_solved + 1 WHERE id = ?',
          [eloChange, req.user.id]
        );
      } else {
        await db.run(
          'UPDATE users SET elo_rating = MAX(0, elo_rating + ?) WHERE id = ?',
          [eloChange, req.user.id]
        );
      }
    } else if (solved && !used_solution && (!existing || !existing.solved)) {
      eloChange = PUZZLE_ELO_REWARD;
      await db.run(
        'UPDATE users SET elo_rating = elo_rating + ?, puzzles_solved = puzzles_solved + 1 WHERE id = ?',
        [eloChange, req.user.id]
      );
    } else if (!solved) {
      // Determine difficulty for ELO penalty
      const userRating = (await db.get('SELECT elo_rating FROM users WHERE id = ?', [req.user.id]))?.elo_rating || 800;
      const isHard = puzzle.rating > 1400 || (puzzle.rating > userRating - 100 && puzzle.rating < userRating + 100);
      if (isHard) {
        eloChange = -1;
        await db.run(
          'UPDATE users SET elo_rating = MAX(0, elo_rating - 1) WHERE id = ?',
          [req.user.id]
        );
      }
    }

    const updatedUser = await db.get('SELECT elo_rating, puzzles_solved FROM users WHERE id = ?', [req.user.id]);

    res.json({
      success: true,
      elo_change: eloChange,
      new_elo: updatedUser.elo_rating,
      puzzles_solved: updatedUser.puzzles_solved,
      themes: puzzle.themes
    });
  } catch (err) {
    console.error('[Puzzles] Attempt error:', err);
    res.status(500).json({ error: 'Failed to record attempt' });
  }
});

// GET /api/puzzles/stats — Get puzzle stats
router.get('/stats/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.get('SELECT puzzles_solved, elo_rating FROM users WHERE id = ?', [req.user.id]);
    const attempted = await db.get(
      'SELECT COUNT(*) as count FROM user_puzzle_history WHERE user_id = ?',
      [req.user.id]
    );
    res.json({
      puzzles_solved: user?.puzzles_solved || 0,
      puzzles_attempted: attempted?.count || 0,
      elo_rating: user?.elo_rating || 800
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
