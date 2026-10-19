/**
 * Play Page — PvP Matchmaking, Invite Link System, and Live Match View
 */
const PlayPage = {
  socket: null,
  currentGame: null,
  selectedTimeControl: 'rapid',
  selectedColor: 'random',
  clockInterval: null,
  whiteTimeRemaining: 0,
  blackTimeRemaining: 0,
  activeTurn: 'white',

  render(inviteCode = null) {
    const main = document.getElementById('main-content');
    clearInterval(this.clockInterval);

    if (inviteCode) {
      this.renderLiveMatch(inviteCode);
    } else {
      this.renderSetup();
    }
  },

  renderSetup() {
    const main = document.getElementById('main-content');
    const isLoggedIn = !!Auth.currentUser;

    main.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1 class="page-title">Play a Friend</h1>
          <p class="page-subtitle">Create a private match and share the invite link</p>
        </div>

        <div class="glass-panel play-setup">
          <h2>Create Match</h2>

          <div class="form-group">
            <label class="form-label">Time Control</label>
            <div class="time-controls">
              <button class="time-control-btn" data-tc="bullet">
                <span class="tc-name">Bullet</span>
                <span class="tc-detail">1 min</span>
              </button>
              <button class="time-control-btn" data-tc="blitz">
                <span class="tc-name">Blitz</span>
                <span class="tc-detail">3 min + 2s</span>
              </button>
              <button class="time-control-btn active" data-tc="rapid">
                <span class="tc-name">Rapid</span>
                <span class="tc-detail">10 min</span>
              </button>
              <button class="time-control-btn" data-tc="untimed">
                <span class="tc-name">Untimed</span>
                <span class="tc-detail">No clock</span>
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Play As</label>
            <div class="color-select">
              <button class="color-btn" data-color="white" title="White">♔</button>
              <button class="color-btn active" data-color="random" title="Random">☯</button>
              <button class="color-btn" data-color="black" title="Black">♚</button>
            </div>
          </div>

          <div id="create-match-actions">
            ${isLoggedIn ? `
              <button class="btn btn-primary btn-block btn-lg" id="btn-create-match">Create Invite Link</button>
            ` : `
              <button class="btn btn-primary btn-block btn-lg" onclick="Auth.showLoginModal()">Sign in to Play</button>
            `}
          </div>

          <div id="invite-output" class="hidden"></div>
        </div>
      </div>
    `;

    // Bind setup event listeners
    const tcBtns = main.querySelectorAll('.time-control-btn');
    tcBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tcBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedTimeControl = btn.dataset.tc;
      });
    });

    const colorBtns = main.querySelectorAll('.color-btn');
    colorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedColor = btn.dataset.color;
      });
    });

    document.getElementById('btn-create-match')?.addEventListener('click', () => this.createMatch());
  },

  async createMatch() {
    const btn = document.getElementById('btn-create-match');
    if (btn) btn.disabled = true;

    try {
      const res = await Api.post('/games/create', {
        game_type: 'pvp',
        time_control: this.selectedTimeControl,
        color_preference: this.selectedColor
      });

      const inviteCode = res.invite_code;
      const shareUrl = `${window.location.origin}/#play/${inviteCode}`;

      const output = document.getElementById('invite-output');
      output.classList.remove('hidden');
      output.innerHTML = `
        <div class="invite-link-box glass-panel mt-3">
          <div style="font-size:32px;margin-bottom:8px;">🔗</div>
          <h3 style="font-size:16px;margin-bottom:4px;">Match Created!</h3>
          <p class="text-muted" style="font-size:13px;">Send this link to your friend:</p>
          <input type="text" class="invite-url" id="invite-url-input" value="${shareUrl}" readonly onclick="this.select()">
          <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;">
            <button class="btn btn-primary btn-sm" id="btn-copy-link">Copy Link</button>
            <button class="btn btn-ghost btn-sm" id="btn-enter-room">Join Room Now</button>
          </div>
          <div class="waiting-text mt-2">Waiting for opponent to connect...</div>
        </div>
      `;

      document.getElementById('btn-copy-link')?.addEventListener('click', () => {
        const input = document.getElementById('invite-url-input');
        input.select();
        navigator.clipboard.writeText(shareUrl);
        const cBtn = document.getElementById('btn-copy-link');
        cBtn.textContent = 'Copied!';
        setTimeout(() => { if (cBtn) cBtn.textContent = 'Copy Link'; }, 2000);
      });

      document.getElementById('btn-enter-room')?.addEventListener('click', () => {
        App.navigateTo('play', inviteCode);
      });

    } catch (err) {
      alert('Failed to create match: ' + (err.message || 'Unknown error'));
      if (btn) btn.disabled = false;
    }
  },

  renderLiveMatch(inviteCode) {
    const main = document.getElementById('main-content');

    main.innerHTML = `
      <div class="page">
        <div class="board-layout">
          <div class="board-wrapper">
            <!-- Opponent bar -->
            <div class="player-bar mb-2" id="opponent-bar">
              <div class="player-info-badge">
                <span class="player-avatar" id="opp-avatar">?</span>
                <div>
                  <div class="player-name" id="opp-name">Waiting...</div>
                  <div class="player-rating" id="opp-rating"></div>
                </div>
              </div>
              <div class="captured-pieces" id="opp-captured"></div>
              <div class="player-clock" id="opp-clock">--:--</div>
            </div>

            <!-- Chess Board -->
            <div id="board-container"></div>

            <!-- Player bar -->
            <div class="player-bar mt-2" id="player-bar">
              <div class="player-info-badge">
                <span class="player-avatar" id="self-avatar">${Auth.currentUser ? AppConfig.AVATARS[(Auth.currentUser.avatar_id || 1) - 1] : '♔'}</span>
                <div>
                  <div class="player-name" id="self-name">${Auth.currentUser ? Auth.currentUser.username : 'You'}</div>
                  <div class="player-rating" id="self-rating">${Auth.currentUser ? Auth.currentUser.elo_rating : ''}</div>
                </div>
              </div>
              <div class="captured-pieces" id="self-captured"></div>
              <div class="player-clock" id="self-clock">--:--</div>
            </div>
          </div>

          <!-- Right Dock Panel -->
          <div class="dock-panel">
            <!-- Move List -->
            <div class="move-list-container glass-panel">
              <div class="move-list-header">
                <h3>Moves</h3>
                <span class="badge badge-accent" id="match-tc-badge">PVP</span>
              </div>
              <div class="move-list" id="move-list-grid"></div>
            </div>

            <!-- Controls -->
            <div class="game-controls glass-panel">
              <button class="btn btn-ghost btn-sm" id="btn-draw-offer">Offer Draw</button>
              <button class="btn btn-danger btn-sm" id="btn-resign">Resign</button>
              <button class="btn btn-ghost btn-sm" id="btn-flip-board">Flip</button>
            </div>

            <!-- Chat -->
            <div class="chat-panel glass-panel">
              <div class="chat-messages" id="chat-messages">
                <div class="chat-msg text-muted" style="font-size:12px;">Match chat room. Say hello!</div>
              </div>
              <form id="chat-form" class="chat-input-row">
                <input type="text" class="chat-input" id="chat-input" placeholder="Chat or react..." maxlength="150" autocomplete="off">
                <button type="submit" class="btn btn-primary btn-sm">Send</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    this.connectPvP(inviteCode);
  },

  connectPvP(inviteCode) {
    if (this.socket) {
      this.socket.disconnect();
    }

    const token = Api.token;
    if (!token) {
      Auth.showLoginModal();
      return;
    }

    this.socket = io(AppConfig.WS_BASE + '/pvp', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('[PvP] Connected to room:', inviteCode);
      this.socket.emit('join_game', { invite_code: inviteCode });
    });

    this.socket.on('game_state', (data) => {
      this.handleGameState(data, inviteCode);
    });

    this.socket.on('player_joined', (data) => {
      this.updatePlayerHeaders(data);
    });

    this.socket.on('move_made', (data) => {
      this.handleMoveMade(data);
    });

    this.socket.on('draw_offered', (data) => {
      if (confirm(`Opponent (${data.by}) offered a draw. Accept?`)) {
        this.socket.emit('accept_draw', { invite_code: inviteCode });
      }
    });

    this.socket.on('chat_message', (msg) => {
      const chatContainer = document.getElementById('chat-messages');
      if (chatContainer) {
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = `<span class="chat-msg-author">${msg.username}:</span> <span class="chat-msg-text">${this.escapeHtml(msg.message)}</span>`;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    });

    this.socket.on('game_over', (data) => {
      this.handleGameOver(data, inviteCode);
    });

    this.socket.on('error', (err) => {
      console.warn('[PvP] Error:', err.message);
    });

    // Chat form
    document.getElementById('chat-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('chat-input');
      const val = input.value.trim();
      if (val && this.socket) {
        this.socket.emit('chat_message', { invite_code: inviteCode, message: val });
        input.value = '';
      }
    });

    // Controls
    document.getElementById('btn-resign')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to resign this game?')) {
        this.socket.emit('resign', { invite_code: inviteCode });
      }
    });

    document.getElementById('btn-draw-offer')?.addEventListener('click', () => {
      this.socket.emit('offer_draw', { invite_code: inviteCode });
      alert('Draw offer sent to opponent');
    });

    document.getElementById('btn-flip-board')?.addEventListener('click', () => {
      ChessBoard.flip();
    });
  },

  handleGameState(data, inviteCode) {
    this.currentGame = data;
    const playerRole = data.role; // 'white', 'black', or 'spectator'
    const userIsWhite = playerRole === 'white';
    const orientation = playerRole === 'black' ? 'black' : 'white';

    // Initialize interactive board
    ChessBoard.init('board-container', {
      orientation,
      fen: data.fen,
      interactive: playerRole !== 'spectator' && !data.result,
      onMove: (move) => {
        this.socket.emit('move', { invite_code: inviteCode, move });
      }
    });

    this.whiteTimeRemaining = data.whiteTime;
    this.blackTimeRemaining = data.blackTime;
    this.activeTurn = data.turn;

    this.updateClocksDisplay();
    this.startClockTimer(data.timeControl);
    this.updatePlayerHeaders(data);
    this.renderMoveList(data.history || []);

    if (data.result) {
      this.handleGameOver({ result: data.result, winner: 'unknown', reason: 'Previous match ended' }, inviteCode);
    }
  },

  handleMoveMade(data) {
    ChessBoard.update(data.fen, {
      lastMove: { from: data.move.from, to: data.move.to },
      inCheck: data.isCheck,
      checkSquare: data.isCheck ? this.findKingSquare(data.fen, data.turn === 'white' ? 'w' : 'b') : null
    });

    this.whiteTimeRemaining = data.whiteTime;
    this.blackTimeRemaining = data.blackTime;
    this.activeTurn = data.turn;
    this.updateClocksDisplay();

    this.renderMoveList(data.history || []);
    this.updateCaptured(data.history || []);

    // Play move sounds
    if (data.isCheck) this.playSound('check');
    else if (data.move.captured) this.playSound('capture');
    else this.playSound('move');
  },

  updatePlayerHeaders(data) {
    const oppBar = document.getElementById('opponent-bar');
    const userRole = this.currentGame?.role || 'white';

    const oppUser = userRole === 'white' ? data.blackPlayer : data.whitePlayer;
    const selfUser = userRole === 'white' ? data.whitePlayer : data.blackPlayer;

    if (oppUser) {
      document.getElementById('opp-name').textContent = oppUser.username;
      document.getElementById('opp-rating').textContent = `${oppUser.elo_rating || 800} ELO`;
      document.getElementById('opp-avatar').textContent = AppConfig.AVATARS[(oppUser.avatar_id || 1) - 1] || '👤';
    } else {
      document.getElementById('opp-name').textContent = 'Waiting for opponent...';
    }

    if (selfUser) {
      document.getElementById('self-name').textContent = selfUser.username;
      document.getElementById('self-rating').textContent = `${selfUser.elo_rating || 800} ELO`;
      document.getElementById('self-avatar').textContent = AppConfig.AVATARS[(selfUser.avatar_id || 1) - 1] || '👤';
    }
  },

  startClockTimer(timeControl) {
    clearInterval(this.clockInterval);
    if (timeControl === 'untimed' || !this.whiteTimeRemaining) return;

    this.clockInterval = setInterval(() => {
      if (this.activeTurn === 'white' && this.whiteTimeRemaining > 0) {
        this.whiteTimeRemaining = Math.max(0, this.whiteTimeRemaining - 100);
      } else if (this.activeTurn === 'black' && this.blackTimeRemaining > 0) {
        this.blackTimeRemaining = Math.max(0, this.blackTimeRemaining - 100);
      }
      this.updateClocksDisplay();
    }, 100);
  },

  updateClocksDisplay() {
    const formatTime = (ms) => {
      if (ms === null || ms === undefined || ms < 0) return '--:--';
      const totalSec = Math.floor(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    };

    const userIsWhite = (this.currentGame?.role || 'white') === 'white';
    const selfClock = document.getElementById('self-clock');
    const oppClock = document.getElementById('opp-clock');

    if (selfClock && oppClock) {
      selfClock.textContent = formatTime(userIsWhite ? this.whiteTimeRemaining : this.blackTimeRemaining);
      oppClock.textContent = formatTime(userIsWhite ? this.blackTimeRemaining : this.whiteTimeRemaining);

      const isMyTurn = (userIsWhite && this.activeTurn === 'white') || (!userIsWhite && this.activeTurn === 'black');
      selfClock.classList.toggle('active', isMyTurn);
      oppClock.classList.toggle('active', !isMyTurn);
    }
  },

  renderMoveList(history) {
    const container = document.getElementById('move-list-grid');
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
    const userIsWhite = (this.currentGame?.role || 'white') === 'white';

    const selfCapturedEl = document.getElementById('self-captured');
    const oppCapturedEl = document.getElementById('opp-captured');

    const renderPieces = (pieces, diff) => {
      let str = pieces.map(p => AppConfig.PIECE_UNICODE[p] || p).join('');
      if (diff > 0) str += ` +${diff}`;
      return str;
    };

    if (selfCapturedEl && oppCapturedEl) {
      selfCapturedEl.textContent = renderPieces(userIsWhite ? whiteCaptured : blackCaptured, userIsWhite ? materialDiff : -materialDiff);
      oppCapturedEl.textContent = renderPieces(userIsWhite ? blackCaptured : whiteCaptured, userIsWhite ? -materialDiff : materialDiff);
    }
  },

  handleGameOver(data, inviteCode) {
    clearInterval(this.clockInterval);
    this.playSound('game_over');

    const isWinner = (data.winner === 'white' && this.currentGame?.role === 'white') ||
                     (data.winner === 'black' && this.currentGame?.role === 'black');
    const isDraw = data.winner === 'draw' || data.result === '1/2-1/2';

    let title = isDraw ? 'Draw Game' : (isWinner ? 'Victory!' : 'Defeat');
    let subtitle = `Result: ${data.result} (${data.reason || 'Concluded'})`;

    const boardWrap = document.querySelector('.board-wrapper');
    if (boardWrap) {
      const overlay = document.createElement('div');
      overlay.className = 'game-over-overlay';
      overlay.innerHTML = `
        <div class="game-over-content glass-panel">
          <div class="game-over-icon">${isDraw ? '🤝' : (isWinner ? '👑' : '💔')}</div>
          <div class="game-over-title">${title}</div>
          <div class="game-over-subtitle">${subtitle}</div>
          <div class="game-over-actions">
            <button class="btn btn-primary" id="btn-review-game">Game Review</button>
            <button class="btn btn-ghost" onclick="App.navigateTo('play')">New Match</button>
          </div>
        </div>
      `;
      boardWrap.appendChild(overlay);

      document.getElementById('btn-review-game')?.addEventListener('click', () => {
        App.navigateTo('analysis', { inviteCode, pgn: data.pgn });
      });
    }
  },

  findKingSquare(fen, color) {
    const board = ChessBoard.parseFEN(fen);
    const kingChar = color === 'w' ? 'K' : 'k';
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        if (board[r][f] === kingChar) {
          return AppConfig.FILES[f] + AppConfig.RANKS[7 - r];
        }
      }
    }
    return null;
  },

  playSound(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'move') {
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === 'capture') {
        osc.frequency.setValueAtTime(480, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'check') {
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'game_over') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch (e) {
      // AudioContext unavailable or blocked
    }
  },

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};
