/**
 * Profile Page — Chess.com-style User Profile, Rating History, Boss Badges,
 * and Interactive Match Replay / Review System
 */
const ProfilePage = {
  profileUser: null,
  profileStats: null,
  recentGames: [],
  currentFilter: 'all',
  replayGame: null,
  replayFens: [],
  replayMoves: [],
  replayIndex: -1,
  replayAutoPlayTimer: null,

  async render(username = null) {
    const main = document.getElementById('main-content');
    const targetUsername = username || (Auth.currentUser ? Auth.currentUser.username : null);

    if (!targetUsername) {
      main.innerHTML = `
        <div class="page text-center" style="max-width:540px;margin:40px auto;">
          <div class="glass-panel" style="padding:40px;">
            <div style="font-size:48px;margin-bottom:12px;">👤</div>
            <h2 class="page-title">User Profile</h2>
            <p class="text-secondary mt-1">Sign in to view your rating, match archives, and boss defeat achievements.</p>
            <div class="mt-3" style="display:flex;gap:10px;justify-content:center;">
              <button class="btn btn-primary" onclick="Auth.showLoginModal()">Sign In</button>
              <button class="btn btn-outline" onclick="App.navigateTo('leaderboard')">View Top Players</button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    main.innerHTML = `
      <div class="page">
        <div class="glass-panel text-center" style="padding:48px;" id="profile-loading">
          <div class="spinner"></div>
          <div class="loading-text mt-2">Loading player profile & match records...</div>
        </div>
        <div id="profile-content" class="hidden"></div>
      </div>
    `;

    try {
      const data = await Api.get(`/users/profile/${encodeURIComponent(targetUsername)}`);
      this.profileUser = data.user;
      this.profileStats = data.stats || {};
      this.recentGames = data.recent_games || [];
      this.renderProfileView(data);
    } catch (err) {
      document.getElementById('profile-loading').innerHTML = `
        <div class="text-danger" style="font-size:18px;font-weight:700;">Player Not Found</div>
        <div class="text-muted mt-1">Could not find user "${this.escapeHtml(targetUsername)}".</div>
        <button class="btn btn-primary mt-3" onclick="App.navigateTo('leaderboard')">Back to Ranks</button>
      `;
    }
  },

  getTierTitle(elo) {
    if (elo >= 2000) return { title: 'Absolute Zero Grandmaster', color: 'var(--red)', icon: '👑' };
    if (elo >= 1800) return { title: 'Arctic Storm Master', color: 'var(--amber)', icon: '⚡' };
    if (elo >= 1500) return { title: 'Glacier Expert', color: 'var(--cyan)', icon: '🛡️' };
    if (elo >= 1200) return { title: 'Sub-Zero Club', color: 'var(--green)', icon: '⚔️' };
    if (elo >= 800) return { title: 'Frost Knight', color: 'var(--blue)', icon: '❄️' };
    return { title: 'Subzero Novice', color: 'var(--text-secondary)', icon: '🧊' };
  },

  renderProfileView(data) {
    document.getElementById('profile-loading')?.classList.add('hidden');
    const container = document.getElementById('profile-content');
    container.classList.remove('hidden');

    const user = data.user;
    const stats = data.stats || {};
    const recent = data.recent_games || [];
    const isSelf = data.is_current_user || (Auth.currentUser && Auth.currentUser.id === user.id);

    const elo = user.elo_rating || 800;
    const tier = this.getTierTitle(elo);
    const avatar = AppConfig.getAvatarHTML(user.avatar_id || 1, user.avatar_custom);

    const totalGames = stats.total_games || 0;
    const wins = stats.wins || 0;
    const losses = stats.losses || 0;
    const draws = stats.draws || 0;
    const winRate = stats.win_rate || 0;

    const winPct = totalGames > 0 ? (wins / totalGames) * 100 : 0;
    const drawPct = totalGames > 0 ? (draws / totalGames) * 100 : 0;
    const lossPct = totalGames > 0 ? (losses / totalGames) * 100 : 0;

    const joinDate = user.created_at
      ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
      : 'Oct 2026';

    const defeatedSet = new Set(stats.defeated_bosses || []);

    container.innerHTML = `
      <div class="profile-layout">
        <!-- Profile Header Glass Card -->
        <div class="profile-header-card glass-panel mb-3">
          <div class="profile-header-top">
            <div class="profile-avatar-wrap" style="cursor:${isSelf ? 'pointer' : 'default'};" id="profile-avatar-clickable">
              <div class="profile-avatar">${avatar}</div>
              ${isSelf ? '<button class="profile-avatar-edit-btn" id="btn-edit-avatar" title="Change Avatar">✎</button>' : ''}
            </div>

            <div class="profile-identity">
              <div class="profile-title-row">
                <h1 class="profile-username">${this.escapeHtml(user.username)}</h1>
                <span class="badge badge-success"><span class="pulse-dot"></span> Online</span>
                ${isSelf ? '<span class="badge badge-accent">You</span>' : ''}
              </div>
              <div class="profile-meta-row">
                <span>Member since ${joinDate}</span>
                <span>•</span>
                <span>${user.puzzles_solved || 0} Puzzles Solved</span>
                <span>•</span>
                <span>${user.bots_defeated || 0} Bosses Defeated</span>
              </div>
            </div>

            <div class="profile-rating-badge glass-panel">
              <div class="rating-tier-icon">${tier.icon}</div>
              <div class="rating-number">${elo}</div>
              <div class="rating-tier-label" style="color:${tier.color};">${tier.title}</div>
            </div>
          </div>
        </div>

        <!-- Performance Stats & Win Rate Distribution -->
        <div class="profile-stats-grid mb-3">
          <div class="glass-panel profile-stat-box">
            <div class="stat-num" style="color:var(--green);">${wins}</div>
            <div class="stat-name">Wins (${winRate}%)</div>
          </div>
          <div class="glass-panel profile-stat-box">
            <div class="stat-num" style="color:var(--text-secondary);">${draws}</div>
            <div class="stat-name">Draws</div>
          </div>
          <div class="glass-panel profile-stat-box">
            <div class="stat-num" style="color:var(--red);">${losses}</div>
            <div class="stat-name">Losses</div>
          </div>
          <div class="glass-panel profile-stat-box">
            <div class="stat-num text-accent">${totalGames}</div>
            <div class="stat-name">Total Matches</div>
          </div>
        </div>

        <!-- Visual Win / Draw / Loss Bar -->
        ${totalGames > 0 ? `
          <div class="glass-panel mb-3" style="padding:14px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:6px;">
              <span style="color:var(--green);">Wins: ${Math.round(winPct)}%</span>
              <span style="color:var(--text-secondary);">Draws: ${Math.round(drawPct)}%</span>
              <span style="color:var(--red);">Losses: ${Math.round(lossPct)}%</span>
            </div>
            <div class="win-rate-bar">
              <div class="win-rate-segment win" style="width:${winPct}%"></div>
              <div class="win-rate-segment draw" style="width:${drawPct}%"></div>
              <div class="win-rate-segment loss" style="width:${lossPct}%"></div>
            </div>
          </div>
        ` : ''}

        <!-- Friends & Community Widget -->
        <div id="profile-friends-widget-wrap" class="mb-3"></div>

        <!-- Defeated Bot Bosses Showcase -->
        <div class="glass-panel mb-3" style="padding:18px;">
          <h3 class="section-heading mb-2">
            <span>Defeated AI Bosses</span>
            <span class="badge badge-accent">${defeatedSet.size} / 9</span>
          </h3>
          <div class="boss-showcase-grid" id="boss-showcase">
            ${this.renderBossBadges(defeatedSet)}
          </div>
        </div>

        <!-- Match History Archive (Chess.com Style) -->
        <div class="glass-panel" style="padding:20px;">
          <div class="match-history-header">
            <div>
              <h2 class="section-title">Recent Matches & Saved Games</h2>
              <p class="section-sub">Watch back matches or launch full Stockfish 16.1 engine reviews</p>
            </div>
            <div class="history-filter-pills">
              <button class="pill-btn active" data-filter="all">All (${recent.length})</button>
              <button class="pill-btn" data-filter="pvp">PvP</button>
              <button class="pill-btn" data-filter="bot">Bots</button>
              <button class="pill-btn" data-filter="win">Wins</button>
            </div>
          </div>

          <div class="matches-table-wrap mt-2">
            <div id="matches-table-container">
              ${this.renderMatchesList(recent, 'all')}
            </div>
          </div>
        </div>
      </div>
    `;

    // Render Friends Widget on profile view
    if (window.FriendsWidget) {
      window.FriendsWidget.render('profile-friends-widget-wrap');
    }

    // Filter pill listeners
    container.querySelectorAll('.pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        document.getElementById('matches-table-container').innerHTML = this.renderMatchesList(recent, this.currentFilter);
        this.bindMatchActionButtons();
      });
    });

    // Avatar edit modal
    if (isSelf) {
      document.getElementById('btn-edit-avatar')?.addEventListener('click', () => {
        this.openAvatarSelector();
      });
      document.getElementById('profile-avatar-clickable')?.addEventListener('click', () => {
        this.openAvatarSelector();
      });
    }

    this.bindMatchActionButtons();
  },

  renderBossBadges(defeatedSet) {
    const bosses = [
      { name: 'Frosty', elo: 250, avatar: '⛄' },
      { name: 'Chilly', elo: 500, avatar: '❄️' },
      { name: 'Cooler', elo: 800, avatar: '🧊' },
      { name: 'Freezer', elo: 1000, avatar: '🏔️' },
      { name: 'Ice Box', elo: 1200, avatar: '📦' },
      { name: 'Sub-Zero', elo: 1350, avatar: '⚔️' },
      { name: 'Glacier', elo: 1500, avatar: '🛡️' },
      { name: 'Arctic Storm', elo: 1800, avatar: '⚡' },
      { name: 'Absolute Zero', elo: 2000, avatar: '👑' }
    ];

    return bosses.map(b => {
      const isDefeated = defeatedSet.has(b.elo);
      return `
        <div class="boss-trophy-card ${isDefeated ? 'defeated' : 'locked'}" title="${b.name} (${b.elo} ELO) - ${isDefeated ? 'Defeated!' : 'Not yet defeated'}">
          <div class="boss-trophy-avatar">${b.avatar}</div>
          <div class="boss-trophy-name">${b.name}</div>
          <div class="boss-trophy-elo">${b.elo} ELO</div>
          ${isDefeated ? '<span class="boss-trophy-check">✓</span>' : '<span class="boss-trophy-lock">🔒</span>'}
        </div>
      `;
    }).join('');
  },

  renderMatchesList(games, filter = 'all') {
    let filtered = games;
    if (filter === 'pvp') filtered = games.filter(g => g.game_type === 'pvp');
    else if (filter === 'bot') filtered = games.filter(g => g.game_type === 'bot');
    else if (filter === 'win') filtered = games.filter(g => g.outcome === 'win');

    if (!filtered || filtered.length === 0) {
      return `
        <div class="text-center text-muted" style="padding:32px;">
          <div style="width:36px;height:36px;margin:0 auto 8px;opacity:0.6;">${AppConfig.getPiece('P')}</div>
          <div>No matches found in this category.</div>
        </div>
      `;
    }

    let rowsHtml = '';
    filtered.forEach((g, idx) => {
      const isWin = g.outcome === 'win';
      const isLoss = g.outcome === 'loss';
      const resultClass = isWin ? 'win' : (isLoss ? 'loss' : 'draw');
      const resultText = isWin ? 'WIN' : (isLoss ? 'LOSS' : 'DRAW');

      const eloChange = g.elo_change || 0;
      let eloBadge = '';
      if (eloChange > 0) eloBadge = `<span class="rating-change positive">+${eloChange}</span>`;
      else if (eloChange < 0) eloBadge = `<span class="rating-change negative">${eloChange}</span>`;
      else eloBadge = `<span class="rating-change neutral">0</span>`;

      const oppAvatar = `<div style="width:100%;height:100%;">${AppConfig.getAvatarHTML(g.opponent_avatar || 7)}</div>`;
      const pieceSvg = `<span style="display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:2px;">${AppConfig.getPiece(g.user_color === 'white' ? 'K' : 'k')}</span>`;
      const userColorIcon = `${pieceSvg} ${g.user_color === 'white' ? 'White' : 'Black'}`;

      const timeAgo = this.formatTimeAgo(g.created_at);
      const tcLabel = this.formatTimeControl(g.time_control);

      rowsHtml += `
        <div class="match-history-row glass-panel glass-panel-hover" data-index="${idx}">
          <!-- Outcome pill -->
          <div class="match-outcome-col">
            <span class="outcome-pill outcome-${resultClass}">${resultText}</span>
            ${eloBadge}
          </div>

          <!-- Opponent info -->
          <div class="match-opponent-col">
            <span class="match-opp-avatar">${oppAvatar}</span>
            <div>
              <div class="match-opp-name">${this.escapeHtml(g.opponent_name)}</div>
              <div class="match-opp-elo">${g.opponent_elo ? g.opponent_elo + ' ELO' : (g.game_type === 'bot' ? 'AI Bot' : 'Player')}</div>
            </div>
          </div>

          <!-- Mode & Side -->
          <div class="match-format-col">
            <span class="badge badge-accent">${tcLabel}</span>
            <span class="match-color-label">${userColorIcon}</span>
          </div>

          <!-- Moves & Date -->
          <div class="match-meta-col">
            <span class="match-move-count">${g.move_count || '?'} moves</span>
            <span class="match-date">${timeAgo}</span>
          </div>

          <!-- Action Buttons -->
          <div class="match-actions-col">
            <button class="btn btn-outline btn-sm btn-match-watch" data-id="${g.id}" title="Watch and step through this game">
              👁️ Watch
            </button>
            <button class="btn btn-fill btn-sm btn-match-review" data-id="${g.id}" title="Evaluate moves with Stockfish">
              🔍 Review
            </button>
          </div>
        </div>
      `;
    });

    return rowsHtml;
  },

  bindMatchActionButtons() {
    const container = document.getElementById('matches-table-container');
    if (!container) return;

    // Watch / Replay button
    container.querySelectorAll('.btn-match-watch').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const game = this.recentGames.find(g => g.id === id);
        if (game) this.openReplayModal(game);
      });
    });

    // Stockfish Review button
    container.querySelectorAll('.btn-match-review').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const game = this.recentGames.find(g => g.id === id);
        if (game && game.pgn) {
          App.navigateTo('analysis', { pgn: game.pgn, inviteCode: game.invite_code });
        } else {
          alert('No notation recorded for this match.');
        }
      });
    });
  },

  /**
   * Interactive Match Replay Modal (Watch back saved matches)
   */
  openReplayModal(game) {
    if (!game.pgn) {
      alert('This match has no moves recorded.');
      return;
    }

    this.replayGame = game;
    clearInterval(this.replayAutoPlayTimer);

    // Parse PGN moves using chess.js
    let moves = [];
    let fens = [AppConfig.INITIAL_FEN];
    try {
      if (typeof window.Chess === 'function') {
        const c = new window.Chess();
        c.load_pgn(game.pgn);
        moves = c.history({ verbose: true });
        
        // Build position after each move
        const stepper = new window.Chess();
        moves.forEach(m => {
          stepper.move(m);
          fens.push(stepper.fen());
        });
      }
    } catch (e) {
      console.warn('[Replay] Error parsing PGN:', e);
    }

    this.replayMoves = moves;
    this.replayFens = fens;
    this.replayIndex = 0;

    const modal = document.getElementById('game-replay-modal');
    const content = document.getElementById('replay-modal-content');
    if (!modal || !content) return;

    const isWin = game.outcome === 'win';
    const isLoss = game.outcome === 'loss';
    const resultColor = isWin ? 'var(--green)' : (isLoss ? 'var(--red)' : 'var(--text-secondary)');

    content.innerHTML = `
      <div class="replay-modal-wrap">
        <div class="replay-header">
          <div>
            <h2 style="font-size:18px;font-weight:700;">Watch Saved Match</h2>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">
              VS <span style="color:var(--text-primary);font-weight:600;">${this.escapeHtml(game.opponent_name)}</span>
              (${game.opponent_elo || 'Bot'}) • Result: <span style="color:${resultColor};font-weight:700;">${game.result}</span>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" id="btn-replay-open-analysis">Review with Stockfish 🔍</button>
        </div>

        <div class="replay-body mt-3">
          <div class="replay-board-wrapper">
            <div id="replay-board-container"></div>
            
            <!-- Controls -->
            <div class="replay-controls glass-panel mt-2">
              <button class="btn btn-ghost btn-sm" id="btn-replay-start" title="First Move">⏮</button>
              <button class="btn btn-ghost btn-sm" id="btn-replay-prev" title="Previous Move">◀</button>
              <button class="btn btn-primary btn-sm" id="btn-replay-play" title="Auto Play">▶ Play</button>
              <button class="btn btn-ghost btn-sm" id="btn-replay-next" title="Next Move">▶</button>
              <button class="btn btn-ghost btn-sm" id="btn-replay-end" title="Last Move">⏭</button>
              <button class="btn btn-ghost btn-sm" id="btn-replay-flip" title="Flip Board">🔄</button>
            </div>
            <div class="replay-status-bar mt-1 text-center" id="replay-status-text" style="font-size:13px;color:var(--cyan);font-weight:600;">
              Move 0 of ${moves.length}
            </div>
          </div>

          <!-- Move List Grid -->
          <div class="replay-movelist glass-panel">
            <div class="move-list-header">
              <h3>Move Record</h3>
              <span class="badge badge-accent">${moves.length} Moves</span>
            </div>
            <div class="move-list" id="replay-moves-grid" style="max-height:380px;">
              ${this.renderReplayMoveGrid(moves)}
            </div>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    // Initialize board
    ChessBoard.init('replay-board-container', {
      orientation: game.user_color || 'white',
      fen: AppConfig.INITIAL_FEN,
      interactive: false
    });

    // Bind replay controls
    document.getElementById('btn-replay-start')?.addEventListener('click', () => this.jumpReplayTo(0));
    document.getElementById('btn-replay-prev')?.addEventListener('click', () => this.jumpReplayTo(Math.max(0, this.replayIndex - 1)));
    document.getElementById('btn-replay-next')?.addEventListener('click', () => this.jumpReplayTo(Math.min(this.replayMoves.length, this.replayIndex + 1)));
    document.getElementById('btn-replay-end')?.addEventListener('click', () => this.jumpReplayTo(this.replayMoves.length));
    document.getElementById('btn-replay-flip')?.addEventListener('click', () => ChessBoard.flip());
    document.getElementById('btn-replay-play')?.addEventListener('click', () => this.toggleAutoPlay());

    // Click on moves in list
    content.querySelectorAll('.move-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const moveIdx = parseInt(cell.dataset.index);
        if (!isNaN(moveIdx)) this.jumpReplayTo(moveIdx + 1);
      });
    });

    // Close button
    document.getElementById('replay-modal-close')?.addEventListener('click', () => {
      clearInterval(this.replayAutoPlayTimer);
      modal.classList.add('hidden');
    });

    modal.onclick = (e) => {
      if (e.target === modal) {
        clearInterval(this.replayAutoPlayTimer);
        modal.classList.add('hidden');
      }
    };

    document.getElementById('btn-replay-open-analysis')?.addEventListener('click', () => {
      clearInterval(this.replayAutoPlayTimer);
      modal.classList.add('hidden');
      App.navigateTo('analysis', { pgn: game.pgn, inviteCode: game.invite_code });
    });
  },

  renderReplayMoveGrid(moves) {
    let html = '';
    for (let i = 0; i < moves.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const w = moves[i]?.san || '';
      const b = moves[i + 1]?.san || '';

      html += `
        <div class="move-number">${moveNum}.</div>
        <div class="move-cell" data-index="${i}">${w}</div>
        <div class="move-cell" data-index="${i + 1}">${b}</div>
      `;
    }
    return html;
  },

  jumpReplayTo(index) {
    this.replayIndex = index;
    const fen = this.replayFens[index] || AppConfig.INITIAL_FEN;

    let lastMove = null;
    if (index > 0 && this.replayMoves[index - 1]) {
      const m = this.replayMoves[index - 1];
      lastMove = { from: m.from, to: m.to };
    }

    ChessBoard.update(fen, { lastMove });

    // Update status text
    const statusText = document.getElementById('replay-status-text');
    if (statusText) {
      if (index === 0) statusText.textContent = 'Initial Position';
      else {
        const m = this.replayMoves[index - 1];
        statusText.textContent = `Move ${Math.ceil(index / 2)} (${m.color === 'w' ? 'White' : 'Black'}): ${m.san}`;
      }
    }

    // Highlight active cell in move list
    document.querySelectorAll('#replay-moves-grid .move-cell').forEach(c => {
      const cIdx = parseInt(c.dataset.index);
      c.classList.toggle('active', cIdx === index - 1);
    });
  },

  toggleAutoPlay() {
    const playBtn = document.getElementById('btn-replay-play');
    if (this.replayAutoPlayTimer) {
      clearInterval(this.replayAutoPlayTimer);
      this.replayAutoPlayTimer = null;
      if (playBtn) playBtn.textContent = '▶ Play';
    } else {
      if (this.replayIndex >= this.replayMoves.length) {
        this.jumpReplayTo(0);
      }
      if (playBtn) playBtn.textContent = '⏸ Pause';
      this.replayAutoPlayTimer = setInterval(() => {
        if (this.replayIndex < this.replayMoves.length) {
          this.jumpReplayTo(this.replayIndex + 1);
        } else {
          clearInterval(this.replayAutoPlayTimer);
          this.replayAutoPlayTimer = null;
          if (playBtn) playBtn.textContent = '▶ Play';
        }
      }, 1000);
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
    const date = new Date(dateString);
    const sec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
  },

  openAvatarSelector() {
    let selectedId = this.profileUser?.avatar_id || 1;
    let customData = this.profileUser?.avatar_custom || null;

    let modal = document.getElementById('avatar-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'avatar-modal';
      modal.className = 'avatar-modal-overlay hidden';
      document.body.appendChild(modal);
    }

    let choicesHTML = '';
    AppConfig.AVATARS.forEach((key, idx) => {
      const id = idx + 1;
      const isSelected = (!customData && selectedId === id);
      choicesHTML += `
        <div class="avatar-picker-choice ${isSelected ? 'selected' : ''}" data-avatar-id="${id}" title="Avatar ${id}">
          <div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
            ${AppConfig.getPiece(key)}
          </div>
        </div>
      `;
    });

    modal.innerHTML = `
      <div class="avatar-modal glass-panel">
        <button class="modal-close" id="btn-close-avatar-modal">&times;</button>
        <h2 style="font-size:18px;font-weight:700;margin-bottom:4px;">Customize Avatar</h2>
        <p class="text-secondary" style="font-size:13px;margin-bottom:14px;">Select a chess piece avatar or upload your custom picture.</p>

        <!-- Current Preview -->
        <div class="d-flex align-items-center gap-3 mb-3 p-2 glass-panel" style="background:rgba(15,23,42,0.6);border-radius:10px;">
          <div style="width:48px;height:48px;border-radius:10px;background:#0f172a;border:1px solid rgba(59,130,246,0.3);overflow:hidden;display:flex;align-items:center;justify-content:center;" id="avatar-preview-box">
            ${AppConfig.getAvatarHTML(selectedId, customData)}
          </div>
          <div>
            <div style="font-size:13px;font-weight:700;">Avatar Preview</div>
            <div class="text-muted" style="font-size:11px;" id="avatar-preview-label">
              ${customData ? 'Custom Picture' : `Piece Vector #${selectedId}`}
            </div>
          </div>
        </div>

        <!-- Custom Upload Box -->
        <div class="avatar-custom-upload-box" id="avatar-upload-box">
          <input type="file" id="avatar-file-input" accept="image/png, image/jpeg, image/webp, image/svg+xml" style="display:none;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent mb-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          <div style="font-size:13px;font-weight:600;">Click to Upload Custom Image</div>
          <div class="text-muted" style="font-size:11px;margin-top:2px;">PNG, JPG, SVG, WebP (Square recommended)</div>
        </div>

        <div style="font-size:12px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;">Or Select Chess Piece Avatar</div>
        <div class="avatar-selector-grid">
          ${choicesHTML}
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3">
          <button class="btn btn-outline btn-sm" id="btn-cancel-avatar">Cancel</button>
          <button class="btn btn-primary btn-sm" id="btn-save-avatar">Save Avatar</button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    const previewBox = document.getElementById('avatar-preview-box');
    const previewLabel = document.getElementById('avatar-preview-label');
    const fileInput = document.getElementById('avatar-file-input');

    // Choice selection
    modal.querySelectorAll('.avatar-picker-choice').forEach(choice => {
      choice.addEventListener('click', () => {
        modal.querySelectorAll('.avatar-picker-choice').forEach(c => c.classList.remove('selected'));
        choice.classList.add('selected');
        selectedId = parseInt(choice.dataset.avatarId, 10);
        customData = null; // reset custom
        if (previewBox) previewBox.innerHTML = AppConfig.getAvatarHTML(selectedId, null);
        if (previewLabel) previewLabel.textContent = `Piece Vector #${selectedId}`;
      });
    });

    // Custom upload click
    document.getElementById('avatar-upload-box')?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert('Image must be under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        customData = ev.target.result;
        modal.querySelectorAll('.avatar-picker-choice').forEach(c => c.classList.remove('selected'));
        if (previewBox) previewBox.innerHTML = `<img src="${customData}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
        if (previewLabel) previewLabel.textContent = 'Custom Uploaded Picture';
      };
      reader.readAsDataURL(file);
    });

    // Cancel / Close
    const closeModal = () => modal.classList.add('hidden');
    document.getElementById('btn-close-avatar-modal')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel-avatar')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Save
    document.getElementById('btn-save-avatar')?.addEventListener('click', async () => {
      const saveBtn = document.getElementById('btn-save-avatar');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }
      try {
        const payload = {
          avatar_id: selectedId,
          avatar_custom: customData || ''
        };
        const res = await Api.post('/users/avatar', payload);
        if (res.user) {
          if (Auth.currentUser) {
            Auth.currentUser.avatar_id = res.user.avatar_id;
            Auth.currentUser.avatar_custom = res.user.avatar_custom;
            Auth.updateUI();
          }
          this.profileUser.avatar_id = res.user.avatar_id;
          this.profileUser.avatar_custom = res.user.avatar_custom;
          closeModal();
          this.renderProfileView({
            user: this.profileUser,
            stats: this.profileStats,
            recent_games: this.recentGames,
            is_current_user: true
          });
        }
      } catch (err) {
        alert(err.message || 'Failed to save avatar');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Avatar';
        }
      }
    });
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

window.ProfilePage = ProfilePage;
