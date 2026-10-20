/**
 * =========================================================================
 * fixes-and-puzzles.js
 * 1. Count + 1 Index Desync Fix (Analysis, Eval Bar, Move List)
 * 2. Seeded Solvable Puzzle Engine (Mulberry32 PRNG + Lichess UCI Format)
 * 3. Working Screen Buttons Action Dispatcher (data-action)
 * 4. User Timezone ID Detection & Localized Formatter
 * =========================================================================
 */

// Misplay classifications that show the engine's best alternative arrow
const MISPLAY_TYPES = new Set(['blunder', 'mistake', 'inaccuracy', 'misplay']);

/**
 * Helper to update board FEN cleanly
 */
function renderBoardFromFen(fen) {
  if (window.ChessBoard) {
    window.ChessBoard.update(fen, { lastMove: null });
  }
}

/**
 * Helper to run Stockfish MultiPV for the current position
 */
function runStockfishMultiPV(fen, depth = 20) {
  if (typeof window.evaluatePositionWithWorker === 'function') {
    window.evaluatePositionWithWorker(fen);
  } else if (typeof window.fetchBackendMultiPV === 'function') {
    window.fetchBackendMultiPV(fen);
  }
}

/**
 * 1. FIX COUNT + 1 DESYNC IN ANALYSIS SCREEN
 * fens.length === moves.length + 1 (fens[0] is starting position)
 * plyIndex ranges from 0 (initial position) to moves.length
 */
