/**
 * PostGameModalComponent — Post-Game Result Modal
 * Displays win/loss/draw outcome, ELO rating delta,
 * "Copy Moves" (Copy PGN) export button, and Game Review launcher.
 */

import { copyMovesToClipboard } from '../../utils/clipboard.js';

export class PostGameModalComponent {
  /**
   * @param {Object} props
   * @param {string} props.title - e.g. "Victory!", "Defeat", "Draw Game"
   * @param {string} props.subtitle - e.g. "Result: 1-0 (Checkmate)"
   * @param {number} [props.eloChange=0] - ELO points gained or lost
   * @param {number} [props.newElo] - Updated rating
   * @param {string} props.pgn - Complete game PGN notation
   * @param {string} [props.inviteCode] - Match code or game identifier
   * @param {Function} [props.onReview] - Review callback
   * @param {Function} [props.onNewMatch] - New game callback
   * @param {Function} [props.onRematch] - Rematch callback
   */
  constructor(props = {}) {
    this.props = props;
    this.overlay = null;
  }

  show(targetWrapper = document.body) {
    this.hide();

    const isDraw = this.props.title?.toLowerCase().includes('draw');
    const isWinner = this.props.title?.toLowerCase().includes('victory');
    const eloChange = this.props.eloChange || 0;
    const isPositive = eloChange > 0;
    const isNegative = eloChange < 0;

    let eloHtml = '';
    if (eloChange !== 0) {
      eloHtml = `<div class="elo-change ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${eloChange} ELO ${this.props.newElo ? '(' + this.props.newElo + ')' : ''}</div>`;
    } else if (isDraw) {
      eloHtml = `<div class="elo-change neutral">+0 ELO</div>`;
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'game-over-overlay';
    this.overlay.innerHTML = `
      <div class="game-over-content glass-panel">
        <div class="game-over-icon">${isDraw ? '🤝' : (isWinner ? '👑' : '💔')}</div>
        <div class="game-over-title">${this.props.title}</div>
        <div class="game-over-subtitle">${this.props.subtitle}</div>
        ${eloHtml}
        <div class="game-over-actions">
          <button class="btn btn-primary" id="btn-postgame-review">Game Review</button>
          <button class="btn btn-outline" id="btn-postgame-copy-moves">📋 Copy Moves</button>
          ${this.props.onRematch ? '<button class="btn btn-ghost" id="btn-postgame-rematch">Rematch</button>' : ''}
          <button class="btn btn-ghost" id="btn-postgame-new">New Match</button>
        </div>
      </div>
    `;

    targetWrapper.appendChild(this.overlay);

    // Event listeners
    this.overlay.querySelector('#btn-postgame-copy-moves')?.addEventListener('click', (e) => {
      copyMovesToClipboard(this.props.pgn, e.currentTarget);
    });

    this.overlay.querySelector('#btn-postgame-review')?.addEventListener('click', () => {
      if (typeof this.props.onReview === 'function') {
        this.props.onReview(this.props.pgn, this.props.inviteCode);
      }
    });

    this.overlay.querySelector('#btn-postgame-new')?.addEventListener('click', () => {
      this.hide();
      if (typeof this.props.onNewMatch === 'function') this.props.onNewMatch();
    });

    this.overlay.querySelector('#btn-postgame-rematch')?.addEventListener('click', () => {
      this.hide();
      if (typeof this.props.onRematch === 'function') this.props.onRematch();
    });
  }

  hide() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
      this.overlay = null;
    }
  }
}
