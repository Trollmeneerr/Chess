/**
 * Analysis Routes — Post-game analysis with Stockfish
 */
const express = require('express');
const router = express.Router();
const { Chess } = require('chess.js');
const stockfish = require('../engine/stockfish');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const { optionalAuth } = require('../middleware/auth');
const { getBotByElo } = require('../engine/bots');

// GET /api/analysis/game/:identifier — Retrieve stored review from database for any node or client
router.get('/game/:identifier', optionalAuth, async (req, res) => {
  try {
    const { identifier } = req.params;
    let game = await db.get(
      `SELECT g.*, 
              w.username AS white_username, w.avatar_id AS white_avatar, w.elo_rating AS white_elo,
              b.username AS black_username, b.avatar_id AS black_avatar, b.elo_rating AS black_elo
       FROM games g
       LEFT JOIN users w ON g.white_id = w.id
       LEFT JOIN users b ON g.black_id = b.id
       WHERE g.invite_code = ? OR g.id = ?`,
      [identifier, isNaN(identifier) ? -1 : parseInt(identifier)]
    );

    if (!game) {
      return res.status(404).json({ error: 'Game not found in database' });
    }

    let parsedAnalysis = null;
    if (game.analysis_json) {
      try {
        parsedAnalysis = typeof game.analysis_json === 'string'
          ? JSON.parse(game.analysis_json)
          : game.analysis_json;
      } catch (e) {
        console.warn('[Analysis] Failed to parse analysis_json for game', game.invite_code);
      }
    }

    // Resolve opponent/players
    let opponentName = 'Unknown';
    let opponentAvatar = 1;
    let opponentElo = null;

    if (game.game_type === 'bot') {
      const bot = getBotByElo(game.bot_elo);
      opponentName = bot.name;
      opponentAvatar = bot.avatar;
      opponentElo = bot.elo;
    }

    res.json({
      success: true,
      id: game.id,
      invite_code: game.invite_code,
      game_type: game.game_type,
      time_control: game.time_control,
      bot_elo: game.bot_elo,
      result: game.result,
      pgn: game.pgn,
      created_at: game.created_at,
      has_analysis: Boolean(parsedAnalysis),
      analysis: parsedAnalysis,
      cached: Boolean(parsedAnalysis),
      white_player: {
        id: game.white_id,
        username: game.white_username || (game.game_type === 'bot' && !game.white_id ? opponentName : 'Player 1'),
        avatar: game.white_avatar || 1,
        elo: game.white_elo
      },
      black_player: {
        id: game.black_id,
        username: game.black_username || (game.game_type === 'bot' && !game.black_id ? opponentName : 'Player 2'),
        avatar: game.black_avatar || 1,
        elo: game.black_elo
      }
    });
  } catch (err) {
    console.error('[Analysis] Fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve analysis from database' });
  }
});

