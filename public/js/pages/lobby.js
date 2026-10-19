/**
 * Lobby Page — Home / Dashboard
 * Steam x Cozy Homelab aesthetic matching isyourrefrigerator.online
 */
const LobbyPage = {
  render() {
    const main = document.getElementById('main-content');
    const isLoggedIn = !!Auth.currentUser;
    const user = Auth.currentUser;

    let statsHTML = '';
    if (isLoggedIn) {
      statsHTML = `
        <div class="stats-bar mb-3">
          <div class="stat-card glass-panel" style="cursor:pointer;" onclick="App.navigateTo('profile')">
            <div class="stat-value text-accent">${user.elo_rating || 800}</div>
            <div class="stat-label">ELO Rating (View Profile)</div>
          </div>
          <div class="stat-card glass-panel" style="cursor:pointer;" onclick="App.navigateTo('puzzles')">
            <div class="stat-value text-success">${user.puzzles_solved || 0}</div>
            <div class="stat-label">Puzzles Solved</div>
          </div>
          <div class="stat-card glass-panel" style="cursor:pointer;" onclick="App.navigateTo('bots')">
            <div class="stat-value text-warning">${user.bots_defeated || 0} / 9</div>
            <div class="stat-label">Bots Defeated</div>
          </div>
        </div>
      `;
    }

    main.innerHTML = `
      <div class="page">
        <!-- Hero Spotlight Section -->
        <div class="lobby-hero mb-3">
          <div class="badge mb-2">
            <span class="pulse-dot"></span>
            <span>Subzero Homelab Arena // Active</span>
          </div>
          <h1 class="page-title">Refrigerator <span class="gradient-text">Chess</span></h1>
          <p class="page-subtitle">Tactical PvP matches, calibrated AI boss bots, and 50,000+ chess puzzles hosted on <strong>isyourrefrigerator.online</strong>.</p>
          
          <div class="hero-actions mt-3 mb-2" style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-fill btn-lg" id="btn-hero-play">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              <span>Play Live Match</span>
            </button>
            <button class="btn btn-outline btn-lg" id="btn-hero-bots">
              <span>🤖 Challenge Bots</span>
            </button>
            <button class="btn btn-ghost btn-lg" id="btn-hero-puzzles">
              <span>🧩 Solve Puzzles</span>
            </button>
          </div>
        </div>

        ${statsHTML}

        <div class="lobby-grid">
          <!-- Card: PvP -->
          <div class="lobby-card glass-panel glass-panel-hover" id="card-pvp" role="button" tabindex="0">
            <div class="card-icon-wrap">
              <span class="lobby-card-icon">⚔️</span>
            </div>
            <div class="lobby-card-body">
              <div class="lobby-card-header">
                <div class="lobby-card-title">Play a Friend</div>
                <span class="badge badge-accent">PVP</span>
              </div>
              <div class="lobby-card-desc">Create a private match and share the instant invite link. Real-time gameplay with custom clocks, live eval, and chat.</div>
            </div>
            <button class="btn btn-fill btn-sm btn-block mt-2" id="btn-card-pvp">Play PvP</button>
          </div>

          <!-- Card: Bots -->
          <div class="lobby-card glass-panel glass-panel-hover" id="card-bots" role="button" tabindex="0">
            <div class="card-icon-wrap">
              <span class="lobby-card-icon">🤖</span>
            </div>
            <div class="lobby-card-body">
              <div class="lobby-card-header">
                <div class="lobby-card-title">Challenge Bots</div>
                <span class="badge badge-warning">PVE</span>
              </div>
              <div class="lobby-card-desc">Battle through 9 boss bots from 250 Frosty to 2000 Absolute Zero running calibrated Stockfish AVX2 engine.</div>
            </div>
            <button class="btn btn-fill btn-sm btn-block mt-2" id="btn-card-bots">Challenge Bots</button>
          </div>

          <!-- Card: Puzzles -->
          <div class="lobby-card glass-panel glass-panel-hover" id="card-puzzles" role="button" tabindex="0">
            <div class="card-icon-wrap">
              <span class="lobby-card-icon">🧩</span>
            </div>
            <div class="lobby-card-body">
              <div class="lobby-card-header">
                <div class="lobby-card-title">Tactical Puzzles</div>
                <span class="badge badge-success">TRAIN</span>
              </div>
              <div class="lobby-card-desc">Sharpen your calculation with 50,000+ starter and grandmaster puzzles. Filter by rating and climb the leaderboards.</div>
            </div>
            <button class="btn btn-fill btn-sm btn-block mt-2" id="btn-card-puzzles">Solve Puzzles</button>
          </div>

          <!-- Card: Ranks -->
          <div class="lobby-card glass-panel glass-panel-hover" id="card-ranks" role="button" tabindex="0">
            <div class="card-icon-wrap">
              <span class="lobby-card-icon">🏆</span>
            </div>
            <div class="lobby-card-body">
              <div class="lobby-card-header">
                <div class="lobby-card-title">Leaderboards</div>
                <span class="badge badge-accent">RANKS</span>
              </div>
              <div class="lobby-card-desc">See top player ratings, highest puzzle streaks, and bot conqueror achievements across the whole community.</div>
            </div>
            <button class="btn btn-outline btn-sm btn-block mt-2" id="btn-card-ranks">View Ranks</button>
          </div>
        </div>

        ${!isLoggedIn ? `
        <div class="glass-panel text-center mt-3 p-3 lobby-cta-box">
          <div class="badge mb-2">
            <span class="pulse-dot"></span>
            <span>Zero Telemetry // Free Registration</span>
          </div>
          <h2 style="font-size:20px;margin-bottom:8px;">Ready to Play?</h2>
          <p class="text-dim mb-3">Create an instant account — no email or password resets required. Save your rating, track boss defeats, and climb the ranks.</p>
          <div class="d-flex justify-content-center gap-2">
            <button class="btn btn-fill btn-lg" id="btn-lobby-register">Create Free Account</button>
            <button class="btn btn-outline btn-lg" id="btn-lobby-login">Sign In</button>
          </div>
        </div>
        ` : ''}
      </div>
    `;

    this.bindEvents();
  },

  bindEvents() {
    const bindClick = (id, page) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.App?.navigateTo(page);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.App?.navigateTo(page);
        }
      });
    };

    // Hero buttons
    bindClick('btn-hero-play', 'play');
    bindClick('btn-hero-bots', 'bots');
    bindClick('btn-hero-puzzles', 'puzzles');

    // Cards and Card Buttons
    bindClick('card-pvp', 'play');
    bindClick('btn-card-pvp', 'play');

    bindClick('card-bots', 'bots');
    bindClick('btn-card-bots', 'bots');

    bindClick('card-puzzles', 'puzzles');
    bindClick('btn-card-puzzles', 'puzzles');

    bindClick('card-ranks', 'leaderboard');
    bindClick('btn-card-ranks', 'leaderboard');

    // Auth buttons
    document.getElementById('btn-lobby-register')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.Auth?.showRegisterModal();
    });

    document.getElementById('btn-lobby-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.Auth?.showLoginModal();
    });
  }
};

window.LobbyPage = LobbyPage;
