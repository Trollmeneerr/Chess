/**
 * Auth Module — Login, Register, Session Management
 */
const Auth = {
  currentUser: null,

  async init() {
    if (Api.token) {
      try {
        const data = await Api.get('/auth/me');
        this.currentUser = data.user;
        this.updateUI();
      } catch (err) {
        Api.setToken(null);
        this.currentUser = null;
        this.updateUI();
      }
    }
    this.bindEvents();
  },

  bindEvents() {
    document.getElementById('btn-show-login')?.addEventListener('click', () => this.showLoginModal());
    document.getElementById('btn-show-register')?.addEventListener('click', () => this.showRegisterModal());
    document.getElementById('auth-modal-close')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btn-logout')?.addEventListener('click', () => this.logout());

    document.getElementById('auth-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'auth-modal') this.closeModal();
    });
  },

  showLoginModal() {
    const content = document.getElementById('auth-modal-content');
    content.innerHTML = `
      <h2>Welcome Back</h2>
      <p class="modal-text">Sign in to track your rating and challenge bots.</p>
      <form id="login-form">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input type="text" class="form-input" id="login-username" placeholder="Enter username" required autocomplete="username">
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" class="form-input" id="login-password" placeholder="Enter password" required autocomplete="current-password">
        </div>
        <div id="login-error" class="form-error hidden"></div>
        <button type="submit" class="btn btn-primary btn-block mt-2">Sign In</button>
        <p class="text-center mt-2">
          <a href="#" id="show-forgot" class="text-accent" style="text-decoration:none;font-size:13px;">Forgot Password?</a>
        </p>
        <p class="text-center mt-1" style="font-size:13px;color:var(--text-muted);">
          Don't have an account? <a href="#" id="switch-to-register" class="text-accent" style="text-decoration:none;">Register</a>
        </p>
      </form>
    `;
    document.getElementById('auth-modal').classList.remove('hidden');

    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.login();
    });
    document.getElementById('switch-to-register')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showRegisterModal();
    });
    document.getElementById('show-forgot')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.closeModal();
      document.getElementById('forgot-modal').classList.remove('hidden');
    });
    document.getElementById('forgot-modal-close')?.addEventListener('click', () => {
      document.getElementById('forgot-modal').classList.add('hidden');
    });
  },

  showRegisterModal() {
    let avatarHTML = '';
    AppConfig.AVATARS.forEach((pieceKey, i) => {
      avatarHTML += `
        <div class="avatar-option${i === 0 ? ' selected' : ''}" data-avatar="${i + 1}" title="Avatar ${i + 1}">
          <div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
            ${AppConfig.getPiece(pieceKey)}
          </div>
        </div>
      `;
    });

    const content = document.getElementById('auth-modal-content');
    content.innerHTML = `
      <h2>Create Account</h2>
      <p class="modal-text">Join Refrigerator Chess — no email required.</p>
      <form id="register-form">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input type="text" class="form-input" id="reg-username" placeholder="3-20 characters" required minlength="3" maxlength="20" pattern="[a-zA-Z0-9_-]+" autocomplete="username">
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" class="form-input" id="reg-password" placeholder="Min 6 characters" required minlength="6" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label class="form-label">Choose Avatar</label>
          <div class="avatar-grid" id="avatar-grid">
            ${avatarHTML}
          </div>
        </div>
        <input type="hidden" id="reg-avatar" value="1">
        <div id="reg-error" class="form-error hidden"></div>
        <button type="submit" class="btn btn-primary btn-block mt-2">Create Account</button>
        <p class="text-center mt-2" style="font-size:13px;color:var(--text-muted);">
          Already have an account? <a href="#" id="switch-to-login" class="text-accent" style="text-decoration:none;">Sign In</a>
        </p>
      </form>
    `;
    document.getElementById('auth-modal').classList.remove('hidden');

    // Avatar selection
    document.querySelectorAll('.avatar-option').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.avatar-option').forEach(a => a.classList.remove('selected'));
        el.classList.add('selected');
        document.getElementById('reg-avatar').value = el.dataset.avatar;
      });
    });

    document.getElementById('register-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.register();
    });
    document.getElementById('switch-to-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showLoginModal();
    });
  },

  async login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
      const data = await Api.post('/auth/login', { username, password });
      Api.setToken(data.token);
      this.currentUser = data.user;
      this.updateUI();
      this.closeModal();
      App.navigateTo('lobby');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  },

  async register() {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const avatar_id = parseInt(document.getElementById('reg-avatar').value);
    const errorEl = document.getElementById('reg-error');

    try {
      const data = await Api.post('/auth/register', { username, password, avatar_id });
      Api.setToken(data.token);
      this.currentUser = data.user;
      this.updateUI();
      this.closeModal();
      App.navigateTo('lobby');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  },

  logout() {
    Api.post('/auth/logout').catch(() => {});
    Api.setToken(null);
    this.currentUser = null;
    this.updateUI();
    App.navigateTo('lobby');
  },

  closeModal() {
    document.getElementById('auth-modal').classList.add('hidden');
  },

  updateUI() {
    const userPanel = document.getElementById('user-panel');
    const authPanel = document.getElementById('auth-panel');

    if (this.currentUser) {
      userPanel?.classList.remove('hidden');
      authPanel?.classList.add('hidden');
      const avatarEl = document.getElementById('sidebar-avatar');
      if (avatarEl) {
        avatarEl.innerHTML = AppConfig.getAvatarHTML(this.currentUser.avatar_id);
      }
      document.getElementById('sidebar-username').textContent = this.currentUser.username;
      document.getElementById('sidebar-elo').textContent = `${this.currentUser.elo_rating || 800} ELO`;
    } else {
      userPanel?.classList.add('hidden');
      authPanel?.classList.remove('hidden');
    }
  },

  requireAuth() {
    if (!this.currentUser) {
      this.showLoginModal();
      return false;
    }
    return true;
  }
};

window.Auth = Auth;

