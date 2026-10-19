/**
 * Lobby Page — Home / Dashboard
 */
const LobbyPage = {
  render() {
    const main = document.getElementById('main-content');
    const isLoggedIn = !!Auth.currentUser;

    let statsHTML = '';
    if (isLoggedIn) {
      const user = Auth.currentUser;
      statsHTML = `
        <div class="stats-bar">
          <div class="stat-card glass-panel">
            <div class="stat-value">${user.elo_rating || 800}</div>
            <div class="stat-label">Rating</div>
          </div>
          <div class="stat-card glass-panel">
            <div class="stat-value">${user.puzzles_solved || 0}</div>
            <div class="stat-label">Puzzles Solved</div>
          </div>
          <div class="stat-card glass-panel">
            <div class="stat-value">${user.bots_defeated || 0}</div>
            <div class="stat-label">Bots Defeated</div>
          </div>
        </div>
      `;
    }

    main.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1 class="page-title">Refrigerator Chess</h1>
          <p class="page-subtitle">Play, learn, and compete on isyourrefrigerator.online</p>
        </div>

        ${statsHTML}

        <div class="lobby-grid">
          <div class="lobby-card glass-panel glass-panel-hover" onclick="App.navigateTo('play')" id="card-pvp">
            <div class="lobby-card-icon">⚔️</div>
            <div class="lobby-card-title">Play a Friend</div>
            <div class="lobby-card-desc">Create a match and share the invite link. Real-time PvP with clocks, draw offers, and chat.</div>
            <div class="lobby-card-badge"><span class="badge badge-accent">PVP</span></div>
          </div>

          <div class="lobby-card glass-panel glass-panel-hover" onclick="App.navigateTo('bots')" id="card-bots">
            <div class="lobby-card-icon">🤖</div>
            <div class="lobby-card-title">Challenge Bots</div>
            <div class="lobby-card-desc">Battle through 9 boss bots from 250 to 2000 ELO. Earn rating points and climb the ranks.</div>
            <div class="lobby-card-badge"><span class="badge badge-warning">PVE</span></div>
          </div>

          <div class="lobby-card glass-panel glass-panel-hover" onclick="App.navigateTo('puzzles')" id="card-puzzles">
            <div class="lobby-card-icon">🧩</div>
            <div class="lobby-card-title">Tactical Puzzles</div>
            <div class="lobby-card-desc">Sharpen your tactics with 50,000+ puzzles. Filter by difficulty, earn ELO for each solve.</div>
            <div class="lobby-card-badge"><span class="badge badge-success">TRAIN</span></div>
          </div>

          <div class="lobby-card glass-panel glass-panel-hover" onclick="App.navigateTo('leaderboard')" id="card-ranks">
            <div class="lobby-card-icon">🏆</div>
            <div class="lobby-card-title">Leaderboard</div>
            <div class="lobby-card-desc">See where you rank among all players. Top ratings, puzzles solved, and bots defeated.</div>
            <div class="lobby-card-badge"><span class="badge badge-accent">RANKS</span></div>
          </div>
        </div>

        ${!isLoggedIn ? `
        <div class="glass-panel text-center mt-3" style="padding:32px;">
          <h2 style="font-size:20px;margin-bottom:8px;">Ready to Play?</h2>
          <p class="text-muted mb-2">Create a free account to track your rating, solve puzzles, and battle bots.</p>
          <button class="btn btn-primary btn-lg" onclick="Auth.showRegisterModal()">Create Free Account</button>
        </div>
        ` : ''}
      </div>
    `;
  }
};
