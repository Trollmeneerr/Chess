/**
 * =========================================================================
 * Complete Fixes, Analysis & Stockfish WebWorker Hook (analysis-and-fixes.js)
 * 1. Mirrored / Flipped Arrow Coordinate Mapping
 * 2. Draw Arrow Only on Mouse Release (No live mousemove drag preview)
 * 3. Piece Snap-Back on Invalid Drop
 * 4. Clean Board State on Mode Switch (Play / Analysis / Puzzles)
 * 5. Current Move Highlight on Actual Move (idx, not idx - 1)
 * 6. Traditional Wooden Chess Audio Synthesizer
 * 7. Vertical Evaluation Bar with Sigmoid Clamping
 * 8. Stockfish WebWorker Streaming Hook (MultiPV: 3)
 * 9. Chess.com-Style Post-Game Summary Panel
 * =========================================================================
 */

// Global State
window.isBoardFlipped = false; // Set true when playing as Black
window.arrowStartSquare = null;
window.stockfishWorker = null;
window.stockfishWorkerReady = false;
window.currentAnalysisFen = null;
window.activeMultiPV = { 1: null, 2: null, 3: null };

/**
 * 1. CLEAN BOARD RESET ON MODE SWITCH / SCREEN TRANSITION
 * Board squares lighting up for the last move (and check) are preserved during moves!
 */
function resetBoardVisualState(fullReset = false) {
  const svg = document.getElementById('board-arrows') || document.getElementById('board-arrows-svg');
  if (svg) {
    if (fullReset) {
      svg.querySelectorAll('path, line').forEach(p => p.remove());
    } else {
      svg.querySelectorAll('#notes-arrows-layer path, path[data-note="true"]').forEach(p => p.remove());
    }
  }

  document.querySelectorAll('.square').forEach(sq => {
    sq.classList.remove(
      'highlight-analysis',
      'highlight-premove',
      'premove-from',
      'premove-to',
      'highlight-green',
      'note-green',
      'highlight-red',
      'highlight-blue',
      'highlight-cyan'
    );
    if (fullReset) {
      sq.classList.remove('in-check', 'last-move', 'last-move-from', 'last-move-to');
    }
  });

  document.querySelectorAll('.chess-piece.is-dragging, .piece.is-dragging').forEach(p => {
    p.classList.remove('is-dragging');
  });

  document.body.classList.remove('dragging-active');
  document.querySelectorAll('.square-eval-badge').forEach(b => b.remove());

  if (window.ChessBoard) {
    if (typeof window.ChessBoard.clearNotes === 'function') {
      window.ChessBoard.clearNotes();
    }
    if (fullReset) {
      window.ChessBoard.lastMove = null;
      window.ChessBoard.checkSquare = null;
      window.ChessBoard.inCheck = false;
    } else if (window.ChessBoard.lastMove) {
      // Always ensure board squares lighting up remain displayed!
      const fromEl = document.querySelector(`[data-square="${window.ChessBoard.lastMove.from}"]`);
      const toEl = document.querySelector(`[data-square="${window.ChessBoard.lastMove.to}"]`);
      if (fromEl) fromEl.classList.add('last-move-from');
      if (toEl) toEl.classList.add('last-move-to');
    }
  }
}

/**
 * Switch mode between Play, Analysis, Puzzles, etc.
 */
function switchMode(mode) {
  resetBoardVisualState();
  const evalBar = document.getElementById('eval-bar');
  const analysisPanel = document.getElementById('analysis-panel');
  const postGamePanel = document.getElementById('post-game-panel');

  if (mode === 'analysis') {
    evalBar?.classList.remove('hidden');
    analysisPanel?.classList.remove('hidden');
    postGamePanel?.classList.add('hidden');
    if (window.App && typeof window.App.navigateTo === 'function') {
      window.App.navigateTo('analysis');
    }
    initStockfishMultiPV();
  } else if (mode === 'play') {
    evalBar?.classList.add('hidden');
    analysisPanel?.classList.add('hidden');
    postGamePanel?.classList.add('hidden');
    if (window.App && typeof window.App.navigateTo === 'function') {
      window.App.navigateTo('play');
    }
  } else if (mode === 'puzzles') {
    evalBar?.classList.add('hidden');
    analysisPanel?.classList.add('hidden');
    postGamePanel?.classList.add('hidden');
    if (window.App && typeof window.App.navigateTo === 'function') {
      window.App.navigateTo('puzzles');
    }
  } else if (mode === 'bots') {
    evalBar?.classList.add('hidden');
    analysisPanel?.classList.add('hidden');
    postGamePanel?.classList.add('hidden');
    if (window.App && typeof window.App.navigateTo === 'function') {
      window.App.navigateTo('bots');
    }
  } else {
    evalBar?.classList.add('hidden');
    analysisPanel?.classList.add('hidden');
  }
}

