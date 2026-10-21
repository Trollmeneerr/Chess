/**
 * ChessBoardComponent — Plug-and-Play Interactive Chessboard
 * Encapsulates square grid rendering, SVGs, drag-and-drop,
 * premoves, checks, sound triggers, and move callbacks.
 */

export class ChessBoardComponent {
  /**
   * @param {Object} props
   * @param {string} [props.orientation='white'] - 'white' | 'black'
   * @param {string} [props.fen] - Board FEN
   * @param {boolean} [props.interactive=true] - Whether user can drag/click pieces
   * @param {Function} [props.onMove] - (move: { from, to, promotion }) => void
   * @param {Function} [props.onPieceClick] - (square: string) => void
   */
  constructor(props = {}) {
    this.props = {
      orientation: 'white',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      interactive: true,
      onMove: () => {},
      onPieceClick: () => {},
      ...props
    };
    this.fen = this.props.fen;
    this.orientation = this.props.orientation;
    this.interactive = this.props.interactive;
    this.selectedSquare = null;
    this.container = null;
  }

  mount(target) {
    this.container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.container) return;

    if (window.ChessBoard) {
      window.ChessBoard.init(this.container.id || this.container, {
        orientation: this.orientation,
        fen: this.fen,
        interactive: this.interactive,
        onMove: this.props.onMove
      });
    }
  }

  setFen(newFen) {
    this.fen = newFen;
    if (window.ChessBoard) {
      window.ChessBoard.update(newFen);
    }
  }

  flip() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    if (window.ChessBoard) {
      window.ChessBoard.flip();
    }
  }

  setInteractive(interactive) {
    this.interactive = interactive;
    if (window.ChessBoard) {
      window.ChessBoard.interactive = interactive;
      window.ChessBoard.bindEvents();
    }
  }
}
