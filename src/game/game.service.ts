import { GAME_SESSION_STATUS, TERMINAL_SESSION_STATUSES, ANTI_CHEAT_CONFIGS, CHEAT_FLAG_TYPE } from '@common/constants';
import { PrismaService } from '@common/prisma/prisma.service';
import { config } from '@config';
import { Injectable, NotFoundException, forwardRef, Inject, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma';

import { buildDefaultStageConfig } from '../admin/stage-config.default';
import { SnsService } from '../aws/sns.service';
import { GameExpiryService } from '../restate/game-expiry.service';
import type { InFlightBoard, InFlightSession } from '../restate/game-state.types';

import { GameEventsService } from './game-events.service';

const DEFAULT_GAME_TIME_LIMIT_SEC = 180; // 3 minutes fallback when no stage config exists

export interface BoardCacheEntry {
    id: string;
    grid: number[][];
    gridX: number;
    gridY: number;
    levelId: string;
    timeLimit: number;
    color?: string | null;
}

type StageConfigForRestate = Prisma.StageConfigGetPayload<{
    include: {
        levels: {
            include: {
                level: {
                    include: {
                        boards: {
                            select: { id: true };
                        };
                    };
                };
                stageLevelBoards: {
                    include: {
                        board: {
                            select: { id: true };
                        };
                    };
                };
            };
        };
    };
}>;

@Injectable()
export class GameService {
    private readonly logger = new Logger(GameService.name);

    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => GameExpiryService))
        private readonly gameExpiryService: GameExpiryService,
        private readonly gameEvents: GameEventsService,
        private readonly sns: SnsService,
    ) {}

    private isDevelopment(): boolean {
        return config.env !== 'production';
    }

    private async wait(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    // ── Stage / board config helpers ──────────────────────────────────────────

    private shuffleBoardIds(boardIds: string[]): string[] {
        const shuffled = [...boardIds];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    private expandBoardSequence(
        boardIds: string[],
        configuredBoardCount?: number | null,
        hasStageConfig?: boolean,
    ): string[] {
        // If stage_level config exists, respect boardCount strictly (including 0)
        if (hasStageConfig && configuredBoardCount != null) {
            if (configuredBoardCount <= 0) return [];
            const selected: string[] = [];
            for (let i = 0; i < configuredBoardCount; i++) {
                selected.push(boardIds[i % boardIds.length]);
            }
            return selected;
        }
        if (boardIds.length === 0) {
            return [];
        }
        const targetCount =
            configuredBoardCount != null && configuredBoardCount > 0
                ? configuredBoardCount
                : boardIds.length;
        const selected: string[] = [];
        for (let i = 0; i < targetCount; i++) {
            selected.push(boardIds[i % boardIds.length]);
        }
        return selected;
    }

    private getConfiguredBoardCount(
        boardIds: string[],
        configuredBoardCount?: number | null,
    ): number {
        if (configuredBoardCount != null && configuredBoardCount >= 0) {
            return configuredBoardCount;
        }
        return boardIds.length;
    }

    // ── Restate support methods ───────────────────────────────────────────────

    private async fetchStageConfigWithIncludes(stageId: string): Promise<StageConfigForRestate | null> {
        return this.prisma.stageConfig.findFirst({
            where: { stageId, isDeleted: false },
            include: {
                levels: {
                    where: { isDeleted: false },
                    orderBy: { createdAt: 'asc' },
                    include: {
                        level: {
                            include: {
                                boards: {
                                    where: { isDeleted: false },
                                    select: { id: true },
                                },
                            },
                        },
                        stageLevelBoards: {
                            where: { board: { isDeleted: false } },
                            orderBy: { sortOrder: 'asc' },
                            include: { board: { select: { id: true } } },
                        },
                    },
                },
            },
        });
    }

    async fetchStageConfigForRestate(stageId: string): Promise<StageConfigForRestate> {
        let stageConfig = await this.fetchStageConfigWithIncludes(stageId);

        if (!stageConfig) {
            this.logger.warn(`[${stageId}] No stage config found — auto-provisioning default (${DEFAULT_GAME_TIME_LIMIT_SEC}s)`);
            const defaults = await buildDefaultStageConfig(stageId, this.prisma);

            if (!defaults) {
                throw new NotFoundException(`Stage ${stageId} has no config and no levels with boards available`);
            }

            const created = await this.prisma.stageConfig.create({
                data: {
                    stageId: defaults.stageId,
                    timeLimit: DEFAULT_GAME_TIME_LIMIT_SEC,
                    enableDemo: false,
                    isEnabled: true,
                },
            });

            for (const level of defaults.levels) {
                const slc = await this.prisma.stageLevelConfig.create({
                    data: {
                        stageConfigId: created.id,
                        levelId: level.levelId,
                        boardCount: level.boardCount,
                    },
                });

                const board = await this.prisma.board.findFirst({
                    where: { levelId: level.levelId, isDeleted: false },
                    orderBy: { createdAt: 'asc' },
                    select: { id: true },
                });

                if (board) {
                    await this.prisma.stageLevelBoard.create({
                        data: { stageLevelConfigId: slc.id, boardId: board.id, sortOrder: 0 },
                    });
                }
            }

            stageConfig = await this.fetchStageConfigWithIncludes(stageId);
            if (!stageConfig) {
                throw new NotFoundException(`Stage ${stageId} could not be auto-provisioned`);
            }
        }

        if (stageConfig.levels) {
            stageConfig.levels.forEach((l) => {
                if (l.level && !l.level.boards) {
                    l.level.boards = [];
                }
                if (!l.stageLevelBoards) {
                    l.stageLevelBoards = [];
                }
            });
        }

        return stageConfig;
    }

    buildBoardSequenceForRestate(stageConfig: StageConfigForRestate) {
        const boardSequence: string[] = [];
        const levelBoundaries: { name: string; endIndex: number }[] = [];

        if (!stageConfig?.levels) {
            return { boardSequence, levelBoundaries };
        }

        for (const levelConfig of stageConfig.levels) {
            let selectedIds: string[] = [];

            // stage_level config is present — always honour boardCount strictly (even if 0)
            const hasStageConfig = true;

            if (levelConfig.stageLevelBoards?.length > 0) {
                const curatedIds = levelConfig.stageLevelBoards.map((slb) => slb.boardId);
                selectedIds = this.expandBoardSequence(curatedIds, levelConfig.boardCount, hasStageConfig);
            } else if (levelConfig.level?.boards?.length > 0) {
                const shuffled = this.shuffleBoardIds(
                    levelConfig.level.boards.map((b: { id: string }) => b.id),
                );
                selectedIds = this.expandBoardSequence(shuffled, levelConfig.boardCount, hasStageConfig);
            } else if (levelConfig.boardCount != null && levelConfig.boardCount <= 0) {
                // boardCount is 0 and no boards available — explicitly skip this level
                continue;
            }

            if (selectedIds.length === 0) {
                if (this.isDevelopment()) {
                    console.warn(
                        `[GameService] No boards for level ${levelConfig.level?.name} in stage ${stageConfig.stageId}`,
                    );
                }
                continue;
            }

            boardSequence.push(...selectedIds);
            levelBoundaries.push({
                name: levelConfig.level?.name ?? 'Unknown Level',
                endIndex: boardSequence.length - 1,
            });
        }

        return { boardSequence, levelBoundaries };
    }

    async fetchSingleBoard(boardId: string): Promise<BoardCacheEntry> {
        const board = await this.prisma.board.findFirst({
            where: { id: boardId, isDeleted: false },
            select: {
                id: true,
                grid: true,
                gridX: true,
                gridY: true,
                levelId: true,
                timeLimit: true,
                color: true,
            },
        });
        if (!board) {
            throw new NotFoundException(`Board ${boardId} not found`);
        }
        return { ...board, grid: board.grid as number[][] };
    }

    async scheduleExpiry(sessionId: string, expiryAtMs: number, userId: string, stageId: string) {
        await this.gameExpiryService.schedule(sessionId, expiryAtMs, userId, stageId);
    }

    async flagCheat(
        sessionId: string,
        userId: string,
        moveDiff: number,
        sessionBoardId?: string,
    ) {
        await this.prisma.gameSession.updateMany({
            where: { id: sessionId },
            data: {
                isCheating: true,
                cheatingReason: `Suspiciously fast rotate: ${moveDiff}ms`,
            },
        });

        void this.persistAndPublishCheatFlags(
            [{ flagType: CHEAT_FLAG_TYPE.ROTATE_TOO_FAST, evidence: { moveDiff, thresholdMs: ANTI_CHEAT_CONFIGS.ROTATE_TOO_FAST_MS } }],
            { userId, sessionId, sessionBoardId: sessionBoardId ?? null },
        );
    }

    async runAntiCheatOnFinalize(session: InFlightSession, boards: InFlightBoard[]): Promise<void> {
        for (const board of boards) {
            if (board.moves.length > 0) {
                const flags = this.detectRotateTooFastFlags(board.moves);
                if (flags.length > 0) {
                    this.persistAndPublishCheatFlags(flags, {
                        userId: session.userId,
                        sessionId: session.sessionId,
                        sessionBoardId: board.id,
                    });
                }
            }

            if (board.isSolved && board.endedAt) {
                const durationMs =
                    new Date(board.endedAt).getTime() - new Date(board.startedAt).getTime();
                const totalTiles = board.gridX * board.gridY;
                const thresholdMs = totalTiles * ANTI_CHEAT_CONFIGS.IMPOSSIBLE_SOLVE_MS_PER_TILE;
                if (durationMs < thresholdMs) {
                    void this.persistAndPublishCheatFlags(
                        [{ flagType: CHEAT_FLAG_TYPE.IMPOSSIBLE_SOLVE_TIME, evidence: { durationMs, thresholdMs, totalTiles } }],
                        { userId: session.userId, sessionId: session.sessionId, sessionBoardId: board.id },
                    );
                }
            }
        }
    }

    private detectRotateTooFastFlags(
        moves: { clickedAt: string }[],
    ): { flagType: number; evidence: object }[] {
        const flags: { flagType: number; evidence: object }[] = [];
        const timestamps = moves.map((m) => new Date(m.clickedAt).getTime());
        const tooFast: { index: number; ms: number }[] = [];

        for (let i = 1; i < timestamps.length; i++) {
            const ms = timestamps[i] - timestamps[i - 1];
            if (ms < ANTI_CHEAT_CONFIGS.ROTATE_TOO_FAST_MS) {
                tooFast.push({ index: i, ms });
            }
        }

        if (tooFast.length > 0) {
            flags.push({ flagType: CHEAT_FLAG_TYPE.ROTATE_TOO_FAST, evidence: { thresholdMs: ANTI_CHEAT_CONFIGS.ROTATE_TOO_FAST_MS, violations: tooFast } });
        }

        if (moves.length >= ANTI_CHEAT_CONFIGS.UNIFORM_TIMING_MIN_INTERVALS + 1) {
            const intervals: number[] = [];
            for (let i = 1; i < timestamps.length; i++) {
                intervals.push(timestamps[i] - timestamps[i - 1]);
            }
            const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
            const stddev = Math.sqrt(intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length);
            const cv = mean > 0 ? stddev / mean : 0;
            if (cv < ANTI_CHEAT_CONFIGS.UNIFORM_TIMING_CV_THRESHOLD) {
                flags.push({ flagType: CHEAT_FLAG_TYPE.UNIFORM_TIMING, evidence: { intervals, mean: Math.round(mean), stddev: Math.round(stddev), cv: +cv.toFixed(4) } });
            }
        }

        return flags;
    }

    private persistAndPublishCheatFlags(
        flags: { flagType: number; evidence: object }[],
        ctx: { userId: string; sessionId: string; sessionBoardId: string | null },
    ): void {
        void this._persistAndPublishCheatFlags(flags, ctx);
    }

    private async _persistAndPublishCheatFlags(
        flags: { flagType: number; evidence: object }[],
        ctx: { userId: string; sessionId: string; sessionBoardId: string | null },
    ): Promise<void> {
        try {
            const createdFlags = await this.prisma.cheatFlag.createManyAndReturn({
                data: flags.map((flag) => ({
                    userId: ctx.userId,
                    sessionId: ctx.sessionId,
                    sessionBoardId: ctx.sessionBoardId ?? undefined,
                    flagType: flag.flagType,
                    evidence: flag.evidence,
                })),
                select: {
                    id: true,
                    userId: true,
                    flagType: true,
                    createdAt: true,
                },
            });

            await Promise.all(
                createdFlags.map((flag) =>
                    this.sns.publishCheatFlag({
                        referenceId: flag.id,
                        userId: flag.userId,
                        gameType: config.gameType,
                        flagType: flag.flagType,
                        createdAt: flag.createdAt.toISOString(),
                    }),
                ),
            );
        } catch (err) {
            this.logger.error(
                `[${ctx.userId}] Failed to persist/publish cheat flags: ${(err as Error).message}`,
            );
        }
    }

    // ── Session queries ───────────────────────────────────────────────────────

    async findTerminalSession(userId: string, stageId: string) {
        return this.prisma.gameSession.findFirst({
            where: {
                userId,
                stageId,
                status: { in: [...TERMINAL_SESSION_STATUSES] as number[] },
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                status: true,
                totalScore: true,
                totalMoves: true,
                totalTimeSec: true,
                terminationReason: true,
            },
        });
    }

    async getTerminalSummary(userId: string, stageId: string) {
        const [session, progress] = await Promise.all([
            this.prisma.gameSession.findFirst({
                where: {
                    userId,
                    stageId,
                    status: { in: [...TERMINAL_SESSION_STATUSES] as number[] },
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true, status: true, totalScore: true, totalMoves: true, terminationReason: true },
            }),
            this.prisma.userStageProgress.findUnique({
                where: { userId_stageId: { userId, stageId } },
                select: { boardsCompleted: true, status: true, score: true },
            }),
        ]);

        // Block replay if GameSession is terminal OR UserStageProgress exists with non-zero status
        const isTerminalBySession = !!session;
        const isTerminalByProgress = !!progress && progress.status !== 0;
        if (!isTerminalBySession && !isTerminalByProgress) {
            return null;
        }

        // If no terminal GameSession found, try to find any session for the id
        const sessionId =
            session?.id ??
            (
                await this.prisma.gameSession.findFirst({
                    where: { userId, stageId },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true },
                })
            )?.id ??
            null;

        // Query GameSessionBoard directly for accurate counts
        let boardsCompleted = 0;
        let boardsTotal = 0;
        if (sessionId) {
            const [completed, total] = await Promise.all([
                this.prisma.gameSessionBoard.count({ where: { sessionId, isSolved: true } }),
                this.prisma.gameSessionBoard.count({ where: { sessionId } }),
            ]);
            boardsCompleted = completed;
            boardsTotal = total;
        }

        // Fallback for old data with no GameSessionBoard rows
        if (boardsTotal === 0) {
            boardsCompleted = progress?.boardsCompleted ?? 0;
            boardsTotal = await this.getStageTotalBoards(stageId);
        }

        // Map UserStageProgress status (1=COMPLETED, 2=FAILED) to GameSession status if no session
        const status =
            session?.status ??
            (progress?.status === 1 ? GAME_SESSION_STATUS.COMPLETED : GAME_SESSION_STATUS.FAILED);

        return {
            id: sessionId,
            status,
            score: session?.totalScore ?? progress?.score ?? 0,
            boardsCompleted,
            boardsTotal,
            moves: session?.totalMoves ?? 0,
            terminationReason: session?.terminationReason ?? null,
        };
    }

    private async getStageTotalBoards(stageId: string): Promise<number> {
        const levels = await this.prisma.stageLevelConfig.findMany({
            where: { stageConfig: { stageId, isDeleted: false }, isDeleted: false },
            select: { boardCount: true },
        });
        return levels.reduce((sum, l) => sum + l.boardCount, 0);
    }

    // ── Timeout / expiry ──────────────────────────────────────────────────────

    emitTimeoutEvent(
        userId: string,
        stageId: string,
        score: number,
        boardsCompleted: number,
        boardsTotal: number,
    ) {
        this.gameEvents.emitTimeout(userId, stageId, { score, boardsCompleted, boardsTotal });
    }

    // ── Single end-of-game DB commit ──────────────────────────────────────────
    // All game data is written here in one atomic transaction — nothing is
    // persisted during gameplay.

    async finalizeAndCommit(
        session: InFlightSession,
        boards: InFlightBoard[],
        now: Date,
        finalStatus: number,
        terminationReason: string,
    ) {
        const terminalCommit = await this.prisma.$transaction(async (tx) => {
            // Idempotency: if a record already exists (e.g. duplicate timer fire), skip
            const existing = await tx.gameSession.findUnique({
                where: { id: session.sessionId },
                select: { status: true, totalScore: true },
            });

            if (existing) {
                if (
                    TERMINAL_SESSION_STATUSES.includes(
                        existing.status as (typeof TERMINAL_SESSION_STATUSES)[number],
                    )
                ) {
                    return {
                        alreadyFinalized: true,
                        userId: session.userId,
                        stageId: session.stageId,
                        totalScore: existing.totalScore,
                        boardsCompleted: 0,
                        totalMoves: 0,
                        progressStatus: 0,
                        startedAt: new Date(session.startedAt),
                        endedAt: now,
                        status: existing.status,
                    };
                }
                // Partial record (shouldn't happen, but handle gracefully)
                return {
                    alreadyFinalized: true,
                    userId: session.userId,
                    stageId: session.stageId,
                    totalScore: existing.totalScore,
                    boardsCompleted: 0,
                    totalMoves: 0,
                    progressStatus: 0,
                    startedAt: new Date(session.startedAt),
                    endedAt: now,
                    status: existing.status,
                };
            }

            const scoredBoards = boards.map((board) => {
                if (board.isSolved) {
                    return board;
                }
                return {
                    ...board,
                    score: board.score ?? 0,
                    endedAt: board.endedAt ?? now.toISOString(),
                };
            });

            const totalScore = scoredBoards.reduce((sum, b) => sum + (b.score ?? 0), 0);
            const totalMoves = scoredBoards.reduce((sum, b) => sum + b.moves.length, 0);
            const boardsCompleted = scoredBoards.filter((b) => b.isSolved).length;
            const durationSec = Math.round(
                (now.getTime() - new Date(session.startedAt).getTime()) / 1000,
            );

            // Create the session record (first time it touches the DB)
            await tx.gameSession.create({
                data: {
                    id: session.sessionId,
                    userId: session.userId,
                    stageId: session.stageId,
                    boardId:
                        boards[Math.min(session.currentBoardIndex, boards.length - 1)]?.boardId ??
                        boards[0]?.boardId ??
                        '',
                    currentGrid:
                        boards[Math.min(session.currentBoardIndex, boards.length - 1)]
                            ?.currentGrid ?? [],
                    status: finalStatus,
                    score: totalScore,
                    totalScore,
                    totalMoves,
                    totalTimeSec: durationSec,
                    moveCount: totalMoves,
                    isCheating: false,
                    terminationReason,
                    startedAt: new Date(session.startedAt),
                    endedAt: now,
                },
            });

            await tx.gameSessionBoard.createMany({
                data: scoredBoards.map((board) => ({
                    id: board.id,
                    sessionId: session.sessionId,
                    boardId: board.boardId,
                    levelId: board.levelId,
                    gridX: board.gridX,
                    gridY: board.gridY,
                    originalGrid: board.originalGrid,
                    scrambledGrid: board.currentGrid,
                    timeLimit: board.timeLimit,
                    color: board.color,
                    score: board.score ?? 0,
                    isSolved: board.isSolved,
                    moveCount: board.moves.length,
                    durationSec: Math.max(
                        0,
                        Math.round(
                            ((board.endedAt ? new Date(board.endedAt) : now).getTime() -
                                new Date(board.startedAt).getTime()) /
                                1000,
                        ),
                    ),
                })),
                skipDuplicates: true,
            });

            await tx.gameMove.createMany({
                data: scoredBoards.flatMap((board) =>
                    board.moves.map((move) => ({
                        id: move.id,
                        sessionId: session.sessionId,
                        boardId: board.id,
                        x: move.x,
                        y: move.y,
                        success: move.success,
                        clickedAt: new Date(move.clickedAt),
                    })),
                ),
                skipDuplicates: true,
            });

            const progressStatus =
                finalStatus === GAME_SESSION_STATUS.COMPLETED
                    ? 1
                    : finalStatus === GAME_SESSION_STATUS.FAILED
                      ? 2
                      : 0;

            return {
                alreadyFinalized: false,
                userId: session.userId,
                stageId: session.stageId,
                totalScore,
                totalMoves,
                boardsCompleted,
                progressStatus,
                startedAt: new Date(session.startedAt),
                endedAt: now,
                status: finalStatus,
            };
        });

        // Anti-cheat — fire-and-forget after the main transaction commits
        if (!terminalCommit.alreadyFinalized) {
            void this.runAntiCheatOnFinalize(session, boards);
        }

        if (!terminalCommit.alreadyFinalized && terminalCommit.progressStatus > 0) {
            await this.prisma.userStageProgress.upsert({
                where: {
                    userId_stageId: {
                        userId: terminalCommit.userId,
                        stageId: terminalCommit.stageId,
                    },
                },
                create: {
                    userId: terminalCommit.userId,
                    stageId: terminalCommit.stageId,
                    score: terminalCommit.totalScore,
                    boardsCompleted: terminalCommit.boardsCompleted,
                    status: terminalCommit.progressStatus,
                    startedAt: terminalCommit.startedAt,
                    endedAt: terminalCommit.endedAt,
                },
                update: {
                    score: terminalCommit.totalScore,
                    boardsCompleted: terminalCommit.boardsCompleted,
                    status: terminalCommit.progressStatus,
                    endedAt: terminalCommit.endedAt,
                },
            });
        }

        return terminalCommit;
    }

    // ── Game metadata (public API) ────────────────────────────────────────────

    async getGameMeta() {
        const stages = await this.prisma.stageConfig.findMany({
            where: { isDeleted: false },
            include: {
                levels: {
                    where: { isDeleted: false },
                    include: {
                        level: {
                            include: { boards: { where: { isDeleted: false } } },
                        },
                        stageLevelBoards: {
                            where: { board: { isDeleted: false } },
                        },
                    },
                },
            },
            orderBy: { stageId: 'asc' },
        });

        const result: Record<string, any[]> = {};
        stages.forEach((s) => {
            result[s.stageId] = s.levels.map((l) => {
                const boardIds =
                    l.stageLevelBoards.length > 0
                        ? l.stageLevelBoards.map((slb) => slb.boardId)
                        : l.level.boards.map((b) => b.id);
                return {
                    level: l.level.name,
                    boardCount: this.getConfiguredBoardCount(boardIds, l.boardCount),
                    curated: l.stageLevelBoards.length > 0,
                    timeLimit: s.timeLimit,
                };
            });
        });

        return { stages: result };
    }

    invalidateGameMetaCache(): void {
        return;
    }

    invalidateStageConfigCache(stageId: string): void {
        void stageId;
    }
}
