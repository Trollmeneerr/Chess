/**
 * Analysis Routes — Post-game analysis with Stockfish
 */
const express = require('express');
const router = express.Router();
const { Chess } = require('chess.js');
const stockfish = require('../engine/stockfish');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db');

// POST /api/analysis/game — Analyze a full game PGN
router.post('/game', authMiddleware, async (req, res) => {
  try {
    const { pgn, invite_code } = req.body;
    if (!pgn) return res.status(400).json({ error: 'PGN required' });

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
        const evalDiff = Math.abs(currentEval - prevEval);
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
      }
    };

    // Save analysis to game record if invite_code provided
    if (invite_code) {
      await db.run(
        'UPDATE games SET analysis_json = ? WHERE invite_code = ?',
        [JSON.stringify(result), invite_code]
      );
    }

    res.json(result);
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
      const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
      let w = 0, bl = 0;
      for (const row of c.board()) {
        for (const sq of row) {
          if (!sq) continue;
          if (sq.color === 'w') w += pieceValues[sq.type] || 0;
          else bl += pieceValues[sq.type] || 0;
        }
      }
      return res.json({ fen, eval: w - bl, scoreType: 'cp', bestmove: null });
    }

    const result = await stockfish.evaluate(fen);
    res.json({
      fen,
      eval: result.score,
      scoreType: result.scoreType,
      bestmove: result.bestmove
    });
  } catch (err) {
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
