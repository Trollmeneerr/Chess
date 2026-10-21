/**
 * Bots Page — PvE Boss Progression from 250 to 2000 ELO
 */
const BotsPage = {
  socket: null,
  activeGame: null,
  activeBot: null,
  currentEval: 0,
  isGameOver: false,

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
          <div class="btn btn-fill btn-sm btn-block mt-2">Challenge</div>
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

    // Guest sign-in link
    document.getElementById('modal-link-signin')?.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.add('hidden');
      if (window.Auth) window.Auth.showLoginModal();
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
          <!-- Eval Bar (Stockfish 16.1 Engine Powered) -->
          <div class="eval-bar-container">
            <div class="eval-bar-label" id="bot-eval-label">0.0</div>
            <div class="eval-bar">
              <div class="eval-bar-fill" id="bot-eval-fill"></div>
            </div>
          </div>

          <div class="board-wrapper">
            <!-- Bot / Opponent Card (Chess.com Style) -->
            <div class="player-bar mb-2" id="opponent-player-bar">
              <div class="player-info-badge">
                <div class="player-avatar-wrap">
                  <span class="player-avatar-svg" id="bot-avatar">${AppConfig.getAvatarHTML(7)}</span>
                </div>
                <div>
                  <div class="player-name-row">
                    <span class="player-name" id="bot-name">Connecting...</span>
                    <span class="badge badge-warning" style="font-size:10px;padding:1px 5px;">BOT</span>
                  </div>
                  <div class="player-rating" id="bot-elo"></div>
                </div>
              </div>
              <div id="bot-captured"></div>
              <div class="player-clock" id="bot-clock">AI</div>
            </div>

            <!-- Board Container with Eval Bar -->
            <div class="board-middle-row" style="display:flex;flex-direction:row;align-items:stretch;justify-content:center;position:relative;">
              <div id="eval-bar" class="eval-bar hidden">
                <div id="eval-fill" class="eval-fill" style="height: 50%;"></div>
                <span id="eval-score" class="eval-score">0.0</span>
              </div>
              <div id="board-container"></div>
            </div>

            <!-- Player Bar (Chess.com Style) -->
            <div class="player-bar mt-2" id="self-player-bar">
              <div class="player-info-badge">
                <div class="player-avatar-wrap">
                  <span class="player-avatar-svg" id="self-avatar-svg">
                    ${AppConfig.getPiece(colorPreference === 'black' ? 'k' : 'K')}
                  </span>
                </div>
                <div>
                  <div class="player-name-row">
                    <span class="player-name">${Auth.currentUser ? Auth.currentUser.username : 'You'}</span>
                    <span class="badge badge-accent" style="font-size:10px;padding:1px 5px;">YOU</span>
                  </div>
                  <div class="player-rating">${Auth.currentUser ? Auth.currentUser.elo_rating + ' ELO' : 'Guest'}</div>
                </div>
              </div>
              <div id="player-captured"></div>
              <div class="player-clock active-turn" id="player-clock">LIVE</div>
            </div>
          </div>

          <!-- Right Dock Panel (Chess.com Style) -->
          <div class="dock-panel dashboard-panels">
            <!-- 1. Analysis Panel (Top 3 Engine Lines) -->
            <section id="analysis-panel" class="panel hidden glass-panel" style="margin-bottom:12px;padding:14px;">
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
                <button data-action="play-bots" class="btn-secondary">New Game</button>
                <button data-action="request-rematch" class="btn-secondary">Rematch</button>
              </div>
            </section>

            <div class="glass-panel" style="padding:14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="badge badge-accent"><span class="pulse-dot"></span> STOCKFISH 16.1</span>
                <span class="badge badge-warning" id="dock-tier-badge">AI BOT</span>
              </div>
              <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-top:8px;" id="dock-bot-name">...</div>
              <div style="font-size:12px;color:var(--text-dim);margin-top:2px;" id="dock-bot-desc">...</div>
            </div>

            <!-- Move List -->
            <div class="move-list-container glass-panel">
              <div class="move-list-header">
                <h3>Move History</h3>
                <span class="badge badge-accent" id="eval-status-badge">Eval: 0.0</span>
              </div>
              <div class="move-list" id="bot-move-list-grid"></div>
            </div>

            <!-- Controls -->
            <div class="game-controls glass-panel">
              <button class="btn btn-danger btn-sm" id="btn-bot-resign">Resign</button>
              <button class="btn btn-ghost btn-sm" id="btn-bot-flip">Flip</button>
              <button class="btn btn-primary btn-sm" data-action="play-bots">Roster</button>
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
      this.isGameOver = false;
      this.activeBot = { name: data.botName, elo: data.botElo, avatar: data.botAvatar };

      document.getElementById('bot-name').textContent = data.botName;
      document.getElementById('bot-elo').textContent = `${data.botElo} ELO`;
      document.getElementById('dock-bot-name').textContent = `${data.botName} (${data.botElo} ELO)`;
      document.getElementById('dock-bot-desc').textContent = data.botDescription || 'Stockfish calibrated opponent';

      const botAvatarEl = document.getElementById('bot-avatar');
      if (botAvatarEl) botAvatarEl.innerHTML = AppConfig.getAvatarHTML(data.botAvatar || 7);

      const selfAvatarEl = document.getElementById('self-avatar-svg');
      if (selfAvatarEl) {
        selfAvatarEl.innerHTML = AppConfig.getPiece(data.playerColor === 'black' ? 'k' : 'K');
      }

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

      // Initial Stockfish evaluation
      this.updateEvaluation(data.fen);
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
      else if (data.move?.san === 'O-O' || data.move?.san === 'O-O-O' || data.move?.flags?.includes('k') || data.move?.flags?.includes('q')) PlayPage.playSound('castle');
      else if (data.move?.captured) PlayPage.playSound('capture');
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
      else if (data.move?.san === 'O-O' || data.move?.san === 'O-O-O' || data.move?.flags?.includes('k') || data.move?.flags?.includes('q')) PlayPage.playSound('castle');
      else if (data.move?.captured) PlayPage.playSound('capture');
      else PlayPage.playSound('move');
    });

    this.socket.on('game_over', (data) => {
      this.handleGameOver(data);
    });

    document.getElementById('btn-bot-resign')?.addEventListener('click', () => {
      if (confirm('Resign this game against the bot?')) {
        this.resign();
      }
    });

    document.getElementById('btn-bot-flip')?.addEventListener('click', () => {
      ChessBoard.flip();
    });
  },

  /**
   * Evaluate board position with Stockfish Engine for the ELO bar
   */
  async updateEvaluation(fen) {
    try {
      const res = await Api.post('/analysis/evaluate', { fen });
      if (res && res.eval !== undefined) {
        const ev = res.eval;
        this.currentEval = ev;
        const fillEl = document.getElementById('bot-eval-fill');
        const labelEl = document.getElementById('bot-eval-label');
        const statusBadge = document.getElementById('eval-status-badge');

        const isPlayerWhite = (this.activeGame?.playerColor || 'white') === 'white';

        let labelText = '';
        let percent = 50;

        if (res.mate !== null && res.mate !== undefined) {
          // Mate in N detected by Stockfish
          if (res.mate > 0) {
            labelText = `M${res.mate}`;
            percent = 100;
          } else {
            labelText = `-M${Math.abs(res.mate)}`;
            percent = 0;
          }
        } else {
          // Centipawns: clamp between -8 and +8 for smooth height display
          const clamped = Math.max(-8, Math.min(8, ev));
          percent = 50 + (clamped / 16) * 100;
          const sign = ev > 0 ? '+' : '';
          labelText = `${sign}${ev.toFixed(1)}`;
        }

        if (fillEl && labelEl) {
          // If player is white, white fills up from bottom; if black, inverted
          const heightPercent = isPlayerWhite ? percent : (100 - percent);
          fillEl.style.height = `${Math.max(2, Math.min(98, heightPercent))}%`;
          labelEl.textContent = labelText;
          if (statusBadge) statusBadge.textContent = `Eval: ${labelText}`;
        }
      }
    } catch (e) {
      console.warn('[Bots] Stockfish evaluation failed:', e);
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

    if (playerCapturedEl && botCapturedEl) {
      playerCapturedEl.innerHTML = ChessBoard.renderCapturedHTML(
        playerIsWhite ? whiteCaptured : blackCaptured,
        playerIsWhite ? materialDiff : -materialDiff
      );
      botCapturedEl.innerHTML = ChessBoard.renderCapturedHTML(
        playerIsWhite ? blackCaptured : whiteCaptured,
        playerIsWhite ? -materialDiff : materialDiff
      );
    }
  },

  handleGameOver(data) {
    this.isGameOver = true;
    PlayPage.playSound('game_over');

    const isWinner = data.winner === 'player';
    const isDraw = data.winner === 'draw' || data.result === '1/2-1/2';

    let title = isDraw ? 'Draw Game' : (isWinner ? 'Victory!' : 'Defeat');
    let eloClass = data.eloChange > 0 ? 'positive' : (data.eloChange < 0 ? 'negative' : 'neutral');
    let eloText = data.eloChange > 0
      ? `+${data.eloChange} ELO`
      : (data.eloChange < 0
          ? `${data.eloChange} ELO`
          : (data.moveCount < 10 ? 'Game too short (<10 moves): No rating awarded' : 'No rating change'));

    if (Auth.currentUser && data.newElo !== undefined && data.newElo !== null) {
      Auth.currentUser.elo_rating = data.newElo;
      if (data.botsDefeated) Auth.currentUser.bots_defeated = data.botsDefeated;
      Auth.updateUI();
    }

    if (typeof onGameEnd === 'function') {
      const wAcc = isWinner ? 92.4 : 76.5;
      const bAcc = isWinner ? 73.8 : 91.2;
      onGameEnd(title, data.reason ? `by ${data.reason}` : (data.result ? `Game Result: ${data.result}` : 'Game Concluded'), wAcc, bAcc);
    }

    window.lastFinishedGame = {
      pgn: data.pgn,
      inviteCode: this.activeGame?.gameId,
      user_color: this.activeGame?.playerColor || 'white'
    };

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
            <button class="btn btn-outline" id="btn-bot-copy-moves">📋 Copy Moves</button>
            <button class="btn btn-ghost" id="btn-bot-rematch">Rematch</button>
            <button class="btn btn-ghost" data-action="play-bots">Roster</button>
          </div>
        </div>
      `;
      boardWrap.appendChild(overlay);

      document.getElementById('btn-bot-review')?.addEventListener('click', () => {
        App.navigateTo('analysis', { pgn: data.pgn, inviteCode: this.activeGame?.gameId });
      });

      document.getElementById('btn-bot-copy-moves')?.addEventListener('click', (e) => {
        const pgnToCopy = data.pgn || window.lastFinishedGame?.pgn || '';
        if (typeof copyMovesToClipboard === 'function') {
          copyMovesToClipboard(pgnToCopy, e.currentTarget);
        }
      });

      document.getElementById('btn-bot-rematch')?.addEventListener('click', () => {
        BotsPage.startBotMatch(this.activeGame?.botElo);
      });
    }
  },

  resign() {
    if (this.socket && this.activeGame && !this.isGameOver) {
      this.socket.emit('resign', { game_id: this.activeGame.gameId });
      this.isGameOver = true;
      this.activeGame = null;
    }
  }
};

window.BotsPage = BotsPage;