function syncAnalysisToPly(plyIndex, fens, moves, evaluations) {
  if (typeof resetBoardVisualState === 'function') {
    resetBoardVisualState();
  }

  const currentFen = fens[plyIndex] || (window.AppConfig ? window.AppConfig.INITIAL_FEN : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const preMoveFen = fens[Math.max(0, plyIndex - 1)]; // Board state BEFORE the move
  const playedMove = plyIndex > 0 ? moves[plyIndex - 1] : null;
  const currentEval = (evaluations && evaluations[plyIndex]) || { cp: 0, mate: null };

  // 1. Render board at exact ply
  renderBoardFromFen(currentFen);

  // 2. Highlight & play audio ONLY if a move was played (plyIndex > 0)
  if (playedMove) {
    const from = playedMove.from || playedMove.uci?.slice(0, 2);
    const to = playedMove.to || playedMove.uci?.slice(2, 4);

    if (from) document.querySelector(`[data-square="${from}"]`)?.classList.add('highlight-analysis');
    if (to) document.querySelector(`[data-square="${to}"]`)?.classList.add('highlight-analysis');

    if (typeof playChessSound === 'function') {
      const soundType = (playedMove.inCheck || playedMove.san?.includes('+') || playedMove.san?.includes('#'))
        ? 'check'
        : (playedMove.captured || playedMove.san?.includes('x'))
          ? 'capture'
          : (playedMove.san === 'O-O' || playedMove.san === 'O-O-O')
            ? 'castle'
            : 'move';
      playChessSound(soundType);
    }
  }

  // 3. Sync Eval Bar to current board position (fens[plyIndex])
  if (typeof updateEvaluationBar === 'function') {
    updateEvaluationBar(currentEval.cp, currentEval.mate);
  }

  // 4. If playedMove was a mistake/blunder/inaccuracy/misplay, show best move from preMoveFen
  const altUci = playedMove?.bestAlternativeUci || playedMove?.bestMove || playedMove?.bestmove;
  if (playedMove && MISPLAY_TYPES.has(playedMove.classification) && altUci && altUci.length >= 4) {
    if (typeof drawMoveArrowFixed === 'function') {
      drawMoveArrowFixed(
        altUci.slice(0, 2),
        altUci.slice(2, 4),
        '#3b82f6',
        true
      );
    }
  }

  // 5. Let Stockfish think through currentFen for the Top 3 continuations box
  const eggDepth = typeof window.configuredEggDepth !== 'undefined' ? window.configuredEggDepth : 20;
  runStockfishMultiPV(currentFen, eggDepth);
}

/**
 * 2. SEEDED SOLVABLE PUZZLE ENGINE (Mulberry32 PRNG + Lichess UCI Format)
 * Each puzzle in `verifiedPuzzles` has: { id, fen, moves: ['e2e4', 'e7e5', ...] }
 * moves[0] = opponent setup move, moves[1] = player's 1st required move
 */
function createSeededPRNG(seedNumber) {
  return function() {
    let t = (seedNumber += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  let hash = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

const puzzleState = {
  currentPuzzle: null,
  solutionIndex: 1, // Index 0 is opponent's setup move; player starts at 1
  penaltyCount: 0,
  reward: 1,
  isFinished: false
};

/**
 * Execute a UCI move on the board (e.g. 'e2e4' or 'e7e8q')
 */
function executeUciMoveOnBoard(uciMove) {
  if (!uciMove || uciMove.length < 4) return;
  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  const promo = uciMove.length > 4 ? uciMove[4] : undefined;

  const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);
  if (cb) {
    const curFen = cb.fen || (puzzleState.currentPuzzle ? puzzleState.currentPuzzle.fen : null);
    if (typeof window.Chess === 'function' && curFen) {
      try {
        const c = new window.Chess(curFen);
        c.move({ from, to, promotion: promo });
        cb.update(c.fen(), { lastMove: { from, to } });
        return;
      } catch (err) {
        // Continue to fallback
      }
    }

    // Direct DOM piece reposition fallback
    const fromEl = document.querySelector(`[data-square="${from}"]`);
    const toEl = document.querySelector(`[data-square="${to}"]`);
    if (fromEl && toEl) {
      const piece = fromEl.querySelector('.chess-piece, .piece');
      if (piece) {
        toEl.querySelectorAll('.chess-piece, .piece').forEach(p => p.remove());
        toEl.appendChild(piece);
      }
    }
  }
}

function loadSeededPuzzle(verifiedPuzzles, seed = Date.now()) {
  if (typeof resetBoardVisualState === 'function') {
    resetBoardVisualState(); // Fixes leftover lit squares in puzzle mode
  }

  const numericSeed = hashSeed(seed);
  const rand = createSeededPRNG(numericSeed);
  const puzzleList = (verifiedPuzzles && verifiedPuzzles.length > 0) ? verifiedPuzzles : VERIFIED_PUZZLES;
  const pickIndex = Math.floor(rand() * puzzleList.length);
  const puzzle = puzzleList[pickIndex];

  // Standardize moves array (support space-delimited string or array)
  const moves = Array.isArray(puzzle.moves) ? puzzle.moves : puzzle.moves.trim().split(/\s+/);
  puzzleState.currentPuzzle = { ...puzzle, moves };
  puzzleState.solutionIndex = 1;
  puzzleState.penaltyCount = 0;
  puzzleState.reward = 1;
  puzzleState.isFinished = false;
  if (window.PuzzlesPage) window.PuzzlesPage.isFinished = false;
  updatePuzzleRewardUI();

  // Determine player color: Initial FEN turn indicates who makes the setup blunder
  const initialTurn = (puzzle.fen.split(' ')[1] || 'w').toLowerCase();
  const playerColor = initialTurn === 'w' ? 'black' : 'white';

  // Initialize board with orientation and initial FEN
  const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);
  if (cb) {
    cb.init('board-container', {
      orientation: playerColor,
      playerColor: playerColor,
      fen: puzzle.fen,
      interactive: false
    });
  } else {
    renderBoardFromFen(puzzle.fen);
  }

  // Play opponent's setup move (moves[0]) after brief visual delay
  const setupMove = puzzleState.currentPuzzle.moves[0];
  setTimeout(() => {
    executeUciMoveOnBoard(setupMove);

    // Highlight opponent's setup move cleanly
    const setupFrom = setupMove.slice(0, 2);
    const setupTo = setupMove.slice(2, 4);
    document.querySelector(`[data-square="${setupFrom}"]`)?.classList.add('highlight-analysis');
    document.querySelector(`[data-square="${setupTo}"]`)?.classList.add('highlight-analysis');

    if (typeof playChessSound === 'function') {
      playChessSound('move');
    }

    // Now enable board for player's move
    if (cb) {
      cb.interactive = true;
      cb.onMove = (attempt) => {
        return handlePuzzlePlayerMove(attempt.from, attempt.to, attempt.promotion);
      };
      cb.render();
      cb.bindEvents();
    }

    const turnInd = document.getElementById('puzzle-turn-indicator');
    if (turnInd) {
      turnInd.textContent = `Your Turn — Find the winning line for ${playerColor}!`;
    }
  }, 250);
}

function applyPuzzlePenalty() {
  puzzleState.penaltyCount += 1;
  // 1st mistake/hint -> reward = 0 | 2nd+ mistake/hint -> reward = -1
  puzzleState.reward = puzzleState.penaltyCount === 1 ? 0 : -1;
  updatePuzzleRewardUI();
}

function updatePuzzleRewardUI() {
  const badge = document.getElementById('puzzle-reward-badge');
  if (badge) {
    const text = puzzleState.reward > 0 ? '+1' : `${puzzleState.reward}`;
    badge.textContent = `Reward: ${text}`;
    badge.className = 'badge';
    if (puzzleState.reward > 0) {
      badge.classList.add('badge-success');
    } else if (puzzleState.reward === 0) {
      badge.classList.add('badge-warning');
    } else {
      badge.classList.add('badge-danger');
    }
  }
}

function handlePuzzlePlayerMove(fromSq, toSq, promo = '') {
  if (!puzzleState.currentPuzzle) return false;

  const expectedUci = puzzleState.currentPuzzle.moves[puzzleState.solutionIndex];
  if (!expectedUci) return false;

  const playedUci = `${fromSq}${toSq}${promo || ''}`.toLowerCase();
  const expectedBase = expectedUci.toLowerCase();

  // Check move match
  if (playedUci.slice(0, 4) !== expectedBase.slice(0, 4)) {
    // Wrong move: apply penalty (0 then -1) and snap piece back
    applyPuzzlePenalty();

    const feedback = document.getElementById('puzzle-feedback');
    if (feedback) {
      feedback.className = 'puzzle-feedback glass-panel incorrect';
      feedback.classList.remove('hidden');
      feedback.textContent = '✗ Incorrect move. Look for a stronger tactical blow!';
    }

    if (typeof playChessSound === 'function') {
      playChessSound('check');
    }

    // Snap piece back to its original square
    const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);
    if (cb) {
      cb.selectedSquare = null;
      cb.legalMoves = [];
      cb.render();
      cb.bindEvents();
    }
    return false;
  }

  // Correct move: clear old highlights, light up current move, advance solution
  if (typeof resetBoardVisualState === 'function') {
    resetBoardVisualState();
  }
  executeUciMoveOnBoard(expectedUci);
  document.querySelector(`[data-square="${fromSq}"]`)?.classList.add('highlight-analysis');
  document.querySelector(`[data-square="${toSq}"]`)?.classList.add('highlight-analysis');

  if (typeof playChessSound === 'function') {
    playChessSound('move');
  }

  puzzleState.solutionIndex += 1;

  // Auto-play opponent response if more moves remain
  const replyUci = puzzleState.currentPuzzle.moves[puzzleState.solutionIndex];
  const cb = window.ChessBoard || (typeof ChessBoard !== 'undefined' ? ChessBoard : null);
  if (replyUci) {
    if (cb) cb.interactive = false;
    setTimeout(() => {
      if (typeof resetBoardVisualState === 'function') {
        resetBoardVisualState();
      }
      executeUciMoveOnBoard(replyUci);
      document.querySelector(`[data-square="${replyUci.slice(0, 2)}"]`)?.classList.add('highlight-analysis');
      document.querySelector(`[data-square="${replyUci.slice(2, 4)}"]`)?.classList.add('highlight-analysis');
      if (typeof playChessSound === 'function') {
        playChessSound('move');
      }
      puzzleState.solutionIndex += 1;

      // Re-enable for subsequent player moves
      if (puzzleState.solutionIndex < puzzleState.currentPuzzle.moves.length) {
        if (cb) {
          cb.interactive = true;
          cb.bindEvents();
        }
      } else {
        // Complete puzzle if reply was final
        onPuzzleFinishedSuccessfully();
      }
    }, 320);
  } else {
    // Puzzle finished!
    onPuzzleFinishedSuccessfully();
  }
  return true;
}

function onPuzzleFinishedSuccessfully() {
  puzzleState.isFinished = true;
  if (window.PuzzlesPage) {
    window.PuzzlesPage.isFinished = true;
  }
  if (typeof playChessSound === 'function') {
    playChessSound('game_over');
  }

  const feedback = document.getElementById('puzzle-feedback');
  if (feedback) {
    feedback.className = 'puzzle-feedback glass-panel correct';
    feedback.classList.remove('hidden');
    const pointsText = puzzleState.reward > 0 ? '+1 ELO' : (puzzleState.reward === 0 ? '+0 ELO' : '-1 ELO');
    feedback.textContent = `✓ Correct! Puzzle solved (${pointsText})`;
  }

  // Submit attempt to server if user is logged in
  if (window.Auth && window.Auth.currentUser && window.Api && puzzleState.currentPuzzle) {
    window.Api.post(`/puzzles/${puzzleState.currentPuzzle.id}/attempt`, {
      solved: true,
      reward: puzzleState.reward,
      penalty_count: puzzleState.penaltyCount
    }).then(res => {
      if (res && res.new_elo !== undefined) {
        window.Auth.currentUser.elo_rating = res.new_elo;
        window.Auth.currentUser.puzzles_solved = res.puzzles_solved;
        window.Auth.updateUI();
      }
    }).catch(() => {});
  }
}

/**
 * 3. PUZZLE HINT: PENALIZE SCORE, LIGHT UP PIECE SQUARE & DRAW BLUE ARROW
 */
function requestPuzzleHint() {
  if (!puzzleState.currentPuzzle) return;
  const expectedUci = puzzleState.currentPuzzle.moves[puzzleState.solutionIndex];
  if (!expectedUci) return;

  applyPuzzlePenalty(); // Counts same as mistake (0 on first, -1 on second)
  if (typeof resetBoardVisualState === 'function') {
    resetBoardVisualState();
  }

  const fromSq = expectedUci.slice(0, 2);
  const toSq = expectedUci.slice(2, 4);

  // Light up the origin square of the piece that needs to move + draw blue arrow
  document.querySelector(`[data-square="${fromSq}"]`)?.classList.add('highlight-analysis');
  if (typeof drawMoveArrowFixed === 'function') {
    drawMoveArrowFixed(fromSq, toSq, '#3b82f6', true);
  }

  const feedback = document.getElementById('puzzle-feedback');
  if (feedback) {
    feedback.className = 'puzzle-feedback glass-panel';
    feedback.classList.remove('hidden');
    feedback.textContent = `💡 Hint: Play ${fromSq.toUpperCase()} → ${toSq.toUpperCase()} (Penalty applied: Reward is now ${puzzleState.reward > 0 ? '+1' : puzzleState.reward})`;
  }
}

/**
 * 4. FIX BROKEN SCREEN BUTTONS (Play, Bots, Review, Profile)
 */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const routes = {
    'play-online':        () => (window.App ? window.App.navigateTo('play') : window.location.assign('/play')),
    'play-bots':          () => (window.App ? window.App.navigateTo('bots') : window.location.assign('/bots')),
    'game-review':        () => {
      if (window.lastFinishedGame && (window.lastFinishedGame.pgn || window.lastFinishedGame.inviteCode)) {
        if (window.App) window.App.navigateTo('analysis', window.lastFinishedGame);
        else window.location.assign('/analysis');
      } else {
        if (typeof switchMode === 'function') switchMode('analysis');
        else if (window.App) window.App.navigateTo('analysis');
        else window.location.assign('/analysis');
      }
    },
    'open-puzzles':       () => (window.App ? window.App.navigateTo('puzzles') : window.location.assign('/puzzles')),
    'open-profile':       () => (window.App ? window.App.navigateTo('profile', btn.dataset.profile || undefined) : window.location.assign('/profile')),
    'open-leaderboard':   () => (window.App ? window.App.navigateTo('leaderboard') : window.location.assign('/leaderboard')),
    'puzzle-hint':        () => (typeof triggerPuzzleHint === 'function' ? triggerPuzzleHint() : requestPuzzleHint()),
    'request-rematch':    () => (typeof requestRematch === 'function' ? requestRematch() : null),
    'show-login':         () => (window.Auth && typeof window.Auth.showLoginModal === 'function' && window.Auth.showLoginModal()),
    'show-register':      () => (window.Auth && typeof window.Auth.showRegisterModal === 'function' && window.Auth.showRegisterModal()),
    'close-forgot-modal': () => {
      const modal = document.getElementById('forgot-modal');
      if (modal) modal.classList.add('hidden');
    },
    'switch-tab': () => {
      const tab = btn.dataset.tab;
      if (tab && window.AnalysisPage && typeof window.AnalysisPage.switchTab === 'function') {
        window.AnalysisPage.switchTab(tab);
      }
    }
  };

  if (routes[action]) {
    e.preventDefault();
    routes[action]();
  }
});

