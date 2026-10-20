/**
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
    const arr = Array.isArray(p.moves) ? p.moves : p.moves.trim().split(/\s+/);
    return arr.length >= 6;
  });
  const effectivePool = multiMovePool.length > 0 ? multiMovePool : poolSource;

  const rand = getSeededRandom(seed);
  const selected = effectivePool[Math.floor(rand() * effectivePool.length)];

  puzzleController.puzzle = selected;
  puzzleController.movesUci = Array.isArray(selected.moves) ? [...selected.moves] : selected.moves.trim().split(/\s+/);
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

  const pvMoves = pvLineString.trim().split(/\s+/);
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
const VERIFIED_MULTI_MOVE_PUZZLES = [
  {
    "id": "00AOH",
    "fen": "6k1/1R6/1p2p1pp/4P3/p1N2P2/6PK/7P/1r6 w - - 0 48",
    "moves": [
      "b7b6",
      "b1b6",
      "c4b6",
      "a4a3",
      "b6d7",
      "a3a2"
    ],
    "rating": 866,
    "themes": "advancedPawn advantage endgame long",
    "popularity": 95,
    "nbPlays": 725
  },
  {
    "id": "01IKM",
    "fen": "8/3Q1pkp/6p1/8/4Pp2/7P/r1p3P1/7K w - - 0 40",
    "moves": [
      "d7c7",
      "a2a1",
      "h1h2",
      "c2c1q",
      "c7c1",
      "a1c1"
    ],
    "rating": 934,
    "themes": "advancedPawn crushing endgame long master promotion queenRookEndgame",
    "popularity": 93,
    "nbPlays": 503
  },
  {
    "id": "01IWu",
    "fen": "7k/4q1p1/4p1B1/5n2/8/P6P/4QPP1/2r1N1K1 b - - 4 35",
    "moves": [
      "f5d4",
      "e2h5",
      "h8g8",
      "h5h7",
      "g8f8",
      "h7h8"
    ],
    "rating": 915,
    "themes": "endgame long mate mateIn3",
    "popularity": 43,
    "nbPlays": 64
  },
  {
    "id": "01ImN",
    "fen": "8/8/p6p/2K2p1P/P3k3/2P5/8/8 w - - 0 43",
    "moves": [
      "c5d6",
      "f5f4",
      "c3c4",
      "f4f3",
      "c4c5",
      "f3f2",
      "c5c6",
      "f2f1q"
    ],
    "rating": 941,
    "themes": "advancedPawn crushing endgame pawnEndgame promotion quietMove veryLong",
    "popularity": 75,
    "nbPlays": 220
  },
  {
    "id": "03CME",
    "fen": "8/2q5/k7/1p3KP1/8/1Q6/8/8 b - - 2 73",
    "moves": [
      "c7d7",
      "b3e6",
      "d7e6",
      "f5e6",
      "b5b4",
      "g5g6",
      "b4b3",
      "g6g7",
      "b3b2",
      "g7g8q"
    ],
    "rating": 793,
    "themes": "advancedPawn crushing endgame promotion queenEndgame veryLong",
    "popularity": 100,
    "nbPlays": 1050
  },
  {
    "id": "06GcV",
    "fen": "3r3k/ppp3pp/6r1/2P5/1n1P1p2/1Q3P1q/P3R2P/4RN1K b - - 5 31",
    "moves": [
      "h7h6",
      "e2e8",
      "d8e8",
      "e1e8",
      "h8h7",
      "b3g8"
    ],
    "rating": 907,
    "themes": "kingsideAttack long mate mateIn3 middlegame",
    "popularity": 100,
    "nbPlays": 138
  },
  {
    "id": "06H5L",
    "fen": "7R/8/2r5/1k6/3K4/8/8/8 b - - 9 55",
    "moves": [
      "c6c5",
      "h8b8",
      "b5c6",
      "b8c8",
      "c6d7",
      "c8c5"
    ],
    "rating": 897,
    "themes": "crushing deflection endgame long master rookEndgame skewer",
    "popularity": 100,
    "nbPlays": 625
  },
  {
    "id": "06IK9",
    "fen": "8/3k4/p1p2rp1/2Pp1P1p/PP2pKPP/4P3/8/6R1 w - - 0 38",
    "moves": [
      "g4g5",
      "f6f5",
      "f4g3",
      "f5f3",
      "g3g2",
      "f3e3"
    ],
    "rating": 984,
    "themes": "crushing endgame long rookEndgame",
    "popularity": 96,
    "nbPlays": 2256
  },
  {
    "id": "06Ipb",
    "fen": "8/p3k3/1q2rpp1/8/1p2R3/8/PPP4P/1K3Q2 w - - 0 30",
    "moves": [
      "f1e2",
      "b6g1",
      "e2e1",
      "g1e1",
      "e4e1",
      "e6e1"
    ],
    "rating": 925,
    "themes": "backRankMate endgame long mate mateIn3 xRayAttack",
    "popularity": 96,
    "nbPlays": 469
  },
  {
    "id": "0BDIF",
    "fen": "8/4Q2p/5ppk/P7/2p5/4p1P1/4qP1P/6K1 w - - 2 37",
    "moves": [
      "e7e3",
      "e2e3",
      "f2e3",
      "c4c3",
      "g1f2",
      "c3c2"
    ],
    "rating": 753,
    "themes": "advancedPawn crushing endgame long queenEndgame",
    "popularity": 96,
    "nbPlays": 597
  },
  {
    "id": "0BDdJ",
    "fen": "8/8/1K6/p7/8/6k1/6P1/8 w - - 0 48",
    "moves": [
      "b6a6",
      "a5a4",
      "a6b5",
      "a4a3",
      "b5a4",
      "a3a2"
    ],
    "rating": 997,
    "themes": "advancedPawn crushing endgame long pawnEndgame quietMove",
    "popularity": 81,
    "nbPlays": 191
  },
  {
    "id": "0BF2J",
    "fen": "3r4/1p1q2k1/p3p1P1/2p2pb1/6p1/2PP2N1/PP2QP2/1K2R3 w - - 2 26",
    "moves": [
      "e2e6",
      "d7d3",
      "b1a1",
      "d3d1",
      "e1d1",
      "d8d1"
    ],
    "rating": 964,
    "themes": "backRankMate endgame long master mate mateIn3 sacrifice",
    "popularity": 100,
    "nbPlays": 430
  },
  {
    "id": "0BFNX",
    "fen": "5k2/4bp2/8/5P2/4Q1K1/1r6/8/8 w - - 9 54",
    "moves": [
      "g4h5",
      "b3h3",
      "h5g4",
      "h3h4",
      "g4f3",
      "h4e4"
    ],
    "rating": 921,
    "themes": "crushing endgame long master skewer",
    "popularity": 91,
    "nbPlays": 1067
  },
  {
    "id": "0Iqnh",
    "fen": "8/8/6pp/p3k2P/P1P1p1P1/4K3/8/8 b - - 0 37",
    "moves": [
      "g6g5",
      "c4c5",
      "e5d5",
      "c5c6",
      "d5c6",
      "e3e4",
      "c6c5",
      "e4f5"
    ],
    "rating": 787,
    "themes": "crushing deflection endgame pawnEndgame quietMove veryLong",
    "popularity": 84,
    "nbPlays": 192
  },
  {
    "id": "0VKQw",
    "fen": "r1b1qr1k/2p4p/p1p2B2/4bp2/8/1QP5/P4PPP/1R2R1K1 b - - 1 18",
    "moves": [
      "e5f6",
      "e1e8",
      "f8e8",
      "b3f7",
      "c8e6",
      "f7f6"
    ],
    "rating": 995,
    "themes": "advantage fork long middlegame",
    "popularity": 87,
    "nbPlays": 251
  },
  {
    "id": "0l4dk",
    "fen": "8/1p3n2/p4k1P/2p3NK/6P1/8/8/8 w - - 2 54",
    "moves": [
      "g5f7",
      "f6f7",
      "h6h7",
      "f7g7",
      "h7h8q",
      "g7h8"
    ],
    "rating": 922,
    "themes": "crushing endgame long",
    "popularity": 100,
    "nbPlays": 77
  },
  {
    "id": "0l56Z",
    "fen": "4rr1k/pp6/5pqP/4b3/4R1P1/4QP2/PPP3K1/4R3 b - - 0 34",
    "moves": [
      "e5b2",
      "e4e8",
      "g6e8",
      "e3e8",
      "f8e8",
      "e1e8"
    ],
    "rating": 800,
    "themes": "crushing long middlegame",
    "popularity": 70,
    "nbPlays": 63
  },
  {
    "id": "10ZdK",
    "fen": "2r4k/pb4rp/1p2Qpp1/8/7P/1P3N2/1PPR1Pq1/2KR4 b - - 5 30",
    "moves": [
      "g2f3",
      "d2d8",
      "c8d8",
      "d1d8",
      "g7g8",
      "e6g8"
    ],
    "rating": 987,
    "themes": "long mate mateIn3 middlegame",
    "popularity": 95,
    "nbPlays": 1406
  },
  {
    "id": "1Vkga",
    "fen": "8/8/1p6/1p1k1p1p/1P3P1P/3PK3/8/8 w - - 0 42",
    "moves": [
      "e3d2",
      "d5d4",
      "d2c2",
      "d4e3",
      "c2c3",
      "e3f4"
    ],
    "rating": 798,
    "themes": "crushing endgame long pawnEndgame zugzwang",
    "popularity": 89,
    "nbPlays": 491
  },
  {
    "id": "20lfi",
    "fen": "r4rk1/pp3ppp/3q4/2pP4/2P1Q1P1/7P/PP3PB1/4R1K1 b - - 0 22",
    "moves": [
      "f8e8",
      "e4e8",
      "a8e8",
      "e1e8",
      "d6f8",
      "e8f8"
    ],
    "rating": 658,
    "themes": "crushing endgame kingsideAttack long",
    "popularity": 96,
    "nbPlays": 798
  },
  {
    "id": "001Fg",
    "fen": "2R2r1k/pQ4pp/5rp1/3B4/q2n4/7P/P4PP1/5RK1 w - - 3 30",
    "moves": [
      "c8c7",
      "d4e2",
      "g1h2",
      "a4f4",
      "h2h1",
      "e2g3",
      "f2g3",
      "f4f1"
    ],
    "rating": 1256,
    "themes": "advantage middlegame veryLong",
    "popularity": 96,
    "nbPlays": 3160
  },
  {
    "id": "001wR",
    "fen": "6nr/pp3p1p/k1p5/8/1QN5/2P1P3/4KPqP/8 b - - 5 26",
    "moves": [
      "b7b5",
      "b4a5",
      "a6b7",
      "c4d6",
      "b7b8",
      "a5d8"
    ],
    "rating": 1152,
    "themes": "endgame long mate mateIn3",
    "popularity": 93,
    "nbPlays": 2632
  },
  {
    "id": "0039T",
    "fen": "1r5r/p3kp2/4p2p/4P3/3R1Pp1/6P1/P1P4P/4K2R w K - 1 25",
    "moves": [
      "d4a4",
      "b8b1",
      "e1f2",
      "b1h1",
      "a4a7",
      "e7f8"
    ],
    "rating": 1121,
    "themes": "crushing defensiveMove endgame long rookEndgame skewer",
    "popularity": 93,
    "nbPlays": 838
  },
  {
    "id": "003eP",
    "fen": "8/r1b1q2k/2p3p1/2Pp4/1P2p1n1/2B1P3/NQ6/2K4R b - - 1 36",
    "moves": [
      "h7g8",
      "h1h8",
      "g8f7",
      "h8h7",
      "f7e8",
      "h7e7"
    ],
    "rating": 1156,
    "themes": "crushing exposedKing long middlegame skewer",
    "popularity": 88,
    "nbPlays": 1756
  },
  {
    "id": "003jH",
    "fen": "rn3rk1/p5pp/3N4/4np1q/5Q2/1P3K2/PB1P2P1/2R4R w - - 0 25",
    "moves": [
      "f3f2",
      "e5d3",
      "f2e3",
      "d3f4",
      "h1h5",
      "f4h5"
    ],
    "rating": 1089,
    "themes": "crushing fork long middlegame",
    "popularity": 89,
    "nbPlays": 344
  },
  {
    "id": "003mh",
    "fen": "r4k1r/1pp2p2/p2p3p/3N4/3P2q1/8/PPP5/1K2Q1NR b - - 1 23",
    "moves": [
      "a8e8",
      "e1e8",
      "f8e8",
      "d5f6",
      "e8e7",
      "f6g4"
    ],
    "rating": 1325,
    "themes": "advantage attraction fork long middlegame sacrifice",
    "popularity": 86,
    "nbPlays": 459
  },
  {
    "id": "009Os",
    "fen": "r2b2k1/1p3q1p/p2p4/3P2p1/2P1PRQr/8/P2B3P/2R4K w - - 1 29",
    "moves": [
      "g4g3",
      "h4f4",
      "d2f4",
      "f7f4",
      "g3f4",
      "g5f4"
    ],
    "rating": 1390,
    "themes": "crushing long middlegame",
    "popularity": 76,
    "nbPlays": 40
  },
  {
    "id": "00AHY",
    "fen": "r6k/3NR1p1/4n2p/5b2/p6P/6R1/8/6K1 w - - 2 43",
    "moves": [
      "h4h5",
      "a4a3",
      "g3a3",
      "a8a3",
      "e7e8",
      "h8h7"
    ],
    "rating": 1356,
    "themes": "advantage endgame long",
    "popularity": 84,
    "nbPlays": 1515
  },
  {
    "id": "00Aae",
    "fen": "1R6/1P6/4pkp1/5p2/3P3p/3KP3/8/1r6 b - - 0 43",
    "moves": [
      "h4h3",
      "b8f8",
      "f6e7",
      "b7b8q",
      "b1b8",
      "f8b8"
    ],
    "rating": 1015,
    "themes": "advancedPawn clearance crushing endgame long promotion rookEndgame",
    "popularity": 88,
    "nbPlays": 347
  },
  {
    "id": "00Aas",
    "fen": "3r1rk1/1p2q1pp/5p2/8/1P1n4/6Q1/PPbB1PPP/R2B1RK1 w - - 9 20",
    "moves": [
      "d1c2",
      "d4e2",
      "g1h1",
      "e2g3",
      "f2g3",
      "d8d2"
    ],
    "rating": 1111,
    "themes": "crushing fork long middlegame",
    "popularity": 96,
    "nbPlays": 8551
  },
  {
    "id": "00AdI",
    "fen": "3r4/4kp1p/1PQ1p1p1/p3b3/1p2P2P/1P6/6PK/8 w - - 1 36",
    "moves": [
      "h2h3",
      "d8d3",
      "g2g3",
      "d3g3",
      "h3h2",
      "g3c3"
    ],
    "rating": 1263,
    "themes": "crushing discoveredAttack discoveredCheck endgame long master",
    "popularity": 97,
    "nbPlays": 8704
  },
  {
    "id": "00AhO",
    "fen": "r1b2rk1/2q2p1p/1p2pbp1/pP6/2P1Q3/P2B1N2/5PPP/3R1RK1 w - - 0 20",
    "moves": [
      "e4a8",
      "c8b7",
      "a8a7",
      "f8a8",
      "a7a8",
      "b7a8"
    ],
    "rating": 1229,
    "themes": "advantage clearance long master middlegame trappedPiece",
    "popularity": 92,
    "nbPlays": 2545
  },
  {
    "id": "00B8m",
    "fen": "3b4/3P4/pp2Pk2/5r2/P6p/3Q4/8/7K w - - 1 43",
    "moves": [
      "d3f5",
      "f6f5",
      "e6e7",
      "d8e7",
      "d7d8q",
      "e7d8"
    ],
    "rating": 1275,
    "themes": "crushing endgame hangingPiece long",
    "popularity": 82,
    "nbPlays": 23
  },
  {
    "id": "00BCa",
    "fen": "1r6/p2kp1P1/3p4/2pP4/2P2B2/pN6/5PK1/8 b - - 1 41",
    "moves": [
      "a3a2",
      "b3c5",
      "d6c5",
      "f4b8",
      "a2a1q",
      "g7g8q"
    ],
    "rating": 1293,
    "themes": "advancedPawn crushing endgame long master promotion",
    "popularity": 98,
    "nbPlays": 2139
  },
  {
    "id": "00KO5",
    "fen": "2r2rk1/3p1ppp/p3p3/1p2q3/6P1/3Q4/PP5P/1K2RR2 b - - 0 22",
    "moves": [
      "e5h2",
      "f1h1",
      "h2c2",
      "d3c2",
      "c8c2",
      "b1c2"
    ],
    "rating": 1323,
    "themes": "advantage endgame long",
    "popularity": 87,
    "nbPlays": 139
  },
  {
    "id": "00Kyy",
    "fen": "8/P7/8/5k2/8/5pr1/5r2/R6K w - - 0 50",
    "moves": [
      "a7a8q",
      "g3h3",
      "h1g1",
      "f2g2",
      "g1f1",
      "h3h1"
    ],
    "rating": 1246,
    "themes": "endgame exposedKing long master mate mateIn3 queenRookEndgame",
    "popularity": 84,
    "nbPlays": 263
  },
  {
    "id": "00L76",
    "fen": "5rk1/5pp1/4p3/7R/2P5/2n2N2/5r2/2K4R b - - 2 37",
    "moves": [
      "g7g6",
      "h5h8",
      "g8g7",
      "h1h7",
      "g7f6",
      "h8f8"
    ],
    "rating": 1132,
    "themes": "crushing deflection endgame long",
    "popularity": 100,
    "nbPlays": 196
  },
  {
    "id": "00MDG",
    "fen": "3r2k1/4ppnp/pp2q1p1/2p5/4N3/3rP3/P2P1QPP/3R1RK1 b - - 1 28",
    "moves": [
      "e6e4",
      "f2f7",
      "g8h8",
      "f7f8",
      "d8f8",
      "f1f8"
    ],
    "rating": 1054,
    "themes": "backRankMate long mate mateIn3 middlegame sacrifice",
    "popularity": 60,
    "nbPlays": 53
  },
  {
    "id": "00MTn",
    "fen": "2rqk2r/3n4/1p2p3/p3N2p/Q1PP2p1/P2BP3/3K1Pb1/R6R w k - 0 22",
    "moves": [
      "h1h5",
      "h8h5",
      "d3g6",
      "e8e7",
      "a4d7",
      "d8d7"
    ],
    "rating": 1335,
    "themes": "advantage hangingPiece long middlegame",
    "popularity": 93,
    "nbPlays": 109
  },
  {
    "id": "00Mke",
    "fen": "6k1/p4p2/3P4/6pp/P2Q4/5qPP/r4P1K/3R4 w - - 1 42",
    "moves": [
      "d6d7",
      "a2f2",
      "d4f2",
      "f3f2",
      "h2h1",
      "f2f3"
    ],
    "rating": 1160,
    "themes": "crushing endgame long",
    "popularity": 100,
    "nbPlays": 430
  },
  {
    "id": "00008",
    "fen": "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
    "moves": [
      "f2g3",
      "e6e7",
      "b2b1",
      "b3c1",
      "b1c1",
      "h6c1"
    ],
    "rating": 1811,
    "themes": "crushing hangingPiece long middlegame",
    "popularity": 95,
    "nbPlays": 10282
  },
  {
    "id": "000Vc",
    "fen": "8/8/4k1p1/2KpP2p/5PP1/8/8/8 w - - 0 53",
    "moves": [
      "g4h5",
      "g6h5",
      "f4f5",
      "e6e5",
      "f5f6",
      "e5f6"
    ],
    "rating": 1569,
    "themes": "crushing endgame long pawnEndgame",
    "popularity": 75,
    "nbPlays": 115
  },
  {
    "id": "000c8",
    "fen": "6k1/Bp3pp1/p3p3/3pPn1p/N4P1q/P2Q1R1P/1P4PK/2r5 w - - 0 28",
    "moves": [
      "a4c5",
      "h4e1",
      "f3f1",
      "e1f1",
      "d3f1",
      "c1f1"
    ],
    "rating": 1478,
    "themes": "crushing long middlegame",
    "popularity": 100,
    "nbPlays": 36
  },
  {
    "id": "0017R",
    "fen": "r2qk2r/pp2ppbp/1n1p2p1/3Pn3/2P5/2NBBP1P/PP3P2/R2QK2R b KQkq - 0 12",
    "moves": [
      "e5c4",
      "d3c4",
      "b6c4",
      "d1a4",
      "d8d7",
      "a4c4"
    ],
    "rating": 1655,
    "themes": "advantage fork long middlegame",
    "popularity": 95,
    "nbPlays": 6539
  },
  {
    "id": "001XA",
    "fen": "1qr2rk1/pb2bppp/8/8/2p1N3/P1Bn2P1/2Q2PBP/1R3RK1 b - - 3 23",
    "moves": [
      "b8c7",
      "b1b7",
      "c7b7",
      "e4f6",
      "e7f6",
      "g2b7"
    ],
    "rating": 1687,
    "themes": "crushing discoveredAttack long master middlegame sacrifice",
    "popularity": 91,
    "nbPlays": 1351
  },
  {
    "id": "001h8",
    "fen": "2r3k1/2r4p/4p1p1/1p1q1pP1/p1bP1P1Q/P6R/5B2/2R3K1 b - - 5 34",
    "moves": [
      "c4e2",
      "h4h7",
      "c7h7",
      "c1c8",
      "g8g7",
      "c8c7"
    ],
    "rating": 1749,
    "themes": "crushing deflection kingsideAttack long middlegame sacrifice",
    "popularity": 88,
    "nbPlays": 621
  },
  {
    "id": "001uD",
    "fen": "6k1/1p3pp1/1p5p/2r1p3/2n5/r3PN2/2RnNPPP/2R3K1 b - - 1 32",
    "moves": [
      "f7f6",
      "f3d2",
      "c4d2",
      "c2d2",
      "c5c1",
      "e2c1"
    ],
    "rating": 1890,
    "themes": "advantage long middlegame",
    "popularity": 92,
    "nbPlays": 989
  },
  {
    "id": "002Hv",
    "fen": "8/8/8/3N2p1/5b2/3p3P/5kP1/3K4 w - - 16 56",
    "moves": [
      "d5f4",
      "g5f4",
      "h3h4",
      "f2g2",
      "h4h5",
      "f4f3",
      "d1d2",
      "f3f2"
    ],
    "rating": 1621,
    "themes": "advancedPawn crushing endgame veryLong",
    "popularity": 63,
    "nbPlays": 28
  },
  {
    "id": "002Uy",
    "fen": "8/8/1p6/k7/P1R5/1K5r/8/8 w - - 26 64",
    "moves": [
      "c4c3",
      "h3c3",
      "b3c3",
      "a5a4",
      "c3b2",
      "a4b4"
    ],
    "rating": 1565,
    "themes": "crushing defensiveMove endgame long rookEndgame",
    "popularity": 97,
    "nbPlays": 7408
  },
  {
    "id": "002rd",
    "fen": "r6k/q1pb1p1p/1b3Pr1/p1ppP2Q/3P2p1/4B3/PP2NRPP/3R2K1 b - - 1 25",
    "moves": [
      "d7e6",
      "e2f4",
      "c5d4",
      "f4g6",
      "f7g6",
      "h5h6"
    ],
    "rating": 1795,
    "themes": "crushing kingsideAttack long middlegame pin",
    "popularity": 79,
    "nbPlays": 131
  },
  {
    "id": "003if",
    "fen": "8/3q1kpp/1P2p3/4Q3/5P2/4B2P/2r3PK/8 b - - 0 43",
    "moves": [
      "d7b7",
      "e5h5",
      "f7e7",
      "e3c5",
      "c2c5",
      "h5c5"
    ],
    "rating": 1700,
    "themes": "advantage endgame long",
    "popularity": 64,
    "nbPlays": 27
  },
  {
    "id": "009zS",
    "fen": "r3r1k1/1p3p1p/p1p3p1/8/6bP/Q3b3/PP2B1P1/R3K2R w KQ - 2 20",
    "moves": [
      "g2g3",
      "g4e2",
      "e1e2",
      "e3c5",
      "e2f3",
      "c5a3"
    ],
    "rating": 1434,
    "themes": "advantage discoveredAttack discoveredCheck exposedKing long middlegame",
    "popularity": 94,
    "nbPlays": 2856
  },
  {
    "id": "00Aq4",
    "fen": "2k1r3/pppn1pp1/3b2b1/3p2Pp/2B2P2/3P3P/PPPR4/2K3NR w - - 0 18",
    "moves": [
      "c4d5",
      "e8e1",
      "d2d1",
      "d6f4",
      "c1b1",
      "e1d1"
    ],
    "rating": 1497,
    "themes": "backRankMate deflection long mate mateIn3 middlegame",
    "popularity": 72,
    "nbPlays": 171
  },
  {
    "id": "00Ar2",
    "fen": "r2q1r2/1n4pk/p6p/1pp2pb1/3n1B2/P1NPN2P/1PPQ1PP1/R3R1K1 w - - 0 21",
    "moves": [
      "c3d5",
      "g5f4",
      "d5f4",
      "d8g5",
      "d2d1",
      "g5f4"
    ],
    "rating": 1738,
    "themes": "advantage clearance long middlegame",
    "popularity": 93,
    "nbPlays": 651
  },
  {
    "id": "00Bg0",
    "fen": "8/3k4/3P1K2/p2R4/5r2/5P2/8/8 w - - 1 57",
    "moves": [
      "d5f5",
      "f4f5",
      "f6f5",
      "a5a4",
      "f5e4",
      "a4a3",
      "e4d3",
      "a3a2"
    ],
    "rating": 1640,
    "themes": "advancedPawn crushing endgame quietMove rookEndgame veryLong",
    "popularity": 94,
    "nbPlays": 798
  },
  {
    "id": "00JqT",
    "fen": "2r2rk1/pp2R3/5p2/3p1q2/3P4/4QPPp/PP3R1P/6K1 w - - 2 30",
    "moves": [
      "g3g4",
      "f5b1",
      "f2f1",
      "b1b2",
      "e3e6",
      "g8h8"
    ],
    "rating": 1897,
    "themes": "crushing deflection endgame long",
    "popularity": 98,
    "nbPlays": 751
  },
  {
    "id": "00KAq",
    "fen": "5rr1/3pk1q1/p2Rp3/1pP4p/1P3p2/2P2QP1/1P3P1P/5RK1 w - - 1 26",
    "moves": [
      "d6d4",
      "f4g3",
      "d4d7",
      "e7d7",
      "f3b7",
      "d7e8"
    ],
    "rating": 1429,
    "themes": "advantage endgame long",
    "popularity": 100,
    "nbPlays": 697
  },
  {
    "id": "00Kbj",
    "fen": "8/8/6p1/PR3p2/1P3k2/7P/r5P1/7K w - - 1 39",
    "moves": [
      "h3h4",
      "f4g3",
      "b5d5",
      "a2a1",
      "d5d1",
      "a1d1"
    ],
    "rating": 1479,
    "themes": "endgame long mate mateIn3 rookEndgame",
    "popularity": 94,
    "nbPlays": 15981
  },
  {
    "id": "00Kia",
    "fen": "5r1k/4n1pp/1p6/pP5Q/P2pB2K/6P1/2P4P/4q3 b - - 4 37",
    "moves": [
      "g7g6",
      "h5e5",
      "h8g8",
      "e4d5",
      "e7d5",
      "e5e1"
    ],
    "rating": 1679,
    "themes": "advantage discoveredAttack endgame fork long",
    "popularity": 96,
    "nbPlays": 4531
  },
  {
    "id": "00Kq4",
    "fen": "r2qk3/5p1r/p1p1p3/1p1pP1p1/P1nP2Pn/2P2NB1/2P2P2/R1QR2K1 w q - 1 21",
    "moves": [
      "f3g5",
      "d8g5",
      "c1g5",
      "h4f3",
      "g1g2",
      "f3g5"
    ],
    "rating": 1417,
    "themes": "advantage attraction fork long middlegame sacrifice",
    "popularity": 83,
    "nbPlays": 563
  },
  {
    "id": "000VW",
    "fen": "r4r2/1p3pkp/p5p1/3R1N1Q/3P4/8/P1q2P2/3R2K1 b - - 3 25",
    "moves": [
      "g6f5",
      "d5c5",
      "c2e4",
      "h5g5",
      "g7h8",
      "g5f6"
    ],
    "rating": 2873,
    "themes": "crushing endgame long",
    "popularity": 85,
    "nbPlays": 323
  },
  {
    "id": "000h0",
    "fen": "5rk1/p5p1/3bpr1p/1Pp4q/3pR3/1P1Q1N2/P4PPP/4R1K1 w - - 4 22",
    "moves": [
      "e4e6",
      "f6f3",
      "g2f3",
      "h5h2",
      "g1f1",
      "h2h3",
      "f1e2",
      "h3e6"
    ],
    "rating": 2048,
    "themes": "advantage interference kingsideAttack middlegame veryLong",
    "popularity": 89,
    "nbPlays": 202
  },
  {
    "id": "000jr",
    "fen": "5k2/1p4pp/p5n1/5Q2/3BpP2/1P2PP1K/P1q4P/7r b - - 1 33",
    "moves": [
      "f8g8",
      "f5d5",
      "g8f8",
      "d4c5",
      "c2c5",
      "d5c5"
    ],
    "rating": 2152,
    "themes": "crushing endgame long",
    "popularity": 69,
    "nbPlays": 91
  },
  {
    "id": "000qP",
    "fen": "8/7R/8/5p2/4bk1P/8/2r2K2/6R1 w - - 7 51",
    "moves": [
      "f2f1",
      "f4f3",
      "f1e1",
      "c2c1",
      "e1d2",
      "c1g1"
    ],
    "rating": 2167,
    "themes": "crushing endgame exposedKing long skewer",
    "popularity": 94,
    "nbPlays": 2029
  },
  {
    "id": "0018P",
    "fen": "5R2/1p6/p1p5/2P1rk2/2K3p1/2P1p1P1/1P5P/8 b - - 1 44",
    "moves": [
      "f5e6",
      "f8e8",
      "e6f5",
      "e8e5",
      "f5e5",
      "c4d3",
      "e5d5",
      "d3e3",
      "a6a5",
      "e3f4",
      "d5c4",
      "f4g4"
    ],
    "rating": 1903,
    "themes": "crushing endgame exposedKing rookEndgame veryLong",
    "popularity": 91,
    "nbPlays": 246
  },
  {
    "id": "001Hi",
    "fen": "6k1/pp1r1pp1/1qp1p2p/4P2P/5Q2/1P4R1/P1Pr1PP1/R5K1 b - - 4 23",
    "moves": [
      "b6d4",
      "f4f6",
      "d4f2",
      "f6f2",
      "d2f2",
      "g1f2"
    ],
    "rating": 2391,
    "themes": "advantage endgame long pin",
    "popularity": 66,
    "nbPlays": 35
  },
  {
    "id": "001Oo",
    "fen": "6k1/4p1bp/6p1/1p1pP3/1PpPp3/2P1P3/Q2B1KPP/3q4 b - - 2 23",
    "moves": [
      "d1a4",
      "a2a4",
      "b5a4",
      "b4b5",
      "g8f7",
      "b5b6"
    ],
    "rating": 2078,
    "themes": "crushing endgame long quietMove",
    "popularity": 84,
    "nbPlays": 63
  },
  {
    "id": "001aK",
    "fen": "6k1/5p2/4p3/P1B5/2P4P/4Pnp1/Rb1rN3/5K2 b - - 1 33",
    "moves": [
      "d2e2",
      "f1e2",
      "g3g2",
      "e3e4",
      "f3d4",
      "e2f2"
    ],
    "rating": 2056,
    "themes": "crushing endgame hangingPiece long quietMove",
    "popularity": 91,
    "nbPlays": 974
  },
  {
    "id": "002Ds",
    "fen": "8/1pp5/p2p4/P2Pk2p/1PP1p2P/2n1K2P/3N4/8 b - - 0 45",
    "moves": [
      "b7b6",
      "b4b5",
      "c3d1",
      "e3e2",
      "a6b5",
      "a5a6"
    ],
    "rating": 1992,
    "themes": "crushing endgame knightEndgame long",
    "popularity": 90,
    "nbPlays": 119
  },
  {
    "id": "002LF",
    "fen": "7r/p2q1pk1/1pp3p1/8/6P1/4Q3/PP1R1P1r/5KN1 b - - 0 38",
    "moves": [
      "d7g4",
      "e3e5",
      "f7f6",
      "e5c7",
      "g7h6",
      "c7h2"
    ],
    "rating": 2185,
    "themes": "advantage endgame interference long",
    "popularity": 91,
    "nbPlays": 618
  },
  {
    "id": "002e5",
    "fen": "r2q4/pp1n1kbp/3P2b1/6N1/6Q1/P3P3/6P1/4K2R b K - 1 21",
    "moves": [
      "f7g8",
      "g4c4",
      "g8h8",
      "h1h7",
      "g6h7",
      "g5f7"
    ],
    "rating": 2632,
    "themes": "crushing long middlegame sacrifice",
    "popularity": 85,
    "nbPlays": 388
  },
  {
    "id": "002xh",
    "fen": "2nk4/8/2PBp1n1/1pK1P1p1/1P4P1/8/8/8 b - - 2 42",
    "moves": [
      "g6h4",
      "c5b5",
      "h4g2",
      "b5a6",
      "g2e3",
      "a6b7"
    ],
    "rating": 2065,
    "themes": "crushing endgame long",
    "popularity": 54,
    "nbPlays": 34
  },
  {
    "id": "003Ec",
    "fen": "3r4/p4R2/1pb2Pp1/n1p1Q1kp/8/P2q4/1P4PP/6RK b - - 2 32",
    "moves": [
      "d3f5",
      "e5e3",
      "f5f4",
      "h2h4",
      "g5f5",
      "e3h3"
    ],
    "rating": 2245,
    "themes": "crushing long middlegame pin",
    "popularity": 89,
    "nbPlays": 310
  },
  {
    "id": "003aS",
    "fen": "8/8/5k1p/6p1/1R4PP/1p2KP2/8/1r6 w - - 0 43",
    "moves": [
      "h4h5",
      "b3b2",
      "b4b6",
      "f6e5",
      "f3f4",
      "g5f4"
    ],
    "rating": 2086,
    "themes": "advancedPawn crushing defensiveMove endgame long rookEndgame",
    "popularity": 93,
    "nbPlays": 396
  },
  {
    "id": "003cs",
    "fen": "2r1kbnr/pp4pp/4p3/3pP1N1/3q4/1P2B3/P3Q1PP/nN3RK1 b k - 1 16",
    "moves": [
      "d4e5",
      "f1f8",
      "e8f8",
      "e3c5",
      "c8c5",
      "e2e5",
      "c5c1",
      "g1f2"
    ],
    "rating": 2119,
    "themes": "advantage attraction discoveredAttack exposedKing middlegame sacrifice veryLong",
    "popularity": 76,
    "nbPlays": 99
  },
  {
    "id": "003md",
    "fen": "r1b1k2N/ppp3pp/2n5/2bp4/7q/1B4n1/PPPP1P1P/RNBQ1RK1 w q - 0 10",
    "moves": [
      "f1e1",
      "g3e4",
      "e1e4",
      "d5e4",
      "d1h5",
      "h4h5",
      "b3f7",
      "h5f7"
    ],
    "rating": 2171,
    "themes": "crushing defensiveMove middlegame veryLong",
    "popularity": 85,
    "nbPlays": 216
  },
  {
    "id": "008EC",
    "fen": "6k1/4rpp1/p6p/7P/q1pP1R2/2Pb2Q1/P4RP1/6K1 w - - 9 31",
    "moves": [
      "f4f7",
      "e7f7",
      "g3b8",
      "g8h7",
      "f2f7",
      "a4d1",
      "g1f2",
      "d1f1",
      "f2g3",
      "f1f7"
    ],
    "rating": 2344,
    "themes": "advantage endgame skewer veryLong",
    "popularity": 91,
    "nbPlays": 592
  },
  {
    "id": "008Sk",
    "fen": "8/6pp/3Bp2k/p2pP2P/P2bp1PK/8/r7/5R2 b - - 2 37",
    "moves": [
      "d4f2",
      "f1f2",
      "g7g5",
      "h4g3",
      "a2f2",
      "g3f2"
    ],
    "rating": 1912,
    "themes": "crushing endgame long",
    "popularity": 94,
    "nbPlays": 15161
  },
  {
    "id": "008lc",
    "fen": "7k/pb1qn2n/1p2R2Q/2p2p2/2Pp4/3B4/PP3PrP/4RK2 b - - 1 27",
    "moves": [
      "g2g7",
      "h6g7",
      "h8g7",
      "e6e7",
      "d7e7",
      "e1e7"
    ],
    "rating": 1974,
    "themes": "attraction crushing exposedKing fork long middlegame",
    "popularity": 93,
    "nbPlays": 2220
  },
  {
    "id": "0091A",
    "fen": "1r3rk1/q4ppp/p3Pb2/3nN3/P2P4/7Q/1B4PP/1R3RK1 b - - 0 24",
    "moves": [
      "b8b2",
      "e6f7",
      "f8f7",
      "h3c8",
      "f7f8",
      "c8e6"
    ],
    "rating": 2177,
    "themes": "advancedPawn advantage kingsideAttack long middlegame",
    "popularity": 93,
    "nbPlays": 1127
  }
];

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
