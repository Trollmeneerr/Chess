/**
 * Main Application Bootstrap & Client-Side Router
 */
const App = {
  currentPage: null,

  async init() {
    console.log('[App] Initializing Refrigerator Chess...');

    // Initialize Auth
    await Auth.init();

    // Bind sidebar navigation
    this.bindNavigation();

    // Handle initial route
    this.handleRoute();

    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleRoute());

    // Listen for browser popstate
    window.addEventListener('popstate', () => this.handleRoute());

    // Warn on page unload / refresh if match or puzzle in progress
    window.addEventListener('beforeunload', (e) => {
      if (this.isMatchOrPuzzleInProgress()) {
        e.preventDefault();
        e.returnValue = 'You have an active game/puzzle in progress. Leaving will automatically resign and forfeit ELO.';
        return e.returnValue;
      }
    });
  },

  isMatchOrPuzzleInProgress() {
    const isPvpActive = window.PlayPage &&
      window.PlayPage.socket &&
      window.PlayPage.socket.connected &&
      window.PlayPage.currentGame &&
      window.PlayPage.gameActive &&
      !window.PlayPage.isGameOver &&
      (window.PlayPage.currentGame.role === 'white' || window.PlayPage.currentGame.role === 'black');

    const isBotActive = window.BotsPage &&
      window.BotsPage.socket &&
      window.BotsPage.socket.connected &&
      window.BotsPage.activeGame &&
      !window.BotsPage.isGameOver;

    const isPuzzleActive = this.currentPage === 'puzzles' &&
      Boolean(window.puzzleState?.currentPuzzle || window.PuzzlesPage?.currentPuzzle) &&
      !window.puzzleState?.isFinished &&
      !window.PuzzlesPage?.isFinished;

    return Boolean(isPvpActive || isBotActive || isPuzzleActive);
  },

  confirmLeaveActiveMatchOrPuzzle(destinationPage) {
    if (this.currentPage === destinationPage) {
      return true;
    }

    // 1. Check PvP match
    const isPvpActive = window.PlayPage &&
      window.PlayPage.socket &&
      window.PlayPage.socket.connected &&
      window.PlayPage.currentGame &&
      window.PlayPage.gameActive &&
      !window.PlayPage.isGameOver &&
      (window.PlayPage.currentGame.role === 'white' || window.PlayPage.currentGame.role === 'black');

    if (isPvpActive) {
      const ok = window.confirm(
        'You are currently in an active game. Leaving now will automatically resign the match and you will lose ELO.\n\nAre you sure you want to leave?'
      );
      if (!ok) return false;

      try {
        if (typeof window.PlayPage.resign === 'function') {
          window.PlayPage.resign();
        } else if (window.PlayPage.socket && (window.PlayPage.currentGame?.invite_code || window.PlayPage.currentInviteCode)) {
          window.PlayPage.socket.emit('resign', { invite_code: window.PlayPage.currentGame?.invite_code || window.PlayPage.currentInviteCode });
          window.PlayPage.gameActive = false;
          window.PlayPage.isGameOver = true;
        }
      } catch (err) {
        console.warn('[Auto-Resign PvP] Error:', err);
      }
      return true;
    }

    // 2. Check Bot match
    const isBotActive = window.BotsPage &&
      window.BotsPage.socket &&
      window.BotsPage.socket.connected &&
      window.BotsPage.activeGame &&
      !window.BotsPage.isGameOver;

    if (isBotActive) {
      const ok = window.confirm(
        'You are currently playing against a bot. Leaving now will automatically resign the match.\n\nAre you sure you want to leave?'
      );
      if (!ok) return false;

      try {
        if (typeof window.BotsPage.resign === 'function') {
          window.BotsPage.resign();
        } else if (window.BotsPage.socket && window.BotsPage.activeGame?.gameId) {
          window.BotsPage.socket.emit('resign', { game_id: window.BotsPage.activeGame.gameId });
          window.BotsPage.isGameOver = true;
          window.BotsPage.activeGame = null;
        }
      } catch (err) {
        console.warn('[Auto-Resign Bot] Error:', err);
      }
      return true;
    }

    // 3. Check Tactical Puzzle
    const isPuzzleActive = this.currentPage === 'puzzles' &&
      Boolean(window.puzzleState?.currentPuzzle || window.PuzzlesPage?.currentPuzzle) &&
      !window.puzzleState?.isFinished &&
      !window.PuzzlesPage?.isFinished;

    if (isPuzzleActive) {
      const ok = window.confirm(
        'You are currently solving a puzzle. Leaving now will automatically forfeit the puzzle and you will lose ELO.\n\nAre you sure you want to leave?'
      );
      if (!ok) return false;

      if (window.puzzleState) window.puzzleState.isFinished = true;
      if (window.PuzzlesPage) window.PuzzlesPage.isFinished = true;

      const puzzle = window.puzzleState?.currentPuzzle || window.PuzzlesPage?.currentPuzzle;
      if (window.Auth && window.Auth.currentUser && window.Api && puzzle) {
        const puzzleId = puzzle.id || puzzle.puzzle_id;
        window.Api.post(`/puzzles/${puzzleId}/attempt`, {
          solved: false,
          reward: -1,
          penalty_count: 99
        }).then(res => {
          if (res && res.new_elo !== undefined) {
            window.Auth.currentUser.elo_rating = res.new_elo;
            window.Auth.updateUI();
          }
        }).catch(err => {
          console.warn('[Auto-Resign Puzzle] Error recording attempt:', err);
        });
      }
      return true;
    }

    return true;
  },

  bindNavigation() {
    // Intercept clicks on internal links to route through SPA
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href) return;

      // Check if it's an internal application route
      if (href.startsWith('/') && !href.startsWith('//') && !link.target && !link.hasAttribute('download')) {
        // Exclude direct API routes or static image links
        if (href.startsWith('/api/') || href.startsWith('/img/')) return;

        e.preventDefault();
        const cleanPath = href.replace(/^\//, '');
        const parts = cleanPath.split('/');
        const page = parts[0] || 'lobby';
        const params = parts.slice(1).join('/') || null;
        this.navigateTo(page, params);
      }
    });

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.navigateTo(page);
      });
    });

    // Logo click returns to lobby/home
    document.querySelector('.sidebar-logo')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.navigateTo('lobby');
    });

    // Clicking avatar/user panel navigates to profile
    document.getElementById('user-panel')?.addEventListener('click', (e) => {
      // Don't navigate if logout button was clicked
      if (e.target.closest('#btn-logout')) return;
      this.navigateTo('profile');
    });
  },

  handleRoute() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    const pathname = window.location.pathname.replace(/^\//, '');

    // Check direct URL path e.g. /play/inv_12345 or /profile/player1
    let route = hash || pathname || 'lobby';
    let params = null;

    if (route.startsWith('play/')) {
      params = route.split('play/')[1];
      route = 'play';
    } else if (route.startsWith('play')) {
      params = route.substring(4).replace(/^\//, '') || null;
      route = 'play';
    } else if (route.startsWith('profile/')) {
      params = decodeURIComponent(route.split('profile/')[1]);
      route = 'profile';
    } else if (route.startsWith('profile')) {
      params = decodeURIComponent(route.substring(7).replace(/^\//, '') || '') || null;
      route = 'profile';
    } else if (route.startsWith('bots/')) {
      params = route.split('bots/')[1];
      route = 'bots';
    } else if (route === '' || route === 'home') {
      route = 'lobby';
    }

    // Intercept if navigating away from active game/puzzle via history back/forward
    if (this.currentPage && route !== this.currentPage) {
      if (!this.confirmLeaveActiveMatchOrPuzzle(route)) {
        const revertPath = this.currentPage === 'lobby' ? '/' : `/${this.currentPage}`;
        window.history.pushState({ page: this.currentPage }, '', revertPath);
        return;
      }
    }

    this.renderPage(route, params);
  },

  navigateTo(page, params = null) {
    if (!this.confirmLeaveActiveMatchOrPuzzle(page)) {
      return;
    }

    let targetPath = `/${page}`;
    if (params && typeof params === 'string') {
      targetPath = `/${page}/${params}`;
    } else if (page === 'lobby' || page === '') {
      targetPath = '/';
    }

    // Update browser URL state without page refresh
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ page, params }, '', targetPath);
    }

    this.renderPage(page, params);
  },

  renderPage(page, params = null) {
    this.currentPage = page;

    // Wipe leftover classes (.highlight-analysis, .highlight-premove, .in-check, .last-move) and SVG arrows
    if (typeof resetBoardVisualState === 'function') {
      resetBoardVisualState();
    }

    // Update active nav button
    document.querySelectorAll('.nav-item').forEach(item => {
      const p = item.dataset.page;
      item.classList.toggle('active', p === page || (page === 'lobby' && p === 'lobby'));
    });

    // Render corresponding page module
    switch (page) {
      case 'lobby':
      case '':
        LobbyPage.render();
        break;
      case 'play':
        PlayPage.render(params);
        break;
      case 'bots':
        BotsPage.render(params);
        break;
      case 'puzzles':
        PuzzlesPage.render();
        break;
      case 'leaderboard':
        LeaderboardPage.render();
        break;
      case 'analysis':
        AnalysisPage.render(params || {});
        break;
      case 'profile':
        ProfilePage.render(params);
        break;
      default:
        LobbyPage.render();
        break;
    }

    // Scroll to top of content
    window.scrollTo(0, 0);
  }
};

window.App = App;

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

