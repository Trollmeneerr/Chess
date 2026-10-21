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
  notes: { arrows: [], squares: new Set() },
  highlightedSquares: new Set(),
  arrows: [], // array of { from, to } notes
  engineArrows: [], // array of { from, to, color, isBestMove }
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
    window.isBoardFlipped = this.orientation === 'black';
    this.interactive = options.interactive !== false;
    this.allowPremove = options.allowPremove !== false;
    this.allowBothColors = Boolean(options.allowBothColors || options.isAnalysis);
    this.isAnalysis = Boolean(options.isAnalysis);
    this.showToolbar = options.showToolbar !== false;
    this.onMove = options.onMove || null;
    this.fen = options.fen || AppConfig.INITIAL_FEN;
    this.premove = null;
    this.notes = { arrows: [], squares: new Set() };
    this.highlightedSquares = this.notes.squares;
    this.arrows = this.notes.arrows;
    this.engineArrows = [];
    if (options.lastMove !== undefined) this.lastMove = options.lastMove;
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
    if (this.allowBothColors || this.isAnalysis || this.playerColor === 'both') {
      return true;
    }
    const turn = this.getTurn();
    return (this.playerColor === 'white' && turn === 'w') || (this.playerColor === 'black' && turn === 'b');
  },

  /**
   * Check if a piece belongs to the player
   */
  isPlayerPiece(piece) {
    if (!piece) return false;
    if (this.allowBothColors || this.isAnalysis || this.playerColor === 'both') {
      return true;
    }
    return this.playerColor === 'white' ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
  },

  /**
   * Render the board from FEN
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const board = this.parseFEN(this.fen);
    const turn = this.getTurn(); // 'w' or 'b'

    // Determine square of the King currently in check strictly
    let kingInCheckSq = null;
    if (this.inCheck) {
      if (this.checkSquare) {
        kingInCheckSq = this.checkSquare;
      } else {
        const kingChar = turn === 'w' ? 'K' : 'k';
        for (let r = 0; r < 8; r++) {
          for (let f = 0; f < 8; f++) {
            if (board[r][f] === kingChar) {
              kingInCheckSq = AppConfig.FILES[f] + AppConfig.RANKS[7 - r];
              break;
            }
          }
          if (kingInCheckSq) break;
        }
      }
    }

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

        // Check highlight - strictly applied to King currently in check
        if (this.inCheck && kingInCheckSq === sq) {
          classes += ' in-check';
        }

        // Custom right-click square highlights
        if (this.highlightedSquares && this.highlightedSquares.has && this.highlightedSquares.has(sq)) {
          classes += ' highlight-green note-green';
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
          const isDraggingPiece = Boolean(this.dragging && this.dragging.hasMoved && this.dragging.from === sq);
          html += `<span class="piece chess-piece${isDraggingPiece ? ' is-dragging' : ''}" data-piece="${piece}">${AppConfig.getPiece(piece)}</span>`;
        }
        html += '</div>';
      }
    }

    // Arrows SVG overlay (800x800 coordinate system with 100px per square)
    html += `
      <svg class="board-arrows-layer" id="board-arrows" viewBox="0 0 800 800" preserveAspectRatio="none">
        <defs></defs>
        <g id="engine-arrows-layer"></g>
        <g id="notes-arrows-layer"></g>
        <g id="arrows-list"></g>
        <g id="arrow-preview"></g>
      </svg>
    `;

    html += '</div>'; // End chess-board

    // Outer wrapper with small corner resize handle only (no bottom bar)
    const outerHTML = `
      <div class="chess-board-outer" id="chess-board-outer">
        ${html}
        <div class="board-resize-handle" id="board-resize-handle" title="Drag corner to scale board">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
            <path d="M14 2v12H2M14 7v7H7" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
      </div>
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
    if (options.lastMove !== undefined) this.lastMove = options.lastMove;
    if (options.inCheck !== undefined) this.inCheck = options.inCheck;
    if (options.checkSquare !== undefined) this.checkSquare = options.checkSquare;
    this.selectedSquare = null;
    this.legalMoves = [];
    if (options.clearNotes) {
      this.clearNotes();
    }

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
    window.isBoardFlipped = this.orientation === 'black';
    this.render();
    this.bindEvents();
  },

  setOrientation(color) {
    this.orientation = color;
    window.isBoardFlipped = this.orientation === 'black';
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
    if (this._justDropped) {
      this._justDropped = false;
      return;
    }
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

    // Right-click: Start arrow drawing or cancel premove (Do not draw preview during drag)
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
      window.arrowStartSquare = square;
      return;
    }

    // Left-click: Clear user notes (green arrows/squares) & start drag
    if (e.button === 0) {
      this.clearNotes();

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
    // Piece drag handling (No live preview arrows during right-click drag per spec)
    if (this.dragging) {
      this.handleDrag(e);
    }
  },

  handleMouseUp(e) {
    // Right-click release: Render arrow ONLY on mouseup if start !== end
    if (e.button === 2 && this.rightDrag) {
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.square');
      const targetSq = el?.dataset.square || this.rightDrag.from;

      if (targetSq === this.rightDrag.from) {
        this.toggleNoteSquare(targetSq);
      } else {
        this.toggleNoteArrow(this.rightDrag.from, targetSq);
      }
      this.rightDrag = null;
      window.arrowStartSquare = null;
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
      document.body.classList.add('dragging-active');

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

    const dragInfo = this.dragging;
    const hasMoved = dragInfo.hasMoved;
    this.dragging = null; // Always clear dragging state FIRST so render() never marks pieces as is-dragging

    document.body.classList.remove('dragging-active');

    if (this.dragPieceEl) {
      this.dragPieceEl.remove();
      this.dragPieceEl = null;
    }

    // Immediately remove is-dragging class from all pieces on the board
    document.querySelectorAll('.chess-piece.is-dragging, .piece.is-dragging').forEach(p => {
      p.classList.remove('is-dragging');
    });

    if (hasMoved) {
      this._justDropped = true;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const squareEl = el?.closest('.square');
      const targetSquare = squareEl?.dataset?.square;

      if (targetSquare && targetSquare !== dragInfo.from) {
        if (this.isMyTurn()) {
          if (this.legalMoves.includes(targetSquare)) {
            // Optimistic DOM placement on target square so piece never disappears
            const originSq = document.querySelector(`[data-square="${dragInfo.from}"]`);
            const targetSqEl = document.querySelector(`[data-square="${targetSquare}"]`);
            const pieceEl = originSq?.querySelector('.chess-piece, .piece');

            if (originSq && targetSqEl && pieceEl) {
              const captured = targetSqEl.querySelector('.chess-piece, .piece');
              if (captured) captured.remove();
              pieceEl.classList.remove('is-dragging');
              targetSqEl.appendChild(pieceEl);
            }

            this.tryMove(dragInfo.from, targetSquare);
            return;
          }
        } else if (this.allowPremove) {
          const piece = dragInfo.piece;
          const isPawn = piece?.toLowerCase() === 'p';
          const targetRank = parseInt(targetSquare[1]);
          const isPromo = isPawn && (targetRank === 8 || targetRank === 1);

          this.premove = {
            from: dragInfo.from,
            to: targetSquare,
            promotion: isPromo ? 'q' : undefined
          };
          this.selectedSquare = null;
          this.legalMoves = [];
          this.render();
          this.bindEvents();
          return;
        }
      }

      // Snap-back: Illegal move, off-board, or dropped on same square
      this.selectedSquare = null;
      this.legalMoves = [];
      this.render();
      this.bindEvents();
      return;
    }

    // Was a click or tiny movement without dragging (>5px)
    this.selectedSquare = null;
    this.legalMoves = [];
    document.querySelectorAll('.chess-piece.is-dragging, .piece.is-dragging').forEach(p => {
      p.classList.remove('is-dragging');
    });
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
    this.renderNotes();
    this.renderEngineArrows();
  },

  renderEngineArrows() {
    const svg = document.getElementById('board-arrows') || document.getElementById('board-arrows-svg');
    if (!svg) return;
    const engineLayer = svg.querySelector('#engine-arrows-layer');
    if (engineLayer) {
      engineLayer.innerHTML = '';
    } else {
      svg.querySelectorAll('path[data-engine="true"]').forEach(p => p.remove());
    }
    for (const arrow of (this.engineArrows || [])) {
      if (typeof window.drawMoveArrowFixed === 'function') {
        window.drawMoveArrowFixed(arrow.from, arrow.to, arrow.color || '#3b82f6', arrow.isBestMove || false);
      }
    }
  },

  renderNotes() {
    const svg = document.getElementById('board-arrows') || document.getElementById('board-arrows-svg');
    if (!svg) return;
    const notesLayer = svg.querySelector('#notes-arrows-layer');
    if (notesLayer) {
      notesLayer.innerHTML = '';
    } else {
      svg.querySelectorAll('path[data-note="true"]').forEach(p => p.remove());
    }
    for (const arrow of (this.notes?.arrows || this.arrows || [])) {
      drawMoveArrow(arrow.from, arrow.to, '#22c55e', false);
    }
  },

  renderArrowPreview(fromSq, toSq) {
    this.renderNotes();
    drawMoveArrow(fromSq, toSq, '#22c55e', false);
  },

  clearArrowPreview() {
    this.renderNotes();
  },

  toggleNoteArrow(from, to) {
    if (!this.notes) this.notes = { arrows: [], squares: new Set() };
    const arrows = this.notes.arrows;
    const idx = arrows.findIndex(a => a.from === from && a.to === to);
    if (idx >= 0) {
      arrows.splice(idx, 1);
    } else {
      arrows.push({ from, to });
    }
    this.arrows = arrows;
    this.renderNotes();
  },

  toggleArrow(from, to) {
    this.toggleNoteArrow(from, to);
  },

  toggleNoteSquare(square) {
    if (!this.notes) this.notes = { arrows: [], squares: new Set() };
    const squares = this.notes.squares;
    const sqEl = this.boardEl?.querySelector(`.square[data-square="${square}"]`);
    if (squares.has(square)) {
      squares.delete(square);
      sqEl?.classList.remove('highlight-green', 'note-green');
    } else {
      squares.add(square);
      sqEl?.classList.add('highlight-green');
    }
    this.highlightedSquares = squares;
  },

  toggleSquareHighlight(square) {
    this.toggleNoteSquare(square);
  },

  clearNotes() {
    if (!this.notes) this.notes = { arrows: [], squares: new Set() };
    this.notes.arrows = [];
    this.notes.squares.clear();
    this.arrows = [];
    this.highlightedSquares = this.notes.squares;
    const svg = document.getElementById('board-arrows') || document.getElementById('board-arrows-svg');
    if (svg) {
      const notesLayer = svg.querySelector('#notes-arrows-layer');
      if (notesLayer) notesLayer.innerHTML = '';
      svg.querySelectorAll('path[data-note="true"]').forEach(p => p.remove());
    }
    this.boardEl?.querySelectorAll('.highlight-green, .note-green').forEach(el => {
      el.classList.remove('highlight-green', 'note-green');
    });
  },

  clearEngineArrows() {
    this.engineArrows = [];
    const svg = document.getElementById('board-arrows') || document.getElementById('board-arrows-svg');
    if (svg) {
      const engineLayer = svg.querySelector('#engine-arrows-layer');
      if (engineLayer) engineLayer.innerHTML = '';
      svg.querySelectorAll('path[data-engine="true"]').forEach(p => p.remove());
    }
  },

  clearAnnotations() {
    this.clearNotes();
    this.clearEngineArrows();
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

    this.lastMove = { from, to };
    this.boardEl?.querySelectorAll('.square.last-move-from, .square.last-move-to').forEach(el => {
      el.classList.remove('last-move-from', 'last-move-to');
    });
    this.boardEl?.querySelector(`[data-square="${from}"]`)?.classList.add('last-move-from');
    this.boardEl?.querySelector(`[data-square="${to}"]`)?.classList.add('last-move-to');

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
    const pieceLabels = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };

    const cleanup = () => {
      modal.classList.add('hidden');
      modal.removeEventListener('click', overlayHandler);
      document.getElementById('promotion-modal-close')?.removeEventListener('click', cancelHandler);
      document.getElementById('btn-cancel-promotion')?.removeEventListener('click', cancelHandler);
      pieceClickHandlers.forEach(({ btn, fn }) => btn.removeEventListener('click', fn));
    };

    const cancelHandler = () => {
      cleanup();
      this.selectedSquare = null;
      this.legalMoves = [];
      this.render();
      this.bindEvents();
    };

    const overlayHandler = (e) => {
      if (e.target === modal) cancelHandler();
    };

    modal.addEventListener('click', overlayHandler);
    document.getElementById('promotion-modal-close')?.addEventListener('click', cancelHandler);
    document.getElementById('btn-cancel-promotion')?.addEventListener('click', cancelHandler);

    const pieceClickHandlers = [];
    pieces.forEach(btn => {
      const p = btn.dataset.piece;
      const pieceKey = turn === 'w' ? p.toUpperCase() : p.toLowerCase();
      btn.innerHTML = `
        <div class="promo-piece-svg">
          <span class="piece" data-piece="${pieceKey}">${AppConfig.getPiece(pieceKey)}</span>
        </div>
        <span class="promo-piece-label">${pieceLabels[p] || p}</span>
      `;

      const fn = () => {
        const promotion = btn.dataset.piece;
        cleanup();
        this.lastMove = { from, to };
        this.boardEl?.querySelectorAll('.square.last-move-from, .square.last-move-to').forEach(el => {
          el.classList.remove('last-move-from', 'last-move-to');
        });
        this.boardEl?.querySelector(`[data-square="${from}"]`)?.classList.add('last-move-from');
        this.boardEl?.querySelector(`[data-square="${to}"]`)?.classList.add('last-move-to');

        if (this.onMove) {
          this.onMove({ from, to, promotion });
        }
        this.selectedSquare = null;
        this.legalMoves = [];
      };
      btn.addEventListener('click', fn);
      pieceClickHandlers.push({ btn, fn });
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

/**
 * 1. Draw SVG Arrows (Supports 90-Degree Knight Hooks & Blue Best Move)
 * Expects an <svg id="board-arrows" viewBox="0 0 800 800"> overlay on the board.
 */