/**
 * 2. FIX MIRRORED/FLIPPED ARROWS + DRAW ONLY ON MOUSE RELEASE
 */
function getSquareCenterCoords(square) {
  if (!square || square.length < 2) return { x: 50, y: 50, col: 0, row: 0 };
  const files = 'abcdefgh';
  const fileIdx = files.indexOf(square[0]); // 0..7
  const rankIdx = parseInt(square[1], 10) - 1; // 0..7

  // Orientation-aware coordinate mapping (fixes mirrored/flipped bug)
  const isFlipped = (window.isBoardFlipped !== undefined)
    ? window.isBoardFlipped
    : (window.ChessBoard && window.ChessBoard.orientation === 'black');

  const col = isFlipped ? (7 - fileIdx) : fileIdx;
  const row = isFlipped ? rankIdx : (7 - rankIdx);

  return { x: col * 100 + 50, y: row * 100 + 50, col, row };
}

function drawMoveArrowFixed(fromSq, toSq, color = '#3b82f6', isBestMove = false) {
  if (!fromSq || !toSq || fromSq === toSq) return;
  const svg = document.getElementById('board-arrows') || document.getElementById('board-arrows-svg');
  if (!svg) return;

  const start = getSquareCenterCoords(fromSq);
  const end = getSquareCenterCoords(toSq);
  const dx = end.col - start.col;
  const dy = end.row - start.row;

  const cleanColor = color.replace(/[^a-zA-Z0-9]/g, '');
  const markerId = `arrowhead-${cleanColor}`;

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  let marker = svg.querySelector(`#${markerId}`);
  if (!marker) {
    marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('markerWidth', '4');
    marker.setAttribute('markerHeight', '4');
    marker.setAttribute('refX', '2.6');
    marker.setAttribute('refY', '2');
    marker.setAttribute('orient', 'auto');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '0 0.5, 3.8 2, 0 3.5');
    poly.setAttribute('fill', color);
    marker.appendChild(poly);
    defs.appendChild(marker);
  }

  const isNote = (color === '#22c55e');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const isKnight = (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);

  if (isKnight) {
    const midX = Math.abs(dx) === 2 ? end.x : start.x;
    const midY = Math.abs(dy) === 2 ? end.y : start.y;
    path.setAttribute('d', `M ${start.x} ${start.y} L ${midX} ${midY} L ${end.x} ${end.y}`);
  } else {
    path.setAttribute('d', `M ${start.x} ${start.y} L ${end.x} ${end.y}`);
  }

  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', isBestMove ? '20' : (isNote ? '14' : '16'));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('opacity', '0.88');
  path.setAttribute('marker-end', `url(#${markerId})`);
  if (isNote) {
    path.setAttribute('data-note', 'true');
  } else {
    path.setAttribute('data-engine', 'true');
  }

  const targetLayer = isNote
    ? (svg.querySelector('#notes-arrows-layer') || svg.querySelector('#arrows-list') || svg)
    : (svg.querySelector('#engine-arrows-layer') || svg.querySelector('#arrows-list') || svg);

  targetLayer.appendChild(path);

  // Preserve engine arrows in ChessBoard state so they persist across board re-renders
  if (!isNote && window.ChessBoard) {
    if (!window.ChessBoard.engineArrows) window.ChessBoard.engineArrows = [];
    if (!window.ChessBoard.engineArrows.some(a => a.from === fromSq && a.to === toSq && a.color === color)) {
      window.ChessBoard.engineArrows.push({ from: fromSq, to: toSq, color, isBestMove });
    }
  }
}

