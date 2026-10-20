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

    this.renderPage(route, params);
  },

  navigateTo(page, params = null) {
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

