# Refrigerator Chess — Backend REST API Specification

This document details the REST API specification for Refrigerator Chess. All communication between the frontend client and backend service occurs via these documented HTTP REST endpoints (or real-time WebSocket events for in-match moves).

---

## Base URL & Protocols
- **API Base URL:** `/api`
- **Content-Type:** `application/json`
- **Authentication:** HTTP-only JWT Cookie (`token`) or `Authorization: Bearer <token>` header.

---

## 1. Authentication (`/api/auth`)

### `POST /api/auth/register`
Register a new player account.
- **Request Body:**
  ```json
  {
    "username": "string (3-20 chars, alphanumeric + _)",
    "password": "string (6+ chars)",
    "avatar_id": "integer (optional, default 1)",
    "timezone_id": "string (optional IANA timezone, e.g. 'Europe/Amsterdam')"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "message": "User registered successfully",
    "token": "jwt_token_string",
    "user": {
      "id": 1,
      "username": "grandmaster",
      "avatar_id": 1,
      "timezone_id": "Europe/Amsterdam",
      "elo_rating": 800
    }
  }
  ```

### `POST /api/auth/login`
Authenticate with username and password. Sets an HTTP-only JWT cookie.
- **Request Body:**
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Login successful",
    "token": "jwt_token_string",
    "user": {
      "id": 1,
      "username": "grandmaster",
      "avatar_id": 1,
      "timezone_id": "Europe/Amsterdam",
      "elo_rating": 800
    }
  }
  ```

### `GET /api/auth/me`
Retrieve currently authenticated user session.
- **Headers:** `Authorization: Bearer <token>` (or cookie)
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": 1,
      "username": "grandmaster",
      "avatar_id": 1,
      "avatar_custom": null,
      "timezone_id": "Europe/Amsterdam",
      "elo_rating": 800,
      "puzzles_solved": 42,
      "bots_defeated": 3,
      "created_at": "2026-10-21 18:30:00"
    }
  }
  ```

### `POST /api/auth/logout`
Clear session cookie.
- **Response (200 OK):** `{"message": "Logged out"}`

---

## 2. Games & Matchmaking (`/api/games`)

### `POST /api/games/create`
Create a new invite match lobby.
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "color": "white" | "black" | "random",
    "time_control": "bullet_1_0" | "blitz_3_2" | "rapid_10_0" | "untimed",
    "game_type": "pvp"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "invite_code": "inv_a1b2c3d4",
    "color": "white",
    "time_control": "rapid_10_0"
  }
  ```

### `POST /api/games/join/:inviteCode`
Join an existing match via invite link.
- **Authentication:** Required
- **Response (200 OK):**
  ```json
  {
    "game": {
      "id": 12,
      "invite_code": "inv_a1b2c3d4",
      "white_id": 1,
      "black_id": 2,
      "role": "black",
      "time_control": "rapid_10_0"
    }
  }
  ```

### `GET /api/games/history/me`
Retrieve game history for the authenticated user. Excludes isolated Analysis mode sessions.
- **Authentication:** Required
- **Response (200 OK):**
  ```json
  {
    "games": [
      {
        "id": 45,
        "invite_code": "inv_x9y8z7",
        "game_type": "pvp",
        "time_control": "rapid_10_0",
        "user_color": "white",
        "outcome": "win",
        "result": "1-0",
        "opponent_name": "magnus",
        "opponent_avatar": 3,
        "opponent_elo": 832,
        "pgn": "1. e4 e5 2. Nf3 Nc6 ...",
        "has_analysis": true,
        "created_at": "2026-10-21 18:00:00"
      }
    ]
  }
  ```

---

## 3. Tactical Puzzles (`/api/puzzles`)

### `GET /api/puzzles/random`
Fetch a tactical puzzle matching difficulty tier.
- **Query Parameters:**
  - `difficulty`: `easy` (400-999) | `medium` (1000-1399) | `hard` (1400-1899) | `master` (1900+) | `adaptive`
  - `multi_move`: `true` (enforces multi-ply forced sequence)
- **Response (200 OK):**
  ```json
  {
    "puzzle_id": "00008",
    "fen": "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/P1P2bPP/7K b - - 0 24",
    "rating": 1200,
    "themes": "crushing endgame fork long",
    "moves": ["f2g3", "e6e7", "g3h4", "e7h7"]
  }
  ```

### `POST /api/puzzles/:id/attempt`
Record a puzzle attempt and update user ELO.
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "solved": true | false,
    "reward": 1,
    "used_solution": false,
    "penalty_count": 0
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "elo_change": 1,
    "new_elo": 825,
    "puzzles_solved": 43
  }
  ```

### `GET /api/puzzles/stats/tiers`
Get available puzzle counts per tier.
- **Response (200 OK):**
  ```json
  {
    "easy": 1016,
    "medium": 1000,
    "hard": 1000,
    "master": 1000,
    "total": 4016
  }
  ```

---

## 4. Users & Profiles (`/api/users`)

### `GET /api/users/profile/:username`
Get detailed user profile, stats, boss trophies, and match history.
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": 1,
      "username": "player1",
      "avatar_id": 1,
      "timezone_id": "Europe/Amsterdam",
      "elo_rating": 850,
      "puzzles_solved": 20,
      "bots_defeated": 2,
      "created_at": "2026-10-15 12:00:00"
    },
    "stats": {
      "total_games": 24,
      "wins": 15,
      "losses": 7,
      "draws": 2,
      "win_rate": 63,
      "defeated_bosses": [250, 500]
    },
    "recent_games": [ ... ],
    "is_current_user": true
  }
  ```

### `POST /api/users/timezone`
Update user's preferred IANA timezone.
- **Authentication:** Required
- **Request Body:** `{"timezone_id": "Europe/Amsterdam"}`
- **Response (200 OK):** `{"success": true, "timezone_id": "Europe/Amsterdam"}`

### `GET /api/users/leaderboard`
Top 50 rated players on the platform.

---

## 5. Game Review & Analysis (`/api/analysis`)

### `POST /api/analysis/game`
Analyze a game with Stockfish 16.1 depth 8 and save classification into database.
- **Request Body:**
  ```json
  {
    "pgn": "1. e4 e5 2. Nf3 Nc6 ...",
    "invite_code": "inv_xxxx" (optional),
    "force": false
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "whiteAccuracy": 91.4,
    "blackAccuracy": 78.2,
    "moves": [
      {
        "ply": 1,
        "san": "e4",
        "uci": "e2e4",
        "evalCp": 25,
        "classification": "best",
        "badge": "★",
        "bestMove": "e2e4"
      }
    ],
    "cached": false
  }
  ```

### `GET /api/analysis/game/:identifier`
Retrieve stored review JSON for a match by invite code or database ID.

### `POST /api/analysis/evaluate`
Evaluate a single FEN position with Stockfish.
- **Request Body:** `{"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "depth": 16}`
- **Response (200 OK):**
  ```json
  {
    "score": 0.25,
    "mate": null,
    "bestMove": "e2e4",
    "depth": 16
  }
  ```