// Right-Click Note Drawing: Green arrows and green square notes
document.addEventListener('mousedown', (e) => {
  const sqEl = e.target.closest('.square');
  if (e.button === 2 && sqEl) {
    window.arrowStartSquare = sqEl.dataset.square;
  } else if (e.button === 0) {
    if (e.target.closest('input, textarea, select, button, .modal, .chat-panel')) return;
    // Left click on board: Clear user notes only (green arrows and green squares)
    const svg = document.getElementById('board-arrows') || document.getElementById('board-arrows-svg');
    if (svg) {
      svg.querySelectorAll('#notes-arrows-layer path, path[data-note="true"]').forEach(p => p.remove());
    }
    document.querySelectorAll('.highlight-green, .note-green').forEach(el => {
      el.classList.remove('highlight-green', 'note-green');
    });
    if (window.ChessBoard) {
      window.ChessBoard.clearNotes?.();
    }
  }
});

document.addEventListener('mouseup', (e) => {
  document.body.classList.remove('dragging-active');
  document.querySelectorAll('.chess-piece.is-dragging, .piece.is-dragging').forEach(p => {
    p.classList.remove('is-dragging');
  });
  const floating = document.querySelector('.piece.dragging');
  if (floating) floating.remove();

  if (e.button === 2 && window.arrowStartSquare) {
    // If board.js has an active rightDrag, it handles arrow/square notes natively without double-toggling
    if (window.ChessBoard && window.ChessBoard.rightDrag) {
      return;
    }
    const sqEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.square');
    if (sqEl) {
      const arrowEndSquare = sqEl.dataset.square;
      if (window.arrowStartSquare !== arrowEndSquare) {
        // Green note arrow
        if (window.ChessBoard && typeof window.ChessBoard.toggleNoteArrow === 'function') {
          window.ChessBoard.toggleNoteArrow(window.arrowStartSquare, arrowEndSquare);
        } else {
          drawMoveArrowFixed(window.arrowStartSquare, arrowEndSquare, '#22c55e', false);
        }
      } else {
        // Toggle green square note
        if (window.ChessBoard && typeof window.ChessBoard.toggleNoteSquare === 'function') {
          window.ChessBoard.toggleNoteSquare(arrowEndSquare);
        } else {
          sqEl.classList.toggle('highlight-green');
        }
      }
    }
    window.arrowStartSquare = null;
  }
});

/**
 * 3. PIECE DRAG & SNAP-BACK IF NO VALID MOVE WAS MADE
 */
function handlePieceDrop(pieceEl, fromSquare, toSquare, validateMoveFn) {
  const isValidMove = toSquare && fromSquare !== toSquare && validateMoveFn(fromSquare, toSquare);

  if (!isValidMove) {
    // Snap piece back to its original square immediately
    pieceEl.classList.remove('is-dragging');
    const originSqEl = document.querySelector(`[data-square="${fromSquare}"]`);
    if (originSqEl && !originSqEl.contains(pieceEl)) {
      originSqEl.appendChild(pieceEl);
    }
    return false;
  }

  // Valid move executed
  pieceEl.classList.remove('is-dragging');
  return true;
}

/**
 * 4. TRADITIONAL WOODEN CHESS AUDIO (Works in Play + Analysis)
 */
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playChessSound(type = 'move') {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;

  // Traditional low-pass wooden knock frequencies
  const freqMap = { move: 145, capture: 110, check: 220, castle: 130, game_over: 180 };
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freqMap[type] || 145, now);
  osc.frequency.exponentialRampToValueAtTime(38, now + 0.065);

  gain.gain.setValueAtTime(0.45, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.075);
}

/**
 * 5. ANALYSIS STEP: HIGHLIGHT THE ACTUAL MOVE + PLAY AUDIO + UPDATE EVAL BAR
 * Call when stepping to move index `idx` in `moveHistory`
 */