function drawMoveArrow(fromSq, toSq, color = '#3b82f6', isBestMove = false) {
  if (typeof window.drawMoveArrowFixed === 'function') {
    return window.drawMoveArrowFixed(fromSq, toSq, color, isBestMove);
  }
  const svg = document.getElementById('board-arrows') || document.getElementById('board-arrows-svg');
  if (!svg || !fromSq || !toSq || fromSq.length < 2 || toSq.length < 2) return;
  const files = 'abcdefgh';
  
  const isFlipped = (window.isBoardFlipped !== undefined) ? window.isBoardFlipped : (window.ChessBoard && window.ChessBoard.orientation === 'black');
  const fileIdx1 = files.indexOf(fromSq[0]);
  const rankIdx1 = parseInt(fromSq[1], 10) - 1;
  const fileIdx2 = files.indexOf(toSq[0]);
  const rankIdx2 = parseInt(toSq[1], 10) - 1;

  const c1 = isFlipped ? (7 - fileIdx1) : fileIdx1;
  const r1 = isFlipped ? rankIdx1 : (7 - rankIdx1);
  const c2 = isFlipped ? (7 - fileIdx2) : fileIdx2;
  const r2 = isFlipped ? rankIdx2 : (7 - rankIdx2);
  
  const x1 = c1 * 100 + 50, y1 = r1 * 100 + 50;
  const x2 = c2 * 100 + 50, y2 = r2 * 100 + 50;
  const dx = c2 - c1, dy = r2 - r1;

  // Ensure arrowhead marker exists
  const cleanColor = color.replace(/[^a-zA-Z0-9]/g, '');
  const markerId = `arrowhead-${cleanColor}`;
  if (!document.getElementById(markerId)) {
    const defs = svg.querySelector('defs') || svg.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'defs'), svg.firstChild);
    defs.innerHTML += `
      <marker id="${markerId}" markerWidth="3.5" markerHeight="3.5" refX="2.2" refY="1.75" orient="auto">
        <polygon points="0 0, 3.5 1.75, 0 3.5" fill="${color}" />
      </marker>`;
  }

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const isKnightMove = (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);

  if (isKnightMove) {
    const midX = Math.abs(dx) === 2 ? x2 : x1;
    const midY = Math.abs(dy) === 2 ? y2 : y1;
    path.setAttribute('d', `M ${x1} ${y1} L ${midX} ${midY} L ${x2} ${y2}`);
  } else {
    path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
  }

  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', isBestMove ? '20' : '16');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('opacity', '0.88');
  path.setAttribute('marker-end', `url(#${markerId})`);
  svg.appendChild(path);
}

