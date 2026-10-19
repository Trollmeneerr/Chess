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
  },

  bindNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        this.navigateTo(page);
      });
    });

    // Logo click returns to lobby/home
    document.querySelector('.sidebar-logo')?.addEventListener('click', () => {
      this.navigateTo('lobby');
    });
  },

  handleRoute() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    const pathname = window.location.pathname.replace(/^\//, '');

    // Check direct URL path e.g. /play/inv_12345
    let route = hash || pathname || 'lobby';
    let params = null;

    if (route.startsWith('play/')) {
      params = route.split('play/')[1];
      route = 'play';
    } else if (route.startsWith('play')) {
      route = 'play';
    }

    this.renderPage(route, params);
  },

  navigateTo(page, params = null) {
    if (page === 'lobby') {
      window.location.hash = '';
    } else if (params && typeof params === 'string') {
      window.location.hash = `#${page}/${params}`;
    } else {
      window.location.hash = `#${page}`;
    }

    this.renderPage(page, params);
  },

  renderPage(page, params = null) {
    this.currentPage = page;

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
      default:
        LobbyPage.render();
        break;
    }

    // Scroll to top of content
    window.scrollTo(0, 0);
  }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
