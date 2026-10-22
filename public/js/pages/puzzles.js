/**
 * Puzzles Page — Tactical Puzzles with difficulty tiers, auto-setup, and rating math
 */
const PuzzlesPage = {
  currentDifficulty: 'medium',
  currentPuzzle: null,
  solutionMoves: [],
  currentMoveIndex: 0,
  usedSolution: false,
  isFinished: false,
  inActivePuzzle: false,

  render() {
    this.inActivePuzzle = false;
    this.currentPuzzle = null;
    this.isFinished = true;
    if (window.puzzleController) window.puzzleController.isCompleted = true;
    if (window.puzzleState) window.puzzleState.isFinished = true;

    this.renderLandingView();
  },

  renderLandingView() {
    this.inActivePuzzle = false;
    if (window.App && typeof window.App.setSidebarCollapsed === 'function') {
      window.App.setSidebarCollapsed(false);
    }
    const main = document.getElementById('main-content');
    const userRating = Auth.currentUser?.elo_rating || 800;
    const puzzlesSolved = Auth.currentUser?.puzzles_solved || 0;

    main.innerHTML = `
      <div class="page puzzles-landing-wrap">
        <div class="page-header" style="text-align:left;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
          <div>
            <h1 class="page-title">Tactical Puzzles</h1>
            <p class="page-subtitle">Sharpen your calculation skills with 4,000+ curated tactical positions (1,000+ per tier) & earn +1 ELO</p>
          </div>
          <div style="display:flex;gap:8px;">
            <span class="badge badge-accent" id="puzzle-pool-badge">4,000+ Active</span>
            <span class="badge badge-success"><span class="pulse-dot"></span> Stockfish 16.1 Active</span>
          </div>
        </div>

        <div class="puzzles-landing-grid">
          <!-- Main Left Column: Hero & Difficulty Tier Cards -->
          <div class="puzzles-landing-main">
            <!-- Hero Card with Chess.com style Start Puzzle CTA -->
            <div class="puzzles-hero-card">
              <div class="puzzles-hero-header">
                <div>
                  <div class="badge badge-accent mb-2">TACTICAL TRAINING // OPT-IN</div>
                  <h2 class="puzzles-hero-title">Solve Tactical Puzzles</h2>
                  <p class="puzzles-hero-desc">
                    Find the best moves in critical positions. ELO rating is <strong>safe on this dashboard</strong> and is only at risk once you actively begin a puzzle.
                  </p>
                </div>
              </div>

              <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                <button class="start-puzzle-hero-btn" id="btn-start-puzzle">
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
                  </svg>
                  <span>Start Puzzle</span>
                </button>
                <div style="font-size:13px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;"></span>
                  Selected: <strong style="color:#fff;text-transform:capitalize;" id="selected-diff-label">${this.currentDifficulty}</strong>
                </div>
              </div>
            </div>

            <!-- Difficulty Selection Cards (Chess.com Style) -->
            <div class="glass-panel" style="padding:24px;border-radius:14px;margin-bottom:20px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <h3 style="margin:0;font-size:16px;font-weight:700;">Choose Difficulty Tier</h3>
                <span style="font-size:12px;color:var(--text-muted);">Select before starting</span>
              </div>
              
              <div class="puzzles-tier-grid">
                <div class="diff-tier-card ${this.currentDifficulty === 'easy' ? 'active' : ''}" data-diff="easy">
                  <div class="diff-tier-card-header">
                    <span class="diff-tier-name">Easy</span>
                    <span class="badge badge-subtle" id="count-easy" style="font-size:11px;">1,016</span>
                  </div>
                  <div class="diff-tier-range">Rating 400 – 999</div>
                  <div class="diff-tier-desc">Hanging pieces, simple forks, and 1-move tactical checkmates.</div>
                  <div class="diff-tier-active-check">✓ Active Tier</div>
                </div>

                <div class="diff-tier-card ${this.currentDifficulty === 'medium' ? 'active' : ''}" data-diff="medium">
                  <div class="diff-tier-card-header">
                    <span class="diff-tier-name">Medium</span>
                    <span class="badge badge-subtle" id="count-medium" style="font-size:11px;">1,000</span>
                  </div>
                  <div class="diff-tier-range">Rating 1000 – 1399</div>
                  <div class="diff-tier-desc">Pins, skewers, double attacks, and discovered threats.</div>
                  <div class="diff-tier-active-check">✓ Active Tier</div>
                </div>

                <div class="diff-tier-card ${this.currentDifficulty === 'hard' ? 'active' : ''}" data-diff="hard">
                  <div class="diff-tier-card-header">
                    <span class="diff-tier-name">Hard</span>
                    <span class="badge badge-subtle" id="count-hard" style="font-size:11px;">1,000</span>
                  </div>
                  <div class="diff-tier-range">Rating 1400 – 1899</div>
                  <div class="diff-tier-desc">Piece sacrifices, deflections, and complex multi-ply lines.</div>
                  <div class="diff-tier-active-check">✓ Active Tier</div>
                </div>

                <div class="diff-tier-card ${this.currentDifficulty === 'master' ? 'active' : ''}" data-diff="master">
                  <div class="diff-tier-card-header">
                    <span class="diff-tier-name">Master</span>
                    <span class="badge badge-subtle" id="count-master" style="font-size:11px;">1,000</span>
                  </div>
                  <div class="diff-tier-range">Rating 1900+</div>
                  <div class="diff-tier-desc">Grandmaster combinations, quiet moves, and deep calculations.</div>
                  <div class="diff-tier-active-check">✓ Active Tier</div>
                </div>

                <div class="diff-tier-card ${this.currentDifficulty === 'adaptive' ? 'active' : ''}" data-diff="adaptive">
                  <div class="diff-tier-card-header">
                    <span class="diff-tier-name">Adaptive</span>
                    <span class="badge badge-accent" style="font-size:11px;">Dynamic</span>
                  </div>
                  <div class="diff-tier-range">${userRating} ± 100 ELO</div>
                  <div class="diff-tier-desc">Automatically adjusts to match your current skill level.</div>
                  <div class="diff-tier-active-check">✓ Active Tier</div>
                </div>
              </div>
            </div>

            <!-- Tactical Themes Showcase -->
            <div class="glass-panel" style="padding:20px;border-radius:14px;">
              <h4 style="margin:0 0 10px 0;font-size:14px;color:var(--text-secondary);">Included Tactical Motifs</h4>
              <div class="puzzle-theme-tags" style="margin-top:0;">
                <span class="puzzle-theme-tag">⚡ Fork</span>
                <span class="puzzle-theme-tag">🎯 Pin</span>
                <span class="puzzle-theme-tag">🏹 Skewer</span>
                <span class="puzzle-theme-tag">🔍 Discovered Attack</span>
                <span class="puzzle-theme-tag">🛡️ Deflection</span>
                <span class="puzzle-theme-tag">👑 Back-Rank Mate</span>
                <span class="puzzle-theme-tag">✨ Stockfish 16.1 Deep Continuation</span>
              </div>
            </div>
          </div>

          <!-- Right Column: Stats & Rating Card -->
          <div class="puzzles-landing-sidebar">
            <div class="glass-panel" style="padding:24px;border-radius:14px;margin-bottom:16px;">
              <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px;">Your Tactical Rating</div>
              <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:14px;">
                <span style="font-size:36px;font-weight:800;color:#38bdf8;line-height:1;" id="landing-user-elo">${userRating}</span>
                <span style="font-size:14px;font-weight:600;color:var(--text-secondary);">ELO</span>
              </div>
              <div style="padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:13px;color:var(--text-secondary);">Puzzles Solved</span>
                <strong style="color:#fff;font-size:14px;" id="landing-puzzles-solved">${puzzlesSolved}</strong>
              </div>
            </div>

            <!-- ELO Protection & Rules Card -->
            <div class="glass-panel" style="padding:20px;border-radius:14px;margin-bottom:16px;">
              <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px;">Rating Rules</div>
              <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-secondary);line-height:1.7;">
                <li><strong style="color:#22c55e;">+1 ELO</strong> per correct solve without hint.</li>
                <li><strong style="color:#ef4444;">-1 ELO</strong> only if incorrect moves are made or puzzle is abandoned mid-attempt.</li>
                <li><strong style="color:#38bdf8;">0 ELO change</strong> while on this dashboard.</li>
                <li>Free board exploration unlocked upon completion.</li>
              </ul>
            </div>

            <!-- Quick Import Puzzles Button -->
            <button type="button" class="btn btn-outline btn-sm btn-block" id="btn-quick-import-puzzles" style="font-size:12px;padding:8px 12px;">
              ⚡ Bulk Add 1,000 Puzzles / Tier
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindLandingEvents();
    this.updateTierCountsUI();
  },

  bindLandingEvents() {
    // Difficulty card selection
    document.querySelectorAll('.diff-tier-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.diff-tier-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.currentDifficulty = card.dataset.diff;
        const lbl = document.getElementById('selected-diff-label');
        if (lbl) lbl.textContent = this.currentDifficulty;
      });
    });

    // Start Puzzle CTA button (Opt-In Initiation)
    document.getElementById('btn-start-puzzle')?.addEventListener('click', () => {
      this.startActivePuzzle();
    });

    // Quick import button
    document.getElementById('btn-quick-import-puzzles')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-quick-import-puzzles');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Importing from Lichess...';
      }
      try {
        const stats = await Api.get('/puzzles/stats/tiers');
        const currentCount = stats?.easy || 1000;
        const nextTarget = currentCount + 1000;
        await Api.post('/puzzles/bulk-import', { targetPerTier: nextTarget });
        setTimeout(async () => {
          await this.updateTierCountsUI();
          if (btn) {
            btn.disabled = false;
            btn.textContent = '✓ 1,000 Puzzles/Tier Added!';
            setTimeout(() => { if (btn) btn.textContent = '⚡ Bulk Add 1,000 Puzzles / Tier'; }, 3000);
          }
        }, 4000);
      } catch (err) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '⚡ Bulk Add 1,000 Puzzles / Tier';
        }
      }
    });
  },

  startActivePuzzle() {
    this.inActivePuzzle = true;
    if (window.App && typeof window.App.setSidebarCollapsed === 'function') {
      window.App.setSidebarCollapsed(true);
    }
    this.renderBoardView();
    this.loadPuzzle();
  },

  renderBoardView() {
    const main = document.getElementById('main-content');
    const userRating = Auth.currentUser?.elo_rating || 800;

    main.innerHTML = `
      <div class="page">
        <!-- Top Navigation Bar inside Puzzle solver -->
        <div class="puzzles-board-header glass-panel">
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="btn btn-outline btn-sm" id="btn-puzzles-dashboard">
              ◀ Puzzles Dashboard
            </button>
            <span style="font-weight:700;font-size:14px;color:#fff;">Tactical Puzzle</span>
            <span class="badge badge-accent" style="text-transform:capitalize;">${this.currentDifficulty}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="puzzle-reward-badge" class="badge">Reward: +1</span>
          </div>
        </div>

        <div class="puzzle-container">
          <!-- Eval Bar -->
          <div class="eval-bar-container">
            <div class="eval-bar-label" id="puzzle-eval-label">0.0</div>
            <div class="eval-bar">
              <div class="eval-bar-fill" id="puzzle-eval-fill" style="height:50%;"></div>
            </div>
          </div>

          <!-- Board Area -->
          <div class="board-wrapper">
            <div class="board-middle-row" style="display:flex;flex-direction:row;align-items:stretch;justify-content:center;position:relative;">
              <div id="eval-bar" class="eval-bar hidden">
                <div id="eval-fill" class="eval-fill" style="height: 50%;"></div>
                <span id="eval-score" class="eval-score">0.0</span>
              </div>
              <div id="board-container" style="min-width:320px;min-height:320px;display:flex;justify-content:center;align-items:center;"></div>
            </div>
          </div>

          <!-- Puzzle Sidebar -->
          <div class="puzzle-sidebar">
            <div class="puzzle-info glass-panel">
              <div class="puzzle-rating-display" id="puzzle-rating">--</div>
              <div class="text-center text-muted" style="font-size:12px;" id="puzzle-turn-indicator">Your Turn</div>
              <div class="puzzle-theme-tags" id="puzzle-themes"></div>
            </div>

            <div class="puzzle-feedback glass-panel hidden" id="puzzle-feedback"></div>

            <!-- Puzzle Controls Bar -->
            <div class="puzzle-toolbar">
              <button data-action="puzzle-hint" class="btn-blue-sm" id="btn-puzzle-hint">Hint</button>
            </div>

            <!-- Stockfish 5-Move Continuation Idea Panel (When Solved) -->
            <div class="glass-panel hidden puzzle-continuation-panel" id="puzzle-continuation-box">
              <div class="continuation-header">
                <span class="badge badge-accent">STOCKFISH 16.1</span>
                <span class="continuation-title">Post-Puzzle Follow-Up (5 Moves Ahead)</span>
              </div>
              <div id="puzzle-5move-line" class="continuation-line">Analyzing strategic continuation...</div>
              <div class="continuation-subtext">Blue arrow shows the immediate engine follow-up idea (#3b82f6). Free board exploration is unlocked!</div>
            </div>

            <div class="glass-panel difficulty-selector mb-2">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h4 style="margin:0;">Difficulty</h4>
                <span class="badge badge-accent" id="puzzle-pool-badge-sub" style="font-size:11px;">Active</span>
              </div>
              <div class="difficulty-options">
                <button class="diff-btn ${this.currentDifficulty === 'easy' ? 'active' : ''}" data-diff="easy" style="display:flex;justify-content:space-between;align-items:center;">
                  <span>Easy (400 - 999)</span>
                </button>
                <button class="diff-btn ${this.currentDifficulty === 'medium' ? 'active' : ''}" data-diff="medium" style="display:flex;justify-content:space-between;align-items:center;">
                  <span>Medium (1000 - 1399)</span>
                </button>
                <button class="diff-btn ${this.currentDifficulty === 'hard' ? 'active' : ''}" data-diff="hard" style="display:flex;justify-content:space-between;align-items:center;">
                  <span>Hard (1400 - 1899)</span>
                </button>
                <button class="diff-btn ${this.currentDifficulty === 'master' ? 'active' : ''}" data-diff="master" style="display:flex;justify-content:space-between;align-items:center;">
                  <span>Master (1900+)</span>
                </button>
                <button class="diff-btn ${this.currentDifficulty === 'adaptive' ? 'active' : ''}" data-diff="adaptive" style="display:flex;justify-content:space-between;align-items:center;">
                  <span>Adaptive (${userRating} ± 100)</span>
                </button>
              </div>
            </div>

            <div class="glass-panel" style="padding:14px;display:flex;gap:8px;">
              <button data-action="puzzle-hint" class="btn btn-ghost btn-block" id="btn-puzzle-hint-alt">Hint</button>
              <button class="btn btn-primary btn-block" id="btn-next-puzzle">Next Puzzle</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindBoardEvents();
  },

  bindBoardEvents() {
    // Back to Puzzles Dashboard button with safe ELO protection
    document.getElementById('btn-puzzles-dashboard')?.addEventListener('click', () => {
      const isUnfinished = this.inActivePuzzle &&
        Boolean(this.currentPuzzle || window.puzzleController?.puzzle) &&
        !this.isFinished &&
        !window.puzzleController?.isCompleted;

      if (isUnfinished) {
        const ok = confirm('You are currently solving a puzzle. Leaving now will forfeit the puzzle and you will lose ELO.\n\nAre you sure you want to return to the dashboard?');
        if (!ok) return;

        // Forfeit puzzle
        if (this.currentPuzzle) {
          const puzzleId = this.currentPuzzle.id || this.currentPuzzle.puzzle_id;
          if (Auth.currentUser && Api && puzzleId) {
            Api.post(`/puzzles/${puzzleId}/attempt`, {
              solved: false,
              reward: -1,
              penalty_count: 99
            }).then(res => {
              if (res && res.new_elo !== undefined) {
                Auth.currentUser.elo_rating = res.new_elo;
                Auth.updateUI();
              }
            }).catch(() => {});
          }
        }
      }

      this.inActivePuzzle = false;
      this.isFinished = true;
      if (window.puzzleController) window.puzzleController.isCompleted = true;
      if (window.puzzleState) window.puzzleState.isFinished = true;
      this.renderLandingView();
    });

    const diffBtns = document.querySelectorAll('.diff-btn');
    diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        diffBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentDifficulty = btn.dataset.diff;
        this.loadPuzzle();
      });
    });

    document.getElementById('btn-next-puzzle')?.addEventListener('click', () => {
      this.loadPuzzle();
    });

    document.getElementById('btn-puzzle-hint')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.revealHint();
    });

    document.getElementById('btn-puzzle-hint-alt')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.revealHint();
    });
  },

  async updateTierCountsUI() {
    try {
      const stats = await Api.get('/puzzles/stats/tiers');
      if (stats) {
        if (stats.easy && document.getElementById('count-easy')) document.getElementById('count-easy').textContent = Number(stats.easy).toLocaleString();
        if (stats.medium && document.getElementById('count-medium')) document.getElementById('count-medium').textContent = Number(stats.medium).toLocaleString();
        if (stats.hard && document.getElementById('count-hard')) document.getElementById('count-hard').textContent = Number(stats.hard).toLocaleString();
        if (stats.master && document.getElementById('count-master')) document.getElementById('count-master').textContent = Number(stats.master).toLocaleString();
        if (stats.total && document.getElementById('puzzle-pool-badge')) document.getElementById('puzzle-pool-badge').textContent = `${Number(stats.total).toLocaleString()} Active`;
      }
    } catch (e) {}
  },

  async loadPuzzle(seed = Date.now()) {
    const feedback = document.getElementById('puzzle-feedback');
    if (feedback) feedback.classList.add('hidden');

    const contBox = document.getElementById('puzzle-continuation-box');
    if (contBox) contBox.classList.add('hidden');

    if (typeof resetBoardVisualState === 'function') {
      resetBoardVisualState();
    }

    this.isFinished = false;
    if (window.puzzleController) {
      window.puzzleController.isCompleted = false;
    }
    if (window.puzzleState) {
      window.puzzleState.isFinished = false;
    }

    // 1. Try loading a live puzzle from the server's 4,000+ puzzle database
    try {
      const data = await Api.get(`/puzzles/random?difficulty=${this.currentDifficulty}&multi_move=true`);
      if (data && data.puzzle_id) {
        let movesArr = [];
        if (data.moves) {
          movesArr = typeof data.moves === 'string' ? data.moves.trim().split(/\s+/) : data.moves;
        } else {
          const sol = await Api.get(`/puzzles/${data.puzzle_id}/solution`);
          if (sol && sol.moves) {
            movesArr = typeof sol.moves === 'string' ? sol.moves.trim().split(/\s+/) : sol.moves;
          }
        }

        if (movesArr.length >= 2) {
          const puzzleObj = {
            id: data.puzzle_id,
            puzzle_id: data.puzzle_id,
            fen: data.fen,
            moves: movesArr,
            rating: data.rating,
            themes: data.themes
          };
          if (typeof startSeededMultiMovePuzzle === 'function') {
            startSeededMultiMovePuzzle([puzzleObj], seed);
            this.currentPuzzle = puzzleObj;
            return;
          } else if (typeof loadSeededPuzzle === 'function') {
            loadSeededPuzzle([puzzleObj], seed);
            this.currentPuzzle = puzzleObj;
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[Puzzles] Server fetch failed, falling back to local pool:', err);
    }

    // 2. Fallback to client-bundled verified puzzles
    const allVerified = (window.VERIFIED_MULTI_MOVE_PUZZLES && window.VERIFIED_MULTI_MOVE_PUZZLES.length > 0)
      ? window.VERIFIED_MULTI_MOVE_PUZZLES
      : ((window.VERIFIED_PUZZLES && window.VERIFIED_PUZZLES.length > 0) ? window.VERIFIED_PUZZLES : []);

    let pool = allVerified;
    if (this.currentDifficulty === 'easy') pool = allVerified.filter(p => p.rating < 1000);
    else if (this.currentDifficulty === 'medium') pool = allVerified.filter(p => p.rating >= 1000 && p.rating < 1400);
    else if (this.currentDifficulty === 'hard') pool = allVerified.filter(p => p.rating >= 1400 && p.rating < 1900);
    else if (this.currentDifficulty === 'master') pool = allVerified.filter(p => p.rating >= 1900);
    else if (this.currentDifficulty === 'adaptive') {
      const userRating = (window.Auth && window.Auth.currentUser?.elo_rating) || 800;
      pool = allVerified.filter(p => p.rating >= userRating - 150 && p.rating <= userRating + 150);
      if (pool.length === 0) pool = allVerified;
    }

    if (pool.length === 0) pool = allVerified;

    if (typeof startSeededMultiMovePuzzle === 'function' && pool.length > 0) {
      startSeededMultiMovePuzzle(pool, seed);
      this.currentPuzzle = window.puzzleController?.puzzle;
      return;
    }

    if (typeof loadSeededPuzzle === 'function' && pool.length > 0) {
      loadSeededPuzzle(pool, seed);
      this.currentPuzzle = window.puzzleState?.currentPuzzle;
      return;
    }
  },

  playOpponentMove(uciMove) {
    if (!uciMove) return;
    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);

    // Update board state with opponent's move
    const board = ChessBoard.parseFEN(ChessBoard.fen);
    const piece = ChessBoard.getPieceAt(from);

    // Apply move onto FEN
    const targetFile = AppConfig.FILES.indexOf(to[0]);
    const targetRank = parseInt(to[1]) - 1;
    const sourceFile = AppConfig.FILES.indexOf(from[0]);
    const sourceRank = parseInt(from[1]) - 1;

    board[sourceRank][sourceFile] = null;
    board[targetRank][targetFile] = piece;

    // Build new FEN
    let newPos = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (!p) empty++;
        else {
          if (empty > 0) { newPos += empty; empty = 0; }
          newPos += p;
        }
      }
      if (empty > 0) newPos += empty;
      if (r > 0) newPos += '/';
    }

    const nextTurn = ChessBoard.getTurn() === 'w' ? 'b' : 'w';
    const newFen = `${newPos} ${nextTurn} - - 0 1`;

    ChessBoard.update(newFen, {
      lastMove: { from, to }
    });

    PlayPage.playSound('move');
  },

  async handleUserMove(move) {
    if (this.isFinished) return;

    const playedUci = move.from + move.to + (move.promotion || '');
    const expectedUci = this.solutionMoves[this.currentMoveIndex];

    if (playedUci === expectedUci) {
      // Move is correct!
      this.playOpponentMove(playedUci);
      this.currentMoveIndex++;

      // Check if more opponent moves remain in solution
      if (this.currentMoveIndex < this.solutionMoves.length) {
        // Opponent plays next move
        ChessBoard.interactive = false;
        setTimeout(() => {
          this.playOpponentMove(this.solutionMoves[this.currentMoveIndex]);
          this.currentMoveIndex++;
          ChessBoard.interactive = true;
          ChessBoard.bindEvents();
        }, 500);
      } else {
        // Puzzle solved completely!
        this.isFinished = true;
        this.handlePuzzleSolved();
      }
    } else {
      // Incorrect move
      this.handlePuzzleIncorrect();
    }
  },

  async handlePuzzleSolved() {
    PlayPage.playSound('game_over');
    const feedback = document.getElementById('puzzle-feedback');
    feedback.className = 'puzzle-feedback glass-panel correct';
    feedback.classList.remove('hidden');
    feedback.textContent = '✓ Correct! Puzzle Solved';

    if (Auth.currentUser) {
      try {
        const res = await Api.post(`/puzzles/${this.currentPuzzle.puzzle_id}/attempt`, {
          solved: true,
          used_solution: this.usedSolution
        });

        if (res && res.elo_change > 0) {
          feedback.textContent = `✓ Correct! Solved (+${res.elo_change} ELO)`;
          Auth.currentUser.elo_rating = res.new_elo;
          Auth.currentUser.puzzles_solved = res.puzzles_solved;
          Auth.updateUI();
        }
      } catch (err) {
        console.error('[Puzzles] Attempt submission error:', err);
      }
    }
  },

  async handlePuzzleIncorrect() {
    PlayPage.playSound('check');
    const feedback = document.getElementById('puzzle-feedback');
    feedback.className = 'puzzle-feedback glass-panel incorrect';
    feedback.classList.remove('hidden');
    feedback.textContent = '✗ Incorrect move. Try another line!';

    // Snap back piece so it does not stay displaced on the wrong square
    ChessBoard.selectedSquare = null;
    ChessBoard.legalMoves = [];
    ChessBoard.render();
    ChessBoard.bindEvents();

    if (Auth.currentUser) {
      try {
        await Api.post(`/puzzles/${this.currentPuzzle.puzzle_id}/attempt`, {
          solved: false,
          used_solution: this.usedSolution
        });
      } catch (e) {
        // ignore
      }
    }
  },

  revealHint() {
    this.usedSolution = true;
    if (typeof triggerPuzzleHint === 'function') {
      triggerPuzzleHint();
      return;
    }
    if (typeof requestPuzzleHint === 'function') {
      requestPuzzleHint();
      return;
    }
    const nextMove = this.solutionMoves?.[this.currentMoveIndex];
    if (nextMove) {
      const from = nextMove.substring(0, 2);
      const to = nextMove.substring(2, 4);
      if (typeof drawMoveArrowFixed === 'function') {
        drawMoveArrowFixed(from, to, '#3b82f6', true);
      }
      document.querySelector(`[data-square="${from}"]`)?.classList.add('highlight-analysis');

      const feedback = document.getElementById('puzzle-feedback');
      if (feedback) {
        feedback.className = 'puzzle-feedback glass-panel';
        feedback.classList.remove('hidden');
        feedback.textContent = `💡 Hint: Move from ${from.toUpperCase()} to ${to.toUpperCase()}`;
      }
    }
  }
};

window.PuzzlesPage = PuzzlesPage;
