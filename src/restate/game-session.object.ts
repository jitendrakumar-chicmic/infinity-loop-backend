import { GAME_CONFIGS, GAME_SESSION_STATUS, RESTATE_SERVICES } from '@common/constants';
import * as restate from '@restatedev/restate-sdk';

import * as PuzzleEngine from '../game/engine/puzzle.engine';
import type { GameService } from '../game/game.service';

import type { InFlightBoard, InFlightMove, InFlightSession } from './game-state.types';
import { STATE_KEY_BOARDS, STATE_KEY_SESSION } from './game-state.types';

// ── Request shapes ────────────────────────────────────────────────────────────

export interface StartGameRequest {
    userId: string;
    stageId: string;
}
export interface RotateTileRequest {
    r: number;
    c: number;
    boardId?: string;
    timestamp?: number;
}
export interface RotateBatchRequest {
    moves: { r: number; c: number; timestamp?: number }[];
    boardId?: string;
}
export interface CompleteGameRequest {
    reason?: 'MANUAL' | 'DISCONNECT';
}
export interface GetStatusRequest {
    userId: string;
    stageId: string;
}
export interface MarkResultProcessingRequest {
    sessionId: string;
}
export interface FinalizeExpiredRequest {
    sessionId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function terminalError(message: string, errorCode: number): restate.TerminalError {
    return new restate.TerminalError(message, { errorCode });
}

function summarizeInFlightTerminal(session: InFlightSession, boards: InFlightBoard[]) {
    const boardsCompleted = boards.filter((board) => board.isSolved).length;
    const score = boards.reduce((sum, board) => sum + (board.score ?? 0), 0);
    const status =
        session.status === GAME_SESSION_STATUS.COMPLETED
            ? GAME_SESSION_STATUS.COMPLETED
            : GAME_SESSION_STATUS.FAILED;
    const moves = boards.reduce((sum, board) => sum + (board.moves?.length ?? 0), 0);

    return {
        id: null,
        status,
        score,
        boardsCompleted,
        boardsTotal: session.totalBoards,
        moves,
        message: `Stage ${session.stageId} already finished`,
    };
}

function getRunningScore(boards: InFlightBoard[]): number {
    return boards.reduce((sum, board) => sum + (board.score ?? 0), 0);
}

function assertSession(session: InFlightSession | null): asserts session is InFlightSession {
    if (!session) {
        throw terminalError('GAME_SESSION_NOT_FOUND', 404);
    }
}

async function checkAndClearIfTerminal(
    ctx: restate.ObjectContext,
    gameService: GameService,
): Promise<void> {
    const [userId, stageId] = ctx.key.split(':');
    const terminal = await ctx.run('check-terminal-on-event', () =>
        gameService.getTerminalSummary(userId, stageId),
    );
    if (terminal) {
        ctx.clearAll();
        throw terminalError('STAGE_ALREADY_FINISHED', 409);
    }
}

const ACTIVE_STATUSES: readonly number[] = [GAME_SESSION_STATUS.ACTIVE];
const ACTIVE_OR_GRACE_STATUSES: readonly number[] = [
    GAME_SESSION_STATUS.ACTIVE,
    GAME_SESSION_STATUS.RESULT_PROCESSING,
] as const;

function assertActive(session: InFlightSession, nowMs: number, allowGrace = false): void {
    const allowed = allowGrace ? ACTIVE_OR_GRACE_STATUSES : ACTIVE_STATUSES;
    if (!allowed.includes(session.status)) {
        throw terminalError('GAME_SESSION_NOT_ACTIVE', 409);
    }
    const graceCutoff = session.expiryAtMs + GAME_CONFIGS.EXPIRY_GRACE_SECONDS * 1_000;
    if (nowMs > graceCutoff) {
        throw terminalError('GAME_SESSION_EXPIRED', 408);
    }
}

function calcBoardScore(board: InFlightBoard, now: Date): number {
    const durationSec = Math.floor((now.getTime() - new Date(board.startedAt).getTime()) / 1000);
    return 10 + Math.max(0, board.timeLimit - durationSec);
}

function buildBoardResponse(board: InFlightBoard) {
    return {
        id: board.boardId,
        sessionBoardId: board.id,
        gridX: board.gridX,
        gridY: board.gridY,
        grid: board.currentGrid,
        color: board.color,
        moves: board.moves.length,
    };
}

// Build an InFlightBoard from a fetched DB entry.
function makeInFlightBoard(
    uuid: string,
    boardId: string,
    roundNumber: number,
    bd: {
        id: string;
        grid: number[][];
        gridX: number;
        gridY: number;
        levelId: string;
        timeLimit: number;
        color?: string | null;
    },
    startedAt: string,
): InFlightBoard {
    const grid = bd.grid ?? [];
    return {
        id: uuid,
        boardId,
        levelId: bd.levelId,
        roundNumber,
        gridX: bd.gridX,
        gridY: bd.gridY,
        originalGrid: grid,
        currentGrid: grid.map((row) => [...row]),
        timeLimit: bd.timeLimit ?? 120,
        color: bd.color ?? null,
        startedAt,
        endedAt: null,
        score: null,
        isSolved: false,
        moves: [],
    };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createGameSessionObject(gameService: GameService) {
    return restate.object({
        name: RESTATE_SERVICES.GAME_SESSION,
        handlers: {
            // ── startGame ─────────────────────────────────────────────────────
            startGame: async (ctx: restate.ObjectContext, req: StartGameRequest) => {
                // DB terminal check takes priority — if the stage is already done, block replay.
                const terminalSession = await ctx.run('check-terminal', async () =>
                    gameService.getTerminalSummary(req.userId, req.stageId),
                );

                if (terminalSession) {
                    ctx.clearAll();
                    return {
                        id: terminalSession.id,
                        status: terminalSession.status,
                        score: terminalSession.score,
                        boardsCompleted: terminalSession.boardsCompleted,
                        boardsTotal: terminalSession.boardsTotal,
                        message: `Stage ${req.stageId} already finished`,
                    };
                }

                // Resume existing in-flight session (reconnect after disconnect).
                const existing = await ctx.get<InFlightSession>(STATE_KEY_SESSION);

                if (existing) {
                    const boards = (await ctx.get<InFlightBoard[]>(STATE_KEY_BOARDS)) ?? [];
                    if (existing.status !== GAME_SESSION_STATUS.ACTIVE) {
                        return summarizeInFlightTerminal(existing, boards);
                    }
                    const activeBoard = boards[existing.currentBoardIndex];
                    const score = getRunningScore(boards);
                    const remainingTime = Math.max(
                        0,
                        Math.floor((existing.expiryAtMs - Date.now()) / 1000),
                    );
                    const totalMoves = boards.reduce((sum, b) => sum + (b.moves?.length ?? 0), 0);
                    return {
                        id: existing.sessionId,
                        boardsTotal: existing.totalBoards,
                        score,
                        moves: totalMoves,
                        boardsCompleted: existing.currentBoardIndex,
                        board: activeBoard
                            ? { ...buildBoardResponse(activeBoard), remainingTime }
                            : null,
                    };
                }

                // ── New session ───────────────────────────────────────────────

                // Fetch stage config to build the ordered board ID sequence.
                const stageConfig = await ctx.run('fetch-stage-config', () =>
                    gameService.fetchStageConfigForRestate(req.stageId),
                );

                const { boardSequence, levelBoundaries } = await ctx.run(
                    'build-board-sequence',
                    () => gameService.buildBoardSequenceForRestate(stageConfig),
                );

                if (boardSequence.length === 0) {
                    throw terminalError('NO_BOARDS_IN_STAGE', 422);
                }

                // Lazy loading: only fetch the first board's data from DB.
                const firstBoardData = await ctx.run('fetch-first-board', () =>
                    gameService.fetchSingleBoard(boardSequence[0]),
                );
                const firstBoardUUID = await ctx.run('generate-first-board-id', () =>
                    crypto.randomUUID(),
                );
                const sessionId = await ctx.run('generate-session-id', () => crypto.randomUUID());

                const nowMs = await ctx.date.now();
                const expiryAtMs = nowMs + stageConfig.timeLimit * 1_000;
                const sessionStartIso = new Date(nowMs).toISOString();

                const firstBoard = makeInFlightBoard(
                    firstBoardUUID,
                    boardSequence[0],
                    1,
                    firstBoardData,
                    sessionStartIso,
                );

                const sessionState: InFlightSession = {
                    sessionId,
                    userId: req.userId,
                    stageId: req.stageId,
                    expiryAtMs,
                    timeLimitSeconds: stageConfig.timeLimit,
                    totalBoards: boardSequence.length,
                    currentBoardIndex: 0,
                    status: GAME_SESSION_STATUS.ACTIVE,
                    startedAt: sessionStartIso,
                    lastMoveAt: null,
                    levelBoundaries,
                    boardSequence, // stored for lazy board fetching on each advance
                };

                // boards[] starts with only the first board — future boards fetched on demand
                ctx.set(STATE_KEY_SESSION, sessionState);
                ctx.set(STATE_KEY_BOARDS, [firstBoard]);

                await ctx.run('schedule-expiry', () =>
                    gameService.scheduleExpiry(sessionId, expiryAtMs, req.userId, req.stageId),
                );

                return {
                    id: sessionId,
                    boardsTotal: boardSequence.length,
                    score: 0,
                    moves: 0,
                    boardsCompleted: 0,
                    board: {
                        ...buildBoardResponse(firstBoard),
                        remainingTime: stageConfig.timeLimit,
                    },
                };
            },

            // ── rotateTile ────────────────────────────────────────────────────
            rotateTile: async (ctx: restate.ObjectContext, req: RotateTileRequest) => {
                const session = await ctx.get<InFlightSession>(STATE_KEY_SESSION);
                if (!session) {
                    await checkAndClearIfTerminal(ctx, gameService);
                }
                assertSession(session);

                const nowMs = await ctx.date.now();
                assertActive(session, nowMs, true);

                const boards = (await ctx.get<InFlightBoard[]>(STATE_KEY_BOARDS)) ?? [];
                const boardIdx = session.currentBoardIndex;
                const board = boards[boardIdx];
                if (!board) {
                    throw terminalError('NO_ACTIVE_BOARD', 404);
                }

                if (req.boardId && req.boardId !== board.boardId) {
                    throw terminalError('BOARD_ALREADY_SOLVED', 409);
                }

                const now = new Date(nowMs);
                const nowIso = now.toISOString();
                const clickedAt = req.timestamp ? new Date(req.timestamp).toISOString() : nowIso;

                if (session.lastMoveAt) {
                    const moveDiff = nowMs - new Date(session.lastMoveAt).getTime();
                    if (moveDiff < GAME_CONFIGS.MOVE_MIN_INTERVAL_MS) {
                        ctx.run('flag-cheat', () =>
                            gameService.flagCheat(session.sessionId, session.userId, moveDiff, boards[boardIdx]?.id),
                        ).catch(() => {});
                    }
                }

                const updatedBoard: InFlightBoard = {
                    ...board,
                    currentGrid: board.currentGrid.map((row) => [...row]),
                    moves: [...board.moves],
                };

                updatedBoard.currentGrid[req.r][req.c] = PuzzleEngine.rotateTile(
                    updatedBoard.currentGrid[req.r][req.c],
                    1,
                );
                updatedBoard.moves.push({
                    id: crypto.randomUUID(),
                    x: req.c,
                    y: req.r,
                    success: true,
                    clickedAt,
                } satisfies InFlightMove);

                const { valid: isBoardSolved } = PuzzleEngine.validateSolution(
                    updatedBoard.currentGrid,
                );
                const updatedSession: InFlightSession = { ...session, lastMoveAt: nowIso };
                const remainingTime = Math.max(0, Math.floor((session.expiryAtMs - nowMs) / 1000));
                const baseScore = getRunningScore(boards);

                if (!isBoardSolved) {
                    ctx.set(STATE_KEY_SESSION, updatedSession);
                    ctx.set(
                        STATE_KEY_BOARDS,
                        boards.map((b, i) => (i === boardIdx ? updatedBoard : b)),
                    );
                    return {
                        grid: updatedBoard.currentGrid,
                        isBoardSolved: false,
                        isStageComplete: false,
                        nextBoard: null,
                        completedLevel: null,
                        moves: updatedBoard.moves.length,
                        totalScore: baseScore,
                        boardsCompleted: boardIdx,
                        boardsTotal: session.totalBoards,
                        remainingTime,
                        currentBoardId: board.boardId,
                    };
                }

                // ── Board solved ──────────────────────────────────────────────
                updatedBoard.isSolved = true;
                updatedBoard.endedAt = nowIso;
                updatedBoard.score = calcBoardScore(updatedBoard, now);

                const completedLevel =
                    session.levelBoundaries.find((lb) => lb.endIndex === boardIdx)?.name ?? null;
                const solvedScore = baseScore + (updatedBoard.score ?? 0);

                const nextIndex = boardIdx + 1;
                const isLastBoard = nextIndex >= session.totalBoards;
                const solvedBoards = boards.map((b, i) => (i === boardIdx ? updatedBoard : b));

                if (isLastBoard) {
                    const finalSession = {
                        ...updatedSession,
                        status: GAME_SESSION_STATUS.COMPLETED,
                    };
                    const result = await ctx.run('finalize-on-complete', () =>
                        gameService.finalizeAndCommit(
                            finalSession,
                            solvedBoards,
                            now,
                            GAME_SESSION_STATUS.COMPLETED,
                            'COMPLETED',
                        ),
                    );
                    ctx.clearAll();
                    return {
                        grid: updatedBoard.currentGrid,
                        isBoardSolved: true,
                        isStageComplete: true,
                        nextBoard: null,
                        completedLevel,
                        moves: updatedBoard.moves.length,
                        totalScore: result.totalScore,
                        boardsCompleted: nextIndex,
                        boardsTotal: session.totalBoards,
                        remainingTime,
                        currentBoardId: board.boardId,
                    };
                }

                // Lazy-fetch the next board from DB now that we need it
                const nextBoardData = await ctx.run('fetch-next-board', () =>
                    gameService.fetchSingleBoard(session.boardSequence[nextIndex]),
                );
                const nextBoardUUID = await ctx.run('generate-next-board-id', () =>
                    crypto.randomUUID(),
                );
                const nextBoard = makeInFlightBoard(
                    nextBoardUUID,
                    session.boardSequence[nextIndex],
                    nextIndex + 1,
                    nextBoardData,
                    nowIso,
                );

                ctx.set(STATE_KEY_SESSION, { ...updatedSession, currentBoardIndex: nextIndex });
                ctx.set(STATE_KEY_BOARDS, [...solvedBoards, nextBoard]);

                return {
                    grid: updatedBoard.currentGrid,
                    isBoardSolved: true,
                    isStageComplete: false,
                    nextBoard: { ...buildBoardResponse(nextBoard), remainingTime },
                    completedLevel,
                    moves: updatedBoard.moves.length,
                    totalScore: solvedScore,
                    boardsCompleted: nextIndex,
                    boardsTotal: session.totalBoards,
                    remainingTime,
                    currentBoardId: nextBoard.boardId,
                };
            },

            // ── rotateTileBatch ───────────────────────────────────────────────
            rotateTileBatch: async (ctx: restate.ObjectContext, req: RotateBatchRequest) => {
                const session = await ctx.get<InFlightSession>(STATE_KEY_SESSION);
                if (!session) {
                    await checkAndClearIfTerminal(ctx, gameService);
                }
                assertSession(session);

                const nowMs = await ctx.date.now();
                assertActive(session, nowMs, true);

                const boards = (await ctx.get<InFlightBoard[]>(STATE_KEY_BOARDS)) ?? [];
                const now = new Date(nowMs);
                const nowIso = now.toISOString();
                const originalBoardIdx = session.currentBoardIndex;
                const originalBoardId = boards[originalBoardIdx]?.boardId ?? '';

                if (req.boardId && req.boardId !== originalBoardId) {
                    throw terminalError('BOARD_ALREADY_SOLVED', 409);
                }

                // Anti-cheat: check timing across batch moves before applying them
                if (req.moves.length >= 2) {
                    const timestamps = req.moves
                        .filter((m) => m.timestamp != null)
                        .map((m) => m.timestamp as number);
                    if (timestamps.length >= 2) {
                        const minInterval = Math.min(
                            ...timestamps.slice(1).map((t, i) => t - timestamps[i]),
                        );
                        if (minInterval < GAME_CONFIGS.MOVE_MIN_INTERVAL_MS) {
                            ctx.run('flag-cheat-batch', () =>
                                gameService.flagCheat(session.sessionId, session.userId, minInterval, boards[session.currentBoardIndex]?.id),
                            ).catch(() => {});
                        }
                    }
                }

                let boardIdx = session.currentBoardIndex;
                let isBoardSolved = false;
                let lastMoveAt = nowIso;

                let workBoards = boards.map((b) => ({
                    ...b,
                    currentGrid: b.currentGrid.map((row) => [...row]),
                    moves: [...b.moves],
                }));

                for (const move of req.moves) {
                    const board = workBoards[boardIdx];
                    if (!board) {
                        break;
                    }

                    const clickedAt = move.timestamp
                        ? new Date(move.timestamp).toISOString()
                        : nowIso;

                    board.currentGrid[move.r][move.c] = PuzzleEngine.rotateTile(
                        board.currentGrid[move.r][move.c],
                        1,
                    );
                    board.moves.push({
                        id: crypto.randomUUID(),
                        x: move.c,
                        y: move.r,
                        success: true,
                        clickedAt,
                    });
                    lastMoveAt = clickedAt;

                    const { valid } = PuzzleEngine.validateSolution(board.currentGrid);
                    if (valid) {
                        board.isSolved = true;
                        board.endedAt = nowIso;
                        board.score = calcBoardScore(board, now);
                        isBoardSolved = true;

                        const nextIndex = boardIdx + 1;
                        const isLastBoard = nextIndex >= session.totalBoards;

                        if (isLastBoard) {
                            const finalSession: InFlightSession = {
                                ...session,
                                currentBoardIndex: boardIdx,
                                lastMoveAt,
                                status: GAME_SESSION_STATUS.COMPLETED,
                            };
                            const result = await ctx.run('finalize-on-batch', () =>
                                gameService.finalizeAndCommit(
                                    finalSession,
                                    workBoards,
                                    now,
                                    GAME_SESSION_STATUS.COMPLETED,
                                    'COMPLETED',
                                ),
                            );
                            ctx.clearAll();
                            const remainingTime = Math.max(
                                0,
                                Math.floor((session.expiryAtMs - nowMs) / 1000),
                            );
                            return {
                                grid: board.currentGrid,
                                isBoardSolved: true,
                                isStageComplete: true,
                                nextBoard: null,
                                completedLevel:
                                    session.levelBoundaries.find((lb) => lb.endIndex === boardIdx)
                                        ?.name ?? null,
                                moves: board.moves.length,
                                totalScore: result.totalScore,
                                boardsCompleted: nextIndex,
                                boardsTotal: session.totalBoards,
                                remainingTime,
                                currentBoardId: board.boardId,
                            };
                        }

                        // Lazy-fetch the next board
                        const nextBoardData = await ctx.run('fetch-next-board-batch', () =>
                            gameService.fetchSingleBoard(session.boardSequence[nextIndex]),
                        );
                        const nextBoardUUID = await ctx.run('generate-next-board-id-batch', () =>
                            crypto.randomUUID(),
                        );
                        const nextBoard = makeInFlightBoard(
                            nextBoardUUID,
                            session.boardSequence[nextIndex],
                            nextIndex + 1,
                            nextBoardData,
                            nowIso,
                        );
                        workBoards = [...workBoards, nextBoard];
                        boardIdx = nextIndex;
                        isBoardSolved = false;
                        break; // client re-submits remaining moves for the new board
                    }
                }

                ctx.set(STATE_KEY_SESSION, { ...session, currentBoardIndex: boardIdx, lastMoveAt });
                ctx.set(STATE_KEY_BOARDS, workBoards);

                const remainingTime = Math.max(0, Math.floor((session.expiryAtMs - nowMs) / 1000));
                const activeBoard = workBoards[boardIdx];
                const nextBoard =
                    isBoardSolved && boardIdx < session.totalBoards ? workBoards[boardIdx] : null;
                const totalScore = getRunningScore(workBoards);

                return {
                    grid: activeBoard?.currentGrid ?? [],
                    isBoardSolved,
                    isStageComplete: false,
                    nextBoard: nextBoard
                        ? { ...buildBoardResponse(nextBoard), remainingTime }
                        : null,
                    completedLevel: isBoardSolved
                        ? (session.levelBoundaries.find((lb) => lb.endIndex === boardIdx - 1)
                              ?.name ?? null)
                        : null,
                    moves: activeBoard?.moves.length ?? 0,
                    totalScore,
                    boardsCompleted: boardIdx,
                    boardsTotal: session.totalBoards,
                    remainingTime,
                    currentBoardId: activeBoard?.boardId ?? '',
                };
            },

            // ── completeGame ──────────────────────────────────────────────────
            completeGame: async (ctx: restate.ObjectContext, req: CompleteGameRequest) => {
                const session = await ctx.get<InFlightSession>(STATE_KEY_SESSION);
                if (!session) {
                    await checkAndClearIfTerminal(ctx, gameService);
                    return { score: 0, status: GAME_SESSION_STATUS.COMPLETED };
                }

                const boards = (await ctx.get<InFlightBoard[]>(STATE_KEY_BOARDS)) ?? [];
                const now = new Date(await ctx.date.now());

                const finalStatus =
                    req.reason === 'DISCONNECT'
                        ? GAME_SESSION_STATUS.DISCONNECTED
                        : GAME_SESSION_STATUS.FAILED;
                const reason = req.reason === 'DISCONNECT' ? 'DISCONNECT' : 'MANUAL';

                const result = await ctx.run('finalize-complete', () =>
                    gameService.finalizeAndCommit(session, boards, now, finalStatus, reason),
                );
                ctx.clearAll();
                return { score: result.totalScore, status: result.status };
            },

            // ── disconnectGame ────────────────────────────────────────────────
            // Restate state persists naturally — client reconnects via startGame.
            disconnectGame: async (ctx: restate.ObjectContext, req: Record<string, never>) => {
                void req;
                const session = await ctx.get<InFlightSession>(STATE_KEY_SESSION);
                if (!session) {
                    return;
                }
                // Keep Restate state intact for reconnect
            },

            // ── getStatus ─────────────────────────────────────────────────────
            getStatus: async (ctx: restate.ObjectContext, req: GetStatusRequest) => {
                const session = await ctx.get<InFlightSession>(STATE_KEY_SESSION);
                if (session) {
                    const boards = (await ctx.get<InFlightBoard[]>(STATE_KEY_BOARDS)) ?? [];
                    const board = boards[session.currentBoardIndex];
                    const remainingTime = Math.max(
                        0,
                        Math.floor((session.expiryAtMs - Date.now()) / 1000),
                    );
                    return {
                        id: session.sessionId,
                        boardsTotal: session.totalBoards,
                        boardsCompleted: session.currentBoardIndex,
                        status: session.status,
                        board: board ? { ...buildBoardResponse(board), remainingTime } : null,
                    };
                }

                // Only terminal sessions exist in DB
                const dbSession = await ctx.run('fetch-status-from-db', () =>
                    gameService.findTerminalSession(req.userId, req.stageId),
                );
                if (!dbSession) {
                    throw terminalError('GAME_SESSION_NOT_FOUND', 404);
                }
                return {
                    id: dbSession.id,
                    boardsTotal: 0,
                    boardsCompleted: 0,
                    status: dbSession.status,
                    board: null,
                };
            },

            // ── markResultProcessing ──────────────────────────────────────────
            markResultProcessing: async (
                ctx: restate.ObjectContext,
                req: MarkResultProcessingRequest,
            ) => {
                const session = await ctx.get<InFlightSession>(STATE_KEY_SESSION);
                if (!session) {
                    ctx.console.warn(`markResultProcessing: state cleared for ${req.sessionId}`);
                    return;
                }
                if (session.status !== GAME_SESSION_STATUS.ACTIVE) {
                    return;
                }

                ctx.set(STATE_KEY_SESSION, {
                    ...session,
                    status: GAME_SESSION_STATUS.RESULT_PROCESSING,
                });

                const boards = (await ctx.get<InFlightBoard[]>(STATE_KEY_BOARDS)) ?? [];
                const boardsCompleted = boards.filter((b) => b.isSolved).length;
                const totalScore = boards.reduce((sum, b) => sum + (b.score ?? 0), 0);
                await ctx.run('emit-timeout-event', () => {
                    gameService.emitTimeoutEvent(
                        session.userId,
                        session.stageId,
                        totalScore,
                        boardsCompleted,
                        session.totalBoards,
                    );
                    return true;
                });
            },

            // ── finalizeExpired ───────────────────────────────────────────────
            finalizeExpired: async (ctx: restate.ObjectContext, req: FinalizeExpiredRequest) => {
                const session = await ctx.get<InFlightSession>(STATE_KEY_SESSION);
                if (!session) {
                    ctx.console.warn(`finalizeExpired: state already cleared for ${req.sessionId}`);
                    return;
                }

                const boards = (await ctx.get<InFlightBoard[]>(STATE_KEY_BOARDS)) ?? [];
                const now = new Date(await ctx.date.now());

                await ctx.run('finalize-expired', () =>
                    gameService.finalizeAndCommit(
                        session,
                        boards,
                        now,
                        GAME_SESSION_STATUS.FAILED,
                        'TIMEOUT',
                    ),
                );
                ctx.clearAll();
            },
        },
    });
}

export type GameSessionObject = ReturnType<typeof createGameSessionObject>;
