const fs = require('fs');
const path = require('path');

const puzzlesPath = path.join(__dirname, '..', '..', 'data', 'verified-multi-move-puzzles.json');
const puzzles = JSON.parse(fs.readFileSync(puzzlesPath, 'utf8'));

const outPath = path.join(__dirname, '..', '..', 'public', 'js', 'multi-move-puzzles.js');

const js = `/**
 * =========================================================================
 * multi-move-puzzles.js
 * Verified Multi-Move Tactical Puzzle Engine + Stockfish Continuation
 *
 * Source: Official Lichess Verified Puzzle Database (CC0 Public Domain)
 * Filter: moves.split(' ').length >= 6 (at least 3 player moves / 6+ plies)
 * Features:
 *  1. Multi-Move forced tactical sequences (3 to 5+ moves)
 *  2. Opponent setup blunder autoplay (250ms) + opponent responses (320ms)
 *  3. Post-Puzzle 'See 5 Moves Ahead' with Stockfish (10 plies preview)
 *  4. Free board exploration mode upon completion
 *  5. Blue Best Path Arrow (#3b82f6) + Origin Square Highlight
 *  6. Mulberry32 Seeded PRNG for reproducible runs
 *  7. Dynamic Reward Penalty System (+1 start -> 0 on 1st -> -1 on 2nd+)
 * =========================================================================
 */

const puzzleController = {
  puzzle: null,
  movesUci: [],     // e.g. ['f6d5', 'e4d5', 'e6d5', 'c4d5', 'f8e8', 'f1e1']
  stepIndex: 1,     // 0 is opponent setup move; player starts at 1
  penaltyCount: 0,
  reward: 1,
  isCompleted: false,
  freeAnalysisGame: null
};

// Mulberry32 Seeded PRNG for reproducible puzzle runs
function getSeededRandom(seed) {
  let seedNum = typeof seed === 'number' ? seed : hashSeed(seed);
  return function() {
    let t = (seedNum += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  let hash = 0;
  const str = String(seed || Date.now());
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

/**
 * 1. BACKEND / SEEDED MULTI-MOVE PUZZLE LOADER
 */
function startSeededMultiMovePuzzle(puzzlePool, seed = Date.now()) {
  if (typeof resetBoardVisualState === 'function') {
    resetBoardVisualState();
  }

  const poolSource = (puzzlePool && puzzlePool.length > 0) ? puzzlePool : VERIFIED_MULTI_MOVE_PUZZLES;
  // Filter for multi-move puzzles (at least 6 plies = 3 player moves)
  const multiMovePool = poolSource.filter(p => {
    const arr = Array.isArray(p.moves) ? p.moves : p.moves.trim().split(/\\s+/);
    return arr.length >= 6;
  });
  const effectivePool = multiMovePool.length > 0 ? multiMovePool : poolSource;

  const rand = getSeededRandom(seed);
  const selected = effectivePool[Math.floor(rand() * effectivePool.length)];

  puzzleController.puzzle = selected;
  puzzleController.movesUci = Array.isArray(selected.moves) ? [...selected.moves] : selected.moves.trim().split(/\\s+/);
  puzzleController.stepIndex = 1;
  puzzleController.penaltyCount = 0;
  puzzleController.reward = 1;
  puzzleController.isCompleted = false;
  puzzleController.freeAnalysisGame = null;

  // Mirror onto window.puzzleState for backward compatibility with other components
  if (window.puzzleState) {
    window.puzzleState.currentPuzzle = selected;
    window.puzzleState.solutionIndex = 1;
    window.puzzleState.penaltyCount = 0;
    window.puzzleState.reward = 1;
    window.puzzleState.isFinished = false;
  }

  updatePuzzleRewardBadge();

  // Reset continuation box and feedback
  const contBox = document.getElementById('puzzle-continuation-box');
  if (contBox) contBox.classList.add('hidden');

  const feedback = document.getElementById('puzzle-feedback');
  if (feedback) feedback.classList.add('hidden');

  // Update Rating & Themes display in UI
  const ratingEl = document.getElementById('puzzle-rating');
  if (ratingEl && selected.rating) {
    ratingEl.textContent = selected.rating + ' Rating';
  }
  const themeContainer = document.getElementById('puzzle-themes');
  if (themeContainer) {
    const tags = (selected.themes || 'tactics').split(' ').map(t => '<span class="puzzle-theme-tag">' + t + '</span>').join('');
    themeContainer.innerHTML = tags;
  }

  // Determine player color: Initial FEN turn is who makes the setup blunder (moves[0])
  const initialTurn = (selected.fen.split(' ')[1] || 'w').toLowerCase();
  const playerColor = initialTurn === 'w' ? 'black' : 'white';

  const turnInd = document.getElementById('puzzle-turn-indicator');
  if (turnInd) {
    turnInd.textContent = 'Opponent is making a move...';
  }

  // Initialize board with orientation and initial FEN (locked while opponent plays setup blunder)
  const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);
  if (cb) {
    cb.init('board-container', {
      orientation: playerColor,
      playerColor: playerColor,
      fen: selected.fen,
      interactive: false
    });
  } else if (typeof renderBoardFromFen === 'function') {
    renderBoardFromFen(selected.fen);
  }

  // Play opponent's setup blunder (movesUci[0]) after 250ms
  setTimeout(() => {
    const setupUci = puzzleController.movesUci[0];
    if (setupUci) {
      executeUciMoveOnBoard(setupUci);
      highlightMoveSquares(setupUci);
      if (typeof playChessSound === 'function') {
        playChessSound('move');
      }
    }

    // Unlock board for player's response
    if (cb) {
      cb.interactive = true;
      cb.onMove = (attempt) => {
        return onUserPuzzleMove(attempt.from, attempt.to, attempt.promotion);
      };
      cb.render();
      cb.bindEvents();
    }

    if (turnInd) {
      turnInd.textContent = 'Your Turn — Find the winning continuation for ' + playerColor.toUpperCase() + '!';
    }
  }, 250);
}

/**
 * 2. VALIDATE PLAYER MOVE THROUGH ALL MULTI-MOVE STEPS
 */
function onUserPuzzleMove(fromSq, toSq, promotion = '') {
  // If puzzle is completed, handle as free analysis exploration!
  if (puzzleController.isCompleted) {
    return handleFreeExplorationMove({ from: fromSq, to: toSq, promotion });
  }

  if (!puzzleController.puzzle) return false;

  const expectedUci = puzzleController.movesUci[puzzleController.stepIndex];
  const playedUci = (fromSq + toSq + (promotion || '')).toLowerCase();

  // Wrong move -> Apply penalty (0 on 1st, -1 on 2nd+) and snap piece back
  if (!expectedUci || !expectedUci.toLowerCase().startsWith(playedUci.slice(0, 4))) {
    applyPuzzleMistakeOrHintPenalty();

    const feedback = document.getElementById('puzzle-feedback');
    if (feedback) {
      feedback.className = 'puzzle-feedback glass-panel incorrect';
      feedback.classList.remove('hidden');
      feedback.textContent = '✗ Incorrect move. Look for a stronger tactical blow!';
    }

    if (typeof playChessSound === 'function') {
      playChessSound('check');
    }

    // Snap piece back to source square
    const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);
    if (cb) {
      cb.selectedSquare = null;
      cb.legalMoves = [];
      cb.render();
      cb.bindEvents();
    }
    return false;
  }

  // Correct move played!
  if (typeof resetBoardVisualState === 'function') {
    resetBoardVisualState();
  }
  executeUciMoveOnBoard(expectedUci);
  highlightMoveSquares(expectedUci);
  if (typeof playChessSound === 'function') {
    playChessSound('move');
  }
  puzzleController.stepIndex += 1;

  // Check if the entire multi-move puzzle is finished
  if (puzzleController.stepIndex >= puzzleController.movesUci.length) {
    onPuzzleCompleted();
    return true;
  }

  // Auto-play opponent's next forced response after 320ms
  const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);
  if (cb) cb.interactive = false;

  setTimeout(() => {
    const opponentReplyUci = puzzleController.movesUci[puzzleController.stepIndex];
    if (opponentReplyUci) {
      if (typeof resetBoardVisualState === 'function') {
        resetBoardVisualState();
      }
      executeUciMoveOnBoard(opponentReplyUci);
      highlightMoveSquares(opponentReplyUci);
      if (typeof playChessSound === 'function') {
        playChessSound('move');
      }
      puzzleController.stepIndex += 1;

      if (puzzleController.stepIndex >= puzzleController.movesUci.length) {
        onPuzzleCompleted();
      } else {
        // Unlock board for user's next move
        if (cb) {
          cb.interactive = true;
          cb.bindEvents();
        }
      }
    }
  }, 320);

  return true;
}

/**
 * 3. PUZZLE COMPLETED: SHOW BEST PATH + 5 MOVES IN ADVANCE (10 PLIES) WITH STOCKFISH
 */
function onPuzzleCompleted() {
  puzzleController.isCompleted = true;
  if (window.puzzleState) window.puzzleState.isFinished = true;
  if (window.PuzzlesPage) window.PuzzlesPage.isFinished = true;

  if (typeof playChessSound === 'function') {
    playChessSound('game_over');
  }

  const feedback = document.getElementById('puzzle-feedback');
  if (feedback) {
    feedback.className = 'puzzle-feedback glass-panel correct';
    feedback.classList.remove('hidden');
    const pts = puzzleController.reward > 0 ? '+1 ELO' : (puzzleController.reward === 0 ? '+0 ELO' : '-1 ELO');
    feedback.textContent = '✓ Correct! Puzzle Solved (' + pts + ') — Free Exploration Unlocked';
  }

  const turnInd = document.getElementById('puzzle-turn-indicator');
  if (turnInd) {
    turnInd.textContent = '✓ Solved! Free Analysis Mode Active — Move pieces freely';
  }

  // Unlock board for free exploration
  const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);
  if (cb) {
    cb.interactive = true;
    cb.onMove = (attempt) => handleFreeExplorationMove(attempt);
    cb.render();
    cb.bindEvents();
  }

  // Submit attempt to server if user is logged in
  if (window.Auth && window.Auth.currentUser && window.Api && puzzleController.puzzle) {
    window.Api.post('/puzzles/' + (puzzleController.puzzle.puzzle_id || puzzleController.puzzle.id) + '/attempt', {
      solved: true,
      reward: puzzleController.reward,
      penalty_count: puzzleController.penaltyCount
    }).then(res => {
      if (res && res.new_elo !== undefined) {
        window.Auth.currentUser.elo_rating = res.new_elo;
        window.Auth.currentUser.puzzles_solved = res.puzzles_solved;
        window.Auth.updateUI();
      }
    }).catch(() => {});
  }

  // Calculate final FEN and trigger Stockfish 5-move continuation preview
  const finalFen = (cb && cb.fen) || getCurrentBoardFen();
  calculatePostPuzzleStockfishContinuation(finalFen);
}

/**
 * Free exploration move handler after puzzle completion
 */
function handleFreeExplorationMove(attempt) {
  const from = attempt.from;
  const to = attempt.to;
  const promo = attempt.promotion;
  const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);

  if (!cb) return false;

  if (typeof window.Chess === 'function') {
    if (!puzzleController.freeAnalysisGame) {
      puzzleController.freeAnalysisGame = new window.Chess(cb.fen);
    }
    try {
      const moveRes = puzzleController.freeAnalysisGame.move({ from, to, promotion: promo });
      if (moveRes) {
        cb.update(puzzleController.freeAnalysisGame.fen(), { lastMove: { from, to } });
        if (typeof playChessSound === 'function') {
          playChessSound(moveRes.captured ? 'capture' : 'move');
        }
        // Calculate new follow-up from this updated board state
        calculatePostPuzzleStockfishContinuation(puzzleController.freeAnalysisGame.fen());
        return true;
      }
    } catch(e) {}
  }
  return false;
}

/**
 * Triggers Stockfish to calculate the next 5 moves (10 plies) from position
 */
function calculatePostPuzzleStockfishContinuation(finalFen) {
  const box = document.getElementById('puzzle-continuation-box');
  const text = document.getElementById('puzzle-5move-line');
  if (box) box.classList.remove('hidden');
  if (text) text.textContent = 'Calculating next 5 moves (10 plies) with Stockfish...';

  // 1. Send command to active Stockfish WebWorker
  if (window.stockfishWorker) {
    try {
      window.currentAnalysisFen = finalFen;
      window.stockfishWorker.postMessage('stop');
      window.stockfishWorker.postMessage('position fen ' + finalFen);
      window.stockfishWorker.postMessage('setoption name MultiPV value 1');
      window.stockfishWorker.postMessage('go depth 16');
      return;
    } catch (e) {
      console.warn('[Puzzles] WebWorker postMessage error:', e);
    }
  }

  // 2. Fallback to initialize worker or backend MultiPV
  if (typeof initStockfishMultiPV === 'function') {
    try {
      initStockfishMultiPV(finalFen);
      return;
    } catch (e) {}
  }

  if (typeof fetchBackendMultiPV === 'function') {
    fetchBackendMultiPV(finalFen);
  }
}

/**
 * Hook into your Stockfish UCI listener when puzzleController.isCompleted === true
 * Displays the next 5 moves (10 plies) to show the strategic idea & draws the Blue Best Move arrow
 */
function renderPostPuzzle5MoveIdea(pvLineString) {
  if (!puzzleController.isCompleted || !pvLineString) return;

  const pvMoves = pvLineString.trim().split(/\\s+/);
  const nextFiveMoves = pvMoves.slice(0, 10); // 10 plies = 5 full moves ahead

  // Draw Blue Best Path Arrow for the immediate follow-up idea
  if (nextFiveMoves[0] && nextFiveMoves[0].length >= 4) {
    if (typeof resetBoardVisualState === 'function') {
      resetBoardVisualState();
    }
    const fromSq = nextFiveMoves[0].slice(0, 2);
    const toSq = nextFiveMoves[0].slice(2, 4);
    if (typeof drawMoveArrowFixed === 'function') {
      drawMoveArrowFixed(fromSq, toSq, '#3b82f6', true);
    }
  }

  // Format continuation moves with SAN if Chess.js is available
  let formattedMoves = nextFiveMoves;
  const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);
  const curFen = (cb && cb.fen) || getCurrentBoardFen();

  if (typeof window.Chess === 'function' && curFen) {
    try {
      const c = new window.Chess(curFen);
      const sanList = [];
      for (const m of nextFiveMoves) {
        const from = m.slice(0, 2);
        const to = m.slice(2, 4);
        const promo = m.length > 4 ? m[4] : undefined;
        const res = c.move({ from, to, promotion: promo });
        if (res) sanList.push(res.san);
        else sanList.push(m);
      }
      formattedMoves = sanList;
    } catch(e) {}
  }

  // Show the 5-move continuation idea in the UI panel
  const box = document.getElementById('puzzle-continuation-box');
  const text = document.getElementById('puzzle-5move-line');
  if (box && text) {
    box.classList.remove('hidden');
    text.textContent = 'Idea (Next 5 Moves): ' + formattedMoves.join(' → ');
  }
}

/**
 * 4. HINT & PENALTY HELPERS (1st = 0, 2nd+ = -1)
 */
function applyPuzzleMistakeOrHintPenalty() {
  puzzleController.penaltyCount += 1;
  puzzleController.reward = puzzleController.penaltyCount === 1 ? 0 : -1;
  if (window.puzzleState) {
    window.puzzleState.penaltyCount = puzzleController.penaltyCount;
    window.puzzleState.reward = puzzleController.reward;
  }
  updatePuzzleRewardBadge();
}

function triggerPuzzleHint() {
  if (!puzzleController.puzzle || puzzleController.isCompleted) return;
  const expectedUci = puzzleController.movesUci[puzzleController.stepIndex];
  if (!expectedUci) return;

  applyPuzzleMistakeOrHintPenalty();
  if (typeof resetBoardVisualState === 'function') {
    resetBoardVisualState();
  }

  const fromSq = expectedUci.slice(0, 2);
  const toSq = expectedUci.slice(2, 4);

  // Light up the square of the piece that needs to move + draw Blue Hint Arrow
  document.querySelector('[data-square="' + fromSq + '"]')?.classList.add('highlight-analysis');
  if (typeof drawMoveArrowFixed === 'function') {
    drawMoveArrowFixed(fromSq, toSq, '#3b82f6', true);
  }

  const feedback = document.getElementById('puzzle-feedback');
  if (feedback) {
    feedback.className = 'puzzle-feedback glass-panel';
    feedback.classList.remove('hidden');
    const rewardText = puzzleController.reward > 0 ? '+1' : String(puzzleController.reward);
    feedback.textContent = '💡 Hint: Move ' + fromSq.toUpperCase() + ' → ' + toSq.toUpperCase() + ' (Reward is now ' + rewardText + ')';
  }
}

function highlightMoveSquares(uciMove) {
  if (!uciMove || uciMove.length < 4) return;
  document.querySelector('[data-square="' + uciMove.slice(0, 2) + '"]')?.classList.add('highlight-analysis');
  document.querySelector('[data-square="' + uciMove.slice(2, 4) + '"]')?.classList.add('highlight-analysis');
}

function executeUciMoveOnBoard(uciMove) {
  if (typeof window.executeUciMoveOnBoard === 'function' && window.executeUciMoveOnBoard !== executeUciMoveOnBoard) {
    return window.executeUciMoveOnBoard(uciMove);
  }
  if (!uciMove || uciMove.length < 4) return;
  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  const promo = uciMove.length > 4 ? uciMove[4] : undefined;
  const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);
  if (cb) {
    const curFen = cb.fen || (puzzleController.puzzle ? puzzleController.puzzle.fen : null);
    if (typeof window.Chess === 'function' && curFen) {
      try {
        const c = new window.Chess(curFen);
        c.move({ from, to, promotion: promo });
        cb.update(c.fen(), { lastMove: { from, to } });
        return;
      } catch (err) {}
    }
    const fromEl = document.querySelector('[data-square="' + from + '"]');
    const toEl = document.querySelector('[data-square="' + to + '"]');
    if (fromEl && toEl) {
      const piece = fromEl.querySelector('.chess-piece, .piece');
      if (piece) {
        toEl.querySelectorAll('.chess-piece, .piece').forEach(p => p.remove());
        toEl.appendChild(piece);
      }
    }
  }
}

function safePlayChessSound(type) {
  if (typeof playChessSound === 'function') {
    try { playChessSound(type); } catch (e) {}
  } else if (typeof window.playChessSound === 'function') {
    try { window.playChessSound(type); } catch (e) {}
  }
}

function updatePuzzleRewardBadge() {
  const el = document.getElementById('puzzle-reward-badge');
  if (el) {
    const text = puzzleController.reward > 0 ? '+1' : String(puzzleController.reward);
    el.textContent = 'Reward: ' + (puzzleController.reward > 0 ? '+1' : text);
    el.className = 'badge';
    if (puzzleController.reward > 0) {
      el.classList.add('badge-success');
    } else if (puzzleController.reward === 0) {
      el.classList.add('badge-warning');
    } else {
      el.classList.add('badge-danger');
    }
  }
}

function getCurrentBoardFen() {
  const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);
  if (cb && cb.fen) return cb.fen;
  if (puzzleController.puzzle && puzzleController.puzzle.fen) return puzzleController.puzzle.fen;
  return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
}

/**
 * 5. 80 VERIFIED MULTI-MOVE LICHESS PUZZLES (CC0 Public Domain)
 * All filtered strictly for >= 6 plies and verified with chess.js
 */
const VERIFIED_MULTI_MOVE_PUZZLES = ` + JSON.stringify(puzzles, null, 2) + `;

// Export to window for global access
window.puzzleController = puzzleController;
window.getSeededRandom = getSeededRandom;
window.startSeededMultiMovePuzzle = startSeededMultiMovePuzzle;
window.onUserPuzzleMove = onUserPuzzleMove;
window.onPuzzleCompleted = onPuzzleCompleted;
window.renderPostPuzzle5MoveIdea = renderPostPuzzle5MoveIdea;
window.applyPuzzleMistakeOrHintPenalty = applyPuzzleMistakeOrHintPenalty;
window.triggerPuzzleHint = triggerPuzzleHint;
window.highlightMoveSquares = highlightMoveSquares;
window.updatePuzzleRewardBadge = updatePuzzleRewardBadge;
window.calculatePostPuzzleStockfishContinuation = calculatePostPuzzleStockfishContinuation;
window.VERIFIED_MULTI_MOVE_PUZZLES = VERIFIED_MULTI_MOVE_PUZZLES;
`;

fs.writeFileSync(outPath, js);
console.log('Successfully written', outPath);
