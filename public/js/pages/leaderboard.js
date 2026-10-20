/**
 * Leaderboard Page — Top Ratings, Puzzles Solved, and Bosses Defeated
 */
const LeaderboardPage = {
  async render() {
    const main = document.getElementById('main-content');

    main.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1 class="page-title">Leaderboard</h1>
          <p class="page-subtitle">Top rated players on isyourrefrigerator.online</p>
        </div>

        <div class="glass-panel" style="padding:20px;overflow-x:auto;">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th style="width:50px;">Rank</th>
                <th>Player</th>
                <th>Rating</th>
                <th>Puzzles Solved</th>
                <th>Bots Defeated</th>
              </tr>
            </thead>
            <tbody id="leaderboard-tbody">
              <tr>
                <td colspan="5" class="text-center text-muted" style="padding:32px;">Loading leaderboard...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    try {
      const data = await Api.get('/users/leaderboard');
      const players = data.players || [];
      const tbody = document.getElementById('leaderboard-tbody');

      if (players.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding:32px;">No players registered yet. Be the first!</td></tr>';
        return;
      }

      let rows = '';
      players.forEach((p, idx) => {
        const rank = idx + 1;
        let rankClass = '';
        if (rank === 1) rankClass = 'gold';
        else if (rank === 2) rankClass = 'silver';
        else if (rank === 3) rankClass = 'bronze';

        const avatarSvg = AppConfig.getAvatarHTML(p.avatar_id || 1);

        rows += `
          <tr style="cursor:pointer;" data-action="open-profile" data-profile="${p.username}" title="View ${p.username}'s Profile">
            <td class="leaderboard-rank ${rankClass}">#${rank}</td>
            <td>
              <div class="leaderboard-player">
                <span class="leaderboard-avatar" style="padding:2px;">${avatarSvg}</span>
                <span style="font-weight:600;color:var(--text-primary);">${p.username}</span>
                ${Auth.currentUser && Auth.currentUser.username === p.username ? '<span class="badge badge-accent ml-1" style="font-size:10px;">YOU</span>' : ''}
              </div>
            </td>
            <td class="leaderboard-elo">${p.elo_rating || 800}</td>
            <td>${p.puzzles_solved || 0}</td>
            <td>${p.bots_defeated || 0} / 9</td>
          </tr>
        `;
      });

      tbody.innerHTML = rows;
    } catch (err) {
      console.error('[Leaderboard] Error loading:', err);
      const tbody = document.getElementById('leaderboard-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-danger text-center" style="padding:24px;">Failed to load leaderboard data.</td></tr>';
    }
  }
};
