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
  AVATARS: ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'],
  PIECE_UNICODE: {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
  },
  PIECE_VALUES: { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0 },
  FILES: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  RANKS: ['8', '7', '6', '5', '4', '3', '2', '1'],
  INITIAL_FEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  getPiece(piece) {
    if (!piece) return '';
    if (window.PIECE_SVGS && window.PIECE_SVGS[piece]) {
      return window.PIECE_SVGS[piece];
    }
    return this.PIECE_UNICODE[piece] || piece;
  },
  getPieceSVG(piece) {
    return this.getPiece(piece);
  },
  getAvatarHTML(avatarId) {
    const id = parseInt(avatarId, 10) || 1;
    const pieceKey = this.AVATARS[(id - 1) % this.AVATARS.length] || 'K';
    return `<div class="avatar-svg-inner" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${this.getPiece(pieceKey)}</div>`;
  }
};