/**
 * 2. Clear Arrows & Premoves on Screen Click
 */
function clearAnnotationsAndPremoves() {
  if (window.ChessBoard) {
    window.ChessBoard.clearNotes?.();
    window.ChessBoard.clearPremove?.();
  }
  document.querySelectorAll('.highlight-green, .note-green, .highlight-cyan, .highlight-red, .premove-from, .premove-to').forEach(el => {
    el.classList.remove('highlight-green', 'note-green', 'highlight-cyan', 'highlight-red', 'premove-from', 'premove-to');
  });
  window.queuedPremove = null;
}

document.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    if (e.target.closest('input, textarea, select, .modal-overlay:not(.hidden) .modal, .engine-line')) return;
    clearAnnotationsAndPremoves();
  }
});

document.addEventListener('contextmenu', (e) => {
  if (window.queuedPremove || (window.ChessBoard && window.ChessBoard.premove)) {
    e.preventDefault();
    clearAnnotationsAndPremoves(); // Right click cancels active premove
  }
});

/**
 * 3. Hide Piece on Original Square While Dragging
 */
function bindPieceDragEvents(pieceElement) {
  pieceElement.addEventListener('dragstart', () => {
    requestAnimationFrame(() => pieceElement.classList.add('is-dragging'));
  });
  pieceElement.addEventListener('dragend', () => {
    document.querySelectorAll('.chess-piece.is-dragging, .piece.is-dragging').forEach(p => {
      p.classList.remove('is-dragging');
    });
  });
}

