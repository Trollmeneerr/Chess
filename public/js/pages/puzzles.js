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

  render() {
    const main = document.getElementById('main-content');
    const userRating = Auth.currentUser?.elo_rating || 800;

    main.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1 class="page-title">Tactical Puzzles</h1>
          <p class="page-subtitle">Sharpen your calculation skills and earn +1 ELO for every puzzle solved</p>
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
              <span id="puzzle-reward-badge" class="badge">Reward: +1</span>
              <button data-action="puzzle-hint" class="btn-blue-sm" id="btn-puzzle-hint">Hint</button>
            </div>

            <div class="glass-panel difficulty-selector mb-2">
              <h4>Difficulty</h4>
              <div class="difficulty-options">
                <button class="diff-btn" data-diff="easy">Easy (400 - 900)</button>
                <button class="diff-btn active" data-diff="medium">Medium (900 - 1400)</button>
                <button class="diff-btn" data-diff="hard">Hard (1400 - 1900)</button>
                <button class="diff-btn" data-diff="master">Master (1900+)</button>
                <button class="diff-btn" data-diff="adaptive">Adaptive (${userRating} ± 100)</button>
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

    this.bindEvents();
    this.loadPuzzle();
  },

  bindEvents() {
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

  async loadPuzzle(seed = Date.now()) {
    const feedback = document.getElementById('puzzle-feedback');
    if (feedback) feedback.classList.add('hidden');

    if (typeof resetBoardVisualState === 'function') {
      resetBoardVisualState();
    }

    this.isFinished = false;
    if (window.puzzleState) {
      window.puzzleState.isFinished = false;
    }

    // Filter verified puzzles by difficulty bracket if possible
    const allVerified = (window.VERIFIED_PUZZLES && window.VERIFIED_PUZZLES.length > 0)
      ? window.VERIFIED_PUZZLES
      : [];
    
    let pool = allVerified;
    if (this.currentDifficulty === 'easy') pool = allVerified.filter(p => p.rating < 900);
    else if (this.currentDifficulty === 'medium') pool = allVerified.filter(p => p.rating >= 900 && p.rating < 1400);
    else if (this.currentDifficulty === 'hard') pool = allVerified.filter(p => p.rating >= 1400 && p.rating < 1900);
    else if (this.currentDifficulty === 'master') pool = allVerified.filter(p => p.rating >= 1900);

    if (pool.length === 0) pool = allVerified;

    if (typeof loadSeededPuzzle === 'function' && pool.length > 0) {
      loadSeededPuzzle(pool, seed);
      this.currentPuzzle = window.puzzleState?.currentPuzzle;
      if (this.currentPuzzle) {
        const ratingEl = document.getElementById('puzzle-rating');
        if (ratingEl) ratingEl.textContent = `${this.currentPuzzle.rating} Rating`;
        const themeContainer = document.getElementById('puzzle-themes');
        if (themeContainer) {
          const tags = (this.currentPuzzle.themes || 'tactics').split(' ').map(t => `<span class="puzzle-theme-tag">${t}</span>`).join('');
          themeContainer.innerHTML = tags;
        }
      }
      return;
    }

    try {
      const data = await Api.get(`/puzzles/random?difficulty=${this.currentDifficulty}`);
      if (!data || !data.puzzle_id) {
        alert('No puzzles found in this difficulty bracket.');
        return;
      }
      const sol = await Api.get(`/puzzles/${data.puzzle_id}/solution`);
      const movesArr = sol.moves.split(' ');
      const puzzleObj = {
        id: data.puzzle_id,
        fen: data.fen,
        moves: movesArr,
        rating: data.rating,
        themes: data.themes
      };
      if (typeof loadSeededPuzzle === 'function') {
        loadSeededPuzzle([puzzleObj], seed);
        this.currentPuzzle = window.puzzleState?.currentPuzzle;
        if (this.currentPuzzle) {
          const ratingEl = document.getElementById('puzzle-rating');
          if (ratingEl) ratingEl.textContent = `${this.currentPuzzle.rating} Rating`;
          const themeContainer = document.getElementById('puzzle-themes');
          if (themeContainer) {
            const tags = (this.currentPuzzle.themes || 'tactics').split(' ').map(t => `<span class="puzzle-theme-tag">${t}</span>`).join('');
            themeContainer.innerHTML = tags;
          }
        }
      }
    } catch (err) {
      console.error('[Puzzles] Error loading puzzle:', err);
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
