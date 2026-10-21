# Refrigerator Chess — Architecture & Component Guide

## Overview
Refrigerator Chess is structured as a decoupled monorepo separating the **Backend API / Game Server** and the **Modular Component-Based Frontend**.

```
d:\Projects\Chess\
├── backend/                  # Decoupled Node.js Express + Socket.IO Backend
│   ├── server.js             # Server entry point
│   ├── db.js                 # Database migrations (SQLite / MariaDB)
│   ├── routes/               # REST API route handlers
│   │   ├── auth.js           # Authentication & sessions
│   │   ├── games.js          # Match management & history
│   │   ├── puzzles.js        # Tactical puzzles & attempts
│   │   ├── users.js          # Player profiles, ratings & friends
│   │   └── analysis.js       # Stockfish 16.1 full-game review
│   ├── sockets/              # Real-time WebSocket handlers (PvP & Bots)
│   ├── engine/               # Stockfish process pool & bot calibrations
│   ├── docs/API.md           # Full REST API specification
│   └── package.json
│
├── frontend/                 # Modular Component-Based Frontend
│   ├── index.html            # Main HTML shell
│   ├── src/
│   │   ├── components/       # Plug-and-Play UI Components
│   │   │   ├── Board/        # ChessBoardComponent
│   │   │   ├── EvalBar/      # EvalBarComponent
│   │   │   ├── Puzzles/      # PuzzlesLandingComponent & Solver
│   │   │   ├── PostGame/     # PostGameModalComponent (with Copy Moves)
│   │   │   ├── Analysis/     # Analysis workspace & MatchSelector
│   │   │   └── Bots/         # BotRosterComponent & BotMatch
│   │   ├── services/         # Client services
│   │   │   ├── api.js        # Strict REST API Client
│   │   │   └── socket.js     # Real-time WebSocket client
│   │   ├── utils/            # Shared utilities
│   │   │   ├── timezone.js   # CET/CEST (-2h) offset correction
│   │   │   └── clipboard.js  # PGN / move export clipboard helper
│   │   └── app.js            # Client-side router & bootstrap
│   └── docs/ARCHITECTURE.md
│
├── public/                   # Production-served assets & bundle
└── package.json              # Monorepo root scripts
```

---

## 1. Modular Plug-and-Play Frontend Components
All UI components are decoupled from backend logic. Data exchange is handled exclusively via the `ApiService` (`src/services/api.js`) and documented REST endpoints.

UI components implement consistent lifecycle methods:
- `constructor(props)`: Sets properties, callbacks, and initial state.
- `render(target)`: Injects markup and visual layout into the specified DOM container.
- `update(state)`: Updates component state without re-rendering the parent.
- `bindEvents()`: Binds interactive event listeners.

Any component (e.g. `ChessBoardComponent` or `PostGameModalComponent`) can be swapped out with a React, Vue, or Web Component without changing backend code.

---

## 2. Puzzles Page Redesign (Chess.com Style)
1. **Landing State:** Navigating to `/puzzles` shows the Puzzles Landing Dashboard first. Puzzles **do not** auto-start.
2. **Opt-In Initiation:** Users select their preferred difficulty tier (Easy, Medium, Hard, Master, or Adaptive) and explicitly click **"Start Puzzle"** to begin.
3. **ELO Protection:** 
   - While on the Puzzles Dashboard, `inActivePuzzle` is `false`. Exiting or refreshing the page **never** incurs an ELO penalty.
   - ELO is only at risk once the user actively starts a puzzle and either makes an incorrect move or abandons it mid-attempt.
   - Returning to the dashboard from an active, unfinished puzzle prompts a confirmation dialog before applying the forfeit.

---

## 3. Gameplay & ELO Updates
1. **Bot Match Penalties:**
   - When a user loses a game against a bot, ELO is deducted according to the standard Elo model:
     `expectedScore = 1 / (1 + 10^((botElo - playerElo) / 400))`
     `eloChange = Math.min(-1, Math.round(32 * (0 - expectedScore)))`
     `newElo = Math.max(100, playerElo + eloChange)`
   - The user's rating is updated in the database and reflected in the post-game Defeat overlay.
2. **Analysis Mode Separation:**
   - Analysis boards are completely isolated from gameplay records.
   - Profile match history queries and `/api/games/history/me` explicitly filter:
     `AND g.game_type IN ('pvp', 'bot') AND g.game_type != 'analysis'`
   - Analysis sessions do not increment "Games Played" and never alter user win/loss statistics.

---

## 4. Game Export Functionality
- Added a **"Copy Moves" (Copy PGN)** button to:
  - Post-Game screen (PvP)
  - Post-Game screen (Bot matches)
  - Analysis Board header toolbar
  - Profile Saved Match Replay modal
- Formats standard chess notation and copies it to the user's clipboard with instant visual confirmation (`✓ Copied Moves!`) and fallback support.

---

## 5. Timezone Bug Fix (CET/CEST -2h Offset Correction)
- Fixes the bug where timezones were inverted (+2/-2 hour offset).
- The `parseAndCorrectTimestamp` utility parses SQL/ISO timestamps and subtracts 2 hours (`- (2 * 60 * 60 * 1000) ms`) before formatting via `Intl.DateTimeFormat(..., { timeZone: userTimezoneId })`.
- All match history rows, time-ago counters, and user join dates now accurately display the player's true local time.
