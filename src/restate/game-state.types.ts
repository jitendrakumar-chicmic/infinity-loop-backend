// Keys used with ctx.get / ctx.set in the Restate Virtual Object.
// All IDs (InFlightBoard.id, InFlightMove.id) are pre-generated UUIDs at
// fetch time so they are stable DB primary keys at finalize time.

export const STATE_KEY_SESSION = 'session' as const;
export const STATE_KEY_BOARDS = 'boards' as const;

export interface InFlightSession {
    sessionId: string; // GameSession.id — written to DB only at finalize
    userId: string;
    stageId: string;
    expiryAtMs: number; // unix ms absolute deadline
    timeLimitSeconds: number;
    totalBoards: number;
    currentBoardIndex: number; // 0-based; points to active board in boards[]
    status: number; // GAME_SESSION_STATUS value
    startedAt: string; // ISO
    lastMoveAt: string | null;
    levelBoundaries: { name: string; endIndex: number }[];
    boardSequence: string[]; // ordered Board.id list — used for lazy board fetching
}

export interface InFlightBoard {
    id: string; // pre-generated UUID → GameSessionBoard.id
    boardId: string; // Board.id (source template)
    levelId: string;
    roundNumber: number; // 1-based display number
    gridX: number;
    gridY: number;
    originalGrid: number[][]; // initial scrambled grid as loaded from DB
    currentGrid: number[][]; // mutable — updated by every rotate
    timeLimit: number; // board-level time limit for score calculation
    color: string | null;
    startedAt: string; // ISO — set when the board becomes active
    endedAt: string | null; // ISO — set when the board is solved
    score: number | null; // set on solve
    isSolved: boolean;
    moves: InFlightMove[];
}

export interface InFlightMove {
    id: string; // pre-generated UUID → GameMove.id
    x: number; // column (c)
    y: number; // row (r)
    success: boolean;
    clickedAt: string; // ISO
}