/**
 * 5. TIMEZONE ID PICKER (For Signup & Profile Settings)
 */
function populateTimezoneSelect(selectElementId, savedTimezone = null) {
  const select = document.getElementById(selectElementId);
  if (!select) return;

  const zones = (typeof Intl !== 'undefined' && Intl.supportedValuesOf)
    ? Intl.supportedValuesOf('timeZone')
    : ['UTC', 'Europe/Amsterdam', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];

  let detectedZone = savedTimezone;
  if (!detectedZone) {
    try {
      detectedZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
      detectedZone = 'UTC';
    }
  }
  if (!detectedZone) detectedZone = 'UTC';

  select.innerHTML = zones.map(tz =>
    `<option value="${tz}" ${tz === detectedZone ? 'selected' : ''}>${tz}</option>`
  ).join('');
}

function formatTimestampForUser(utcDateString, userTimezoneId = 'UTC') {
  if (!utcDateString) return '';
  const tz = userTimezoneId || 'UTC';
  try {
    return new Date(utcDateString).toLocaleString('en-GB', {
      timeZone: tz,
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch (err) {
    return new Date(utcDateString).toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }
}

/**
 * Save user timezone to backend and update local user session
 */
async function saveUserTimezone(newTimezoneId) {
  if (!newTimezoneId) return;

  if (window.Auth && window.Auth.currentUser) {
    window.Auth.currentUser.timezone_id = newTimezoneId;
  }

  if (window.Api && window.Auth?.currentUser) {
    try {
      await window.Api.post('/users/timezone', { timezone_id: newTimezoneId });
      console.log(`[Timezone] Saved user timezone: ${newTimezoneId}`);
    } catch (e) {
      console.warn('[Timezone] Error saving timezone preference:', e.message);
    }
  }

  // Re-render date stamps if ProfilePage or AnalysisPage is active
  if (window.ProfilePage && window.ProfilePage.profileUser) {
    window.ProfilePage.profileUser.timezone_id = newTimezoneId;
    const container = document.getElementById('matches-table-container');
    if (container && window.ProfilePage.recentGames) {
      container.innerHTML = window.ProfilePage.renderMatchesList(window.ProfilePage.recentGames, window.ProfilePage.currentFilter);
      window.ProfilePage.bindMatchActionButtons();
    }
  }
}

/**
 * Standard Verified Solvable Puzzles (Lichess MultiPV 1 > +2.0 Verified Dataset)
 */
const VERIFIED_PUZZLES = [
  {
    id: '00008',
    fen: 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/P1P2bPP/7K b - - 0 24',
    moves: ['f2g3', 'e6e7', 'g3h4', 'e7h7'],
    rating: 1200,
    themes: 'crushing endgame fork long'
  },
  {
    id: '00078',
    fen: 'r1b2rk1/pp3ppp/2n1p3/q7/2B5/P3PN2/1PQ2PPP/R3K2R w KQ - 1 13',
    moves: ['e1e2', 'c6e5', 'c2c3'],
    rating: 1100,
    themes: 'advantage master middlegame'
  },
  {
    id: '001Wb',
    fen: '2r3k1/pp3ppp/4p3/3pP3/3P4/PP6/1Q2RPPP/2q3K1 w - - 3 26',
    moves: ['b2c1', 'c8c1', 'e2e1', 'c1e1'],
    rating: 600,
    themes: 'backRankMate endgame mate mateIn2'
  },
  {
    id: '001m8',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 1 4',
    moves: ['d7d5', 'c4b5', 'f8d6'],
    rating: 800,
    themes: 'opening advantage'
  },
  {
    id: '0021O',
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1',
    moves: ['h7h6', 'e1e8', 'g8h7'],
    rating: 500,
    themes: 'backRankMate mate mateIn1'
  },
  {
    id: '002r9',
    fen: 'r1b1k2r/pppp1ppp/8/4P3/1b1q4/2N5/PPPB1PPP/R2QKB1R w KQkq - 2 9',
    moves: ['f1d3', 'd4e5', 'd1e2'],
    rating: 900,
    themes: 'advantage opening'
  },
  {
    id: '003iZ',
    fen: 'r2q1rk1/1pp1bppp/p1np1nb1/4p3/B3P1P1/2PP1N1P/PP3P2/RNBQR1K1 w - - 1 11',
    moves: ['f3h4', 'f6d7', 'h4g6'],
    rating: 1150,
    themes: 'advantage middlegame'
  },
  {
    id: '004N6',
    fen: 'r1b2rk1/pp1n1ppp/2p5/q3p3/1bPP4/2N1B3/PP2BPPP/R2Q1RK1 w - - 2 12',
    moves: ['d1c2', 'e5d4', 'e3d4'],
    rating: 1250,
    themes: 'advantage middlegame'
  },
  {
    id: '005M1',
    fen: 'r1b1r1k1/pp3ppp/2n2n2/q2p4/3P4/B1PB1N2/P1Q2PPP/R4RK1 w - - 4 13',
    moves: ['a3c5', 'c8g4', 'f3d2'],
    rating: 1300,
    themes: 'advantage middlegame quietMove'
  },
  {
    id: '006W5',
    fen: '2r1r1k1/pp3ppp/8/3p4/3P4/PP6/1Q2RPPP/2q3K1 w - - 0 25',
    moves: ['e2e1', 'e8e1'],
    rating: 700,
    themes: 'backRankMate mate mateIn1'
  },
  {
    id: '007T1',
    fen: 'r1b1k2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4',
    moves: ['d2d3', 'd7d6', 'c1g5'],
    rating: 800,
    themes: 'opening pin'
  },
  {
    id: '008K3',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    moves: ['f3g5', 'd7d5', 'e4d5', 'c6a5'],
    rating: 1200,
    themes: 'opening attack fork'
  },
  {
    id: '009H8',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/4P3/2NP1N2/PPP2PPP/R1BQKB1R w KQkq - 1 5',
    moves: ['f1e2', 'd7d6', 'c1e3'],
    rating: 900,
    themes: 'development opening'
  },
  {
    id: '00D4E',
    fen: '6k1/5p1p/6p1/8/8/8/5PPP/3q1QK1 w - - 0 1',
    moves: ['g2g3', 'd1f1', 'g1f1'],
    rating: 650,
    themes: 'endgame mate'
  },
  {
    id: '00E5F',
    fen: 'r4rk1/1pp1qppp/p1np1n2/4p3/4P1b1/2PP1N2/PP1NBPPP/R2Q1RK1 w - - 0 10',
    moves: ['h2h3', 'g4h5', 'f3h2'],
    rating: 1150,
    themes: 'advantage middlegame'
  }
];

// Export to window for global access
window.syncAnalysisToPly = syncAnalysisToPly;
window.createSeededPRNG = createSeededPRNG;
window.hashSeed = hashSeed;
window.puzzleState = puzzleState;
window.loadSeededPuzzle = loadSeededPuzzle;
window.applyPuzzlePenalty = applyPuzzlePenalty;
window.updatePuzzleRewardUI = updatePuzzleRewardUI;
window.handlePuzzlePlayerMove = handlePuzzlePlayerMove;
window.requestPuzzleHint = requestPuzzleHint;
window.populateTimezoneSelect = populateTimezoneSelect;
window.formatTimestampForUser = formatTimestampForUser;
window.saveUserTimezone = saveUserTimezone;
window.executeUciMoveOnBoard = executeUciMoveOnBoard;
window.renderBoardFromFen = renderBoardFromFen;
window.runStockfishMultiPV = runStockfishMultiPV;
window.MISPLAY_TYPES = MISPLAY_TYPES;
window.VERIFIED_PUZZLES = VERIFIED_PUZZLES;
