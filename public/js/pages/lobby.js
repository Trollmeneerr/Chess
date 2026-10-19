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
          <div class="stat-card glass-panel">
            <div class="stat-value text-accent">${user.elo_rating || 800}</div>
            <div class="stat-label">ELO Rating</div>
          </div>
          <div class="stat-card glass-panel">
            <div class="stat-value text-success">${user.puzzles_solved || 0}</div>
            <div class="stat-label">Puzzles Solved</div>
          </div>
          <div class="stat-card glass-panel">
            <div class="stat-value text-warning">${user.bots_defeated || 0}</div>
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
            <button class="btn btn-fill btn-sm btn-block mt-2">Play PvP</button>
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
            <button class="btn btn-fill btn-sm btn-block mt-2">Challenge Bots</button>
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
            <button class="btn btn-fill btn-sm btn-block mt-2">Solve Puzzles</button>
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
            <button class="btn btn-outline btn-sm btn-block mt-2">View Ranks</button>
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
    const bindNav = (elementId, page) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        window.App?.navigateTo(page);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.App?.navigateTo(page);
        }
      });
    };

    bindNav('card-pvp', 'play');
    bindNav('card-bots', 'bots');
    bindNav('card-puzzles', 'puzzles');
    bindNav('card-ranks', 'leaderboard');

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
