/**
 * EvalBarComponent — Vertical Evaluation Bar
 * Displays live Stockfish engine evaluation with sigmoid clamping and score display.
 */

export class EvalBarComponent {
  /**
   * @param {Object} props
   * @param {number} [props.evalCp=0] - Centipawn advantage (positive = White, negative = Black)
   * @param {number|null} [props.mate=null] - Mate in N moves
   */
  constructor(props = {}) {
    this.evalCp = props.evalCp || 0;
    this.mate = props.mate || null;
    this.container = null;
  }

  render(target) {
    this.container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="eval-bar">
        <div class="eval-bar-fill" id="eval-bar-fill-inner" style="height: 50%;"></div>
        <span class="eval-score" id="eval-bar-score-label">0.0</span>
      </div>
    `;

    this.update(this.evalCp, this.mate);
  }

  /**
   * Update evaluation display with sigmoid clamping.
   * @param {number} cp - Centipawns
   * @param {number|null} mate - Mate score
   */
  update(cp = 0, mate = null) {
    this.evalCp = cp;
    this.mate = mate;

    const fill = this.container?.querySelector('#eval-bar-fill-inner');
    const label = this.container?.querySelector('#eval-bar-score-label');
    if (!fill || !label) return;

    if (mate !== null && mate !== undefined) {
      const isWhiteMate = mate > 0;
      fill.style.height = isWhiteMate ? '100%' : '0%';
      label.textContent = `M${Math.abs(mate)}`;
      return;
    }

    // Sigmoid curve mapping cp to percentage: 50 + 50 * (2 / (1 + exp(-0.004 * cp)) - 1)
    const percentage = 50 + 50 * (2 / (1 + Math.exp(-0.0035 * cp)) - 1);
    const clampedPct = Math.max(5, Math.min(95, percentage));
    fill.style.height = `${clampedPct}%`;

    const score = (cp / 100).toFixed(1);
    label.textContent = cp > 0 ? `+${score}` : score;
  }
}