function renderAnalysisMoveStep(moveHistory, idx) {
  resetBoardVisualState();
  const currentMove = moveHistory[idx]; // Highlight the move ITSELF (not idx - 1)
  if (!currentMove) return;

  // Highlight origin and destination of the current move
  const from = currentMove.from || currentMove.uci?.substring(0, 2);
  const to = currentMove.to || currentMove.uci?.substring(2, 4);

  if (from) document.querySelector(`[data-square="${from}"]`)?.classList.add('highlight-analysis');
  if (to) document.querySelector(`[data-square="${to}"]`)?.classList.add('highlight-analysis');

  // Play traditional audio on analysis step
  if (currentMove.inCheck || currentMove.san?.includes('+') || currentMove.san?.includes('#')) {
    playChessSound('check');
  } else if (currentMove.captured || currentMove.san?.includes('x')) {
    playChessSound('capture');
  } else if (currentMove.san === 'O-O' || currentMove.san === 'O-O-O') {
    playChessSound('castle');
  } else {
    playChessSound('move');
  }

  // Update Evaluation Bar
  const cpVal = currentMove.evalCp !== undefined
    ? currentMove.evalCp
    : (currentMove.eval !== undefined ? Math.round(currentMove.eval * 100) : 0);
  updateEvaluationBar(cpVal, currentMove.mate);

  // If player made an inaccuracy/mistake/blunder, draw the Blue Best Move arrow
  const bestMove = currentMove.bestMove || currentMove.bestmove;
  if (['inaccuracy', 'mistake', 'blunder'].includes(currentMove.classification) && bestMove && bestMove.length >= 4) {
    const bestFrom = bestMove.slice(0, 2);
    const bestTo = bestMove.slice(2, 4);
    drawMoveArrowFixed(bestFrom, bestTo, '#3b82f6', true);
  }

  // Stream Top 3 lines for this position using Stockfish WebWorker hook
  if (currentMove.fen) {
    evaluatePositionWithWorker(currentMove.fen);
  }
}

/**
 * 6. EVALUATION BAR UPDATER
 * @param {number} cp - Centipawns from White's perspective (+150 = +1.50)
 * @param {number|null} mate - Mate in N moves (positive for White, negative for Black)
 */
function updateEvaluationBar(cp = 0, mate = null) {
  const fillEl = document.getElementById('eval-fill');
  const scoreEl = document.getElementById('eval-score');
  if (!fillEl || !scoreEl) return;

  let whitePercent = 50;
  if (mate !== null && mate !== undefined) {
    whitePercent = mate > 0 ? 100 : 0;
    scoreEl.textContent = `M${Math.abs(mate)}`;
  } else {
    const pawns = (cp / 100).toFixed(1);
    scoreEl.textContent = cp > 0 ? `+${pawns}` : pawns;
    // Sigmoid clamping between 5% and 95%
    whitePercent = 50 + (50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1));
    whitePercent = Math.max(5, Math.min(95, whitePercent));
  }

  fillEl.style.height = `${whitePercent}%`;
}

/**
 * 7. ENGINE TOP 3 LINES (MultiPV = 3 Parser)
 */
function updateEngineLineUI(multipvIndex, scoreText, pvMovesString, rawUciString = '') {
  const lineEl = document.querySelector(`.engine-line[data-multipv="${multipvIndex}"]`);
  if (!lineEl) return;
  if (rawUciString) lineEl.dataset.uci = rawUciString;
  const evalEl = lineEl.querySelector('.line-eval');
  if (evalEl) {
    evalEl.textContent = scoreText;
    if (scoreText.startsWith('+') || scoreText === '+0.0' || scoreText.includes('+M')) {
      evalEl.classList.add('blue-eval');
    } else {
      evalEl.classList.remove('blue-eval');
    }
  }
  const movesEl = lineEl.querySelector('.line-moves');
  if (movesEl) {
    movesEl.textContent = pvMovesString;
  }

  // Bind click on line to trigger audio and preview arrow / play move in analysis
  if (!lineEl._clickBound) {
    lineEl._clickBound = true;
    lineEl.addEventListener('click', () => {
      playChessSound('move');
      const uciStr = lineEl.dataset.uci || '';
      const firstUci = uciStr.split(' ')[0] || '';
      if (firstUci && firstUci.length >= 4) {
        const from = firstUci.slice(0, 2);
        const to = firstUci.slice(2, 4);
        drawMoveArrowFixed(from, to, '#3b82f6', true);
        if (window.AnalysisPage && window.AnalysisPage.isExploring !== undefined) {
          window.AnalysisPage.handleBoardMove(from, to, firstUci[4] || '');
        }
      }
    });
  }
}

/**
 * 8. SHOW POST-GAME CARD ON RIGHT HAND SIDE WHEN GAME ENDS
 */
