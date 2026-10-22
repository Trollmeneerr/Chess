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

    // Responsive sidebar collapse on window resize / orientation change
    window.addEventListener('resize', () => {
      const isMobile = window.innerWidth <= 768;
      if (!isMobile) {
        this.setSidebarCollapsed(false);
      } else {
        const gameStarted = this.isGameOrPuzzleOrAnalysisStarted();
        this.setSidebarCollapsed(gameStarted);
      }
    });

    // Warn on page unload / refresh if match or puzzle in progress
    window.addEventListener('beforeunload', (e) => {
      if (this.isMatchOrPuzzleInProgress()) {
        e.preventDefault();
        e.returnValue = 'You have an active game/puzzle in progress. Leaving will automatically resign and forfeit ELO.';
        return e.returnValue;
      }
    });

    // Initialize top scroll progress bar
    this.initScrollProgress();
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
      window.PuzzlesPage?.inActivePuzzle === true &&
      Boolean(window.puzzleState?.currentPuzzle || window.PuzzlesPage?.currentPuzzle || window.puzzleController?.puzzle) &&
      !window.puzzleState?.isFinished &&
      !window.PuzzlesPage?.isFinished &&
      !window.puzzleController?.isCompleted;

    return Boolean(isPvpActive || isBotActive || isPuzzleActive);
  },

  isGameOrPuzzleOrAnalysisStarted() {
    if (this.isMatchOrPuzzleInProgress()) return true;

    // Check if active game review analysis board is loaded
    if (this.currentPage === 'analysis') {
      const workspace = document.getElementById('analysis-workspace');
      if (workspace && !workspace.classList.contains('hidden') && window.AnalysisPage?.currentAnalysis) {
        return true;
      }
    }

    return false;
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
      window.PuzzlesPage?.inActivePuzzle === true &&
      Boolean(window.puzzleState?.currentPuzzle || window.PuzzlesPage?.currentPuzzle || window.puzzleController?.puzzle) &&
      !window.puzzleState?.isFinished &&
      !window.PuzzlesPage?.isFinished &&
      !window.puzzleController?.isCompleted;

    if (isPuzzleActive) {
      const ok = window.confirm(
        'You are currently solving a puzzle. Leaving now will automatically forfeit the puzzle and you will lose ELO.\n\nAre you sure you want to leave?'
      );
      if (!ok) return false;

      if (window.puzzleState) window.puzzleState.isFinished = true;
      if (window.PuzzlesPage) window.PuzzlesPage.isFinished = true;
      if (window.puzzleController) window.puzzleController.isCompleted = true;

      const puzzle = window.puzzleState?.currentPuzzle || window.PuzzlesPage?.currentPuzzle || window.puzzleController?.puzzle;
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
      this.closeSidebarDrawer();
      this.navigateTo('lobby');
    });

    // Clicking avatar/user panel navigates to profile
    document.getElementById('user-panel')?.addEventListener('click', (e) => {
      // Don't navigate if logout button was clicked
      if (e.target.closest('#btn-logout')) return;
      this.closeSidebarDrawer();
      this.navigateTo('profile');
    });

    // Top-left Arrow toggle button for mobile when game/puzzle/analysis is started
    document.getElementById('sidebar-toggle-btn')?.addEventListener('click', (e) => {
      if (window.innerWidth > 768) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      this.toggleSidebarDrawer();
    });

    // Tap backdrop to close drawer
    document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
      this.closeSidebarDrawer();
    });

    // Close drawer on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeSidebarDrawer();
    });
  },

  toggleSidebarDrawer() {
    if (window.innerWidth > 768) return; // Never toggle on desktop
    const appEl = document.getElementById('app');
    if (!appEl) return;
    appEl.classList.toggle('sidebar-drawer-open');
  },

  closeSidebarDrawer() {
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.classList.remove('sidebar-drawer-open');
    }
  },

  openSidebarDrawer() {
    if (window.innerWidth > 768) return; // Never open on desktop
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.classList.add('sidebar-drawer-open');
    }
  },

  setSidebarCollapsed(collapsed) {
    const isMobile = window.innerWidth <= 768;
    const appEl = document.getElementById('app');
    if (!appEl) return;

    if (!isMobile) {
      // NEVER collapse on desktop
      appEl.classList.remove('nav-collapsed');
      appEl.classList.remove('sidebar-drawer-open');
      return;
    }

    appEl.classList.toggle('nav-collapsed', Boolean(collapsed));
    if (!collapsed) {
      appEl.classList.remove('sidebar-drawer-open');
    }
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

    // Close any open mobile drawer on route transition
    this.closeSidebarDrawer();

    // On desktop, keep sidebar navigation open at all times.
    // On mobile, only collapse sidebar when a game, puzzle, or analysis is started.
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
      this.setSidebarCollapsed(false);
    } else {
      const willDirectlyStartGame = (page === 'play' && params) || (page === 'analysis' && params && (params.pgn || params.inviteCode));
      this.setSidebarCollapsed(Boolean(willDirectlyStartGame));
    }

    // Wipe leftover classes (.highlight-analysis, .highlight-premove, .in-check) and SVG arrows
    if (typeof resetBoardVisualState === 'function') {
      resetBoardVisualState();
    }

    // Update active nav button
    document.querySelectorAll('.nav-item').forEach(item => {
      const p = item.dataset.page;
      item.classList.toggle('active', p === page || (page === 'lobby' && p === 'lobby'));
    });

    // Clean up previous page resources (e.g. Analysis Stockfish worker and event listeners)
    if (page !== 'analysis') {
      window.AnalysisPage?.cleanup?.();
    }

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
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTop = 0;
    this.updateScrollProgress?.();
  },

  initScrollProgress() {
    const bar = document.getElementById('scrollProgressBar');
    const container = document.getElementById('scrollProgressContainer');
    const mainContent = document.querySelector('.main-content');
    if (!bar) return;

    this.updateScrollProgress = () => {
      let scrollTop = 0;
      let scrollHeight = 0;
      let clientHeight = 0;

      if (mainContent && mainContent.scrollHeight > mainContent.clientHeight) {
        scrollTop = mainContent.scrollTop;
        scrollHeight = mainContent.scrollHeight;
        clientHeight = mainContent.clientHeight;
      } else {
        scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
        scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
        clientHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      }

      const totalScroll = scrollHeight - clientHeight;
      const progress = totalScroll > 0 ? (scrollTop / totalScroll) * 100 : 0;
      bar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    };

    if (mainContent) {
      mainContent.addEventListener('scroll', this.updateScrollProgress, { passive: true });
    }
    window.addEventListener('scroll', this.updateScrollProgress, { passive: true });
    window.addEventListener('resize', this.updateScrollProgress, { passive: true });

    if (container) {
      container.addEventListener('click', (e) => {
        const rect = container.getBoundingClientRect();
        const clickRatio = (e.clientX - rect.left) / rect.width;
        if (mainContent && mainContent.scrollHeight > mainContent.clientHeight) {
          mainContent.scrollTo({
            top: clickRatio * (mainContent.scrollHeight - mainContent.clientHeight),
            behavior: 'smooth'
          });
        } else {
          window.scrollTo({
            top: clickRatio * (document.documentElement.scrollHeight - window.innerHeight),
            behavior: 'smooth'
          });
        }
      });
    }

    this.updateScrollProgress();
  }
};

window.App = App;

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

