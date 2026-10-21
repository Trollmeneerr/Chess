/**
 * Bot Personality Engine
 * Calibrates Stockfish to play at specific ELO levels with natural human-like play
 */
const stockfish = require('./stockfish');
const { Chess } = require('chess.js');

/**
 * Bot roster — each has a name, target ELO, and personality settings
 */
const BOT_ROSTER = [
  { name: 'Frosty',        elo: 250,  depth: 1, avatar: 1,  description: 'Just learned the rules. Drops pieces constantly.' },
  { name: 'Chilly',        elo: 500,  depth: 2, avatar: 2,  description: 'Knows how pieces move, but misses tactics.' },
  { name: 'Cooler',        elo: 800,  depth: 3, avatar: 3,  description: 'Can spot simple threats and captures.' },
  { name: 'Freezer',       elo: 1000, depth: 3, avatar: 4,  description: 'Solid beginner. Occasionally finds tactics.' },
  { name: 'Ice Box',       elo: 1200, depth: 4, avatar: 5,  description: 'Intermediate player. Understands basic strategy.' },
  { name: 'Sub-Zero',      elo: 1350, depth: 5, avatar: 6,  description: 'Strong club player. Fewer mistakes.' },
  { name: 'Glacier',       elo: 1500, depth: 6, avatar: 7,  description: 'Advanced player. Solid positional understanding.' },
  { name: 'Arctic Storm',  elo: 1800, depth: 7, avatar: 8,  description: 'Expert-level play. Finds deep tactics.' },
  { name: 'Absolute Zero', elo: 2000, depth: 8, avatar: 9,  description: 'The final boss. Near-master strength.' },
];

function getBotRoster() {
  return BOT_ROSTER.map(b => ({
    name: b.name,
    elo: b.elo,
    avatar: b.avatar,
    description: b.description
  }));
}

function getBotByElo(targetElo) {
  return BOT_ROSTER.find(b => b.elo === targetElo) || BOT_ROSTER[0];
}

/**
 * Simple heuristic fallback move generator when Stockfish is not running
 */
function getFallbackBotMove(fen, targetElo) {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return { move: null, error: 'No legal moves' };

    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    if (targetElo < 800) {
      // Pick random move
      const chosen = moves[Math.floor(Math.random() * moves.length)];
      return { move: chosen.from + chosen.to + (chosen.promotion || '') };
    }

    // Score moves based on capture value and checks
    let bestScore = -9999;
    let candidates = [];

    for (const m of moves) {
      let score = 0;
      if (m.captured) score += (pieceValues[m.captured] || 1) * 10;
      if (m.promotion) score += 90;
      // Center control (e4, d4, e5, d5)
      if (['e4', 'd4', 'e5', 'd5'].includes(m.to)) score += 2;

      // Small random noise based on targetElo
      const noise = (Math.random() * (2000 - targetElo)) / 100;
      score -= noise;

      if (score > bestScore) {
        bestScore = score;
        candidates = [m];
      } else if (Math.abs(score - bestScore) < 0.5) {
        candidates.push(m);
      }
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || moves[0];
    return { move: chosen.from + chosen.to + (chosen.promotion || '') };
  } catch (err) {
    return { move: null, error: err.message };
  }
}

/**
 * Get a bot move for a position using calibrated strength
 * @param {string} fen Current board FEN
 * @param {string} moves Space-separated UCI move list
 * @param {number} targetElo Bot's target ELO
 * @returns {Promise<{move: string, evaluation: object}>}
 */
async function getBotMove(fen, moves, targetElo) {
  const bot = getBotByElo(targetElo);

  if (!stockfish.isAvailable()) {
    return getFallbackBotMove(fen, targetElo);
  }

  if (targetElo < 1320) {
    // Hybrid move selector for sub-1320 ELO bots
    return await getWeakBotMove(fen, moves, bot);
  } else {
    // Use native UCI_LimitStrength
    return await getStrongBotMove(fen, moves, bot);
  }
}

/**
 * Weak bot (250-1200 ELO): MultiPV with Gaussian selection
 */
async function getWeakBotMove(fen, moves, bot) {
  try {
    const result = await stockfish.getMultiPV(fen, moves, 5, bot.depth, 800);
    const pvLines = result.pvLines.filter(pv => pv && pv.bestMove);

    if (pvLines.length === 0) {
      return { move: result.bestmove, evaluation: null };
    }

    // Generate weighted probabilities based on target ELO
    // Lower ELO = more likely to pick worse moves
    const weights = generateWeights(bot.elo, pvLines.length);
    const selectedIndex = weightedRandom(weights);
    const selectedPV = pvLines[Math.min(selectedIndex, pvLines.length - 1)];

    return {
      move: selectedPV.bestMove,
      evaluation: {
        score: selectedPV.score,
        selectedRank: selectedIndex + 1,
        totalPV: pvLines.length
      }
    };
  } catch (err) {
    console.error('[Bot] Error getting weak bot move:', err);
    return { move: null, error: err.message };
  }
}

/**
 * Strong bot (1350-2000 ELO): Native UCI_LimitStrength
 */
async function getStrongBotMove(fen, moves, bot) {
  try {
    const result = await stockfish.getBestMove(fen, moves, bot.depth, 1500, {
      limitStrength: true,
      elo: bot.elo
    });

    return {
      move: result.bestmove,
      evaluation: {
        score: null,
        ponder: result.ponder
      }
    };
  } catch (err) {
    console.error('[Bot] Error getting strong bot move:', err);
    return { move: null, error: err.message };
  }
}

/**
 * Generate weighted probability distribution for move selection
 * Lower ELO = flatter distribution (more random)
 * Higher ELO = sharper distribution (more likely to pick best)
 */
function generateWeights(targetElo, numMoves) {
  // Sigma controls how "peaked" the distribution is
  // Low sigma = sharp peak at best move (stronger play)
  // High sigma = flat distribution (weaker play)
  const sigma = mapEloToSigma(targetElo);
  const weights = [];

  for (let i = 0; i < numMoves; i++) {
    // Gaussian centered at index 0 (best move)
    weights.push(Math.exp(-0.5 * (i / sigma) ** 2));
  }

  // Normalize
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => w / sum);
}

function mapEloToSigma(elo) {
  // 250 ELO -> sigma ~3.0 (very flat, picks bad moves often)
  // 500 ELO -> sigma ~2.2
  // 800 ELO -> sigma ~1.5
  // 1000 ELO -> sigma ~1.0
  // 1200 ELO -> sigma ~0.6 (mostly picks best/2nd best)
  if (elo <= 250) return 3.0;
  if (elo >= 1200) return 0.6;
  // Linear interpolation
  return 3.0 - ((elo - 250) / (1200 - 250)) * (3.0 - 0.6);
}

function weightedRandom(weights) {
  const rand = Math.random();
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) return i;
  }
  return weights.length - 1;
}

module.exports = { getBotMove, getBotRoster, getBotByElo, BOT_ROSTER };
