# Refrigerator Chess

> Self-hosted, real-time chess platform built for **[isyourrefrigerator.online](https://chess.isyourrefrigerator.online)**. Designed to run inside a Pelican Panel / Wings Docker container with Stockfish 16.1 AVX2 engine acceleration, PvP invite links, PvE boss bot progression, and tactical puzzles.

---

## Features

- **Branding & Design:** Deep slate/midnight blue glassmorphic aesthetic (`#0b0f19` to `#111827`) with cyan accents, responsive chess board, real-time evaluation bar, dual-column SAN move list, clocks, and chat.
- **Player vs. Player (PvP):** Instant invite link generation (`/#play/inv_xxxx`), real-time WebSocket move validation, dual clocks with increments (Bullet 1+0, Blitz 3+2, Rapid 10+0, Untimed), draw offers, and resignation.
- **Player vs. Bot (PvE):** Roster of 9 boss bots calibrated from 250 ELO to 2000 ELO:
  - *250–1200 ELO:* MultiPV 5 with Gaussian probability move selection for natural human-like blunders and inaccuracies.
  - *1350–2000 ELO:* Native `UCI_LimitStrength` capped at Depth 8.
- **Tactical Puzzles:** Curated puzzle database with difficulty tiers (*Easy*, *Medium*, *Hard*, *Master*, *Adaptive*), automatic setup moves, interactive line validation, and tactical theme tags.
- **Custom Rating & Anti-Farming Math:**
  - Puzzles: `+1 ELO` per solve without hint.
  - Lower-rated Bot: `+5 ELO` (diminishing cooldown if defeated >3 times in 24 hours).
  - Higher-rated Boss: `5 + Math.round((Bot_ELO - Player_ELO) * 0.04)` (capped at +25 ELO).
  - Minimum match length requirement: 10 full moves (20 plies).
- **Post-Game Game Review:** Fast depth-8 Stockfish pass classifying moves into *Best Move (★)*, *Good (✓)*, *Inaccuracy (?!)*, *Mistake (?)*, and *Blunder (??)*, CAPS-style accuracy percentage, and an interactive **Retry Mistake** feature.
- **Authentication & Database:** Registration requires only `username`, `password` (Argon2id hashed), and an avatar. Built-in Pelican Panel MySQL/MariaDB integration with automatic local SQLite fallback.

---

## Pelican Panel Deployment

### 1. Import Custom Egg
1. Open your Pelican Admin Panel -> **Eggs**.
2. Click **Import Egg** and upload [`egg-refrigerator-chess.json`](./egg-refrigerator-chess.json).
3. Assign the egg to your preferred nest (e.g. `WebApps` or `NodeJS`).

### 2. Create the Server
Create a server in Pelican Panel configured for your hardware allocation:

| Setting | Value | Description |
|---|---|---|
| **Server Name** | `Refrigerator Chess` | Identifier in Pelican Panel |
| **Default Port** | `3080` (or free port) | Port bound for Nginx reverse proxy |
| **Database Limit** | `1` | Enables Pelican's built-in MariaDB provisioning |
| **CPU Limit** | `100%` | 1 full logical thread of host CPU |
| **Memory** | `4096 MiB` | 4 GB allocated RAM |
| **Swap** | `0 MiB` | Keeps Stockfish transposition tables in RAM |

### 3. Configure Database & Startup Variables
In your server's **Startup** tab:
- `SUBDOMAIN`: `chess.isyourrefrigerator.online`
- `STOCKFISH_MAX_DEPTH`: `16` (configurable between 1–64)
- `STOCKFISH_HASH_MB`: `512` (configurable between 16–32768 MB)
- `STOCKFISH_THREADS`: `2` (configurable between 1–64 CPU threads)
- `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`: (Paste from the server's **Databases** tab)

---

## Nginx Reverse Proxy Configuration

Create `/etc/nginx/sites-available/chess.isyourrefrigerator.online.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name chess.isyourrefrigerator.online;

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;

        # WebSockets for live moves & chat
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward player IPs
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Prevent socket dropouts during long moves
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

Enable and issue SSL:
```bash
sudo ln -s /etc/nginx/sites-available/chess.isyourrefrigerator.online.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d chess.isyourrefrigerator.online
```

---

## Admin CLI Commands

### Reset User Password
Reset any player's password directly from the Pelican Panel Console tab in seconds:
```bash
npm run reset-pass <username> <new_password>
# Example: npm run reset-pass player1 newSecurePassword123
```

### Seed Puzzles
Seed the tactical puzzle database:
```bash
# Seed curated starter pack:
npm run seed-puzzles

# Or stream an offline Lichess CSV dataset:
node src/cli/seed-puzzles.js /path/to/lichess_puzzles.csv
```

---

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm start
# Server listens at http://localhost:3080
```
