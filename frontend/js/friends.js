/**
 * Friends Module & Widget
 * Handles friend requests, search, online status, and friend list widgets
 * Reusable on both Homescreen (dashboard right panel) and Profile page
 */
const FriendsWidget = {
  friends: [],
  incoming: [],
  outgoing: [],
  searchResults: [],
  isSearching: false,
  activeTab: 'friends', // 'friends' | 'requests' | 'add'

  async fetchFriends() {
    if (!Auth.currentUser) {
      this.friends = [];
      this.incoming = [];
      this.outgoing = [];
      return;
    }
    try {
      const data = await Api.get('/users/friends');
      this.friends = data.friends || [];
      this.incoming = data.incoming || [];
      this.outgoing = data.outgoing || [];
    } catch (err) {
      console.warn('[Friends] Failed to fetch friends list:', err);
    }
  },

  async searchUsers(query) {
    if (!query || query.trim().length < 1) {
      this.searchResults = [];
      return [];
    }
    try {
      const data = await Api.get(`/users/search?q=${encodeURIComponent(query.trim())}`);
      this.searchResults = data.users || [];
      return this.searchResults;
    } catch (err) {
      console.warn('[Friends] Search error:', err);
      this.searchResults = [];
      return [];
    }
  },

  async sendRequest(targetUsername, containerId = null) {
    if (!Auth.requireAuth()) return;
    try {
      const res = await Api.post('/users/friends/request', { target_username: targetUsername });
      alert(res.message || `Friend request sent to ${targetUsername}`);
      await this.fetchFriends();
      if (containerId) this.render(containerId);
    } catch (err) {
      alert(err.message || 'Could not send friend request');
    }
  },

  async acceptRequest(requestId, containerId = null) {
    if (!Auth.requireAuth()) return;
    try {
      await Api.post('/users/friends/accept', { request_id: requestId });
      await this.fetchFriends();
      if (containerId) this.render(containerId);
    } catch (err) {
      alert(err.message || 'Could not accept friend request');
    }
  },

  async declineRequest(requestId, containerId = null) {
    if (!Auth.requireAuth()) return;
    try {
      await Api.post('/users/friends/decline', { request_id: requestId });
      await this.fetchFriends();
      if (containerId) this.render(containerId);
    } catch (err) {
      alert(err.message || 'Could not decline friend request');
    }
  },

  async removeFriend(friendId, containerId = null) {
    if (!confirm('Remove this user from your friends?')) return;
    try {
      await Api.post('/users/friends/remove', { friend_id: friendId });
      await this.fetchFriends();
      if (containerId) this.render(containerId);
    } catch (err) {
      alert(err.message || 'Could not remove friend');
    }
  },

  /**
   * Render Friends Widget into a given container element
   */
  async render(containerId) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return;

    await this.fetchFriends();

    const isLoggedIn = Boolean(Auth.currentUser);
    const friendsCount = this.friends.length;
    const incomingCount = this.incoming.length;

    let html = `
      <div class="friends-widget glass-panel">
        <div class="friends-widget-header">
          <div class="d-flex align-items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <h3 style="font-size:15px;font-weight:700;margin:0;">Friends & Community</h3>
          </div>
          ${incomingCount > 0 ? `<span class="badge badge-accent" title="${incomingCount} pending request(s)">+${incomingCount}</span>` : ''}
        </div>

        ${!isLoggedIn ? `
          <div class="friends-widget-auth-prompt text-center p-3">
            <p class="text-secondary mb-2" style="font-size:13px;">Sign in to search friends, send invites, and play live matches.</p>
            <button class="btn btn-primary btn-sm btn-block" data-action="show-login">Sign In</button>
          </div>
        ` : `
          <!-- Friend Widget Tabs -->
          <div class="friends-widget-tabs">
            <button class="friends-tab-btn ${this.activeTab === 'friends' ? 'active' : ''}" data-tab="friends">
              Friends (${friendsCount})
            </button>
            <button class="friends-tab-btn ${this.activeTab === 'requests' ? 'active' : ''}" data-tab="requests">
              Requests ${incomingCount > 0 ? `(${incomingCount})` : ''}
            </button>
            <button class="friends-tab-btn ${this.activeTab === 'add' ? 'active' : ''}" data-tab="add">
              + Add
            </button>
          </div>

          <!-- Tab Content -->
          <div class="friends-widget-body">
            <!-- Add Friend Search Input (Always visible or in Tab) -->
            <div class="friend-search-box ${this.activeTab === 'add' ? 'active-search' : ''} mb-2">
              <div class="input-with-icon">
                <input type="text" class="form-input friend-search-input" placeholder="Search username..." autocomplete="off">
                <button class="btn btn-primary btn-sm friend-search-btn">Search</button>
              </div>
              <div class="friend-search-results mt-2 hidden"></div>
            </div>

            ${this.activeTab === 'friends' ? this.renderFriendsListHTML() : ''}
            ${this.activeTab === 'requests' ? this.renderRequestsListHTML() : ''}
            ${this.activeTab === 'add' ? `<div class="text-secondary text-center p-2" style="font-size:12px;">Type a username above to search and send friend requests.</div>` : ''}
          </div>
        `}
      </div>
    `;

    container.innerHTML = html;
    this.bindEvents(container, containerId);
  },

  renderFriendsListHTML() {
    if (this.friends.length === 0) {
      return `
        <div class="friends-empty-state text-center p-3 text-secondary" style="font-size:13px;">
          <div style="font-size:24px;margin-bottom:6px;">♟️</div>
          <div>No friends added yet.</div>
          <div style="font-size:11px;margin-top:4px;" class="text-muted">Search for players above to add friends!</div>
        </div>
      `;
    }

    let list = '<div class="friends-list">';
    for (const f of this.friends) {
      const avatarHTML = AppConfig.getAvatarHTML(f.avatar_id, f.avatar_custom);
      list += `
        <div class="friend-item" data-user-id="${f.id}">
          <div class="friend-avatar-wrap">
            ${avatarHTML}
            <span class="friend-online-dot"></span>
          </div>
          <div class="friend-meta">
            <div class="friend-name" data-action="open-profile" data-profile="${encodeURIComponent(f.username)}" style="cursor:pointer;">${f.username}</div>
            <div class="friend-rating text-muted">${f.elo_rating || 800} ELO</div>
          </div>
          <div class="friend-actions">
            <button class="btn btn-outline btn-xs friend-challenge-btn" title="Challenge ${f.username}" data-action="play-online">Play</button>
            <button class="btn btn-ghost btn-xs text-muted friend-remove-btn" title="Remove Friend" data-remove-id="${f.id}">&times;</button>
          </div>
        </div>
      `;
    }
    list += '</div>';
    return list;
  },

  renderRequestsListHTML() {
    if (this.incoming.length === 0 && this.outgoing.length === 0) {
      return `
        <div class="friends-empty-state text-center p-3 text-secondary" style="font-size:13px;">
          <div>No pending friend requests.</div>
        </div>
      `;
    }

    let html = '';
    if (this.incoming.length > 0) {
      html += '<div class="friends-section-title">Incoming Requests</div><div class="friends-list mb-2">';
      for (const r of this.incoming) {
        const avatarHTML = AppConfig.getAvatarHTML(r.avatar_id, r.avatar_custom);
        html += `
          <div class="friend-item">
            <div class="friend-avatar-wrap">${avatarHTML}</div>
            <div class="friend-meta">
              <div class="friend-name">${r.username}</div>
              <div class="friend-rating text-muted">${r.elo_rating || 800} ELO</div>
            </div>
            <div class="friend-actions">
              <button class="btn btn-primary btn-xs req-accept-btn" data-req-id="${r.request_id}">Accept</button>
              <button class="btn btn-ghost btn-xs text-danger req-decline-btn" data-req-id="${r.request_id}">Decline</button>
            </div>
          </div>
        `;
      }
      html += '</div>';
    }

    if (this.outgoing.length > 0) {
      html += '<div class="friends-section-title text-muted">Pending Sent Requests</div><div class="friends-list">';
      for (const r of this.outgoing) {
        html += `
          <div class="friend-item" style="opacity:0.75;">
            <div class="friend-meta">
              <div class="friend-name">${r.username}</div>
              <div class="text-muted" style="font-size:11px;">Waiting for response...</div>
            </div>
            <button class="btn btn-ghost btn-xs text-muted req-decline-btn" data-req-id="${r.request_id}" title="Cancel Request">Cancel</button>
          </div>
        `;
      }
      html += '</div>';
    }

    return html;
  },

  bindEvents(container, containerId) {
    // Tab switching
    container.querySelectorAll('.friends-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.render(containerId);
      });
    });

    // Accept / Decline / Remove
    container.querySelectorAll('.req-accept-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.acceptRequest(btn.dataset.reqId, containerId);
      });
    });

    container.querySelectorAll('.req-decline-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.declineRequest(btn.dataset.reqId, containerId);
      });
    });

    container.querySelectorAll('.friend-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeFriend(btn.dataset.removeId, containerId);
      });
    });

    // Search input & button
    const searchInput = container.querySelector('.friend-search-input');
    const searchBtn = container.querySelector('.friend-search-btn');
    const resultsContainer = container.querySelector('.friend-search-results');

    const performSearch = async () => {
      const q = searchInput?.value.trim();
      if (!q || !resultsContainer) return;
      resultsContainer.classList.remove('hidden');
      resultsContainer.innerHTML = '<div class="text-center p-2 text-muted" style="font-size:12px;">Searching...</div>';
      const results = await this.searchUsers(q);
      if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="text-center p-2 text-muted" style="font-size:12px;">No players found matching "' + q + '"</div>';
        return;
      }
      let resHTML = '';
      results.forEach(u => {
        const isAlreadyFriend = this.friends.some(f => f.id === u.id);
        const hasPending = this.outgoing.some(o => o.receiver_id === u.id);
        const avatarHTML = AppConfig.getAvatarHTML(u.avatar_id, u.avatar_custom);
        resHTML += `
          <div class="search-user-card">
            <div class="friend-avatar-wrap" style="width:28px;height:28px;">${avatarHTML}</div>
            <div class="search-user-meta">
              <span class="search-user-name">${u.username}</span>
              <span class="search-user-elo">${u.elo_rating || 800} ELO</span>
            </div>
            ${isAlreadyFriend
              ? '<span class="badge badge-success">Friend</span>'
              : hasPending
                ? '<span class="badge badge-accent">Sent</span>'
                : `<button class="btn btn-primary btn-xs btn-add-friend" data-username="${u.username}">+ Add</button>`
            }
          </div>
        `;
      });
      resultsContainer.innerHTML = resHTML;

      resultsContainer.querySelectorAll('.btn-add-friend').forEach(b => {
        b.addEventListener('click', () => {
          this.sendRequest(b.dataset.username, containerId);
        });
      });
    };

    searchBtn?.addEventListener('click', performSearch);
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performSearch();
      }
    });
  }
};

window.FriendsWidget = FriendsWidget;
