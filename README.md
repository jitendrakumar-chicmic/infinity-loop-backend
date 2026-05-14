# Infinity Loop Game Service

A production-grade NestJS microservice powering the Infinity Loop puzzle game. Provides a REST API for admin operations and real-time WebSocket gameplay via Socket.io.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Installation & Running](#installation--running)
- [API Documentation](#api-documentation)
- [Admin Setup (Before Playing)](#admin-setup-before-playing)
- [WebSocket Game Protocol](#websocket-game-protocol)
  - [Connection](#connection)
  - [Client → Server Events](#client--server-events)
  - [Server → Client Events](#server--client-events)
- [Full Game Flow](#full-game-flow)
- [Tile Bitmask Reference](#tile-bitmask-reference)
- [Project Structure](#project-structure)

---

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- PostgreSQL (Neon or local)
- Redis

---

## Environment Setup

Copy `.env.example` to `.env` and fill in all required values:

```env
NODE_ENV=development
DATABASE_URL="postgresql://user:pass@host/db"
PORT=3004
JWT_SECRET=<32+ character secret>

REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=
REDIS_DB=0
REDIS_INFINITYLOOP_PROJECT_KEY=INFINITYLOOP_SERVICE
REDIS_ADMIN_PROJECT_KEY=ADMIN_SERVICE

ADMIN_MICROSERVICE_BASE_URL=
ADMIN_BYPASS=false

PROJECT_NAME=
PROJECT_DESCRIPTION=
PROJECT_VERSION=1.0.0
SUPPORTED_LANGUAGES=en
DEFAULT_LANGUAGE=en
```

---

## Installation & Running

```bash
# Install dependencies
bun install

# Generate Prisma client
bunx prisma generate

# Run database migrations
bunx prisma migrate dev

# Seed initial data (levels, boards)
bunx prisma db seed

# Start development server (hot reload)
bun run start:dev

# Build and start production server
bun run build && bun run start
```

Server starts on `http://localhost:3004`.

---

## API Documentation

Swagger UI: `http://localhost:3004/api`
Swagger JSON: `http://localhost:3004/api-json`

---

## Admin Setup (Before Playing)

Before a game can be played, you must configure at least one stage via the admin REST API. All admin endpoints require a valid admin JWT.

### 1. Verify Levels

Levels (Easy, Medium, Hard, etc.) should exist in the DB after seeding:

```
GET /v1/levels
```

Note the `id` values — you will need them when creating a stage config.

### 2. Create Boards

Boards (puzzle grids) must be linked to a Level:

```
POST /v1/boards
```

### 3. Create a Stage Config

A stage config defines a playable stage with a time limit and which levels (and how many boards per level) to include.

**One-shot endpoint (recommended):**

```
PUT /v1/stage-configs
```

```json
{
  "stageId": "1",
  "timeLimit": 300,
  "levels": [
    { "levelId": "<level-uuid>", "boardCount": 5 }
  ]
}
```

This creates the stage config, links the level, and sets the board count in a single call.

### 4. Verify Setup

```
GET /v1/stage-configs
```

You should see your stage with its linked levels and board counts.

### 5. Flush Cache (after any config updates)

```
DELETE /v1/stage-configs/cache
```

---

## WebSocket Game Protocol

### Connection

Connect to the Socket.io server with a JWT token in the handshake auth:

```js
const socket = io("http://localhost:3004", {
  auth: { token: "<JWT>" }
});
```

The gateway validates the token on connection. Failed auth will reject the socket immediately.

---

### Client → Server Events

#### `game:meta`

Request available stages and level info. No payload required.

```js
socket.emit("game:meta");
```

#### `game:start`

Start a new game session on a specific stage.

```js
socket.emit("game:start", {
  stage: "1",   // stage number as string (required)
  level: 1      // optional: specific level index
});
```

If an active session already exists for this user + stage, the same board state and remaining time are returned automatically.

#### `game:rotate`

Rotate a single tile at grid position `[r, c]`.

```js
socket.emit("game:rotate", {
  r: 2,                     // row index (0-based)
  c: 3,                     // column index (0-based)
  boardId: "<board-uuid>",  // optional: validated against current board
  timestamp: Date.now()     // optional: move timestamp in milliseconds
});
```

#### `game:rotate:batch`

Submit multiple offline moves atomically (useful on reconnect).

```js
socket.emit("game:rotate:batch", {
  moves: [
    { r: 0, c: 1, timestamp: 1700000000000 },
    { r: 2, c: 3, timestamp: 1700000000100 }
  ]
});
```

Moves are applied in order. Processing stops at the first board solve.

#### `game:reset`

Restart the current stage from the beginning.

```js
socket.emit("game:reset", { stage: "1" });
```

#### `game:complete`

Manually end the session (e.g., user quits).

```js
socket.emit("game:complete");
```

---

### Server → Client Events

#### `game:meta`

Response to the `game:meta` request.

```json
{
  "stages": {
    "1": [
      {
        "level": "Easy",
        "boardCount": 5,
        "curated": false,
        "timeLimit": 300
      }
    ]
  }
}
```

#### `game:started`

Emitted after a successful `game:start`. Contains the initial board state.

```json
{
  "gameSessionId": "<uuid>",
  "boardsTotal": 5,
  "board": {
    "boardId": "<uuid>",
    "grid": [[5, 10, 3], [6, 15, 9]],
    "gridX": 3,
    "gridY": 2,
    "remainingTime": 300,
    "color": "#ff6b6b"
  }
}
```

#### `game:rotate`

Emitted after every `game:rotate` or `game:rotate:batch`. Contains the updated board state.

```json
{
  "grid": [[5, 10, 6], [6, 15, 9]],
  "isBoardSolved": false,
  "isStageComplete": false,
  "nextBoard": null,
  "moves": 4,
  "totalScore": 0,
  "boardsCompleted": 0,
  "remainingTime": 280
}
```

When a board is solved and there is a next board, `nextBoard` is populated:

```json
{
  "grid": [[...]],
  "isBoardSolved": true,
  "isStageComplete": false,
  "nextBoard": {
    "boardId": "<uuid>",
    "grid": [[...]],
    "gridX": 4,
    "gridY": 4,
    "remainingTime": 265,
    "color": "#4ecdc4"
  },
  "moves": 12,
  "totalScore": 18,
  "boardsCompleted": 1,
  "remainingTime": 265
}
```

#### `game:complete:success`

Emitted when the stage ends (all boards solved, timeout, or manual complete).

```json
{
  "reason": "COMPLETED",
  "totalScore": 72,
  "boardsCompleted": 5,
  "boardsTotal": 5,
  "timeTaken": 240
}
```

`reason` values:
- `COMPLETED` — all boards solved
- `TIME_UP` — stage timer expired
- `MANUAL` — user called `game:complete`

#### `game:already_finished`

Emitted if `game:start` is called on a stage the user already completed or failed.

```json
{
  "status": 1,
  "score": 72,
  "boardsCompleted": 5
}
```

`status`: `1` = completed, `2` = failed/timed out.

#### `force:disconnect`

Emitted to the old socket when the same user connects to the same stage from a new socket. The old socket is immediately disconnected.

```json
{ "reason": "new_connection" }
```

---

## Full Game Flow

```
Client                                  Server
  |                                       |
  |-- connect (auth: { token }) -------->|  JWT validated
  |                                       |
  |-- game:meta ------------------------>|
  |<- game:meta (stages/levels/counts) --|
  |                                       |
  |-- game:start ({ stage: "1" }) ------>|  Session created, stage timer starts
  |<- game:started (board, sessionId) ---|
  |                                       |
  |-- game:rotate ({ r, c }) ----------->|
  |<- game:rotate (grid, solved=false) --|
  |                                       |
  |  ... more rotations ...               |
  |                                       |
  |-- game:rotate ({ r, c }) ----------->|  Last tile → board solved
  |<- game:rotate (solved=true,          |  Score calculated
  |               nextBoard) ------------|
  |                                       |
  |  ... solve remaining boards ...       |
  |                                       |
  |<- game:rotate (isStageComplete=true) |  All boards done
  |<- game:complete:success -------------|  Stage finalized
```

### Timeout Path

If the stage timer expires, the server emits `game:complete:success` with `reason: "TIME_UP"` automatically — no client action needed.

### Reconnect / Resume Path

On disconnect and reconnect within the time limit:
1. Call `game:start` with the same stage.
2. The server resumes the exact board state.
3. `remainingTime` is adjusted to reflect elapsed time.
4. Use `game:rotate:batch` to replay any offline moves.

### Scoring

Each board score = `10 + max(0, boardTimeLimit - durationSeconds)`.
Stage total score is the sum of all board scores.

---

## Tile Bitmask Reference

Each cell in `grid` is an integer bitmask representing tile connections:

| Bit | Direction |
|-----|-----------|
| 1   | North     |
| 2   | East      |
| 4   | South     |
| 8   | West      |
| 16  | Curved marker (visual only) |

Common tile values:

| Value | Shape    | Connections |
|-------|----------|-------------|
| 5     | Straight | N + S       |
| 10    | Straight | E + W       |
| 3     | Elbow    | N + E       |
| 6     | Elbow    | E + S       |
| 12    | Elbow    | S + W       |
| 9     | Elbow    | N + W       |
| 7     | T-piece  | N + E + S   |
| 14    | T-piece  | E + S + W   |
| 13    | T-piece  | N + S + W   |
| 11    | T-piece  | N + E + W   |
| 15    | Cross    | N+E+S+W     |

A puzzle is solved when all tile connections match their neighbors and form a single valid loop.

---

## Project Structure

```
src/
├── main.ts                  # App bootstrap
├── app.module.ts            # Root module
├── admin/                   # Admin REST API
│   ├── stage-config.controller.ts
│   ├── puzzle.controller.ts
│   ├── level.controller.ts
│   └── dto/
├── game/                    # WebSocket game engine
│   ├── game.gateway.ts      # Socket.io event handlers
│   ├── game.service.ts      # Session & board logic
│   ├── game-config.service.ts
│   └── engine/
│       └── puzzle.engine.ts # Tile rotation & solve validation
├── redis/                   # Redis client wrapper
└── common/                  # Shared utilities, guards, middleware
```
