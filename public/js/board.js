/**
 * Chess Board Renderer
 * Interactive board with drag-and-drop, click-to-move, highlights, SVG vector pieces,
 * and interactive arrow / highlight drawing (Chess.com / Lichess style)
 */
const ChessBoard = {
  containerId: null,
  boardEl: null,
  fen: AppConfig.INITIAL_FEN,
  orientation: 'white', // 'white' or 'black'
  playerColor: 'white', // 'white' or 'black'
  interactive: true,
  allowPremove: true,
  premove: null, // { from, to, promotion }
  selectedSquare: null,
  legalMoves: [],
  lastMove: null,
  inCheck: false,
  checkSquare: null,
  highlightedSquares: new Map(), // square -> 'green' | 'red' | 'blue' | 'yellow'
  arrows: [], // array of { from, to }
  rightDrag: null, // { from, startX, startY }
  boundDocEvents: false,
  onMove: null, // callback(move) => { from, to, promotion }
  dragging: null,
  dragPieceEl: null,

  /**
   * Initialize the board in a container element
   */
  init(containerId, options = {}) {
    this.containerId = containerId;
    this.playerColor = options.playerColor || options.orientation || 'white';
    this.orientation = options.orientation || 'white';
    this.interactive = options.interactive !== false;
    this.allowPremove = options.allowPremove !== false;
    this.showToolbar = options.showToolbar !== false;
    this.onMove = options.onMove || null;
    this.fen = options.fen || AppConfig.INITIAL_FEN;
    this.premove = null;
    this.arrows = [];
    this.highlightedSquares.clear();
    this.render();
    this.bindEvents();
    this.setupResizeObserver();
    this.applySavedBoardSize();
  },

  /**
   * Get preferred board size from localStorage or viewport
   */
  getBoardSize() {
    const saved = localStorage.getItem('chess_board_size');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 320 && parsed <= 960) return parsed;
    }
    const maxViewport = Math.min(window.innerWidth - 380, window.innerHeight * 0.76);
    return Math.max(340, Math.min(680, Math.round(maxViewport)));
  },

  /**
   * Set board size dynamically and persist to localStorage
   */
  setBoardSize(size) {
    const minSize = 320;
    const maxAvailable = Math.min(960, window.innerWidth - 32, window.innerHeight * 0.88);
    const clamped = Math.round(Math.max(minSize, Math.min(maxAvailable, size)));

    localStorage.setItem('chess_board_size', clamped);

    const boardEl = this.boardEl || document.getElementById('chess-board-grid');
    if (boardEl) {
      boardEl.style.setProperty('--board-custom-size', `${clamped}px`);
      boardEl.style.width = `${clamped}px`;
      boardEl.style.height = `${clamped}px`;
    }

    const slider = document.getElementById('board-scale-slider');
    if (slider) slider.value = clamped;

    this.updateSquareSize();
  },

  applySavedBoardSize() {
    const size = this.getBoardSize();
    const boardEl = this.boardEl || document.getElementById('chess-board-grid');
    if (boardEl && size) {
      boardEl.style.setProperty('--board-custom-size', `${size}px`);
      boardEl.style.width = `${size}px`;
      boardEl.style.height = `${size}px`;
    }
    const slider = document.getElementById('board-scale-slider');
    if (slider && size) slider.value = size;
  },

  getScaleToolbarHTML() {
    const currentSize = this.getBoardSize();
    return `
      <div class="board-controls-toolbar" id="board-controls-toolbar">
        <div class="board-scale-slider-wrap">
          <label>Board</label>
          <input type="range" class="board-scale-slider" id="board-scale-slider" min="340" max="860" step="10" value="${currentSize}" title="Scale Board Size">
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button type="button" class="btn btn-outline btn-sm" id="btn-scale-preset-sm" style="padding:4px 8px;font-size:11px;">Small</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-scale-preset-md" style="padding:4px 8px;font-size:11px;">Medium</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-scale-preset-lg" style="padding:4px 8px;font-size:11px;">Large</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-board-flip-tb" title="Flip Board" style="padding:4px 8px;font-size:12px;">⇄ Flip</button>
        </div>
      </div>
    `;
  },

  /**
   * Check if it is currently this player's active turn
   */
  isMyTurn() {
    const turn = this.getTurn();
    return (this.playerColor === 'white' && turn === 'w') || (this.playerColor === 'black' && turn === 'b');
  },

  /**
   * Check if a piece belongs to the player
   */
  isPlayerPiece(piece) {
    if (!piece) return false;
    return this.playerColor === 'white' ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
  },

  /**
   * Render the board from FEN
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const board = this.parseFEN(this.fen);
    let html = '<div class="chess-board" id="chess-board-grid">';

    const ranks = this.orientation === 'white'
      ? [7, 6, 5, 4, 3, 2, 1, 0]
      : [0, 1, 2, 3, 4, 5, 6, 7];
    const files = this.orientation === 'white'
      ? [0, 1, 2, 3, 4, 5, 6, 7]
      : [7, 6, 5, 4, 3, 2, 1, 0];

    for (const rank of ranks) {
      for (const file of files) {
        const sq = AppConfig.FILES[file] + AppConfig.RANKS[7 - rank];
        const isLight = (rank + file) % 2 === 1;
        const piece = board[rank][file];

        let classes = `square ${isLight ? 'square-light' : 'square-dark'}`;

        // Last move highlight
        if (this.lastMove) {
          if (sq === this.lastMove.from) classes += ' last-move-from';
          if (sq === this.lastMove.to) classes += ' last-move-to';
        }

        // Selected
        if (sq === this.selectedSquare) classes += ' selected';

        // Premove highlights
        if (this.premove) {
          if (sq === this.premove.from) classes += ' premove-from';
          if (sq === this.premove.to) classes += ' premove-to';
        }

        // Legal moves
        if (this.legalMoves.includes(sq)) {
          classes += piece ? ' legal-capture' : ' legal-move';
        }

        // Check
        if (this.checkSquare === sq) classes += ' in-check';

        // Custom right-click square highlights
        if (this.highlightedSquares.has(sq)) {
          classes += ` highlight-${this.highlightedSquares.get(sq)}`;
        }

        // In-square coordinates (Chess.com style)
        let coordHTML = '';
        if (file === files[0]) {
          coordHTML += `<span class="coord-in-square coord-rank">${AppConfig.RANKS[7 - rank]}</span>`;
        }
        if (rank === ranks[7]) {
          coordHTML += `<span class="coord-in-square coord-file">${AppConfig.FILES[file]}</span>`;
        }

        html += `<div class="${classes}" data-square="${sq}" data-rank="${rank}" data-file="${file}">`;
        html += coordHTML;
        if (piece) {
          html += `<span class="piece" data-piece="${piece}">${AppConfig.getPiece(piece)}</span>`;
        }
        html += '</div>';
      }
    }

    // Arrows SVG overlay
    html += `
      <svg class="board-arrows-layer" id="board-arrows-svg" viewBox="0 0 8 8" preserveAspectRatio="none">
        <defs>
          <marker id="arrowhead-green" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="rgba(34, 197, 94, 0.9)" />
          </marker>
          <marker id="arrowhead-cyan" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="rgba(56, 189, 248, 0.9)" />
          </marker>
        </defs>
        <g id="arrows-list"></g>
        <g id="arrow-preview"></g>
      </svg>
    `;

    html += '</div>'; // End chess-board

    // Outer wrapper with corner resize handle and toolbar
    const toolbarHTML = this.showToolbar ? this.getScaleToolbarHTML() : '';
    const outerHTML = `
      <div class="chess-board-outer" id="chess-board-outer">
        ${html}
        <div class="board-resize-handle" id="board-resize-handle" title="Drag corner to scale board">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 14 20 20 14 20"></polyline><line x1="20" y1="20" x2="13" y2="13"></line></svg>
        </div>
      </div>
      ${toolbarHTML}
    `;

    container.innerHTML = outerHTML;
    this.boardEl = document.getElementById('chess-board-grid');
    this.applySavedBoardSize();
    this.renderArrows();
    this.updateSquareSize();
  },

  /**
   * Update the board with a new FEN. Automatically executes queued premove if legal!
   */
  update(fen, options = {}) {
    this.fen = fen;
    if (options.lastMove) this.lastMove = options.lastMove;
    if (options.inCheck !== undefined) this.inCheck = options.inCheck;
    if (options.checkSquare !== undefined) this.checkSquare = options.checkSquare;
    this.selectedSquare = null;
    this.legalMoves = [];
    this.clearAnnotations();

    // Check if an existing premove can now execute
    if (this.premove && this.isMyTurn()) {
      const pm = this.premove;
      this.premove = null;

      let isLegal = false;
      if (typeof window.Chess === 'function') {
        try {
          const testChess = new window.Chess(fen);
          const executed = testChess.move({ from: pm.from, to: pm.to, promotion: pm.promotion || 'q' });
          if (executed) isLegal = true;
        } catch (e) {
          isLegal = false;
        }
      } else {
        isLegal = true;
      }

      this.render();
      this.bindEvents();

      if (isLegal && this.onMove) {
        // Instantaneous premove dispatch (0ms delay)
        setTimeout(() => {
          if (this.onMove) this.onMove(pm);
        }, 10);
      }
      return;
    }

    this.render();
    this.bindEvents();
  },

  /**
   * Cancel any pending premove
   */
  clearPremove() {
    this.premove = null;
    this.boardEl?.querySelectorAll('.premove-from, .premove-to').forEach(el => {
      el.classList.remove('premove-from', 'premove-to');
    });
  },

  /**
   * Set board orientation
   */
  flip() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    this.render();
    this.bindEvents();
  },

  setOrientation(color) {
    this.orientation = color;
    this.render();
    this.bindEvents();
  },

  /**
   * Parse FEN string to 2D board array
   */
  parseFEN(fen) {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    const position = fen.split(' ')[0];
    const ranks = position.split('/');

    for (let r = 0; r < 8; r++) {
      let file = 0;
      for (const char of ranks[r]) {
        if (char >= '1' && char <= '8') {
          file += parseInt(char);
        } else {
          board[7 - r][file] = char;
          file++;
        }
      }
    }
    return board;
  },

  /**
   * Get the turn from FEN ('w' or 'b')
   */
  getTurn() {
    return this.fen.split(' ')[1] || 'w';
  },

  /**
   * Update CSS variable --sq-size to exactly match the board's square dimensions in pixels
   */
  updateSquareSize() {
    const boardEl = this.boardEl || (this.containerId && document.getElementById(this.containerId)?.querySelector('.chess-board'));
    if (!boardEl) return;
    const rect = boardEl.getBoundingClientRect();
    if (rect.width > 0) {
      const sqSize = rect.width / 8;
      this.squareSize = sqSize;
      boardEl.style.setProperty('--sq-size', `${sqSize}px`);
    }
  },

  /**
   * Setup ResizeObserver and window listener to dynamically keep piece font size matching square size
   */
  setupResizeObserver() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    const boardEl = this.boardEl || (this.containerId && document.getElementById(this.containerId)?.querySelector('.chess-board'));
    if (boardEl && window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        this.updateSquareSize();
      });
      this._resizeObserver.observe(boardEl);
    }
    if (!this._windowResizeBound) {
      this._windowResizeBound = true;
      window.addEventListener('resize', () => this.updateSquareSize());
    }
  },

  /**
   * Get piece at a square from current FEN
   */
  getPieceAt(square) {
    const board = this.parseFEN(this.fen);
    const file = AppConfig.FILES.indexOf(square[0]);
    const rank = parseInt(square[1]) - 1;
    return board[rank][file];
  },

  /**
   * Bind click, drag, and arrow drawing events
   */
  bindEvents() {
    if (!this.interactive || !this.boardEl) return;

    const squares = this.boardEl.querySelectorAll('.square');
    squares.forEach(sq => {
      sq.addEventListener('mousedown', (e) => this.handleMouseDown(e, sq));
      sq.addEventListener('click', (e) => this.handleClick(e, sq));
    });

    // Board corner drag resize handle
    const handle = document.getElementById('board-resize-handle');
    if (handle && !handle._resizeBound) {
      handle._resizeBound = true;
      const onResizeStart = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX || (e.touches && e.touches[0]?.clientX);
        const startWidth = this.boardEl ? this.boardEl.clientWidth : this.getBoardSize();
        handle.classList.add('active');

        const onResizeMove = (moveEv) => {
          const clientX = moveEv.clientX || (moveEv.touches && moveEv.touches[0]?.clientX);
          if (clientX === undefined) return;
          const delta = (clientX - startX) * 1.5;
          this.setBoardSize(startWidth + delta);
        };

        const onResizeEnd = () => {
          handle.classList.remove('active');
          document.removeEventListener('mousemove', onResizeMove);
          document.removeEventListener('mouseup', onResizeEnd);
          document.removeEventListener('touchmove', onResizeMove);
          document.removeEventListener('touchend', onResizeEnd);
        };

        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeEnd);
        document.addEventListener('touchmove', onResizeMove);
        document.addEventListener('touchend', onResizeEnd);
      };

      handle.addEventListener('mousedown', onResizeStart);
      handle.addEventListener('touchstart', onResizeStart, { passive: false });
    }

    // Board scale slider and presets
    const slider = document.getElementById('board-scale-slider');
    if (slider && !slider._sliderBound) {
      slider._sliderBound = true;
      slider.addEventListener('input', (e) => {
        this.setBoardSize(parseInt(e.target.value, 10));
      });
    }

    const smBtn = document.getElementById('btn-scale-preset-sm');
    if (smBtn && !smBtn._bound) {
      smBtn._bound = true;
      smBtn.addEventListener('click', () => this.setBoardSize(440));
    }

    const mdBtn = document.getElementById('btn-scale-preset-md');
    if (mdBtn && !mdBtn._bound) {
      mdBtn._bound = true;
      mdBtn.addEventListener('click', () => this.setBoardSize(620));
    }

    const lgBtn = document.getElementById('btn-scale-preset-lg');
    if (lgBtn && !lgBtn._bound) {
      lgBtn._bound = true;
      lgBtn.addEventListener('click', () => this.setBoardSize(780));
    }

    const flipTbBtn = document.getElementById('btn-board-flip-tb');
    if (flipTbBtn && !flipTbBtn._bound) {
      flipTbBtn._bound = true;
      flipTbBtn.addEventListener('click', () => this.flip());
    }

    // Prevent context menu anywhere on board grid
    this.boardEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Global document listeners (bound only once)
    if (!this.boundDocEvents) {
      this.boundDocEvents = true;
      document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
      document.addEventListener('contextmenu', (e) => {
        if (this.rightDrag) e.preventDefault();
      });
    }
  },

  handleClick(e, squareEl) {
    if (this.dragging?.hasMoved) return; // Was a piece drag, not a click

    const square = squareEl.dataset.square;
    const piece = this.getPieceAt(square);
    const myTurn = this.isMyTurn();

    if (myTurn) {
      const turn = this.getTurn();
      if (this.selectedSquare) {
        if (this.legalMoves.includes(square)) {
          // Make move
          this.tryMove(this.selectedSquare, square);
        } else if (piece && this.isOwnPiece(piece, turn)) {
          // Select different piece
          this.selectSquare(square);
        } else {
          // Deselect
          this.selectedSquare = null;
          this.legalMoves = [];
          this.render();
          this.bindEvents();
        }
      } else if (piece && this.isOwnPiece(piece, turn)) {
        this.selectSquare(square);
      }
    } else if (this.allowPremove) {
      // Premove interaction when waiting for opponent
      if (this.selectedSquare) {
        if (square !== this.selectedSquare) {
          const fromPiece = this.getPieceAt(this.selectedSquare);
          const isPawn = fromPiece?.toLowerCase() === 'p';
          const targetRank = parseInt(square[1]);
          const isPromo = isPawn && (targetRank === 8 || targetRank === 1);

          this.premove = {
            from: this.selectedSquare,
            to: square,
            promotion: isPromo ? 'q' : undefined
          };
          this.selectedSquare = null;
          this.legalMoves = [];
          this.render();
          this.bindEvents();
        } else {
          this.clearPremove();
          this.selectedSquare = null;
          this.legalMoves = [];
          this.render();
          this.bindEvents();
        }
      } else if (piece && this.isPlayerPiece(piece)) {
        this.selectedSquare = square;
        this.legalMoves = this.getBasicLegalMoves(square, true);
        this.render();
        this.bindEvents();
      }
    }
  },

  handleMouseDown(e, squareEl) {
    const square = squareEl.dataset.square;

    // Right-click: Start arrow drawing or cancel premove
    if (e.button === 2) {
      e.preventDefault();
      if (this.premove) {
        this.clearPremove();
        this.render();
        this.bindEvents();
      }
      this.rightDrag = {
        from: square,
        startX: e.clientX,
        startY: e.clientY
      };
      return;
    }

    // Left-click: Clear annotations & start drag
    if (e.button === 0) {
      this.clearAnnotations();

      const piece = this.getPieceAt(square);
      const myTurn = this.isMyTurn();
      const canDrag = myTurn
        ? (piece && this.isOwnPiece(piece, this.getTurn()))
        : (this.allowPremove && piece && this.isPlayerPiece(piece));

      if (canDrag) {
        this.dragging = {
          from: square,
          piece,
          startX: e.clientX,
          startY: e.clientY,
          hasMoved: false
        };
      }
    }
  },

  handleMouseMove(e) {
    // Arrow preview during right-click drag
    if (this.rightDrag) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.square');
      if (el && el.dataset.square !== this.rightDrag.from) {
        this.renderArrowPreview(this.rightDrag.from, el.dataset.square);
      } else {
        this.clearArrowPreview();
      }
    }

    // Piece drag handling
    if (this.dragging) {
      this.handleDrag(e);
    }
  },

  handleMouseUp(e) {
    // Right-click release: Finalize arrow or square highlight
    if (e.button === 2 && this.rightDrag) {
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.square');
      const targetSq = el?.dataset.square || this.rightDrag.from;
      this.clearArrowPreview();

      if (targetSq === this.rightDrag.from) {
        this.toggleSquareHighlight(targetSq);
      } else {
        this.toggleArrow(this.rightDrag.from, targetSq);
      }
      this.rightDrag = null;
      return;
    }

    // Left-click release: Drop dragged piece
    if (this.dragging) {
      this.handleDrop(e);
    }
  },

  handleDrag(e) {
    if (!this.dragging) return;

    const dx = Math.abs(e.clientX - this.dragging.startX);
    const dy = Math.abs(e.clientY - this.dragging.startY);

    if (!this.dragging.hasMoved && (dx > 5 || dy > 5)) {
      this.dragging.hasMoved = true;
      // Create floating piece
      this.dragPieceEl = document.createElement('div');
      this.dragPieceEl.className = 'piece dragging';
      this.dragPieceEl.setAttribute('data-piece', this.dragging.piece);
      this.dragPieceEl.innerHTML = AppConfig.getPiece(this.dragging.piece);

      const sqSize = this.squareSize || (this.boardEl ? this.boardEl.clientWidth / 8 : 72);
      this.dragPieceEl.style.width = sqSize + 'px';
      this.dragPieceEl.style.height = sqSize + 'px';

      document.body.appendChild(this.dragPieceEl);

      // Select source square to show legal move destinations
      this.selectedSquare = this.dragging.from;
      this.legalMoves = this.getBasicLegalMoves(this.dragging.from, !this.isMyTurn());
      this.render();
      this.bindEvents();
    }

    if (this.dragPieceEl) {
      this.dragPieceEl.style.left = e.clientX + 'px';
      this.dragPieceEl.style.top = e.clientY + 'px';
    }
  },

  handleDrop(e) {
    if (!this.dragging) return;

    if (this.dragPieceEl) {
      this.dragPieceEl.remove();
      this.dragPieceEl = null;
    }

    if (this.dragging.hasMoved) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const squareEl = el?.closest('.square');
      if (squareEl) {
        const targetSquare = squareEl.dataset.square;
        if (this.isMyTurn()) {
          if (this.legalMoves.includes(targetSquare)) {
            this.tryMove(this.dragging.from, targetSquare);
          } else {
            this.selectedSquare = null;
            this.legalMoves = [];
            this.render();
            this.bindEvents();
          }
        } else if (this.allowPremove && targetSquare !== this.dragging.from) {
          // Set premove from drag drop
          const piece = this.dragging.piece;
          const isPawn = piece?.toLowerCase() === 'p';
          const targetRank = parseInt(targetSquare[1]);
          const isPromo = isPawn && (targetRank === 8 || targetRank === 1);

          this.premove = {
            from: this.dragging.from,
            to: targetSquare,
            promotion: isPromo ? 'q' : undefined
          };
          this.selectedSquare = null;
          this.legalMoves = [];
          this.render();
          this.bindEvents();
        }
      }
    }

    this.dragging = null;
  },

  selectSquare(square, isPremove = false) {
    this.selectedSquare = square;
    this.legalMoves = this.getBasicLegalMoves(square, isPremove);
    this.render();
    this.bindEvents();
  },

  /**
   * Arrow and annotation methods (Chess.com / Lichess style)
   */
  getSquareCenter(square) {
    if (!square || square.length < 2) return null;
    const file = AppConfig.FILES.indexOf(square[0]);
    const rank = parseInt(square[1]) - 1;
    if (file < 0 || rank < 0 || rank > 7) return null;
    if (this.orientation === 'white') {
      return { x: file + 0.5, y: (7 - rank) + 0.5 };
    } else {
      return { x: (7 - file) + 0.5, y: rank + 0.5 };
    }
  },

  renderArrows() {
    const listEl = document.getElementById('arrows-list');
    if (!listEl) return;
    let html = '';
    for (const arrow of this.arrows) {
      const p1 = this.getSquareCenter(arrow.from);
      const p2 = this.getSquareCenter(arrow.to);
      if (!p1 || !p2) continue;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) continue;
      const ux = dx / dist;
      const uy = dy / dist;
      const startX = p1.x + ux * 0.25;
      const startY = p1.y + uy * 0.25;
      const endX = p2.x - ux * 0.35;
      const endY = p2.y - uy * 0.35;
      html += `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="rgba(34, 197, 94, 0.88)" stroke-width="0.22" stroke-linecap="round" marker-end="url(#arrowhead-green)"/>`;
    }
    listEl.innerHTML = html;
  },

  renderArrowPreview(fromSq, toSq) {
    const previewEl = document.getElementById('arrow-preview');
    if (!previewEl) return;
    const p1 = this.getSquareCenter(fromSq);
    const p2 = this.getSquareCenter(toSq);
    if (!p1 || !p2) return;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) {
      previewEl.innerHTML = '';
      return;
    }
    const ux = dx / dist;
    const uy = dy / dist;
    const startX = p1.x + ux * 0.25;
    const startY = p1.y + uy * 0.25;
    const endX = p2.x - ux * 0.35;
    const endY = p2.y - uy * 0.35;
    previewEl.innerHTML = `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="rgba(56, 189, 248, 0.88)" stroke-width="0.22" stroke-linecap="round" stroke-dasharray="0.3 0.15" marker-end="url(#arrowhead-cyan)"/>`;
  },

  clearArrowPreview() {
    const previewEl = document.getElementById('arrow-preview');
    if (previewEl) previewEl.innerHTML = '';
  },

  toggleArrow(from, to) {
    const idx = this.arrows.findIndex(a => a.from === from && a.to === to);
    if (idx >= 0) {
      this.arrows.splice(idx, 1);
    } else {
      this.arrows.push({ from, to });
    }
    this.renderArrows();
  },

  toggleSquareHighlight(square) {
    const sqEl = this.boardEl?.querySelector(`.square[data-square="${square}"]`);
    if (this.highlightedSquares.has(square)) {
      this.highlightedSquares.delete(square);
      sqEl?.classList.remove('highlight-green');
    } else {
      this.highlightedSquares.set(square, 'green');
      sqEl?.classList.add('highlight-green');
    }
  },

  clearAnnotations() {
    if (this.arrows.length > 0) {
      this.arrows = [];
      this.renderArrows();
    }
    if (this.highlightedSquares.size > 0) {
      this.highlightedSquares.clear();
      this.boardEl?.querySelectorAll('.highlight-green').forEach(el => el.classList.remove('highlight-green'));
    }
  },

  /**
   * Basic legal move computation (client-side preview, server validates)
   */
  getBasicLegalMoves(fromSquare, isPremove = false) {
    if (typeof window.Chess === 'function') {
      try {
        let fenToUse = this.fen;
        if (isPremove) {
          const parts = this.fen.split(' ');
          parts[1] = this.playerColor === 'white' ? 'w' : 'b';
          fenToUse = parts.join(' ');
        }
        const c = new window.Chess(fenToUse);
        const moves = c.moves({ square: fromSquare, verbose: true });
        return moves.map(m => m.to);
      } catch (err) {}
    }

    const piece = this.getPieceAt(fromSquare);
    if (!piece) return [];

    const board = this.parseFEN(this.fen);
    const file = AppConfig.FILES.indexOf(fromSquare[0]);
    const rank = parseInt(fromSquare[1]) - 1;
    const isWhite = piece === piece.toUpperCase();
    const moves = [];

    const addMove = (r, f) => {
      if (r >= 0 && r < 8 && f >= 0 && f < 8) {
        const target = board[r][f];
        if (!target || (isWhite !== (target === target.toUpperCase()))) {
          moves.push(AppConfig.FILES[f] + (r + 1));
        }
      }
    };

    const addSlide = (dr, df) => {
      let r = rank + dr, f = file + df;
      while (r >= 0 && r < 8 && f >= 0 && f < 8) {
        const target = board[r][f];
        if (!target) {
          moves.push(AppConfig.FILES[f] + (r + 1));
        } else {
          if (isWhite !== (target === target.toUpperCase())) {
            moves.push(AppConfig.FILES[f] + (r + 1));
          }
          break;
        }
        r += dr;
        f += df;
      }
    };

    const type = piece.toLowerCase();
    switch (type) {
      case 'p': {
        const dir = isWhite ? 1 : -1;
        const startRank = isWhite ? 1 : 6;
        if (rank + dir >= 0 && rank + dir < 8 && !board[rank + dir][file]) {
          moves.push(AppConfig.FILES[file] + (rank + dir + 1));
          if (rank === startRank && !board[rank + 2 * dir][file]) {
            moves.push(AppConfig.FILES[file] + (rank + 2 * dir + 1));
          }
        }
        for (const df of [-1, 1]) {
          const nr = rank + dir, nf = file + df;
          if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const target = board[nr][nf];
            if (target && (isWhite !== (target === target.toUpperCase()))) {
              moves.push(AppConfig.FILES[nf] + (nr + 1));
            }
            const fenParts = this.fen.split(' ');
            const epSquare = fenParts[3];
            if (epSquare !== '-' && epSquare === AppConfig.FILES[nf] + (nr + 1)) {
              moves.push(epSquare);
            }
          }
        }
        break;
      }
      case 'n':
        for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          addMove(rank + dr, file + df);
        }
        break;
      case 'b':
        addSlide(1, 1); addSlide(1, -1); addSlide(-1, 1); addSlide(-1, -1);
        break;
      case 'r':
        addSlide(1, 0); addSlide(-1, 0); addSlide(0, 1); addSlide(0, -1);
        break;
      case 'q':
        addSlide(1, 0); addSlide(-1, 0); addSlide(0, 1); addSlide(0, -1);
        addSlide(1, 1); addSlide(1, -1); addSlide(-1, 1); addSlide(-1, -1);
        break;
      case 'k':
        for (let dr = -1; dr <= 1; dr++) {
          for (let df = -1; df <= 1; df++) {
            if (dr || df) addMove(rank + dr, file + df);
          }
        }
        const castling = this.fen.split(' ')[2] || '';
        if (isWhite && rank === 0) {
          if (castling.includes('K') && !board[0][5] && !board[0][6]) moves.push('g1');
          if (castling.includes('Q') && !board[0][3] && !board[0][2] && !board[0][1]) moves.push('c1');
        } else if (!isWhite && rank === 7) {
          if (castling.includes('k') && !board[7][5] && !board[7][6]) moves.push('g8');
          if (castling.includes('q') && !board[7][3] && !board[7][2] && !board[7][1]) moves.push('c8');
        }
        break;
    }
    return moves;
  },

  isOwnPiece(piece, turn) {
    if (turn === 'w') return piece === piece.toUpperCase();
    return piece === piece.toLowerCase();
  },

  tryMove(from, to) {
    const piece = this.getPieceAt(from);
    const type = piece?.toLowerCase();
    const targetRank = parseInt(to[1]);

    // Check for pawn promotion
    if (type === 'p' && (targetRank === 8 || targetRank === 1)) {
      this.showPromotionModal(from, to);
      return;
    }

    if (this.onMove) {
      this.onMove({ from, to });
    }
    this.selectedSquare = null;
    this.legalMoves = [];
  },

  showPromotionModal(from, to) {
    const modal = document.getElementById('promotion-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const turn = this.getTurn();
    const pieces = modal.querySelectorAll('.promotion-piece');
    pieces.forEach(btn => {
      const p = btn.dataset.piece;
      const pieceKey = turn === 'w' ? p.toUpperCase() : p.toLowerCase();
      btn.innerHTML = `<span class="piece" data-piece="${pieceKey}">${AppConfig.getPiece(pieceKey)}</span>`;

      const handler = () => {
        const promotion = btn.dataset.piece;
        modal.classList.add('hidden');
        if (this.onMove) {
          this.onMove({ from, to, promotion });
        }
        this.selectedSquare = null;
        this.legalMoves = [];
        pieces.forEach(b => b.removeEventListener('click', handler));
      };
      btn.addEventListener('click', handler);
    });
  },

  /**
   * Get captured pieces and material difference from move history
   */
  getCapturedPieces(history) {
    const whiteCaptured = [];
    const blackCaptured = [];

    if (!history) return { whiteCaptured, blackCaptured, materialDiff: 0 };

    history.forEach(move => {
      if (move.captured) {
        if (move.color === 'w') {
          whiteCaptured.push(move.captured);
        } else {
          blackCaptured.push(move.captured);
        }
      }
    });

    const calcValue = (pieces) => pieces.reduce((sum, p) => sum + (AppConfig.PIECE_VALUES[p] || 0), 0);
    const materialDiff = calcValue(whiteCaptured) - calcValue(blackCaptured);

    return { whiteCaptured, blackCaptured, materialDiff };
  },

  /**
   * Render captured pieces with mini SVG icons and count badges (Chess.com style)
   */
  renderCapturedHTML(capturedPieces, materialDiff = 0) {
    if (!capturedPieces || capturedPieces.length === 0) {
      if (materialDiff > 0) return `<span class="material-diff-badge">+${materialDiff}</span>`;
      return '';
    }

    const order = { 'p': 1, 'n': 2, 'b': 3, 'r': 4, 'q': 5, 'k': 6 };
    const counts = {};
    for (const p of capturedPieces) {
      counts[p] = (counts[p] || 0) + 1;
    }

    const sortedKeys = Object.keys(counts).sort((a, b) => (order[a.toLowerCase()] || 0) - (order[b.toLowerCase()] || 0));

    let html = '<div class="captured-pieces">';
    for (const pieceKey of sortedKeys) {
      const count = counts[pieceKey];
      html += `
        <div class="captured-group" title="${pieceKey.toUpperCase()} x${count}">
          <span class="captured-piece-svg">${AppConfig.getPiece(pieceKey)}</span>
          ${count > 1 ? `<span class="captured-count">${count}</span>` : ''}
        </div>
      `;
    }
    if (materialDiff > 0) {
      html += `<span class="material-diff-badge">+${materialDiff}</span>`;
    }
    html += '</div>';
    return html;
  }
};
