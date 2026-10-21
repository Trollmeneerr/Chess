/**
 * Analysis Page — Post-Game Review with Stockfish 16.1 Depth 8,
 * Interactive Match Selector, Database Storage & Caching for Nodes
 */
const AnalysisPage = {
  currentAnalysis: null,
  currentMoveIndex: -1,
  fens: [],
  pgn: '',
  currentGame: null,
  myMatches: [],
  storedDbGames: [],
  activeTab: 'my-matches',
  currentFilter: 'all',
  searchQuery: '',
  isExploring: false,
  explorationBasePly: 0,
  explorationHistory: [],

  async render(params = {}) {
    const main = document.getElementById('main-content');
    this.pgn = params.pgn || '';
    const inviteCode = params.inviteCode || null;

    if (this.pgn || inviteCode) {
      // Direct review requested (e.g., from Profile or Play page)
      this.startAnalysis(this.pgn, inviteCode);
      return;
    }

    // Default: Show the Game Review Match Selector
    await this.renderSelectorView();
  },

  /**
   * Render Match Selector View
   */
  async renderSelectorView() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page review-selector-wrap">
        <div class="page-header" style="text-align:left;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
          <div>
            <h1 class="page-title">Game Review & Analysis</h1>
            <p class="page-subtitle">Select a match to evaluate with Stockfish 16.1 depth 8 and store in the database for nodes</p>
          </div>
          <div style="display:flex;gap:8px;">
            <span class="badge badge-success"><span class="pulse-dot"></span> Stockfish 16.1 Active</span>
            <span class="badge badge-accent">⚡ DB Node Sync</span>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="review-nav-tabs">
          <button class="review-nav-tab ${this.activeTab === 'my-matches' ? 'active' : ''}" data-tab="my-matches">
            <span>🎮 My Match History</span>
          </button>
          <button class="review-nav-tab ${this.activeTab === 'db-stored' ? 'active' : ''}" data-tab="db-stored">
            <span>⚡ Stored in DB (For Nodes)</span>
          </button>
          <button class="review-nav-tab ${this.activeTab === 'custom-pgn' ? 'active' : ''}" data-tab="custom-pgn">
            <span>📋 Import / Custom PGN</span>
          </button>
        </div>

        <!-- Tab Content Area -->
        <div id="review-tab-content">
          <div class="glass-panel text-center" style="padding:40px;">
            <div class="spinner"></div>
            <div class="loading-text mt-2">Loading match history from database...</div>
          </div>
        </div>
      </div>
    `;

    // Bind tab clicks
    main.querySelectorAll('.review-nav-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        main.querySelectorAll('.review-nav-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.dataset.tab;
        this.renderTabContent();
      });
    });

    await this.fetchDataAndRender();
  },

  async fetchDataAndRender() {
    try {
      // 1. Fetch user matches if logged in
      if (Auth.currentUser) {
        const histData = await Api.get('/games/history/me');
        this.myMatches = histData.games || [];
      } else {
        this.myMatches = [];
      }

      // 2. Fetch stored database reviews (accessible to all nodes / users)
      try {
        const storedData = await Api.get('/analysis/stored');
        this.storedDbGames = storedData.games || [];
      } catch (e) {
        this.storedDbGames = [];
      }
    } catch (err) {
      console.warn('[Analysis] Error fetching matches:', err);
    }

    this.renderTabContent();
  },

  renderTabContent() {
    const container = document.getElementById('review-tab-content');
    if (!container) return;

    if (this.activeTab === 'my-matches') {
      this.renderMyMatchesTab(container);
    } else if (this.activeTab === 'db-stored') {
      this.renderDbStoredTab(container);
    } else {
      this.renderCustomPgnTab(container);
    }
  },

  /**
   * Tab 1: My Matches
   */
  renderMyMatchesTab(container) {
    if (!Auth.currentUser) {
      container.innerHTML = `
        <div class="glass-panel text-center" style="padding:48px;max-width:560px;margin:20px auto;">
          <div style="font-size:42px;margin-bottom:12px;">👤</div>
          <h2>Sign In to Review Your Games</h2>
          <p class="text-secondary mt-1">Log in to view all your recent PvP and AI Bot matches, or use the tabs above to import a PGN or browse database records.</p>
          <div class="mt-3" style="display:flex;gap:10px;justify-content:center;">
            <button class="btn btn-primary" data-action="show-login">Sign In</button>
            <button class="btn btn-outline" data-action="switch-tab" data-tab="custom-pgn">Paste Custom PGN</button>
          </div>
        </div>
      `;
      return;
    }

    if (!this.myMatches || this.myMatches.length === 0) {
      container.innerHTML = `
        <div class="glass-panel text-center" style="padding:48px;">
          <div style="width:48px;height:48px;margin:0 auto 12px;opacity:0.6;">${AppConfig.getPiece('P')}</div>
          <h3>No Finished Games Yet</h3>
          <p class="text-secondary mt-1">Play a match against AI Bots or a friend to record and review games here.</p>
          <div class="mt-3" style="display:flex;gap:10px;justify-content:center;">
            <button class="btn btn-primary" data-action="play-bots">Play AI Bots</button>
            <button class="btn btn-outline" data-action="play-online">Play Online</button>
          </div>
        </div>
      `;
      return;
    }

    // Filter matches
    let filtered = this.myMatches;
    if (this.currentFilter === 'pvp') filtered = filtered.filter(g => g.game_type === 'pvp');
    else if (this.currentFilter === 'bot') filtered = filtered.filter(g => g.game_type === 'bot');
    else if (this.currentFilter === 'cached') filtered = filtered.filter(g => g.has_analysis);
    else if (this.currentFilter === 'needs-review') filtered = filtered.filter(g => !g.has_analysis);

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(g =>
        (g.opponent_name && g.opponent_name.toLowerCase().includes(q)) ||
        (g.invite_code && g.invite_code.toLowerCase().includes(q)) ||
        (g.time_control && g.time_control.toLowerCase().includes(q))
      );
    }

    const cachedCount = this.myMatches.filter(g => g.has_analysis).length;

    container.innerHTML = `
      <!-- Toolbar: Filters & Search -->
      <div class="review-toolbar">
        <div class="history-filter-pills">
          <button class="pill-btn ${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all">All (${this.myMatches.length})</button>
          <button class="pill-btn ${this.currentFilter === 'cached' ? 'active' : ''}" data-filter="cached">⚡ Stored in DB (${cachedCount})</button>
          <button class="pill-btn ${this.currentFilter === 'needs-review' ? 'active' : ''}" data-filter="needs-review">🔍 Needs Review (${this.myMatches.length - cachedCount})</button>
          <button class="pill-btn ${this.currentFilter === 'pvp' ? 'active' : ''}" data-filter="pvp">PvP</button>
          <button class="pill-btn ${this.currentFilter === 'bot' ? 'active' : ''}" data-filter="bot">Bots</button>
        </div>

        <div class="review-search-box">
          <span class="review-search-icon">🔍</span>
          <input type="text" class="review-search-input" id="review-search-input" placeholder="Search opponent or invite code..." value="${this.escapeHtml(this.searchQuery)}">
        </div>
      </div>

      <!-- Match Cards Grid -->
      <div class="review-match-grid">
        ${this.renderMatchCards(filtered)}
      </div>
    `;

    // Bind Filter pills
    container.querySelectorAll('.pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentFilter = btn.dataset.filter;
        this.renderTabContent();
      });
    });

    // Bind Search Input
    const searchInput = document.getElementById('review-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim();
        this.renderTabContent();
      });
    }

    // Bind Match Card Actions
    this.bindCardClicks(container);
  },

  /**
   * Tab 2: Database Stored Reviews (Shared across cluster/nodes)
   */
  renderDbStoredTab(container) {
    if (!this.storedDbGames || this.storedDbGames.length === 0) {
      container.innerHTML = `
        <div class="glass-panel text-center" style="padding:48px;">
          <div style="font-size:36px;margin-bottom:8px;">💾</div>
          <h3>No Analyzed Games Stored in Database</h3>
          <p class="text-secondary mt-1">Select a game from your history or import a PGN to analyze and store it in the database for nodes.</p>
          <button class="btn btn-primary mt-2" data-action="switch-tab" data-tab="my-matches">Choose a Match to Review</button>
        </div>
      `;
      return;
    }

    let rowsHtml = '';
    this.storedDbGames.forEach(g => {
      const whiteAcc = g.white_accuracy ? `${g.white_accuracy}%` : '-';
      const blackAcc = g.black_accuracy ? `${g.black_accuracy}%` : '-';
      const timeAgo = this.formatTimeAgo(g.created_at);

      rowsHtml += `
        <div class="review-match-card is-cached" data-code="${g.invite_code}">
          <div class="review-card-top">
            <div>
              <div class="review-card-name">
                <span>${this.escapeHtml(g.white_name)} vs ${this.escapeHtml(g.black_name)}</span>
              </div>
              <div class="review-card-meta">
                <span>Code: <strong style="color:var(--cyan);">${g.invite_code}</strong></span> • 
                <span>${g.game_type?.toUpperCase()}</span> • 
                <span>${timeAgo}</span>
              </div>
            </div>
            <span class="review-db-badge ready">⚡ Ready in DB</span>
          </div>

          <div class="review-card-stats">
            <div>
              <span style="color:var(--text-secondary);font-size:11px;">White Acc:</span>
              <strong style="color:var(--cyan);margin-left:4px;">${whiteAcc}</strong>
            </div>
            <div>
              <span style="color:var(--text-secondary);font-size:11px;">Black Acc:</span>
              <strong style="color:var(--cyan);margin-left:4px;">${blackAcc}</strong>
            </div>
            <div>
              <span style="color:var(--text-secondary);font-size:11px;">Result:</span>
              <strong style="margin-left:4px;">${g.result || '*'}</strong>
            </div>
          </div>

          <div class="review-card-bottom">
            <span style="font-size:11px;color:var(--text-muted);">${g.moves || '?'} moves recorded</span>
            <button class="btn btn-fill btn-sm btn-load-stored" data-code="${g.invite_code}">
              ⚡ Load Review (Instant)
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="glass-panel mb-3" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div style="font-size:13px;color:var(--text-secondary);">
          Showing <strong style="color:var(--cyan);">${this.storedDbGames.length}</strong> games stored in the database with cached Stockfish evaluations. These records are permanently persisted and accessible by all cluster nodes.
        </div>
        <button class="btn btn-outline btn-sm" id="btn-refresh-db-list">🔄 Refresh Database List</button>
      </div>

      <div class="review-match-grid">
        ${rowsHtml}
      </div>
    `;

    container.querySelector('#btn-refresh-db-list')?.addEventListener('click', () => {
      this.fetchDataAndRender();
    });

    container.querySelectorAll('.btn-load-stored').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = btn.dataset.code;
        if (code) this.startAnalysis(null, code, false);
      });
    });

    container.querySelectorAll('.review-match-card').forEach(card => {
      card.addEventListener('click', () => {
        const code = card.dataset.code;
        if (code) this.startAnalysis(null, code, false);
      });
    });
  },

  /**
   * Tab 3: Custom PGN or Invite Code Input
   */
  renderCustomPgnTab(container) {
    container.innerHTML = `
      <div class="glass-panel play-setup" style="max-width:680px;margin:0 auto;padding:28px;">
        <h2 style="font-size:20px;margin-bottom:6px;">Import & Save Match to Database</h2>
        <p class="text-secondary" style="font-size:13px;margin-bottom:20px;">
          Paste game notation or enter an existing match code. The game will be evaluated with Stockfish 16.1 depth 8 and stored in the database for later use with nodes.
        </p>

        <div class="form-group mb-3">
          <label class="form-label">Search / Load by Match Invite Code</label>
          <div style="display:flex;gap:8px;">
            <input type="text" class="form-input" id="custom-invite-input" placeholder="e.g. inv_3a4b5c or rev_123456">
            <button class="btn btn-outline" id="btn-load-by-code">Load from DB</button>
          </div>
        </div>

        <div style="text-align:center;margin:16px 0;position:relative;">
          <hr style="border-color:var(--glass-border);margin:0;">
          <span style="position:relative;top:-10px;background:rgba(15,23,42,0.95);padding:0 12px;font-size:11px;color:var(--text-muted);text-transform:uppercase;">or paste PGN</span>
        </div>

        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label class="form-label" style="margin:0;">Game PGN Notation</label>
            <button type="button" class="btn btn-ghost btn-xs" id="btn-load-sample-pgn" style="font-size:11px;color:var(--cyan);">
              ⚡ Paste Sample Match
            </button>
          </div>
          <textarea class="form-input" id="pgn-input" rows="7" placeholder="1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 ..."></textarea>
        </div>

        <button class="btn btn-primary btn-block btn-lg mt-3" id="btn-start-analysis">
          🚀 Run Game Review & Save to Database
        </button>
      </div>
    `;

    document.getElementById('btn-load-by-code')?.addEventListener('click', () => {
      const code = document.getElementById('custom-invite-input')?.value.trim();
      if (code) {
        this.startAnalysis(null, code, false);
      } else {
        alert('Please enter a match invite code.');
      }
    });

    document.getElementById('btn-load-sample-pgn')?.addEventListener('click', () => {
      const pgnEl = document.getElementById('pgn-input');
      if (pgnEl) {
        pgnEl.value = '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. Qd2 Nbd7 9. f3 b5 10. O-O-O Be7';
      }
    });

    document.getElementById('btn-start-analysis')?.addEventListener('click', () => {
      const val = document.getElementById('pgn-input').value.trim();
      if (val) {
        this.startAnalysis(val, null, false);
      } else {
        alert('Please enter or paste a valid PGN string.');
      }
    });
  },

  renderMatchCards(games) {
    if (!games || games.length === 0) {
      return `
        <div class="text-center text-muted" style="grid-column:1/-1;padding:36px;">
          <div style="font-size:32px;margin-bottom:8px;">🔍</div>
          <div>No matches match your current filter or search query.</div>
        </div>
      `;
    }

    return games.map(g => {
      const isWin = g.outcome === 'win';
      const isLoss = g.outcome === 'loss';
      const resultClass = isWin ? 'outcome-win' : (isLoss ? 'outcome-loss' : '');
      const resultText = isWin ? 'WIN' : (isLoss ? 'LOSS' : 'DRAW');

      const oppAvatar = `<div style="width:100%;height:100%;">${AppConfig.getAvatarHTML(g.opponent_avatar || 7)}</div>`;
      const pieceSvg = `<span style="display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:2px;">${AppConfig.getPiece(g.user_color === 'white' ? 'K' : 'k')}</span>`;
      const userColorLabel = `${pieceSvg} ${g.user_color === 'white' ? 'White' : 'Black'}`;
      const timeAgo = this.formatTimeAgo(g.created_at);
      const tcLabel = this.formatTimeControl(g.time_control);

      const isCached = Boolean(g.has_analysis);

      return `
        <div class="review-match-card ${isCached ? 'is-cached' : ''}" data-code="${g.invite_code}">
          <div class="review-card-top">
            <div class="review-card-opp">
              <div class="review-card-avatar">${oppAvatar}</div>
              <div>
                <div class="review-card-name">
                  <span>${this.escapeHtml(g.opponent_name)}</span>
                  <span class="outcome-pill ${resultClass}">${resultText}</span>
                </div>
                <div class="review-card-meta">
                  <span>${g.opponent_elo ? g.opponent_elo + ' ELO' : (g.game_type === 'bot' ? 'AI Bot' : 'Player')}</span> • 
                  <span>${userColorLabel}</span>
                </div>
              </div>
            </div>
            
            <div class="review-card-badges">
              ${isCached
                ? `<span class="review-db-badge ready" title="Saved in database and ready for instant playback">⚡ Stored in DB</span>`
                : `<span class="badge badge-outline" style="font-size:11px;" title="Engine analysis not yet stored">🔍 Needs Review</span>`
              }
            </div>
          </div>

          <div class="review-card-stats">
            <div>
              <span style="color:var(--text-secondary);font-size:11px;">Format:</span>
              <strong style="margin-left:4px;">${tcLabel}</strong>
            </div>
            <div>
              <span style="color:var(--text-secondary);font-size:11px;">Moves:</span>
              <strong style="margin-left:4px;">${g.move_count || '?'}</strong>
            </div>
            <div>
              <span style="color:var(--text-secondary);font-size:11px;">Date:</span>
              <span style="margin-left:4px;color:var(--text-secondary);">${timeAgo}</span>
            </div>
          </div>

          <div class="review-card-bottom">
            <span style="font-size:11px;color:var(--cyan);font-family:monospace;">${g.invite_code}</span>
            <div style="display:flex;gap:6px;">
              ${isCached
                ? `
                  <button class="btn btn-fill btn-sm btn-action-review" data-code="${g.invite_code}" data-force="false" title="Instant review from database">
                    ⚡ View Review
                  </button>
                  <button class="btn btn-outline btn-sm btn-action-review" data-code="${g.invite_code}" data-force="true" title="Re-evaluate with Stockfish">
                    🔄
                  </button>
                `
                : `
                  <button class="btn btn-primary btn-sm btn-action-review" data-code="${g.invite_code}" data-force="false">
                    🚀 Run Review & Save
                  </button>
                `
              }
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  bindCardClicks(container) {
    container.querySelectorAll('.btn-action-review').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = btn.dataset.code;
        const force = btn.dataset.force === 'true';
        const match = this.myMatches.find(m => m.invite_code === code);
        this.startAnalysis(match ? match.pgn : null, code, force, match);
      });
    });

    container.querySelectorAll('.review-match-card').forEach(card => {
      card.addEventListener('click', () => {
        const code = card.dataset.code;
        const match = this.myMatches.find(m => m.invite_code === code);
        this.startAnalysis(match ? match.pgn : null, code, false, match);
      });
    });
  },

  switchTab(tabName) {
    this.activeTab = tabName;
    const tabBtn = document.querySelector(`.review-nav-tab[data-tab="${tabName}"]`);
    if (tabBtn) {
      document.querySelectorAll('.review-nav-tab').forEach(b => b.classList.remove('active'));
      tabBtn.classList.add('active');
    }
    this.renderTabContent();
  },

  /**
   * Start or Load Analysis (cached from DB or run Stockfish)
   */
  async startAnalysis(pgnString, inviteCode = null, force = false, matchMeta = null) {
    const main = document.getElementById('main-content');
    this.pgn = pgnString ? decodeURIComponent(pgnString) : '';
    this.currentGame = matchMeta || { invite_code: inviteCode };

    main.innerHTML = `
      <div class="page">
        <div class="glass-panel text-center" style="padding:48px;" id="analysis-loading">
          <div class="spinner"></div>
          <div class="loading-text mt-2" id="analysis-loading-text">
            ${force ? 'Re-evaluating every move with Stockfish 16.1 at Depth 8...' : 'Connecting to database and evaluating moves...'}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:8px;">
            Checking stored reviews in database for nodes...
          </div>
        </div>

        <div id="analysis-workspace" class="hidden"></div>
      </div>
    `;

    try {
      const payload = {
        pgn: this.pgn || undefined,
        invite_code: inviteCode || undefined,
        force: Boolean(force)
      };

      const result = await Api.post('/analysis/game', payload);
      this.currentAnalysis = result;
      this.currentGame = {
        ...this.currentGame,
        invite_code: result.invite_code || inviteCode,
        cached: result.cached,
        saved_to_database: result.saved_to_database
      };

      this.renderAnalysisView(result);
    } catch (err) {
      document.getElementById('analysis-loading').innerHTML = `
        <div class="text-danger" style="font-size:18px;font-weight:700;">Review Failed</div>
        <div class="text-muted mt-2">${this.escapeHtml(err.message || 'Error processing game review with engine.')}</div>
        <div class="mt-3" style="display:flex;gap:10px;justify-content:center;">
          <button class="btn btn-primary" id="btn-err-selector">Back to Match Selector</button>
          <button class="btn btn-outline" id="btn-err-retry">Retry with Engine</button>
        </div>
      `;
      document.getElementById('btn-err-selector')?.addEventListener('click', () => {
        this.renderSelectorView();
      });
      document.getElementById('btn-err-retry')?.addEventListener('click', () => {
        this.startAnalysis(this.pgn, inviteCode, true);
      });
    }
  },

  /**
   * Render Active Game Review View
   */
  renderAnalysisView(data) {
    document.getElementById('analysis-loading')?.classList.add('hidden');
    const workspace = document.getElementById('analysis-workspace');
    workspace.classList.remove('hidden');

    const whiteAcc = data.whiteAccuracy || 50;
    const blackAcc = data.blackAccuracy || 50;
    const moves = data.moves || [];
    const inviteCode = this.currentGame?.invite_code || data.invite_code || 'N/A';
    const isCached = Boolean(data.cached);

    // Pre-calculate FEN for each move step: fens[0] = initial board, fens[plyIndex] = board AFTER moves[plyIndex - 1]
    const chess = (typeof window.Chess === 'function') ? new window.Chess() : null;
    this.fens = [AppConfig.INITIAL_FEN];
    this.evaluations = [{ cp: 0, mate: null }];
    this.moves = moves;

    moves.forEach((m, idx) => {
      const from = m.from || m.uci?.substring(0, 2);
      const to = m.to || m.uci?.substring(2, 4);
      const promotion = m.uci?.length > 4 ? m.uci[4] : undefined;
      m.from = from;
      m.to = to;
      if (!m.bestAlternativeUci && m.bestMove) m.bestAlternativeUci = m.bestMove;

      let postFen = m.fen;
      if (chess) {
        try {
          if (m.san) {
            chess.move(m.san);
          } else {
            chess.move({ from, to, promotion });
          }
          postFen = chess.fen();
        } catch (e) {}
      }
      this.fens.push(postFen);

      const cpVal = m.evalCp !== undefined
        ? m.evalCp
        : (m.eval !== undefined ? Math.round(m.eval * 100) : 0);
      this.evaluations.push({ cp: cpVal, mate: m.mate || null });
    });

    workspace.innerHTML = `
      <!-- Top Action & DB Status Header Bar -->
      <div class="review-header-bar glass-panel">
        <div class="review-header-meta">
          <button class="btn btn-outline btn-sm" id="btn-back-to-selector">
            ◀ Select Match
          </button>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;font-weight:700;">Match Review</span>
            <span class="badge badge-accent">${inviteCode}</span>
          </div>
          ${isCached
            ? `<span class="review-db-badge ready"><span class="pulse-dot"></span> ⚡ Loaded from Database Cache</span>`
            : `<span class="review-db-badge"><span class="pulse-dot"></span> 💾 Stored in Database for Nodes</span>`
          }
        </div>

        <div class="review-header-actions">
          <button class="btn btn-outline btn-sm" id="btn-copy-moves" title="Copy standard chess notation / PGN">
            📋 Copy Moves
          </button>
          <button class="btn btn-ghost btn-sm" id="btn-copy-code" title="Copy match invite code">
            📋 Copy Code
          </button>
          <button class="btn btn-outline btn-sm" id="btn-force-reanalyze" title="Force Stockfish 16.1 re-evaluation">
            🔄 Re-analyze
          </button>
        </div>
      </div>

      <div class="analysis-layout">
        <!-- Board Wrapper with Left-Hand Eval Bar -->
        <div class="board-wrapper">
          <div class="board-middle-row" style="display:flex;flex-direction:row;align-items:stretch;justify-content:center;position:relative;">
            <div id="eval-bar" class="eval-bar">
              <div id="eval-fill" class="eval-fill" style="height: 50%;"></div>
              <span id="eval-score" class="eval-score">0.0</span>
            </div>
            <div id="board-container"></div>
          </div>

          <!-- Move Stepper Bar -->
          <div class="glass-panel mt-2" style="padding:10px;display:flex;gap:8px;justify-content:center;align-items:center;">
            <button class="btn btn-ghost btn-sm" id="btn-step-start" title="First Move">⏮</button>
            <button class="btn btn-ghost btn-sm" id="btn-step-prev" title="Previous Move (←)">◀</button>
            <span id="step-indicator" style="font-size:13px;font-weight:600;min-width:140px;text-align:center;">Initial Position</span>
            <button class="btn btn-ghost btn-sm" id="btn-step-next" title="Next Move (→)">▶</button>
            <button class="btn btn-ghost btn-sm" id="btn-step-end" title="Last Move">⏭</button>
            <button class="btn btn-ghost btn-sm" id="btn-flip" title="Flip Board">🔄 Flip</button>
          </div>

          <!-- Interactive Exploration Bar (Chess.com Style) -->
          <div id="analysis-exploration-bar" class="analysis-exploration-bar hidden">
            <div class="exploration-info">
              <span class="badge badge-accent">EXPLORING VARIATION</span>
              <span class="exploration-moves" id="exploration-moves-text">1. ...</span>
            </div>
            <button class="btn btn-outline btn-xs" id="btn-return-game-line">
              ↩ Return to Game Line
            </button>
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
        <div class="analysis-sidebar dashboard-panels">
          <!-- 1. Analysis Panel (Top 3 Engine Lines) -->
          <section id="analysis-panel" class="panel glass-panel" style="margin-bottom:12px;padding:14px;">
            <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <h3 style="margin:0;font-size:14px;">Game Analysis</h3>
              <span class="eval-depth badge badge-accent" id="engine-depth">Depth 20</span>
            </div>
            
            <!-- Top 3 Engine Lines (MultiPV) -->
            <div id="engine-lines" class="engine-lines">
              <div class="engine-line" data-multipv="1">
                <span class="line-eval blue-eval">+1.45</span>
                <span class="line-moves">1. e4 e5 2. Nf3 Nc6 3. Bb5</span>
              </div>
              <div class="engine-line" data-multipv="2">
                <span class="line-eval">+0.80</span>
                <span class="line-moves">1. d4 d5 2. c4 e6 3. Nc3</span>
              </div>
              <div class="engine-line" data-multipv="3">
                <span class="line-eval">+0.42</span>
                <span class="line-moves">1. Nf3 d5 2. g3 Nf6 3. Bg2</span>
              </div>
            </div>
          </section>

          <!-- 2. Post-Game Summary Panel (Shows on Right Side After Game Ends) -->
          <section id="post-game-panel" class="panel hidden glass-panel" style="margin-bottom:14px;padding:16px;">
            <div class="game-over-header">
              <h2 id="game-result-title">White Won</h2>
              <p id="game-result-reason">by Checkmate</p>
            </div>

            <!-- Accuracy Preview Row -->
            <div class="accuracy-box">
              <div class="acc-player">
                <span class="acc-label">White Accuracy</span>
                <strong class="acc-val blue-badge" id="white-acc">89.4%</strong>
              </div>
              <div class="acc-player">
                <span class="acc-label">Black Accuracy</span>
                <strong class="acc-val" id="black-acc">76.1%</strong>
              </div>
            </div>

            <a href="/analysis" data-action="game-review" class="btn-primary review-cta">
              <strong>Game Review</strong>
              <span>See top 3 lines & best blue moves</span>
            </a>

            <div class="post-game-actions">
              <button data-action="play-online" class="btn-secondary">New Game</button>
              <button data-action="request-rematch" class="btn-secondary">Rematch</button>
            </div>
          </section>

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
                <div class="class-count" style="color:var(--move-best);">${(data.summary?.white?.best || 0) + (data.summary?.black?.best || 0)}</div>
                <div class="class-label">Best</div>
              </div>
              <div class="class-item">
                <div class="class-count" style="color:var(--move-inaccuracy);">${(data.summary?.white?.inaccuracy || 0) + (data.summary?.black?.inaccuracy || 0)}</div>
                <div class="class-label">Inacc.</div>
              </div>
              <div class="class-item">
                <div class="class-count" style="color:var(--move-mistake);">${(data.summary?.white?.mistake || 0) + (data.summary?.black?.mistake || 0)}</div>
                <div class="class-label">Mistake</div>
              </div>
              <div class="class-item">
                <div class="class-count" style="color:var(--move-blunder);">${(data.summary?.white?.blunder || 0) + (data.summary?.black?.blunder || 0)}</div>
                <div class="class-label">Blunder</div>
              </div>
            </div>
          </div>

          <!-- Move List with Badges -->
          <div class="move-list-container glass-panel" style="max-height:420px;">
            <div class="move-list-header">
              <h3>Move Review</h3>
              <span class="badge badge-accent">CAPS Engine</span>
            </div>
            <div class="move-list" id="analysis-moves-grid"></div>
          </div>
        </div>
      </div>
    `;

    // Initialize board with interactive moves enabled (Chess.com analysis style)
    ChessBoard.init('board-container', {
      orientation: this.currentGame?.user_color || 'white',
      fen: AppConfig.INITIAL_FEN,
      interactive: true,
      allowBothColors: true,
      isAnalysis: true,
      onMove: (attempt) => this.handleBoardMove(attempt.from, attempt.to, attempt.promotion)
    });

    this.renderMovesGrid(moves);
    this.bindAnalysisControls(moves);
    this.jumpToPly(0);

    // Header buttons
    document.getElementById('btn-back-to-selector')?.addEventListener('click', () => {
      this.renderSelectorView();
    });

    document.getElementById('btn-copy-moves')?.addEventListener('click', (e) => {
      const pgnToCopy = this.pgn || data.pgn || '';
      if (typeof copyMovesToClipboard === 'function') {
        copyMovesToClipboard(pgnToCopy, e.currentTarget);
      }
    });

    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
      if (inviteCode && inviteCode !== 'N/A') {
        navigator.clipboard?.writeText(inviteCode);
        alert(`Match code "${inviteCode}" copied to clipboard!`);
      }
    });

    document.getElementById('btn-force-reanalyze')?.addEventListener('click', () => {
      if (confirm('Re-run Stockfish engine analysis on this game? This will update the database.')) {
        this.startAnalysis(this.pgn, inviteCode, true, this.currentGame);
      }
    });
  },

  renderMovesGrid(moves) {
    const container = document.getElementById('analysis-moves-grid');
    if (!container) return;

    const getMoveBadge = (m) => {
      if (!m || !m.classification) return '';
      const iconSvg = window.AppConfig?.getEvalIcon(m.classification);
      if (iconSvg) {
        return `<span class="move-eval-icon" title="${m.classification}">${iconSvg}</span>`;
      }
      return `<span class="badge-${m.classification}" style="font-size:11px;margin-left:4px;">${m.badge || ''}</span>`;
    };

    let html = '';
    for (let i = 0; i < moves.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const w = moves[i];
      const b = moves[i + 1];

      const wBadge = getMoveBadge(w);
      const bBadge = getMoveBadge(b);

      // Spec Formula: plyIndex = (moveNumber - 1) * 2 + (isBlack ? 2 : 1)
      const wPly = (moveNum - 1) * 2 + 1;
      const bPly = (moveNum - 1) * 2 + 2;

      html += `
        <div class="move-number">${moveNum}.</div>
        <div class="move-cell ${w?.classification || ''}" data-ply="${wPly}">${w ? w.san + wBadge : ''}</div>
        <div class="move-cell ${b?.classification || ''}" data-ply="${bPly}">${b ? b.san + bBadge : ''}</div>
      `;
    }

    container.innerHTML = html;
    container.querySelectorAll('.move-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const ply = parseInt(cell.dataset.ply);
        if (!isNaN(ply)) this.jumpToPly(ply);
      });
    });
  },

  bindAnalysisControls(moves) {
    document.getElementById('btn-step-start')?.addEventListener('click', () => {
      this.exitExploration();
      this.jumpToPly(0);
    });

    document.getElementById('btn-step-prev')?.addEventListener('click', () => {
      this.stepBackward();
    });

    document.getElementById('btn-step-next')?.addEventListener('click', () => {
      this.stepForward();
    });

    document.getElementById('btn-step-end')?.addEventListener('click', () => {
      this.exitExploration();
      this.jumpToPly(this.moves.length);
    });

    document.getElementById('btn-flip')?.addEventListener('click', () => ChessBoard.flip());

    // Return to game line button
    document.getElementById('btn-return-game-line')?.addEventListener('click', () => {
      const basePly = this.explorationBasePly;
      this.exitExploration();
      this.jumpToPly(basePly);
    });

    // Keyboard navigation (Left / Right arrow keys)
    window.onkeydown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.stepBackward();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.stepForward();
      }
    };
  },

  getCurrentBoardFen() {
    if (this.isExploring && this.explorationHistory.length > 0) {
      return this.explorationHistory[this.explorationHistory.length - 1].fen;
    }
    return this.fens[this.currentPlyIndex] || AppConfig.INITIAL_FEN;
  },

  handleBoardMove(from, to, promo = '') {
    const currentFen = this.getCurrentBoardFen();
    if (!currentFen || typeof window.Chess !== 'function') return false;

    let chess = null;
    try {
      chess = new window.Chess(currentFen);
    } catch (e) {
      return false;
    }

    let moveResult = null;
    try {
      moveResult = chess.move({ from, to, promotion: promo || 'q' });
    } catch (e) {
      return false;
    }

    if (!moveResult) return false;

    // Check if player played the actual next move of the game review
    if (!this.isExploring && this.currentPlyIndex < this.moves.length) {
      const nextGameMove = this.moves[this.currentPlyIndex];
      const nextFrom = nextGameMove.from || nextGameMove.uci?.slice(0, 2);
      const nextTo = nextGameMove.to || nextGameMove.uci?.slice(2, 4);
      if (from === nextFrom && to === nextTo) {
        // Player played the actual game continuation! Advance review ply
        this.jumpToPly(this.currentPlyIndex + 1);
        return true;
      }
    }

    // Player made a deviation / alternative line move (Chess.com style exploration)
    if (!this.isExploring) {
      this.isExploring = true;
      this.explorationBasePly = this.currentPlyIndex;
      this.explorationHistory = [];
    }

    const newFen = chess.fen();
    this.explorationHistory.push({
      from,
      to,
      san: moveResult.san,
      fen: newFen,
      captured: Boolean(moveResult.captured),
      inCheck: chess.in_check()
    });

    // Update board display
    ChessBoard.update(newFen, {
      lastMove: { from, to },
      inCheck: chess.in_check()
    });

    // Play chess knock sound
    if (typeof playChessSound === 'function') {
      const soundType = chess.in_check() ? 'check' : (moveResult.captured ? 'capture' : 'move');
      playChessSound(soundType);
    }

    // Update exploration bar UI
    this.updateExplorationUI();

    // Stream real-time Stockfish MultiPV for the new position!
    if (typeof runStockfishMultiPV === 'function') {
      runStockfishMultiPV(newFen, 20);
    } else if (typeof evaluatePositionWithWorker === 'function') {
      evaluatePositionWithWorker(newFen);
    } else if (typeof fetchBackendMultiPV === 'function') {
      fetchBackendMultiPV(newFen);
    }

    return true;
  },

  updateExplorationUI() {
    const expBar = document.getElementById('analysis-exploration-bar');
    const expText = document.getElementById('exploration-moves-text');
    const stepInd = document.getElementById('step-indicator');
    if (!expBar || !expText) return;

    expBar.classList.remove('hidden');

    // Build SAN move line for the variation
    let lineStr = '';
    this.explorationHistory.forEach((m, idx) => {
      const plyNum = this.explorationBasePly + idx;
      const moveNum = Math.floor(plyNum / 2) + 1;
      const isBlack = (plyNum % 2 === 1);

      if (!isBlack) {
        lineStr += `${moveNum}. ${m.san} `;
      } else {
        if (idx === 0) lineStr += `${moveNum}... ${m.san} `;
        else lineStr += `${m.san} `;
      }
    });

    expText.textContent = lineStr.trim();
    if (stepInd) {
      stepInd.textContent = `Variation (+${this.explorationHistory.length} ply)`;
    }
  },

  exitExploration() {
    this.isExploring = false;
    this.explorationHistory = [];
    const expBar = document.getElementById('analysis-exploration-bar');
    if (expBar) expBar.classList.add('hidden');
  },

  stepBackward() {
    if (this.isExploring && this.explorationHistory.length > 0) {
      this.explorationHistory.pop();
      if (this.explorationHistory.length === 0) {
        const basePly = this.explorationBasePly;
        this.exitExploration();
        this.jumpToPly(basePly);
      } else {
        const prev = this.explorationHistory[this.explorationHistory.length - 1];
        ChessBoard.update(prev.fen, {
          lastMove: { from: prev.from, to: prev.to },
          inCheck: prev.inCheck
        });
        this.updateExplorationUI();
        if (typeof runStockfishMultiPV === 'function') {
          runStockfishMultiPV(prev.fen, 20);
        }
      }
    } else {
      this.jumpToPly(Math.max(0, this.currentPlyIndex - 1));
    }
  },

  stepForward() {
    if (this.isExploring) {
      const nextPly = this.explorationBasePly + 1;
      this.exitExploration();
      this.jumpToPly(Math.min(this.moves.length, nextPly));
    } else {
      this.jumpToPly(Math.min(this.moves.length, this.currentPlyIndex + 1));
    }
  },

  jumpToPly(plyIndex) {
    this.exitExploration();
    this.currentPlyIndex = plyIndex;
    this.currentMoveIndex = plyIndex - 1;

    // 1. Synchronize Board, Eval Bar, Audio, Highlights & Worker MultiPV
    if (typeof syncAnalysisToPly === 'function') {
      syncAnalysisToPly(plyIndex, this.fens, this.moves, this.evaluations);
    } else {
      renderBoardFromFen(this.fens[plyIndex]);
    }

    // 2. Highlight active cell in move list
    document.querySelectorAll('#analysis-moves-grid .move-cell').forEach(c => {
      const cPly = parseInt(c.dataset.ply);
      c.classList.toggle('active', cPly === plyIndex);
    });

    const indicator = document.getElementById('step-indicator');
    const retryBanner = document.getElementById('retry-banner');

    if (plyIndex === 0) {
      if (indicator) indicator.textContent = 'Initial Position';
      if (retryBanner) retryBanner.classList.add('hidden');
      return;
    }

    // 3. Move indicator: Full-move number = Math.ceil(plyIndex / 2)
    const moveNumber = Math.ceil(plyIndex / 2);
    const isBlack = (plyIndex % 2 === 0);
    const playedMove = this.moves[plyIndex - 1];

    if (indicator && playedMove) {
      indicator.textContent = `Move ${moveNumber}${isBlack ? '... ' : '. '}${playedMove.san} (${playedMove.badge || ''})`;
    }

    // 4. Retry Mistake banner if playedMove was mistake, blunder, or inaccuracy
    const misplayTypes = (typeof MISPLAY_TYPES !== 'undefined') ? MISPLAY_TYPES : new Set(['blunder', 'mistake', 'inaccuracy']);
    if (playedMove && misplayTypes.has(playedMove.classification)) {
      if (retryBanner) {
        retryBanner.classList.remove('hidden');
        document.getElementById('retry-badge-type').textContent = playedMove.classification.toUpperCase();
        const altMove = playedMove.bestAlternativeUci || playedMove.bestMove || 'another move';
        document.getElementById('retry-text').textContent = `Played ${playedMove.san}. Stockfish prefers ${altMove}.`;

        document.getElementById('btn-retry-mistake').onclick = () => {
          this.retryMistake(plyIndex - 1);
        };
      }
    } else {
      if (retryBanner) retryBanner.classList.add('hidden');
    }
  },

  jumpToMove(index) {
    // Backwards-compatible bridge: index -1 -> ply 0; index 0 -> ply 1
    this.jumpToPly(index + 1);
  },

  retryMistake(index) {
    const moves = this.moves || this.currentAnalysis?.moves || [];
    const move = moves[index];
    if (!move) return;

    // FEN before the mistake was made is fens[index]
    const preFen = (this.fens && this.fens[index]) ? this.fens[index] : AppConfig.INITIAL_FEN;
    const turn = index % 2 === 0 ? 'white' : 'black';
    const expectedBest = move.bestAlternativeUci || move.bestMove;

    ChessBoard.init('board-container', {
      orientation: turn,
      fen: preFen,
      interactive: true,
      onMove: (attempt) => {
        const attemptUci = attempt.from + attempt.to + (attempt.promotion || '');
        if (expectedBest && (attemptUci === expectedBest || attemptUci === expectedBest.slice(0, 4))) {
          alert('★ Excellent! You found the engine\'s best move!');
          this.jumpToPly(index + 1);
        } else {
          alert(`Not quite the best move. Stockfish recommended: ${expectedBest || 'a better line'}`);
          this.jumpToPly(index + 1);
        }
      }
    });

    alert(`Retrying Move ${Math.ceil((index + 1) / 2)}. Find a better move than ${move.san}!`);
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
  },

  formatTimeControl(tc) {
    if (!tc) return 'Rapid';
    if (tc === 'bullet') return '1m Bullet';
    if (tc === 'bullet_1_1') return '1|1 Bullet';
    if (tc === 'blitz' || tc === 'blitz_3_2') return '3|2 Blitz';
    if (tc === 'blitz_5_3') return '5|3 Blitz';
    if (tc === 'rapid' || tc === 'rapid_10_0') return '10m Rapid';
    if (tc === 'rapid_15_10') return '15|10 Rapid';
    if (tc === 'untimed') return 'Untimed';
    const m = tc.match(/custom_(\d+)_(\d+)/);
    if (m) return `${m[1]}|${m[2]} Custom`;
    return tc.toUpperCase();
  },

  formatTimeAgo(dateString) {
    if (!dateString) return '';
    const date = typeof parseAndCorrectTimestamp === 'function'
      ? parseAndCorrectTimestamp(dateString)
      : new Date(dateString);
    if (!date) return '';
    const sec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

window.AnalysisPage = AnalysisPage;
