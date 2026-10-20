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
  EVAL_ICONS: {
    brilliant: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="eval-icon eval-brilliant"><circle cx="12" cy="12" r="11" fill="#06b6d4" stroke="#fff" stroke-width="1.5"/><path d="M9.5 7v6m0 3.5v.5m5-10v6m0 3.5v.5" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
    great: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="eval-icon eval-great"><circle cx="12" cy="12" r="11" fill="#2563eb" stroke="#fff" stroke-width="1.5"/><path d="M12 7v6m0 3.5v.5" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
    best: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="eval-icon eval-best"><circle cx="12" cy="12" r="11" fill="#3b82f6" stroke="#fff" stroke-width="1.5"/><path d="M12 5.5l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6L12 5.5z" fill="#fff"/></svg>',
    good: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="eval-icon eval-good"><circle cx="12" cy="12" r="11" fill="#60a5fa" stroke="#fff" stroke-width="1.5"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    book: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="eval-icon eval-good"><circle cx="12" cy="12" r="11" fill="#60a5fa" stroke="#fff" stroke-width="1.5"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    inaccuracy: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="eval-icon eval-inaccuracy"><circle cx="12" cy="12" r="11" fill="#eab308" stroke="#fff" stroke-width="1.5"/><path d="M7.5 9.5a2.2 2.2 0 1 1 3 2c-.7.4-1 .8-1 1.5m0 3.5v.5m5.5-10v6m0 3.5v.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
    mistake: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="eval-icon eval-mistake"><circle cx="12" cy="12" r="11" fill="#f97316" stroke="#fff" stroke-width="1.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7m0 3v.5" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
    blunder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="eval-icon eval-blunder"><circle cx="12" cy="12" r="11" fill="#ef4444" stroke="#fff" stroke-width="1.5"/><path d="M6.5 9.5a2.1 2.1 0 1 1 2.8 2c-.6.4-.8.8-.8 1.5m0 3.5v.5m5-7.5a2.1 2.1 0 1 1 2.8 2c-.6.4-.8.8-.8 1.5m0 3.5v.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>'
  },
  CORNER_RESIZE_ICON: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" class="board-resize-handle-svg"><path d="M14 2v12H2M14 7v7H7" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"/></svg>',
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
  getEvalIcon(classification) {
    if (!classification) return '';
    return this.EVAL_ICONS[classification.toLowerCase()] || '';
  },
  getAvatarHTML(avatarId, customAvatar = null) {
    if (customAvatar && (customAvatar.startsWith('data:') || customAvatar.startsWith('http') || customAvatar.startsWith('/'))) {
      return `<img src="${customAvatar}" alt="Avatar" class="avatar-img-custom" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
    }
    const id = parseInt(avatarId, 10) || 1;
    const pieceKey = this.AVATARS[(id - 1) % this.AVATARS.length] || 'K';
    return `<div class="avatar-svg-inner" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${this.getPiece(pieceKey)}</div>`;
  }
};
