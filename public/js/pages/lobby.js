/**
 * Lobby Page — Modern Chess.com-Style Home Dashboard
 * Replicates Chess.com dashboard layout:
 * - Central quick-play & game modes grid
 * - Right-side activity & friends panel
 * - Live routing endpoints for all links and buttons
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
          <a href="/profile" class="stat-card glass-panel" title="View Rating & Profile" style="text-decoration:none;">
            <div class="stat-value text-accent">${user.elo_rating || 800}</div>
            <div class="stat-label">ELO Rating</div>
          </a>
          <a href="/puzzles" class="stat-card glass-panel" title="Solve Puzzles" style="text-decoration:none;">
            <div class="stat-value text-success">${user.puzzles_solved || 0}</div>
            <div class="stat-label">Puzzles Solved</div>
          </a>
          <a href="/bots" class="stat-card glass-panel" title="Challenge AI Bots" style="text-decoration:none;">
            <div class="stat-value text-warning">${user.bots_defeated || 0} / 9</div>
            <div class="stat-label">Bots Defeated</div>
          </a>
          <a href="/analysis" class="stat-card glass-panel" title="Review Previous Games" style="text-decoration:none;">
            <div class="stat-value text-accent">Review</div>
            <div class="stat-label">Game Analysis</div>
          </a>
        </div>
      `;
    }

    main.innerHTML = `
      <div class="page lobby-page">
        <div class="homescreen-layout">
          <!-- Central Column: Quick Play, Hero, Game Modes Grid -->
          <div class="homescreen-main">
            <!-- Hero Spotlight Section -->
            <div class="lobby-hero mb-3 glass-panel">
              <div class="badge mb-2">
                <span class="pulse-dot"></span>
                <span>Subzero Homelab Arena // Online</span>
              </div>
              <h1 class="page-title">Play <span class="gradient-text">Chess</span></h1>
              <p class="page-subtitle">Tactical PvP matches, calibrated Stockfish AI boss bots, and 50,000+ tactical puzzles.</p>
              
              <!-- Quick-Play Time Controls (Chess.com Style) -->
              <div class="quick-play-bar mt-3 mb-2">
                <a href="/play" class="time-control-pill" title="1 min Bullet">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>
                  <span>1 min</span> <span class="tc-label">Bullet</span>
                </a>
                <a href="/play" class="time-control-pill" title="3 min Blitz">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
                  <span>3 min</span> <span class="tc-label">Blitz</span>
                </a>
                <a href="/play" class="time-control-pill active" title="5 min Blitz">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
                  <span>5 min</span> <span class="tc-label">Blitz</span>
                </a>
                <a href="/play" class="time-control-pill" title="10 min Rapid">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                  <span>10 min</span> <span class="tc-label">Rapid</span>
                </a>
                <a href="/play" class="time-control-pill" title="15|10 Rapid">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                  <span>15 | 10</span> <span class="tc-label">Rapid</span>
                </a>
              </div>

              <div class="hero-actions mt-2 mb-1">
                <a href="/play" class="btn btn-fill btn-lg hero-action-btn" id="btn-hero-play">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  <span>Play Online</span>
                </a>
                <a href="/bots" class="btn btn-outline btn-lg hero-action-btn" id="btn-hero-bots">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8.01" y2="16"></line><line x1="16" y1="16" x2="16.01" y2="16"></line></svg>
                  <span>Play Computer</span>
                </a>
                <a href="/puzzles" class="btn btn-ghost btn-lg hero-action-btn" id="btn-hero-puzzles">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"></path></svg>
                  <span>Solve Puzzles</span>
                </a>
              </div>
            </div>

            ${statsHTML}

            <!-- Chess.com Style Game Tiles Grid -->
            <div class="lobby-grid">
              <!-- Card: Play Online -->
              <a href="/play" class="lobby-card glass-panel glass-panel-hover" id="card-pvp" style="text-decoration:none;">
                <div class="card-icon-wrap">
                  <div class="lobby-vector-icon icon-cyan">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14.5 17.5L3 6V3h3l11.5 11.5"></path>
                      <path d="M13 19l6 2l3 -3l-2 -6"></path>
                      <path d="M19 5l-2.5 2.5"></path>
                      <path d="M14.5 9.5l-5 5"></path>
                    </svg>
                  </div>
                </div>
                <div class="lobby-card-body">
                  <div class="lobby-card-header">
                    <div class="lobby-card-title">Play a Friend</div>
                    <span class="badge badge-accent">PVP</span>
                  </div>
                  <div class="lobby-card-desc">Create private match rooms, share instant invite links, with live Stockfish eval bar and clocks.</div>
                </div>
                <div class="btn btn-fill btn-sm btn-block mt-2">Play PvP</div>
              </a>

              <!-- Card: Play Bots -->
              <a href="/bots" class="lobby-card glass-panel glass-panel-hover" id="card-bots" style="text-decoration:none;">
                <div class="card-icon-wrap">
                  <div class="lobby-vector-icon icon-warning">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                      <circle cx="12" cy="5" r="2"></circle>
                      <path d="M12 7v4"></path>
                      <line x1="8" y1="16" x2="8.01" y2="16"></line>
                      <line x1="16" y1="16" x2="16.01" y2="16"></line>
                    </svg>
                  </div>
                </div>
                <div class="lobby-card-body">
                  <div class="lobby-card-header">
                    <div class="lobby-card-title">Challenge Bots</div>
                    <span class="badge badge-warning">STOCKFISH</span>
                  </div>
                  <div class="lobby-card-desc">Battle 9 calibrated AI personalities from 250 Frosty to 2000 Absolute Zero with live evaluation bar.</div>
                </div>
                <div class="btn btn-fill btn-sm btn-block mt-2">Challenge Bots</div>
              </a>

              <!-- Card: Tactical Puzzles -->
              <a href="/puzzles" class="lobby-card glass-panel glass-panel-hover" id="card-puzzles" style="text-decoration:none;">
                <div class="card-icon-wrap">
                  <div class="lobby-vector-icon icon-success">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 7a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2v4a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-4a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2z"></path>
                    </svg>
                  </div>
                </div>
                <div class="lobby-card-body">
                  <div class="lobby-card-header">
                    <div class="lobby-card-title">Tactical Puzzles</div>
                    <span class="badge badge-success">TRAIN</span>
                  </div>
                  <div class="lobby-card-desc">Solve 50,000+ tactical puzzles across 5 difficulty tiers. Gain +1 ELO per correct tactical solution.</div>
                </div>
                <div class="btn btn-fill btn-sm btn-block mt-2">Solve Puzzles</div>
              </a>

              <!-- Card: Game Review -->
              <a href="/analysis" class="lobby-card glass-panel glass-panel-hover" id="card-analysis" style="text-decoration:none;">
                <div class="card-icon-wrap">
                  <div class="lobby-vector-icon icon-cyan">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 3v18h18"></path>
                      <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
                    </svg>
                  </div>
                </div>
                <div class="lobby-card-body">
                  <div class="lobby-card-header">
                    <div class="lobby-card-title">Game Review</div>
                    <span class="badge badge-accent">ANALYSIS</span>
                  </div>
                  <div class="lobby-card-desc">Review your matches with Stockfish 16.1. Pinpoint inaccuracies, blunders, and brilliant moves.</div>
                </div>
                <div class="btn btn-outline btn-sm btn-block mt-2">Analyze Matches</div>
              </a>

              <!-- Card: Leaderboards -->
              <a href="/leaderboard" class="lobby-card glass-panel glass-panel-hover" id="card-ranks" style="text-decoration:none;">
                <div class="card-icon-wrap">
                  <div class="lobby-vector-icon icon-amber">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M6 9a6 6 0 1 0 12 0a6 6 0 0 0 -12 0"></path>
                      <path d="M12 15v6"></path>
                      <path d="M8 21h8"></path>
                    </svg>
                  </div>
                </div>
                <div class="lobby-card-body">
                  <div class="lobby-card-header">
                    <div class="lobby-card-title">Leaderboards</div>
                    <span class="badge badge-warning">RANKS</span>
                  </div>
                  <div class="lobby-card-desc">Compare player ratings, puzzle streaks, and boss defeat achievements across the community.</div>
                </div>
                <div class="btn btn-outline btn-sm btn-block mt-2">View Ranks</div>
              </a>

              <!-- Card: Profile & Stats -->
              <a href="/profile" class="lobby-card glass-panel glass-panel-hover" id="card-profile" style="text-decoration:none;">
                <div class="card-icon-wrap">
                  <div class="lobby-vector-icon icon-blue">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </div>
                </div>
                <div class="lobby-card-body">
                  <div class="lobby-card-header">
                    <div class="lobby-card-title">Profile & History</div>
                    <span class="badge badge-accent">PROFILE</span>
                  </div>
                  <div class="lobby-card-desc">Manage your avatar, view detailed rating progress, friend lists, and replay archived games.</div>
                </div>
                <div class="btn btn-outline btn-sm btn-block mt-2">View Profile</div>
              </a>
            </div>

            <!-- Puzzle of the Day Spotlight -->
            <div class="daily-puzzle-banner glass-panel mt-3 p-3">
              <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div>
                  <div class="badge badge-success mb-1">TACTICAL TRAINING</div>
                  <h3 style="font-size:16px;margin:0 0 4px 0;font-weight:700;">Tactical Puzzle Challenge</h3>
                  <p class="text-dim mb-0" style="font-size:13px;">Find the best continuation to gain rating points and sharpen your vision.</p>
                </div>
                <a href="/puzzles" class="btn btn-fill btn-md">
                  <span>Solve Daily Tactics</span>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                </a>
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

          <!-- Right-side Column: Activity & Friends Panel -->
          <div class="homescreen-sidebar-right">
            <!-- Mount Point for Friends Widget (search input, friend requests, online friends) -->
            <div id="lobby-friends-container"></div>

            <!-- Server Status & Homelab Info -->
            <div class="glass-panel p-3">
              <div class="d-flex align-items-center justify-content-between mb-2">
                <span style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Homelab Engine</span>
                <span class="badge badge-success"><span class="pulse-dot"></span> 16.1 NNUE</span>
              </div>
              <p class="text-dim mb-2" style="font-size:12px;line-height:1.5;">Calibrated Stockfish evaluation engine and Web Audio wooden piece physics active.</p>
              <div class="d-flex gap-2">
                <a href="/bots" class="btn btn-outline btn-xs flex-1 text-center" style="text-decoration:none;">Play AI</a>
                <a href="/analysis" class="btn btn-outline btn-xs flex-1 text-center" style="text-decoration:none;">Review</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();

    // Render Friends Widget into the right panel
    if (window.FriendsWidget) {
      window.FriendsWidget.render('lobby-friends-container');
    }
  },

  bindEvents() {
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