/**
 * 4. Trigger Analysis Highlight & Best Move Arrow on Mistake
 */
function showMoveAnalysis(playedFrom, playedTo, bestFrom, bestTo, classification) {
  clearAnnotationsAndPremoves();
  if (playedFrom) document.querySelector(`[data-square="${playedFrom}"]`)?.classList.add('highlight-analysis');
  if (playedTo) {
    const toEl = document.querySelector(`[data-square="${playedTo}"]`);
    if (toEl) {
      toEl.classList.add('highlight-analysis');
      const badgeSvg = window.AppConfig?.getEvalIcon(classification);
      if (badgeSvg) {
        const badgeEl = document.createElement('div');
        badgeEl.className = 'square-eval-badge';
        badgeEl.innerHTML = badgeSvg;
        toEl.appendChild(badgeEl);
      }
    }
  }

  // If mistake, inaccuracy, or blunder -> show blue Best Move path
  if (['inaccuracy', 'mistake', 'blunder'].includes(classification?.toLowerCase()) && bestFrom && bestTo) {
    drawMoveArrow(bestFrom, bestTo, '#3b82f6', true);
  }
}

window.drawMoveArrow = drawMoveArrow;
window.clearAnnotationsAndPremoves = clearAnnotationsAndPremoves;
window.bindPieceDragEvents = bindPieceDragEvents;
window.showMoveAnalysis = showMoveAnalysis;
ChessBoard.drawMoveArrow = drawMoveArrow;
ChessBoard.clearAnnotationsAndPremoves = clearAnnotationsAndPremoves;
ChessBoard.showMoveAnalysis = showMoveAnalysis;
window.ChessBoard = ChessBoard;