function onGameEnd(resultTitle, reasonText, whiteAcc = 88.5, blackAcc = 74.2) {
  const postGamePanel = document.getElementById('post-game-panel');
  if (!postGamePanel) return;

  postGamePanel.classList.remove('hidden');

  const titleEl = document.getElementById('game-result-title');
  const reasonEl = document.getElementById('game-result-reason');
  const wAccEl = document.getElementById('white-acc');
  const bAccEl = document.getElementById('black-acc');

  if (titleEl) titleEl.textContent = resultTitle;
  if (reasonEl) reasonEl.textContent = reasonText;
  if (wAccEl) wAccEl.textContent = `${typeof whiteAcc === 'number' ? whiteAcc.toFixed(1) : whiteAcc}%`;
  if (bAccEl) bAccEl.textContent = `${typeof blackAcc === 'number' ? blackAcc.toFixed(1) : blackAcc}%`;
}

function startNewGame() {
  const postGame = document.getElementById('post-game-panel');
  postGame?.classList.add('hidden');
  resetBoardVisualState();
  if (window.App) window.App.navigateTo('play');
}

function requestRematch() {
  const postGame = document.getElementById('post-game-panel');
  postGame?.classList.add('hidden');
  resetBoardVisualState();
  if (window.PlayPage && window.PlayPage.socket) {
    window.PlayPage.socket.emit('rematch_request', { invite_code: window.PlayPage.currentGame?.invite_code });
  } else if (window.BotsPage && window.BotsPage.activeGame) {
    window.BotsPage.startBotMatch(window.BotsPage.activeGame.botElo);
  } else if (window.App) {
    window.App.navigateTo('play');
  }
}

/**
 * 9. STOCKFISH WEBWORKER HOOK — LIVE MULTIPV: 3 STREAMING
 */
function initStockfishMultiPV(initialFen = null) {
  if (window.stockfishWorker) {
    if (initialFen) evaluatePositionWithWorker(initialFen);
    return;
  }

  try {
    window.stockfishWorker = new Worker('/js/stockfish-worker.js');

    window.stockfishWorker.onmessage = function (event) {
      const line = typeof event.data === 'string' ? event.data : (event.data?.line || '');
      handleStockfishWorkerMessage(line);
    };

    window.stockfishWorker.postMessage('uci');
    window.stockfishWorker.postMessage('setoption name MultiPV value 3');
    window.stockfishWorker.postMessage('isready');
    window.stockfishWorkerReady = true;

    if (initialFen) {
      evaluatePositionWithWorker(initialFen);
    }
  } catch (err) {
    console.warn('[Stockfish Worker] Could not start worker, using backend MultiPV fallback:', err);
    if (initialFen) evaluatePositionWithWorker(initialFen);
  }
}

function evaluatePositionWithWorker(fen) {
  if (!fen) return;
  window.currentAnalysisFen = fen;

  const depthEl = document.getElementById('engine-depth');
  if (depthEl) depthEl.textContent = 'Analyzing...';

  if (window.stockfishWorker && window.stockfishWorkerReady) {
    try {
      window.stockfishWorker.postMessage('stop');
      window.stockfishWorker.postMessage(`position fen ${fen}`);
      window.stockfishWorker.postMessage('setoption name MultiPV value 3');
      window.stockfishWorker.postMessage('go depth 20');
    } catch (e) {
      fetchBackendMultiPV(fen);
    }
  } else {
    fetchBackendMultiPV(fen);
  }
}

/**
 * Parse UCI output from Stockfish Worker and update UI live
 */
function handleStockfishWorkerMessage(line) {
  if (!line || typeof line !== 'string') return;

  // Depth update
  const depthMatch = line.match(/depth\s+(\d+)/);
  if (depthMatch) {
    const depthEl = document.getElementById('engine-depth');
    if (depthEl) depthEl.textContent = `Depth ${depthMatch[1]}`;
  }

  // Parse MultiPV lines: info depth 12 ... multipv 1 score cp 145 ... pv e2e4 e7e5 ...
  const pvMatch = line.match(/multipv\s+(\d+)/);
  const scoreMatch = line.match(/score\s+(cp|mate)\s+(-?\d+)/);
  const pvMovesMatch = line.match(/pv\s+(.+)/);

  if (pvMatch && scoreMatch && pvMovesMatch) {
    const pvIndex = parseInt(pvMatch[1], 10);
    const scoreType = scoreMatch[1];
    let scoreVal = parseInt(scoreMatch[2], 10);

    // Format score text
    let scoreText = '+0.00';
    if (scoreType === 'mate') {
      scoreText = scoreVal > 0 ? `+M${Math.abs(scoreVal)}` : `-M${Math.abs(scoreVal)}`;
    } else {
      const pawns = (scoreVal / 100).toFixed(2);
      scoreText = scoreVal > 0 ? `+${pawns}` : pawns;
    }

    // Format PV moves
    const pvString = formatPVToAlgebraic(pvMovesMatch[1].trim());

    // Update UI badge and line moves
    updateEngineLineUI(pvIndex, scoreText, pvString, pvMovesMatch[1].trim());

    // If top line (multipv 1), update evaluation bar and puzzle post-continuation preview!
    if (pvIndex === 1) {
      updateEvaluationBar(scoreType === 'cp' ? scoreVal : 0, scoreType === 'mate' ? scoreVal : null);
      if (typeof window.renderPostPuzzle5MoveIdea === 'function' && window.puzzleController && window.puzzleController.isCompleted) {
        window.renderPostPuzzle5MoveIdea(pvMovesMatch[1].trim());
      }
    }
  }
}

