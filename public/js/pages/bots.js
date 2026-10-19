/**
 * Bots Page — PvE Boss Progression from 250 to 2000 ELO
 */
const BotsPage = {
  socket: null,
  activeGame: null,
  activeBot: null,
  currentEval: 0,

  render(selectedBotElo = null) {
    this.renderRoster().then(() => {
      if (selectedBotElo) {
        const elo = parseInt(selectedBotElo);
        const roster = this.getRoster();
        const bot = roster.find(b => b.elo === elo) || { name: 'Bot', elo, avatar: '🤖', desc: 'Calibrated AI opponent' };
        this.openBotModal(bot);
      }
    });
  },

  getRoster() {
    return [
      { name: 'Frosty',        elo: 250,  avatar: '⛄', desc: 'Just learned the rules. Drops pieces constantly.' },
      { name: 'Chilly',        elo: 500,  avatar: '❄️', desc: 'Knows how pieces move, but misses basic tactics.' },
      { name: 'Cooler',        elo: 800,  avatar: '🧊', desc: 'Can spot simple threats and hanging captures.' },
      { name: 'Freezer',       elo: 1000, avatar: '🏔️', desc: 'Solid beginner. Occasionally finds tactical forks.' },
      { name: 'Ice Box',       elo: 1200, avatar: '📦', desc: 'Intermediate player. Understands opening strategy.' },
      { name: 'Sub-Zero',      elo: 1350, avatar: '⚔️', desc: 'Strong club player. Rare mistakes, aggressive tactics.' },
      { name: 'Glacier',       elo: 1500, avatar: '🛡️', desc: 'Advanced player. Solid positional control.' },
      { name: 'Arctic Storm',  elo: 1800, avatar: '⚡', desc: 'Expert-level play. Calculates deep tactical lines.' },
      { name: 'Absolute Zero', elo: 2000, avatar: '👑', desc: 'The Final Boss. Master strength running Stockfish AVX2.' }
    ];
  },

  async renderRoster() {
    const main = document.getElementById('main-content');
    const isLoggedIn = !!Auth.currentUser;
    const roster = this.getRoster();

    let cardsHTML = '';
    roster.forEach(b => {
      const isBoss = b.elo === 2000;
      cardsHTML += `
        <div class="bot-card glass-panel glass-panel-hover" data-elo="${b.elo}" id="bot-card-${b.elo}">
          ${isBoss ? '<span class="badge badge-warning" style="position:absolute;top:10px;left:10px;">BOSS</span>' : ''}
          <div class="bot-avatar">${b.avatar}</div>
          <div class="bot-name">${b.name}</div>
          <div class="bot-elo">${b.elo} ELO</div>
          <div class="bot-desc">${b.desc}</div>
          <button class="btn btn-fill btn-sm btn-block mt-2">Challenge</button>
        </div>
      `;
    });

    main.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1 class="page-title">Challenge Bots</h1>
          <p class="page-subtitle">Battle 9 calibrated AI personalities from beginner to master strength</p>
        </div>

        ${!isLoggedIn ? `
          <div class="glass-panel p-2 mb-3 text-center">
            <span class="text-accent font-weight-bold">Note:</span> Sign in to earn permanent ELO points and boss defeat badges!
          </div>
        ` : ''}

        <div class="bot-grid">
          ${cardsHTML}
        </div>
      </div>
    `;

    main.querySelectorAll('.bot-card').forEach(card => {
      card.addEventListener('click', () => {
        const elo = parseInt(card.dataset.elo);
        const bot = roster.find(b => b.elo === elo) || { name: 'Bot', elo, avatar: '🤖', desc: 'Calibrated AI' };
        this.openBotModal(bot);
      });
    });
  },

  openBotModal(bot) {
    const modal = document.getElementById('bot-match-modal');
    const content = document.getElementById('bot-modal-content');
    if (!modal || !content) {
      this.startBotMatch(bot.elo, 'white');
      return;
    }

    const isLoggedIn = !!Auth.currentUser;
    const tier = bot.elo <= 500 ? 'Beginner' : (bot.elo <= 1200 ? 'Intermediate' : (bot.elo <= 1500 ? 'Advanced' : (bot.elo < 2000 ? 'Expert' : 'Final Boss')));
    const tierColor = bot.elo <= 500 ? 'var(--cyan)' : (bot.elo <= 1200 ? 'var(--green)' : (bot.elo <= 1500 ? 'var(--amber)' : 'var(--red)'));

    let selectedColor = 'white';

    content.innerHTML = `
      <div class="bot-modal-header text-center">
        <div class="bot-modal-avatar-wrap">
          <div class="bot-modal-avatar">${bot.avatar}</div>
        </div>
        <h2 class="bot-modal-title mt-2">${bot.name}</h2>
        <div class="bot-badge-row mt-1">
          <span class="badge" style="border-color:${tierColor};color:${tierColor}">${tier}</span>
          <span class="badge badge-accent">${bot.elo} ELO</span>
        </div>
        <p class="bot-modal-desc mt-2">${bot.desc}</p>
      </div>

      <div class="bot-modal-section mt-3">
        <label class="form-label text-center d-block">Choose Your Side</label>
        <div class="bot-side-selector">
          <button type="button" class="side-btn active" data-color="white" id="side-white">
            <span class="side-piece">${AppConfig.getPieceSVG('K')}</span>
            <span class="side-name">White</span>
            <span class="side-sub">First Move</span>
          </button>
          <button type="button" class="side-btn" data-color="random" id="side-random">
            <span class="side-piece-icon">☯</span>
            <span class="side-name">Random</span>
            <span class="side-sub">Balanced</span>
          </button>
          <button type="button" class="side-btn" data-color="black" id="side-black">
            <span class="side-piece">${AppConfig.getPieceSVG('k')}</span>
            <span class="side-name">Black</span>
            <span class="side-sub">Defend</span>
          </button>
        </div>
      </div>

      <div class="bot-modal-footer mt-3">
        ${!isLoggedIn ? `
          <div class="guest-warning text-center mb-2">
            <small style="color:var(--text-dim);">Playing as Guest. <a href="#" id="modal-link-signin" style="color:var(--cyan);text-decoration:underline;">Sign In</a> to save rating & unlock badges.</small>
          </div>
        ` : ''}
        <button type="button" class="btn btn-fill btn-lg btn-block" id="btn-start-bot-game">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <span>Start Match</span>
        </button>
      </div>
    `;

    modal.classList.remove('hidden');

    // Color buttons
    content.querySelectorAll('.side-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        content.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedColor = btn.dataset.color;
      });
    });

    // Start button
    document.getElementById('btn-start-bot-game')?.addEventListener('click', () => {
      modal.classList.add('hidden');
      this.startBotMatch(bot.elo, selectedColor);
    });

    // Close button
    document.getElementById('bot-modal-close')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    };

    document.getElementById('modal-link-signin')?.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.add('hidden');
      Auth.showLoginModal();
    });
  },

  startBotMatch(elo, colorPreference = 'white') {
    const main = document.getElementById('main-content');

    main.innerHTML = `
      <div class="page">
        <div class="board-layout">
          <!-- Eval Bar -->
          <div class="eval-bar-container">
            <div class="eval-bar-label" id="bot-eval-label">0.0</div>
            <div class="eval-bar">
              <div class="eval-bar-fill" id="bot-eval-fill"></div>
            </div>
          </div>

          <div class="board-wrapper">
            <!-- Bot bar -->
            <div class="player-bar mb-2">
              <div class="player-info-badge">
                <span class="player-avatar" id="bot-avatar">🤖</span>
                <div>
                  <div class="player-name" id="bot-name">Connecting...</div>
                  <div class="player-rating" id="bot-elo"></div>
                </div>
              </div>
              <div class="captured-pieces" id="bot-captured"></div>
            </div>

            <!-- Board -->
            <div id="board-container"></div>

            <!-- Player bar -->
            <div class="player-bar mt-2">
              <div class="player-info-badge">
                <span class="player-avatar">${Auth.currentUser ? AppConfig.AVATARS[(Auth.currentUser.avatar_id || 1) - 1] : '♔'}</span>
                <div>
                  <div class="player-name">${Auth.currentUser ? Auth.currentUser.username : 'You'}</div>
                  <div class="player-rating">${Auth.currentUser ? Auth.currentUser.elo_rating + ' ELO' : ''}</div>
                </div>
              </div>
              <div class="captured-pieces" id="player-captured"></div>
            </div>
          </div>

          <!-- Right Dock Panel -->
          <div class="dock-panel">
            <div class="glass-panel" style="padding:14px;">
              <h3 style="font-size:14px;color:var(--text-secondary);margin-bottom:4px;">OPPONENT</h3>
              <div style="font-size:16px;font-weight:700;color:var(--text-primary);" id="dock-bot-name">...</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;" id="dock-bot-desc">...</div>
            </div>

            <!-- Move List -->
            <div class="move-list-container glass-panel">
              <div class="move-list-header">
                <h3>Moves</h3>
                <span class="badge badge-warning">BOT</span>
              </div>
              <div class="move-list" id="bot-move-list-grid"></div>
            </div>

            <!-- Controls -->
            <div class="game-controls glass-panel">
              <button class="btn btn-danger btn-sm" id="btn-bot-resign">Resign</button>
              <button class="btn btn-ghost btn-sm" id="btn-bot-flip">Flip</button>
              <button class="btn btn-primary btn-sm" onclick="App.navigateTo('bots')">Exit</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.connectBot(elo, colorPreference);
  },

  connectBot(elo, colorPreference) {
    if (this.socket) {
      this.socket.disconnect();
    }

    const token = Api.token;
    this.socket = io(AppConfig.WS_BASE + '/bot', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('[Bot] Connected to socket namespace');
      this.socket.emit('start_game', {
        bot_elo: elo,
        color_preference: colorPreference
      });
    });

    this.socket.on('game_started', (data) => {
      this.activeGame = data;
      this.activeBot = { name: data.botName, elo: data.botElo, avatar: data.botAvatar };

      document.getElementById('bot-name').textContent = data.botName;
      document.getElementById('bot-elo').textContent = `${data.botElo} ELO`;
      document.getElementById('dock-bot-name').textContent = `${data.botName} (${data.botElo} ELO)`;
      document.getElementById('dock-bot-desc').textContent = data.botDescription || 'Stockfish calibrated opponent';

      const avatarSymbol = AppConfig.AVATARS[(data.botAvatar || 1) - 1] || '🤖';
      document.getElementById('bot-avatar').textContent = avatarSymbol;

      ChessBoard.init('board-container', {
        orientation: data.playerColor,
        playerColor: data.playerColor,
        fen: data.fen,
        interactive: true,
        allowPremove: true,
        onMove: (move) => {
          this.socket.emit('move', { game_id: data.gameId, move });
        }
      });
    });

    this.socket.on('move_made', (data) => {
      ChessBoard.update(data.fen, {
        lastMove: { from: data.move.from, to: data.move.to },
        inCheck: data.isCheck,
        checkSquare: data.isCheck ? PlayPage.findKingSquare(data.fen, data.turn === 'white' ? 'w' : 'b') : null
      });

      this.renderMoveList(data.history || []);
      this.updateCaptured(data.history || []);
      this.updateEvaluation(data.fen);

      if (data.isCheck) PlayPage.playSound('check');
      else if (data.move.captured) PlayPage.playSound('capture');
      else PlayPage.playSound('move');
    });

    this.socket.on('bot_move', (data) => {
      ChessBoard.update(data.fen, {
        lastMove: { from: data.move.from, to: data.move.to },
        inCheck: data.isCheck,
        checkSquare: data.isCheck ? PlayPage.findKingSquare(data.fen, data.turn === 'white' ? 'w' : 'b') : null
      });

      this.renderMoveList(data.history || []);
      this.updateCaptured(data.history || []);
      this.updateEvaluation(data.fen);

      if (data.isCheck) PlayPage.playSound('check');
      else if (data.move.captured) PlayPage.playSound('capture');
      else PlayPage.playSound('move');
    });

    this.socket.on('game_over', (data) => {
      this.handleGameOver(data);
    });

    document.getElementById('btn-bot-resign')?.addEventListener('click', () => {
      if (confirm('Resign this game against the bot?')) {
        this.socket.emit('resign', { game_id: this.activeGame?.gameId });
      }
    });

    document.getElementById('btn-bot-flip')?.addEventListener('click', () => {
      ChessBoard.flip();
    });
  },

  async updateEvaluation(fen) {
    try {
      const res = await Api.post('/analysis/evaluate', { fen });
      if (res && res.eval !== undefined) {
        const ev = res.eval;
        this.currentEval = ev;
        const fillEl = document.getElementById('bot-eval-fill');
        const labelEl = document.getElementById('bot-eval-label');

        if (fillEl && labelEl) {
          // Clamp score between -5 and +5 for height calculation
          const clamped = Math.max(-5, Math.min(5, ev));
          const percent = 50 + (clamped / 10) * 100;
          fillEl.style.height = `${percent}%`;

          const sign = ev > 0 ? '+' : '';
          labelEl.textContent = `${sign}${ev.toFixed(1)}`;
        }
      }
    } catch (e) {
      // ignore
    }
  },

  renderMoveList(history) {
    const container = document.getElementById('bot-move-list-grid');
    if (!container) return;

    let html = '';
    for (let i = 0; i < history.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = history[i]?.san || '';
      const blackMove = history[i + 1]?.san || '';

      html += `
        <div class="move-number">${moveNum}.</div>
        <div class="move-cell${i === history.length - 1 ? ' active' : ''}">${whiteMove}</div>
        <div class="move-cell${i + 1 === history.length - 1 ? ' active' : ''}">${blackMove}</div>
      `;
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  },

  updateCaptured(history) {
    const { whiteCaptured, blackCaptured, materialDiff } = ChessBoard.getCapturedPieces(history);
    const playerIsWhite = (this.activeGame?.playerColor || 'white') === 'white';

    const playerCapturedEl = document.getElementById('player-captured');
    const botCapturedEl = document.getElementById('bot-captured');

    const renderPieces = (pieces, diff) => {
      let str = pieces.map(p => AppConfig.PIECE_UNICODE[p] || p).join('');
      if (diff > 0) str += ` +${diff}`;
      return str;
    };

    if (playerCapturedEl && botCapturedEl) {
      playerCapturedEl.textContent = renderPieces(playerIsWhite ? whiteCaptured : blackCaptured, playerIsWhite ? materialDiff : -materialDiff);
      botCapturedEl.textContent = renderPieces(playerIsWhite ? blackCaptured : whiteCaptured, playerIsWhite ? -materialDiff : materialDiff);
    }
  },

  handleGameOver(data) {
    PlayPage.playSound('game_over');

    const isWinner = data.winner === 'player';
    const isDraw = data.winner === 'draw' || data.result === '1/2-1/2';

    let title = isDraw ? 'Draw Game' : (isWinner ? 'Victory!' : 'Defeat');
    let eloClass = data.eloChange > 0 ? 'positive' : 'neutral';
    let eloText = data.eloChange > 0 ? `+${data.eloChange} ELO` : (data.moveCount < 10 ? 'Game too short (<10 moves): No rating awarded' : 'No rating change');

    if (isWinner && Auth.currentUser && data.newElo) {
      Auth.currentUser.elo_rating = data.newElo;
      if (data.botsDefeated) Auth.currentUser.bots_defeated = data.botsDefeated;
      Auth.updateUI();
    }

    const boardWrap = document.querySelector('.board-wrapper');
    if (boardWrap) {
      const overlay = document.createElement('div');
      overlay.className = 'game-over-overlay';
      overlay.innerHTML = `
        <div class="game-over-content glass-panel">
          <div class="game-over-icon">${isDraw ? '🤝' : (isWinner ? '👑' : '🤖')}</div>
          <div class="game-over-title">${title}</div>
          <div class="game-over-subtitle">Game ended by ${data.reason || 'checkmate'} (${data.result})</div>
          <div class="elo-change ${eloClass}">${eloText}</div>
          <div class="game-over-actions">
            <button class="btn btn-primary" id="btn-bot-review">Game Review</button>
            <button class="btn btn-ghost" onclick="BotsPage.startBotMatch(${this.activeGame?.botElo})">Rematch</button>
            <button class="btn btn-ghost" onclick="App.navigateTo('bots')">Roster</button>
          </div>
        </div>
      `;
      boardWrap.appendChild(overlay);

      document.getElementById('btn-bot-review')?.addEventListener('click', () => {
        App.navigateTo('analysis', { pgn: data.pgn, inviteCode: this.activeGame?.gameId });
      });
    }
  }
};
