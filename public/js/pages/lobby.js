/**
 * Lobby Page — Modern Chess.com-Style Home Dashboard
 * Sleek Dark Slate aesthetic with vibrant Blue/Cyan Outlines
 * All Cards, Icons, and Buttons are fully interactive and clickable
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
          <div class="stat-card glass-panel" data-navigate="profile" title="View Rating & Profile">
            <div class="stat-value text-accent">${user.elo_rating || 800}</div>
            <div class="stat-label">ELO Rating</div>
          </div>
          <div class="stat-card glass-panel" data-navigate="puzzles" title="Solve Puzzles">
            <div class="stat-value text-success">${user.puzzles_solved || 0}</div>
            <div class="stat-label">Puzzles Solved</div>
          </div>
          <div class="stat-card glass-panel" data-navigate="bots" title="Challenge AI Bots">
            <div class="stat-value text-warning">${user.bots_defeated || 0} / 9</div>
            <div class="stat-label">Bots Defeated</div>
          </div>
          <div class="stat-card glass-panel" data-navigate="analysis" title="Review Previous Games">
            <div class="stat-value text-accent">Review</div>
            <div class="stat-label">Game Analysis</div>
          </div>
        </div>
      `;
    }

    main.innerHTML = `
      <div class="page lobby-page">
        <!-- Hero Spotlight Section -->
        <div class="lobby-hero mb-3 glass-panel">
          <div class="badge mb-2">
            <span class="pulse-dot"></span>
            <span>Subzero Homelab Arena // Online</span>
          </div>
          <h1 class="page-title">Refrigerator <span class="gradient-text">Chess</span></h1>
          <p class="page-subtitle">Tactical PvP matches, calibrated Stockfish AI boss bots, and 50,000+ tactical puzzles.</p>
          
          <div class="hero-actions mt-3 mb-1">
            <button class="btn btn-fill btn-lg hero-action-btn" data-navigate="play" id="btn-hero-play">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              <span>Play Online</span>
            </button>
            <button class="btn btn-outline btn-lg hero-action-btn" data-navigate="bots" id="btn-hero-bots">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8.01" y2="16"></line><line x1="16" y1="16" x2="16.01" y2="16"></line></svg>
              <span>Play Computer</span>
            </button>
            <button class="btn btn-ghost btn-lg hero-action-btn" data-navigate="puzzles" id="btn-hero-puzzles">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"></path></svg>
              <span>Solve Puzzles</span>
            </button>
          </div>
        </div>

        ${statsHTML}

        <!-- Chess.com Style Game Tiles Grid -->
        <div class="lobby-grid">
          <!-- Card: Play Online -->
          <div class="lobby-card glass-panel glass-panel-hover" id="card-pvp" data-navigate="play" role="button" tabindex="0">
            <div class="card-icon-wrap" data-navigate="play">
              <div class="lobby-vector-icon icon-cyan" data-navigate="play">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14.5 17.5L3 6V3h3l11.5 11.5"></path>
                  <path d="M13 19l6 2l3 -3l-2 -6"></path>
                  <path d="M19 5l-2.5 2.5"></path>
                  <path d="M14.5 9.5l-5 5"></path>
                </svg>
              </div>
            </div>
            <div class="lobby-card-body" data-navigate="play">
              <div class="lobby-card-header">
                <div class="lobby-card-title">Play a Friend</div>
                <span class="badge badge-accent">PVP</span>
              </div>
              <div class="lobby-card-desc">Create private match rooms, share instant invite links, with live Stockfish eval bar and clocks.</div>
            </div>
            <button class="btn btn-fill btn-sm btn-block mt-2" data-navigate="play">Play PvP</button>
          </div>

          <!-- Card: Play Bots -->
          <div class="lobby-card glass-panel glass-panel-hover" id="card-bots" data-navigate="bots" role="button" tabindex="0">
            <div class="card-icon-wrap" data-navigate="bots">
              <div class="lobby-vector-icon icon-warning" data-navigate="bots">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                  <circle cx="12" cy="5" r="2"></circle>
                  <path d="M12 7v4"></path>
                  <line x1="8" y1="16" x2="8.01" y2="16"></line>
                  <line x1="16" y1="16" x2="16.01" y2="16"></line>
                </svg>
              </div>
            </div>
            <div class="lobby-card-body" data-navigate="bots">
              <div class="lobby-card-header">
                <div class="lobby-card-title">Challenge Bots</div>
                <span class="badge badge-warning">STOCKFISH</span>
              </div>
              <div class="lobby-card-desc">Battle 9 calibrated AI personalities from 250 Frosty to 2000 Absolute Zero with live evaluation bar.</div>
            </div>
            <button class="btn btn-fill btn-sm btn-block mt-2" data-navigate="bots">Challenge Bots</button>
          </div>

          <!-- Card: Tactical Puzzles -->
          <div class="lobby-card glass-panel glass-panel-hover" id="card-puzzles" data-navigate="puzzles" role="button" tabindex="0">
            <div class="card-icon-wrap" data-navigate="puzzles">
              <div class="lobby-vector-icon icon-success" data-navigate="puzzles">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 7a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2v4a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-4a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2z"></path>
                </svg>
              </div>
            </div>
            <div class="lobby-card-body" data-navigate="puzzles">
              <div class="lobby-card-header">
                <div class="lobby-card-title">Tactical Puzzles</div>
                <span class="badge badge-success">TRAIN</span>
              </div>
              <div class="lobby-card-desc">Solve 50,000+ tactical puzzles across 5 difficulty tiers. Gain +1 ELO per correct tactical solution.</div>
            </div>
            <button class="btn btn-fill btn-sm btn-block mt-2" data-navigate="puzzles">Solve Puzzles</button>
          </div>

          <!-- Card: Game Review -->
          <div class="lobby-card glass-panel glass-panel-hover" id="card-analysis" data-navigate="analysis" role="button" tabindex="0">
            <div class="card-icon-wrap" data-navigate="analysis">
              <div class="lobby-vector-icon icon-cyan" data-navigate="analysis">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 3v18h18"></path>
                  <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
                </svg>
              </div>
            </div>
            <div class="lobby-card-body" data-navigate="analysis">
              <div class="lobby-card-header">
                <div class="lobby-card-title">Game Review</div>
                <span class="badge badge-accent">ANALYSIS</span>
              </div>
              <div class="lobby-card-desc">Review your matches with Stockfish 16.1. Pinpoint inaccuracies, blunders, and brilliant moves.</div>
            </div>
            <button class="btn btn-outline btn-sm btn-block mt-2" data-navigate="analysis">Analyze Matches</button>
          </div>

          <!-- Card: Leaderboards -->
          <div class="lobby-card glass-panel glass-panel-hover" id="card-ranks" data-navigate="leaderboard" role="button" tabindex="0">
            <div class="card-icon-wrap" data-navigate="leaderboard">
              <div class="lobby-vector-icon icon-amber" data-navigate="leaderboard">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 9a6 6 0 1 0 12 0a6 6 0 0 0 -12 0"></path>
                  <path d="M12 15v6"></path>
                  <path d="M8 21h8"></path>
                </svg>
              </div>
            </div>
            <div class="lobby-card-body" data-navigate="leaderboard">
              <div class="lobby-card-header">
                <div class="lobby-card-title">Leaderboards</div>
                <span class="badge badge-warning">RANKS</span>
              </div>
              <div class="lobby-card-desc">Compare player ratings, puzzle streaks, and boss defeat achievements across the community.</div>
            </div>
            <button class="btn btn-outline btn-sm btn-block mt-2" data-navigate="leaderboard">View Ranks</button>
          </div>
        </div>

        ${!isLoggedIn ? `
        <div class="glass-panel text-center mt-3 p-3 lobby-cta-box">
          <div class="badge mb-2">
            <span class="pulse-dot"></span>
            <span>Zero Telemetry // Free Registration</span>
          </div>
          <h2 style="font-size:20px;margin-bottom:8px;">Ready to Climb the Ranks?</h2>
          <p class="text-dim mb-3">Create an instant account with zero email required. Save ratings, defeat boss bots, and review your games.</p>
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
    // Bind all elements with data-navigate attribute (cards, icons, titles, buttons)
    document.querySelectorAll('[data-navigate]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const page = el.dataset.navigate;
        if (page && window.App) {
          window.App.navigateTo(page);
        }
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const page = el.dataset.navigate;
          if (page && window.App) {
            window.App.navigateTo(page);
          }
        }
      });
    });

    // Auth CTA buttons
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