/**
 * Format raw UCI moves e.g. "e2e4 e7e5 g1f3" to user-friendly chess notation
 */
function formatPVToAlgebraic(uciMovesStr) {
  if (!uciMovesStr) return '';
  const moves = uciMovesStr.split(/\s+/).slice(0, 8);
  if (typeof window.Chess === 'function' && window.currentAnalysisFen) {
    try {
      const c = new window.Chess(window.currentAnalysisFen);
      const formatted = [];
      moves.forEach((m) => {
        const from = m.substring(0, 2);
        const to = m.substring(2, 4);
        const promotion = m.length > 4 ? m[4] : undefined;
        const res = c.move({ from, to, promotion });
        if (res) formatted.push(res.san);
        else formatted.push(m);
      });
      return formatted.join(' ');
    } catch (e) {
      // Return raw moves
    }
  }
  return moves.join(' ');
}

/**
 * Backend fallback to native Stockfish binary via /api/analysis/multipv
 */
async function fetchBackendMultiPV(fen) {
  try {
    const res = await fetch('/api/analysis/multipv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, depth: 16, numPV: 3 })
    });
    const data = await res.json();
    if (data.lines && Array.isArray(data.lines)) {
      const depthEl = document.getElementById('engine-depth');
      if (depthEl) depthEl.textContent = `Depth ${data.depth || 16}`;

      data.lines.forEach((l) => {
        const scoreType = l.scoreType || 'cp';
        let scoreText = '+0.00';
        if (scoreType === 'mate') {
          scoreText = l.score > 0 ? `+M${Math.abs(l.score)}` : `-M${Math.abs(l.score)}`;
        } else {
          const pawns = typeof l.score === 'number' ? l.score.toFixed(2) : '0.00';
          scoreText = l.score > 0 ? `+${pawns}` : pawns;
        }
        const pvStr = Array.isArray(l.pv) ? l.pv.slice(0, 8).join(' ') : (l.pv || '');
        const rawUciStr = Array.isArray(l.pv) ? l.pv.join(' ') : (l.pv || '');
        updateEngineLineUI(l.pvNum, scoreText, pvStr, rawUciStr);

        if (l.pvNum === 1) {
          updateEvaluationBar(scoreType === 'cp' ? Math.round(l.score * 100) : 0, scoreType === 'mate' ? l.score : null);
          if (typeof window.renderPostPuzzle5MoveIdea === 'function' && window.puzzleController && window.puzzleController.isCompleted) {
            window.renderPostPuzzle5MoveIdea(Array.isArray(l.pv) ? l.pv.join(' ') : (l.pv || ''));
          }
        }
      });
    }
  } catch (err) {
    // Silent fallback
  }
}

// Export functions to window
window.resetBoardVisualState = resetBoardVisualState;
window.switchMode = switchMode;
window.getSquareCenterCoords = getSquareCenterCoords;
window.drawMoveArrowFixed = drawMoveArrowFixed;
window.handlePieceDrop = handlePieceDrop;
window.playChessSound = playChessSound;
window.renderAnalysisMoveStep = renderAnalysisMoveStep;
window.updateEvaluationBar = updateEvaluationBar;
window.updateEngineLineUI = updateEngineLineUI;
window.onGameEnd = onGameEnd;
window.startNewGame = startNewGame;
window.requestRematch = requestRematch;
window.initStockfishMultiPV = initStockfishMultiPV;
window.evaluatePositionWithWorker = evaluatePositionWithWorker;
