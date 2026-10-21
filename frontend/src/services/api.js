/**
 * Decoupled REST API Service
 * Centralizes all HTTP communication between frontend and backend REST endpoints.
 */

const BASE_URL = '/api';

class ApiService {
  /**
   * Perform an HTTP request with error handling and JSON parsing.
   * @param {string} endpoint - Path relative to /api (e.g. '/auth/me')
   * @param {RequestInit} [options]
   * @returns {Promise<any>}
   */
  async request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('chess_token') : null;

    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    const config = {
      ...options,
      headers,
      credentials: 'include' // include cookies for auth
    };

    try {
      const res = await fetch(url, config);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const errorMsg = data?.error || data?.message || `HTTP ${res.status}: ${res.statusText}`;
        const err = new Error(errorMsg);
        err.status = res.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (err) {
      console.warn(`[API] Error on ${options.method || 'GET'} ${url}:`, err.message);
      throw err;
    }
  }

  // --- Convenience HTTP Verbs ---

  get(endpoint, headers = {}) {
    return this.request(endpoint, { method: 'GET', headers });
  }

  post(endpoint, body = {}, headers = {}) {
    return this.request(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
  }

  put(endpoint, body = {}, headers = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
  }

  delete(endpoint, headers = {}) {
    return this.request(endpoint, { method: 'DELETE', headers });
  }

  // --- Domain-Specific REST Endpoint Methods ---

  // Auth
  login(username, password) {
    return this.post('/auth/login', { username, password });
  }

  register(username, password, avatar_id, timezone_id) {
    return this.post('/auth/register', { username, password, avatar_id, timezone_id });
  }

  getMe() {
    return this.get('/auth/me');
  }

  logout() {
    return this.post('/auth/logout');
  }

  // Games
  createGame(color, time_control, game_type = 'pvp') {
    return this.post('/games/create', { color, time_control, game_type });
  }

  joinGame(inviteCode) {
    return this.post(`/games/join/${inviteCode}`);
  }

  getMyGameHistory() {
    return this.get('/games/history/me');
  }

  // Puzzles
  getRandomPuzzle(difficulty = 'medium', multiMove = true) {
    return this.get(`/puzzles/random?difficulty=${difficulty}&multi_move=${multiMove}`);
  }

  submitPuzzleAttempt(puzzleId, { solved, reward, used_solution, penalty_count }) {
    return this.post(`/puzzles/${puzzleId}/attempt`, {
      solved,
      reward,
      used_solution,
      penalty_count
    });
  }

  getPuzzleTierStats() {
    return this.get('/puzzles/stats/tiers');
  }

  // Users & Profiles
  getUserProfile(username) {
    return this.get(`/users/profile/${username}`);
  }

  updateTimezone(timezone_id) {
    return this.post('/users/timezone', { timezone_id });
  }

  getLeaderboard() {
    return this.get('/users/leaderboard');
  }

  // Analysis
  analyzeGame(pgn, invite_code = null, force = false) {
    return this.post('/analysis/game', { pgn, invite_code, force });
  }

  getStoredAnalysis(identifier) {
    return this.get(`/analysis/game/${identifier}`);
  }

  evaluateFen(fen, depth = 16) {
    return this.post('/analysis/evaluate', { fen, depth });
  }
}

export const api = new ApiService();

if (typeof window !== 'undefined') {
  window.Api = api;
}
