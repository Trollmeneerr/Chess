/**
 * Chess Board Renderer
 * Interactive board with drag-and-drop, click-to-move, highlights, and animations
 */
const ChessBoard = {
  containerId: null,
  boardEl: null,
  fen: AppConfig.INITIAL_FEN,
  orientation: 'white', // 'white' or 'black'
  interactive: true,
  selectedSquare: null,
  legalMoves: [],
  lastMove: null,
  inCheck: false,
  checkSquare: null,
  highlightedSquares: new Map(),
  onMove: null, // callback(move) => { from, to, promotion }
  dragging: null,
  dragPieceEl: null,

  /**
   * Initialize the board in a container element
   */
  init(containerId, options = {}) {
    this.containerId = containerId;
    this.orientation = options.orientation || 'white';
    this.interactive = options.interactive !== false;
    this.onMove = options.onMove || null;
    this.fen = options.fen || AppConfig.INITIAL_FEN;
    this.render();
    this.bindEvents();
  },

  /**
   * Render the board from FEN
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const board = this.parseFEN(this.fen);
    let html = '<div class="chess-board size-lg" id="chess-board-grid">';

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

        // Legal moves
        if (this.legalMoves.includes(sq)) {
          classes += piece ? ' legal-capture' : ' legal-move';
        }

        // Check
        if (this.checkSquare === sq) classes += ' in-check';

        // Custom highlights
        if (this.highlightedSquares.has(sq)) {
          classes += ` highlight-${this.highlightedSquares.get(sq)}`;
        }

        html += `<div class="${classes}" data-square="${sq}" data-rank="${rank}" data-file="${file}">`;
        if (piece) {
          html += `<span class="piece" data-piece="${piece}">${AppConfig.PIECE_UNICODE[piece]}</span>`;
        }
        html += '</div>';
      }
    }
    html += '</div>';

    // Board coordinates
    html += '<div class="board-coords-rank">';
    for (const rank of ranks) {
      html += `<span class="coord-label">${AppConfig.RANKS[7 - rank]}</span>`;
    }
    html += '</div>';
    html += '<div class="board-coords-file">';
    for (const file of files) {
      html += `<span class="coord-label">${AppConfig.FILES[file]}</span>`;
    }
    html += '</div>';

    container.innerHTML = html;
    this.boardEl = document.getElementById('chess-board-grid');
  },

  /**
   * Update the board with a new FEN
   */
  update(fen, options = {}) {
    this.fen = fen;
    if (options.lastMove) this.lastMove = options.lastMove;
    if (options.inCheck !== undefined) this.inCheck = options.inCheck;
    if (options.checkSquare !== undefined) this.checkSquare = options.checkSquare;
    this.selectedSquare = null;
    this.legalMoves = [];
    this.render();
    this.bindEvents();
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
   * Get square from board coordinates
   */
  squareFromCoords(rank, file) {
    return AppConfig.FILES[file] + AppConfig.RANKS[7 - rank];
  },

  /**
   * Get piece at a square from the current FEN
   */
  getPieceAt(square) {
    const board = this.parseFEN(this.fen);
    const file = AppConfig.FILES.indexOf(square[0]);
    const rank = parseInt(square[1]) - 1;
    return board[rank][file];
  },

  /**
   * Bind click and drag events
   */
  bindEvents() {
    if (!this.interactive || !this.boardEl) return;

    const squares = this.boardEl.querySelectorAll('.square');
    squares.forEach(sq => {
      sq.addEventListener('mousedown', (e) => this.handleMouseDown(e, sq));
      sq.addEventListener('click', (e) => this.handleClick(e, sq));
    });

    // Right-click for square highlights
    this.boardEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const sq = e.target.closest('.square');
      if (sq) {
        const square = sq.dataset.square;
        if (this.highlightedSquares.has(square)) {
          this.highlightedSquares.delete(square);
        } else {
          this.highlightedSquares.set(square, 'green');
        }
        this.render();
        this.bindEvents();
      }
    });

    // Drag handling on document
    document.addEventListener('mousemove', (e) => this.handleDrag(e));
    document.addEventListener('mouseup', (e) => this.handleDrop(e));
  },

  handleClick(e, squareEl) {
    if (this.dragging) return; // Was a drag, not a click

    const square = squareEl.dataset.square;
    const piece = this.getPieceAt(square);
    const turn = this.getTurn();

    // Clear highlights on click
    this.highlightedSquares.clear();

    if (this.selectedSquare) {
      if (this.legalMoves.includes(square)) {
        // Make the move
        this.tryMove(this.selectedSquare, square);
      } else if (piece && this.isOwnPiece(piece, turn)) {
        // Select a different piece
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
  },

  handleMouseDown(e, squareEl) {
    if (e.button !== 0) return; // Left click only
    const square = squareEl.dataset.square;
    const piece = this.getPieceAt(square);
    const turn = this.getTurn();

    if (piece && this.isOwnPiece(piece, turn)) {
      this.dragging = {
        from: square,
        piece,
        startX: e.clientX,
        startY: e.clientY,
        hasMoved: false
      };
    }
  },

  handleDrag(e) {
    if (!this.dragging) return;

    const dx = Math.abs(e.clientX - this.dragging.startX);
    const dy = Math.abs(e.clientY - this.dragging.startY);

    if (!this.dragging.hasMoved && (dx > 5 || dy > 5)) {
      this.dragging.hasMoved = true;
      // Create floating piece
      this.dragPieceEl = document.createElement('span');
      this.dragPieceEl.className = 'piece dragging';
      this.dragPieceEl.textContent = AppConfig.PIECE_UNICODE[this.dragging.piece];
      document.body.appendChild(this.dragPieceEl);

      // Select the source square to show legal moves
      this.selectSquare(this.dragging.from);
    }

    if (this.dragPieceEl) {
      this.dragPieceEl.style.left = (e.clientX - 30) + 'px';
      this.dragPieceEl.style.top = (e.clientY - 30) + 'px';
    }
  },

  handleDrop(e) {
    if (!this.dragging) return;

    if (this.dragPieceEl) {
      this.dragPieceEl.remove();
      this.dragPieceEl = null;
    }

    if (this.dragging.hasMoved) {
      // Find the square under the cursor
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const squareEl = el?.closest('.square');
      if (squareEl) {
        const targetSquare = squareEl.dataset.square;
        if (this.legalMoves.includes(targetSquare)) {
          this.tryMove(this.dragging.from, targetSquare);
        } else {
          this.selectedSquare = null;
          this.legalMoves = [];
          this.render();
          this.bindEvents();
        }
      }
    }

    this.dragging = null;
  },

  selectSquare(square) {
    this.selectedSquare = square;
    // In a full implementation, we'd compute legal moves client-side
    // For now, show all squares as potentially legal and let the server validate
    this.legalMoves = this.getBasicLegalMoves(square);
    this.render();
    this.bindEvents();
  },

  /**
   * Basic legal move computation (simplified — server validates)
   */
  getBasicLegalMoves(fromSquare) {
    if (typeof window.Chess === 'function') {
      try {
        const c = new window.Chess(this.fen);
        const moves = c.moves({ square: fromSquare, verbose: true });
        return moves.map(m => m.to);
      } catch (err) {
        // Fallback to manual computation below
      }
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
        // Forward
        if (rank + dir >= 0 && rank + dir < 8 && !board[rank + dir][file]) {
          moves.push(AppConfig.FILES[file] + (rank + dir + 1));
          if (rank === startRank && !board[rank + 2 * dir][file]) {
            moves.push(AppConfig.FILES[file] + (rank + 2 * dir + 1));
          }
        }
        // Captures
        for (const df of [-1, 1]) {
          const nr = rank + dir, nf = file + df;
          if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const target = board[nr][nf];
            if (target && (isWhite !== (target === target.toUpperCase()))) {
              moves.push(AppConfig.FILES[nf] + (nr + 1));
            }
            // En passant check
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
        // Castling (simplified check)
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
    modal.classList.remove('hidden');

    const pieces = modal.querySelectorAll('.promotion-piece');
    pieces.forEach(btn => {
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
    const whiteCaptured = []; // Pieces white has captured (black pieces)
    const blackCaptured = []; // Pieces black has captured (white pieces)

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
  }
};
