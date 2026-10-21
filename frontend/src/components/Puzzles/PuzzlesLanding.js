/**
 * PuzzlesLandingComponent — Chess.com Style Puzzles Landing Dashboard
 * Plug-and-play UI component displaying player tactical stats, difficulty tiers,
 * and an opt-in "Start Puzzle" initiation button.
 *
 * Exiting this landing page NEVER incurs an ELO penalty.
 */

export class PuzzlesLandingComponent {
  /**
   * @param {Object} props
   * @param {string} [props.initialDifficulty='medium']
   * @param {number} [props.userRating=800]
   * @param {number} [props.puzzlesSolved=0]
   * @param {Function} props.onStartPuzzle - Callback when user explicitly clicks Start Puzzle
   */
  constructor(props = {}) {
    this.props = {
      initialDifficulty: 'medium',
      userRating: 800,
      puzzlesSolved: 0,
      onStartPuzzle: () => {},
      ...props
    };
    this.selectedDifficulty = this.props.initialDifficulty;
    this.container = null;
  }

  /**
   * Render the component into a container DOM element.
   * @param {HTMLElement|string} target - Container element or selector
   */
  render(target) {
    this.container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="puzzles-landing-wrap">
        <div class="page-header" style="text-align:left;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
          <div>
            <h1 class="page-title">Tactical Puzzles</h1>
            <p class="page-subtitle">Sharpen your calculation skills with 4,000+ curated tactical positions (1,000+ per tier) & earn +1 ELO</p>
          </div>
          <div style="display:flex;gap:8px;">
            <span class="badge badge-accent" id="puzzle-pool-badge">4,000+ Active</span>
            <span class="badge badge-success"><span class="pulse-dot"></span> Stockfish 16.1 Active</span>
          </div>
        </div>

        <div class="puzzles-landing-grid">
          <!-- Main Column -->
          <div class="puzzles-landing-main">
            <!-- Hero Card: Opt-In Initiation -->
            <div class="puzzles-hero-card">
              <div class="puzzles-hero-header">
                <div>
                  <div class="badge badge-accent mb-2">TACTICAL TRAINING // OPT-IN</div>
                  <h2 class="puzzles-hero-title">Solve Tactical Puzzles</h2>
                  <p class="puzzles-hero-desc">
                    Find the best moves in critical positions. ELO rating is <strong>safe on this dashboard</strong> and is only at risk once you actively start a puzzle.
                  </p>
                </div>
              </div>

              <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                <button class="start-puzzle-hero-btn" id="btn-component-start-puzzle">
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
                  </svg>
                  <span>Start Puzzle</span>
                </button>
                <div style="font-size:13px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;"></span>
                  Selected: <strong style="color:#fff;text-transform:capitalize;" id="comp-selected-diff">${this.selectedDifficulty}</strong>
                </div>
              </div>
            </div>

            <!-- Difficulty Tier Cards (Chess.com Style) -->
            <div class="glass-panel" style="padding:24px;border-radius:14px;margin-bottom:20px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <h3 style="margin:0;font-size:16px;font-weight:700;">Choose Difficulty Tier</h3>
                <span style="font-size:12px;color:var(--text-muted);">Select before starting</span>
              </div>
              
              <div class="puzzles-tier-grid">
                <div class="diff-tier-card ${this.selectedDifficulty === 'easy' ? 'active' : ''}" data-diff="easy">
                  <div class="diff-tier-card-header">
                    <span class="diff-tier-name">Easy</span>
                    <span class="badge badge-subtle" id="count-easy" style="font-size:11px;">1,016</span>
                  </div>
                  <div class="diff-tier-range">Rating 400 – 999</div>
                  <div class="diff-tier-desc">Hanging pieces, simple forks, and 1-move tactical checkmates.</div>
                  <div class="diff-tier-active-check">✓ Active Tier</div>
                </div>

                <div class="diff-tier-card ${this.selectedDifficulty === 'medium' ? 'active' : ''}" data-diff="medium">
                  <div class="diff-tier-card-header">
                    <span class="diff-tier-name">Medium</span>
                    <span class="badge badge-subtle" id="count-medium" style="font-size:11px;">1,000</span>
                  </div>
                  <div class="diff-tier-range">Rating 1000 – 1399</div>
                  <div class="diff-tier-desc">Pins, skewers, double attacks, and discovered threats.</div>
                  <div class="diff-tier-active-check">✓ Active Tier</div>
                </div>

                <div class="diff-tier-card ${this.selectedDifficulty === 'hard' ? 'active' : ''}" data-diff="hard">
                  <div class="diff-tier-card-header">
                    <span class="diff-tier-name">Hard</span>
                    <span class="badge badge-subtle" id="count-hard" style="font-size:11px;">1,000</span>
                  </div>
                  <div class="diff-tier-range">Rating 1400 – 1899</div>
                  <div class="diff-tier-desc">Piece sacrifices, deflections, and complex multi-ply lines.</div>
                  <div class="diff-tier-active-check">✓ Active Tier</div>
                </div>

                <div class="diff-tier-card ${this.selectedDifficulty === 'master' ? 'active' : ''}" data-diff="master">
                  <div class="diff-tier-card-header">
                    <span class="diff-tier-name">Master</span>
                    <span class="badge badge-subtle" id="count-master" style="font-size:11px;">1,000</span>
                  </div>
                  <div class="diff-tier-range">Rating 1900+</div>
                  <div class="diff-tier-desc">Grandmaster combinations, quiet moves, and deep calculations.</div>
                  <div class="diff-tier-active-check">✓ Active Tier</div>
                </div>

                <div class="diff-tier-card ${this.selectedDifficulty === 'adaptive' ? 'active' : ''}" data-diff="adaptive">
                  <div class="diff-tier-card-header">
                    <span class="diff-tier-name">Adaptive</span>
                    <span class="badge badge-accent" style="font-size:11px;">Dynamic</span>
                  </div>
                  <div class="diff-tier-range">${this.props.userRating} ± 100 ELO</div>
                  <div class="diff-tier-desc">Automatically adjusts to match your current skill level.</div>
                  <div class="diff-tier-active-check">✓ Active Tier</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Sidebar Column: Stats & Rules -->
          <div class="puzzles-landing-sidebar">
            <div class="glass-panel" style="padding:24px;border-radius:14px;margin-bottom:16px;">
              <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px;">Your Tactical Rating</div>
              <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:14px;">
                <span style="font-size:36px;font-weight:800;color:#38bdf8;line-height:1;">${this.props.userRating}</span>
                <span style="font-size:14px;font-weight:600;color:var(--text-secondary);">ELO</span>
              </div>
              <div style="padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:13px;color:var(--text-secondary);">Puzzles Solved</span>
                <strong style="color:#fff;font-size:14px;">${this.props.puzzlesSolved}</strong>
              </div>
            </div>

            <div class="glass-panel" style="padding:20px;border-radius:14px;">
              <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px;">Rating Rules</div>
              <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-secondary);line-height:1.7;">
                <li><strong style="color:#22c55e;">+1 ELO</strong> per correct solve without hint.</li>
                <li><strong style="color:#ef4444;">-1 ELO</strong> only if incorrect moves are made or puzzle is abandoned mid-attempt.</li>
                <li><strong style="color:#38bdf8;">0 ELO penalty</strong> while browsing this dashboard.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    this.container.querySelectorAll('.diff-tier-card').forEach(card => {
      card.addEventListener('click', () => {
        this.container.querySelectorAll('.diff-tier-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedDifficulty = card.dataset.diff;
        const lbl = this.container.querySelector('#comp-selected-diff');
        if (lbl) lbl.textContent = this.selectedDifficulty;
      });
    });

    this.container.querySelector('#btn-component-start-puzzle')?.addEventListener('click', () => {
      if (typeof this.props.onStartPuzzle === 'function') {
        this.props.onStartPuzzle(this.selectedDifficulty);
      }
    });
  }
}
