/**
 * Analysis Page — Post-Game Review with Stockfish Depth 8, Accuracy %, Badges & Retry Mistake
 */
const AnalysisPage = {
  currentAnalysis: null,
  currentMoveIndex: -1,
  fens: [],
  pgn: '',

  async render(params = {}) {
    const main = document.getElementById('main-content');
    this.pgn = params.pgn || '';
    const inviteCode = params.inviteCode || null;

    if (!this.pgn) {
      // Show PGN input / select previous game
      main.innerHTML = `
        <div class="page">
          <div class="page-header">
            <h1 class="page-title">Game Review & Analysis</h1>
            <p class="page-subtitle">Paste a PGN or analyze your recent matches with Stockfish</p>
          </div>

          <div class="glass-panel play-setup" style="max-width:600px;">
            <h2>Enter Game PGN</h2>
            <div class="form-group">
              <label class="form-label">PGN Notation</label>
              <textarea class="form-input" id="pgn-input" rows="8" placeholder="1. e4 e5 2. Nf3 Nc6 3. Bc4 ..."></textarea>
            </div>
            <button class="btn btn-primary btn-block btn-lg" id="btn-start-analysis">Run Game Review</button>
            <div id="recent-games-list" class="mt-3"></div>
          </div>
        </div>
      `;

      document.getElementById('btn-start-analysis')?.addEventListener('click', () => {
        const val = document.getElementById('pgn-input').value.trim();
        if (val) this.startAnalysis(val);
        else alert('Please enter or paste a valid PGN string.');
      });

      this.loadRecentGames();
      return;
    }

    this.startAnalysis(this.pgn, inviteCode);
  },

  async loadRecentGames() {
    if (!Auth.currentUser) return;
    try {
      const data = await Api.get('/games/history/me');
      const games = data.games || [];
      const container = document.getElementById('recent-games-list');
      if (container && games.length > 0) {
        let html = '<h3 style="font-size:14px;color:var(--text-secondary);margin-bottom:8px;">Recent Games:</h3><div style="display:flex;flex-direction:column;gap:6px;">';
        games.slice(0, 5).forEach(g => {
          if (g.pgn) {
            html += `
              <div class="glass-panel" style="padding:10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="AnalysisPage.startAnalysis(\`${encodeURIComponent(g.pgn)}\`, '${g.invite_code}')">
                <span style="font-size:13px;font-weight:600;">Match ${g.invite_code} (${g.game_type.toUpperCase()})</span>
                <span class="badge badge-accent">Result: ${g.result || '*'}</span>
              </div>
            `;
          }
        });
        html += '</div>';
        container.innerHTML = html;
      }
    } catch (e) {
      // ignore
    }
  },

  async startAnalysis(pgnString, inviteCode = null) {
    const rawPgn = decodeURIComponent(pgnString);
    const main = document.getElementById('main-content');

    main.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1 class="page-title">Game Review</h1>
          <p class="page-subtitle">Evaluating every move with Stockfish 16.1 at Depth 8</p>
        </div>

        <div class="glass-panel text-center" style="padding:48px;" id="analysis-loading">
          <div class="spinner"></div>
          <div class="loading-text mt-2">Classifying blunders, mistakes, and accuracy...</div>
        </div>

        <div id="analysis-workspace" class="hidden"></div>
      </div>
    `;

    try {
      const result = await Api.post('/analysis/game', { pgn: rawPgn, invite_code: inviteCode });
      this.currentAnalysis = result;
      this.renderAnalysisView(result);
    } catch (err) {
      document.getElementById('analysis-loading').innerHTML = `
        <div class="text-danger" style="font-size:16px;font-weight:700;">Analysis Failed</div>
        <div class="text-muted mt-1">${err.message || 'Error processing PGN with engine.'}</div>
        <button class="btn btn-primary mt-3" onclick="App.navigateTo('analysis')">Try Another Game</button>
      `;
    }
  },

  renderAnalysisView(data) {
    document.getElementById('analysis-loading')?.classList.add('hidden');
    const workspace = document.getElementById('analysis-workspace');
    workspace.classList.remove('hidden');

    const whiteAcc = data.whiteAccuracy || 50;
    const blackAcc = data.blackAccuracy || 50;
    const moves = data.moves || [];

    // Pre-calculate FEN for each move step
    this.fens = [AppConfig.INITIAL_FEN];
    moves.forEach(m => {
      this.fens.push(m.fen);
    });

    workspace.innerHTML = `
      <div class="analysis-layout">
        <!-- Eval Bar -->
        <div class="eval-bar-container">
          <div class="eval-bar-label" id="analysis-eval-label">0.0</div>
          <div class="eval-bar">
            <div class="eval-bar-fill" id="analysis-eval-fill"></div>
          </div>
        </div>

        <!-- Board Wrapper -->
        <div class="board-wrapper">
          <div id="board-container"></div>

          <!-- Move Stepper Bar -->
          <div class="glass-panel mt-2" style="padding:10px;display:flex;gap:8px;justify-content:center;align-items:center;">
            <button class="btn btn-ghost btn-sm" id="btn-step-start">⏮</button>
            <button class="btn btn-ghost btn-sm" id="btn-step-prev">◀</button>
            <span id="step-indicator" style="font-size:13px;font-weight:600;min-width:100px;text-align:center;">Start</span>
            <button class="btn btn-ghost btn-sm" id="btn-step-next">▶</button>
            <button class="btn btn-ghost btn-sm" id="btn-step-end">⏭</button>
            <button class="btn btn-ghost btn-sm" id="btn-flip">Flip</button>
          </div>

          <!-- Retry Mistake Banner -->
          <div id="retry-banner" class="glass-panel mt-2 hidden" style="padding:14px;border-color:var(--danger);display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span class="badge badge-danger" id="retry-badge-type">MISTAKE</span>
              <span style="font-size:13px;margin-left:8px;" id="retry-text">Can you find a better move?</span>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-retry-mistake">Retry Mistake</button>
          </div>
        </div>

        <!-- Right Analysis Sidebar -->
        <div class="analysis-sidebar">
          <!-- Accuracy Card -->
          <div class="accuracy-display glass-panel">
            <div style="display:flex;justify-content:space-around;align-items:center;margin-bottom:12px;">
              <div>
                <div class="accuracy-ring ${whiteAcc >= 80 ? 'high' : (whiteAcc >= 60 ? 'medium' : 'low')}">${whiteAcc}%</div>
                <div style="font-size:12px;font-weight:600;color:var(--text-secondary);">White Accuracy</div>
              </div>
              <div>
                <div class="accuracy-ring ${blackAcc >= 80 ? 'high' : (blackAcc >= 60 ? 'medium' : 'low')}">${blackAcc}%</div>
                <div style="font-size:12px;font-weight:600;color:var(--text-secondary);">Black Accuracy</div>
              </div>
            </div>

            <!-- Classification summary -->
            <div class="classification-summary">
              <div class="class-item">
                <div class="class-count" style="color:var(--move-best);">${data.summary?.white?.best + data.summary?.black?.best || 0}</div>
                <div class="class-label">Best</div>
              </div>
              <div class="class-item">
                <div class="class-count" style="color:var(--move-inaccuracy);">${data.summary?.white?.inaccuracy + data.summary?.black?.inaccuracy || 0}</div>
                <div class="class-label">Inacc.</div>
              </div>
              <div class="class-item">
                <div class="class-count" style="color:var(--move-mistake);">${data.summary?.white?.mistake + data.summary?.black?.mistake || 0}</div>
                <div class="class-label">Mistake</div>
              </div>
              <div class="class-item">
                <div class="class-count" style="color:var(--move-blunder);">${data.summary?.white?.blunder + data.summary?.black?.blunder || 0}</div>
                <div class="class-label">Blunder</div>
              </div>
            </div>
          </div>

          <!-- Move List with Badges -->
          <div class="move-list-container glass-panel" style="max-height:360px;">
            <div class="move-list-header">
              <h3>Move Review</h3>
              <span class="badge badge-accent">CAPS</span>
            </div>
            <div class="move-list" id="analysis-moves-grid"></div>
          </div>
        </div>
      </div>
    `;

    ChessBoard.init('board-container', {
      orientation: 'white',
      fen: AppConfig.INITIAL_FEN,
      interactive: false
    });

    this.renderMovesGrid(moves);
    this.bindAnalysisControls(moves);
    this.jumpToMove(-1);
  },

  renderMovesGrid(moves) {
    const container = document.getElementById('analysis-moves-grid');
    if (!container) return;

    let html = '';
    for (let i = 0; i < moves.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const w = moves[i];
      const b = moves[i + 1];

      const wBadge = w ? `<span class="badge-${w.classification}" style="font-size:11px;margin-left:4px;">${w.badge}</span>` : '';
      const bBadge = b ? `<span class="badge-${b.classification}" style="font-size:11px;margin-left:4px;">${b.badge}</span>` : '';

      html += `
        <div class="move-number">${moveNum}.</div>
        <div class="move-cell ${w?.classification || ''}" data-index="${i}">${w ? w.san + wBadge : ''}</div>
        <div class="move-cell ${b?.classification || ''}" data-index="${i + 1}">${b ? b.san + bBadge : ''}</div>
      `;
    }

    container.innerHTML = html;
    container.querySelectorAll('.move-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const idx = parseInt(cell.dataset.index);
        if (!isNaN(idx)) this.jumpToMove(idx);
      });
    });
  },

  bindAnalysisControls(moves) {
    document.getElementById('btn-step-start')?.addEventListener('click', () => this.jumpToMove(-1));
    document.getElementById('btn-step-prev')?.addEventListener('click', () => this.jumpToMove(Math.max(-1, this.currentMoveIndex - 1)));
    document.getElementById('btn-step-next')?.addEventListener('click', () => this.jumpToMove(Math.min(moves.length - 1, this.currentMoveIndex + 1)));
    document.getElementById('btn-step-end')?.addEventListener('click', () => this.jumpToMove(moves.length - 1));
    document.getElementById('btn-flip')?.addEventListener('click', () => ChessBoard.flip());

    // Keyboard navigation (Left / Right arrow keys)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.jumpToMove(Math.max(-1, this.currentMoveIndex - 1));
      if (e.key === 'ArrowRight') this.jumpToMove(Math.min(moves.length - 1, this.currentMoveIndex + 1));
    });
  },

  jumpToMove(index) {
    this.currentMoveIndex = index;
    const moves = this.currentAnalysis?.moves || [];

    // Highlight active cell in move list
    document.querySelectorAll('#analysis-moves-grid .move-cell').forEach(c => {
      const cIdx = parseInt(c.dataset.index);
      c.classList.toggle('active', cIdx === index);
    });

    const indicator = document.getElementById('step-indicator');
    const retryBanner = document.getElementById('retry-banner');

    if (index === -1) {
      ChessBoard.update(AppConfig.INITIAL_FEN, { lastMove: null });
      if (indicator) indicator.textContent = 'Initial Position';
      if (retryBanner) retryBanner.classList.add('hidden');
      this.updateEvalBar(0);
      return;
    }

    const currentMove = moves[index];
    if (!currentMove) return;

    // Board position
    const fen = currentMove.fen;
    const from = currentMove.uci.substring(0, 2);
    const to = currentMove.uci.substring(2, 4);

    ChessBoard.update(fen, {
      lastMove: { from, to }
    });

    if (indicator) {
      indicator.textContent = `Move ${currentMove.moveNumber}: ${currentMove.san} (${currentMove.badge})`;
    }

    this.updateEvalBar(currentMove.eval || 0);

    // Show Retry Mistake banner if move was mistake or blunder
    if (['blunder', 'mistake', 'inaccuracy'].includes(currentMove.classification)) {
      if (retryBanner) {
        retryBanner.classList.remove('hidden');
        document.getElementById('retry-badge-type').textContent = currentMove.classification.toUpperCase();
        document.getElementById('retry-text').textContent = `Played ${currentMove.san}. Stockfish prefers ${currentMove.bestMove || 'another move'}.`;
        
        document.getElementById('btn-retry-mistake').onclick = () => {
          this.retryMistake(index);
        };
      }
    } else {
      if (retryBanner) retryBanner.classList.add('hidden');
    }
  },

  retryMistake(index) {
    const moves = this.currentAnalysis?.moves || [];
    const move = moves[index];
    if (!move) return;

    // Load position prior to this move
    const prevFen = index === 0 ? AppConfig.INITIAL_FEN : moves[index - 1].fen;
    const turn = index % 2 === 0 ? 'white' : 'black';

    ChessBoard.init('board-container', {
      orientation: turn,
      fen: prevFen,
      interactive: true,
      onMove: (attempt) => {
        const attemptUci = attempt.from + attempt.to + (attempt.promotion || '');
        if (attemptUci === move.bestMove) {
          alert('★ Excellent! You found the engine\'s best move!');
          this.jumpToMove(index);
        } else {
          alert(`Not quite the best move. Engine recommended: ${move.bestMove}`);
          this.jumpToMove(index);
        }
      }
    });

    alert(`Retrying Move ${move.moveNumber}. Find a better move than ${move.san}!`);
  },

  updateEvalBar(ev) {
    const fillEl = document.getElementById('analysis-eval-fill');
    const labelEl = document.getElementById('analysis-eval-label');
    if (fillEl && labelEl) {
      const clamped = Math.max(-5, Math.min(5, ev));
      const percent = 50 + (clamped / 10) * 100;
      fillEl.style.height = `${percent}%`;

      const sign = ev > 0 ? '+' : '';
      labelEl.textContent = `${sign}${ev.toFixed(1)}`;
    }
  }
};