// GET /api/analysis/stored — List all matches in database with completed analysis (for nodes and dashboard)
router.get('/stored', optionalAuth, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT g.id, g.invite_code, g.white_id, g.black_id, g.game_type, g.time_control,
              g.bot_elo, g.result, g.created_at, g.analysis_json,
              w.username AS white_username, w.avatar_id AS white_avatar,
              b.username AS black_username, b.avatar_id AS black_avatar
       FROM games g
       LEFT JOIN users w ON g.white_id = w.id
       LEFT JOIN users b ON g.black_id = b.id
       WHERE g.analysis_json IS NOT NULL AND g.analysis_json != ''
       ORDER BY g.created_at DESC LIMIT 50`
    );

    const stored = rows.map(g => {
      let whiteAcc = null;
      let blackAcc = null;
      let moveCount = 0;
      try {
        const parsed = typeof g.analysis_json === 'string' ? JSON.parse(g.analysis_json) : g.analysis_json;
        whiteAcc = parsed.whiteAccuracy || null;
        blackAcc = parsed.blackAccuracy || null;
        moveCount = parsed.moves?.length ? Math.ceil(parsed.moves.length / 2) : 0;
      } catch (e) {}

      let botName = null;
      if (g.game_type === 'bot') {
        botName = getBotByElo(g.bot_elo)?.name || 'AI Bot';
      }

      return {
        id: g.id,
        invite_code: g.invite_code,
        game_type: g.game_type,
        time_control: g.time_control,
        result: g.result,
        white_name: g.white_username || (g.game_type === 'bot' && !g.white_id ? botName : 'Player 1'),
        black_name: g.black_username || (g.game_type === 'bot' && !g.black_id ? botName : 'Player 2'),
        white_accuracy: whiteAcc,
        black_accuracy: blackAcc,
        moves: moveCount,
        created_at: g.created_at
      };
    });

    res.json({ success: true, count: stored.length, games: stored });
  } catch (err) {
    console.error('[Analysis] Stored list error:', err);
    res.status(500).json({ error: 'Failed to list stored analyses' });
  }
});

// POST /api/analysis/store — Directly save/update analysis JSON from external nodes or workers
router.post('/store', optionalAuth, async (req, res) => {
  try {
    const { invite_code, game_id, analysis_json } = req.body;
    if (!analysis_json) {
      return res.status(400).json({ error: 'analysis_json required' });
    }

    const jsonStr = typeof analysis_json === 'object' ? JSON.stringify(analysis_json) : analysis_json;

    let targetCode = invite_code;
    if (!targetCode && game_id) {
      const g = await db.get('SELECT invite_code FROM games WHERE id = ?', [game_id]);
      if (g) targetCode = g.invite_code;
    }

    if (!targetCode) {
      return res.status(400).json({ error: 'Valid invite_code or game_id required to store analysis' });
    }

    await db.run('UPDATE games SET analysis_json = ? WHERE invite_code = ?', [jsonStr, targetCode]);
    res.json({ success: true, saved: true, invite_code: targetCode });
  } catch (err) {
    console.error('[Analysis] Store error:', err);
    res.status(500).json({ error: 'Failed to store analysis in database' });
  }
});

// POST /api/analysis/game — Analyze a full game PGN and store inside database
router.post('/game', optionalAuth, async (req, res) => {
  try {
    let { pgn, invite_code, game_id, force } = req.body;

    let game = null;
    if (invite_code) {
      game = await db.get('SELECT * FROM games WHERE invite_code = ?', [invite_code]);
    } else if (game_id) {
      game = await db.get('SELECT * FROM games WHERE id = ?', [game_id]);
    }

    // 1. If game already has analysis stored in DB and force refresh was not requested, return DB review immediately
    if (game && game.analysis_json && !force) {
      try {
        const cachedResult = typeof game.analysis_json === 'string'
          ? JSON.parse(game.analysis_json)
          : game.analysis_json;
        return res.json({
          ...cachedResult,
          cached: true,
          invite_code: game.invite_code,
          game_id: game.id,
          pgn: game.pgn || pgn
        });
      } catch (parseErr) {
        console.warn('[Analysis] Cached analysis parse failed, re-evaluating...');
      }
    }

    // 2. Determine PGN to analyze
    if (!pgn && game && game.pgn) {
      pgn = game.pgn;
    }

    if (!pgn) {
      return res.status(400).json({ error: 'PGN required or match has no recorded notation' });
    }

    let isStockfish = stockfish.isAvailable();
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });

    if (history.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty PGN' });
    }

    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    function calcMaterial(c) {
      const b = c.board();
      let w = 0, bl = 0;
      for (const row of b) {
        for (const sq of row) {
          if (!sq) continue;
          const val = pieceValues[sq.type] || 0;
          if (sq.color === 'w') w += val;
          else bl += val;
        }
      }
      return w - bl;
    }

    // Evaluate each position
    const analysis = [];
    const evalChess = new Chess();
    let prevEval = 0;

    for (let i = 0; i < history.length; i++) {
      const fen = evalChess.fen();
      const move = history[i];

      try {
        // Get evaluation before the move
        const evalResult = isStockfish
          ? await stockfish.evaluate(fen, 8, 800)
          : { score: calcMaterial(evalChess), bestmove: null };
        const currentEval = evalResult.score;

        // Apply the move
        evalChess.move(move.san);

        // Classify the move based on eval change
        const isWhiteMove = i % 2 === 0;
        const evalChange = isWhiteMove
          ? (currentEval - prevEval)
          : (prevEval - currentEval);

        let classification = 'good';
        let badge = '✓';

        // Check if the played move was the engine's best
        if (move.lan === evalResult.bestmove || move.from + move.to === evalResult.bestmove) {
          classification = 'best';
          badge = '★';
        } else if (evalChange < -2.0) {
          classification = 'blunder';
          badge = '??';
        } else if (evalChange < -1.0) {
          classification = 'mistake';
          badge = '?';
        } else if (evalChange < -0.5) {
          classification = 'inaccuracy';
          badge = '?!';
        }

        analysis.push({
          moveNumber: Math.floor(i / 2) + 1,
          san: move.san,
          uci: move.from + move.to + (move.promotion || ''),
          fen: fen,
          eval: currentEval,
          bestMove: evalResult.bestmove,
          classification,
          badge,
          evalChange: Math.round(evalChange * 100) / 100
        });

        prevEval = currentEval;
      } catch (err) {
        analysis.push({
          moveNumber: Math.floor(i / 2) + 1,
          san: move.san,
          uci: move.from + move.to + (move.promotion || ''),
          fen: fen,
          eval: prevEval,
          classification: 'unknown',
          badge: '·'
        });
        evalChess.move(move.san);
      }
    }

    // Calculate accuracy percentages (CAPS-style)
    const whiteMoves = analysis.filter((_, i) => i % 2 === 0);
    const blackMoves = analysis.filter((_, i) => i % 2 === 1);

    const calcAccuracy = (moves) => {
      if (moves.length === 0) return 100;
      const scores = moves.map(m => {
        switch (m.classification) {
          case 'best': return 100;
          case 'good': return 80;
          case 'inaccuracy': return 50;
          case 'mistake': return 20;
          case 'blunder': return 0;
          default: return 60;
        }
      });
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    };

    const result = {
      moves: analysis,
      whiteAccuracy: calcAccuracy(whiteMoves),
      blackAccuracy: calcAccuracy(blackMoves),
      summary: {
        white: countClassifications(whiteMoves),
        black: countClassifications(blackMoves)
      },
      analyzed_at: new Date().toISOString()
    };

    // 3. Persist review into database for later use with nodes
    let savedInviteCode = game ? game.invite_code : invite_code;
    const jsonToStore = JSON.stringify(result);

    if (game) {
      await db.run(
        'UPDATE games SET analysis_json = ? WHERE id = ?',
        [jsonToStore, game.id]
      );
    } else if (invite_code) {
      await db.run(
        'UPDATE games SET analysis_json = ? WHERE invite_code = ?',
        [jsonToStore, invite_code]
      );
    } else {
      // Create new game record in DB so it is permanently stored for nodes
      savedInviteCode = 'rev_' + uuidv4().replace(/-/g, '').substring(0, 8);
      await db.insert(
        'INSERT INTO games (invite_code, white_id, black_id, game_type, pgn, result, analysis_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [savedInviteCode, req.user?.id || null, null, 'analysis', pgn, '*', jsonToStore]
      );
    }

    res.json({
      ...result,
      cached: false,
      invite_code: savedInviteCode,
      game_id: game ? game.id : null,
      saved_to_database: true
    });
  } catch (err) {
    console.error('[Analysis] Error:', err);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// POST /api/analysis/evaluate — Evaluate a single position
router.post('/evaluate', async (req, res) => {
  try {
    const { fen } = req.body;
    if (!fen) return res.status(400).json({ error: 'FEN required' });

    if (!stockfish.isAvailable()) {
      const c = new Chess(fen);
      const pieceValues = { p: 1, n: 3, b: 3.15, r: 5, q: 9, k: 0 };
      let w = 0, bl = 0;
      for (const row of c.board()) {
        for (const sq of row) {
          if (!sq) continue;
          if (sq.color === 'w') w += pieceValues[sq.type] || 0;
          else bl += pieceValues[sq.type] || 0;
        }
      }
      const evalScore = Math.round((w - bl) * 10) / 10;
      return res.json({ fen, eval: evalScore, scoreType: 'cp', mate: null, bestmove: null });
    }

    const result = await stockfish.evaluate(fen, 8, 400);
    res.json({
      fen,
      eval: result.score,
      scoreType: result.scoreType,
      mate: result.mate !== undefined ? result.mate : null,
      bestmove: result.bestmove
    });
  } catch (err) {
    console.error('[Analysis] Evaluate error:', err.message);
    res.status(500).json({ error: 'Evaluation failed' });
  }
});

function countClassifications(moves) {
  const counts = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  moves.forEach(m => {
    if (counts[m.classification] !== undefined) counts[m.classification]++;
  });
  return counts;
}

module.exports = router;
