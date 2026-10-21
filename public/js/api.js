/**
 * API Helper — Fetch wrapper with auth
 */
const Api = {
  token: localStorage.getItem('chess_token') || null,

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('chess_token', token);
    else localStorage.removeItem('chess_token');
  },

  async request(method, url, body = null) {
    // Ephemeral Engine Analysis: Completely disable/bypass any API calls saving moves to database
    const isAnalysisActive = Boolean(
      (window.ChessBoard && window.ChessBoard.isAnalysis) ||
      document.querySelector('.analysis-layout') ||
      document.querySelector('#chess-board-grid.is-analysis') ||
      (window.AnalysisPage && window.AnalysisPage.isExploring !== undefined && document.getElementById('analysis-workspace') && !document.getElementById('analysis-workspace').classList.contains('hidden'))
    );
    if (isAnalysisActive && (url.includes('/moves') || url.includes('/games/move'))) {
      return { success: true, bypassed: true, localOnly: true };
    }

    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    };
    if (this.token) {
      opts.headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(AppConfig.API_BASE + url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  del(url) { return this.request('DELETE', url); }
};
