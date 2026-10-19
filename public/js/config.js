/**
 * App Configuration
 */
const AppConfig = {
  get API_BASE() {
    return window.location.origin + '/api';
  },
  get WS_BASE() {
    return window.location.origin;
  },
  AVATARS: ['♔', '♚', '♕', '♛', '♖', '♜', '♗', '♝', '♘', '♞', '♙', '♟', '❄️', '🧊', '🏔️', '⛄'],
  PIECE_UNICODE: {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
  },
  PIECE_VALUES: { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0 },
  FILES: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  RANKS: ['8', '7', '6', '5', '4', '3', '2', '1'],
  INITIAL_FEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  getPieceSVG(piece) {
    if (!piece) return '';
    if (window.PIECE_SVGS && window.PIECE_SVGS[piece]) {
      return window.PIECE_SVGS[piece];
    }
    if (window.PIECE_URLS && window.PIECE_URLS[piece]) {
      return `<img src="${window.PIECE_URLS[piece]}" alt="${piece}" class="chess-piece-img" draggable="false" style="width:100%;height:100%;">`;
    }
    return this.PIECE_UNICODE[piece] || piece;
  }
};

