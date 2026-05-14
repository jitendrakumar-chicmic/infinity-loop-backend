import { PrismaService } from '@common/prisma/prisma.service';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma';

import * as PuzzleEngine from '../game/engine/puzzle.engine';
import { RedisService } from '../redis/redis.service';

import {
    UpsertStageConfigDto,
    DeleteStageConfigsDto,
    ListStageConfigsDto,
    CreateLevelDto,
    LinkLevelDto,
    CreateBoardDto,
    UpdateBoardDto,
    DeleteBoardsDto,
    ListBoardsDto,
    UpdateLevelDto,
    DeleteLevelsDto,
    ListLevelsDto,
    SelectStageBoardsDto,
    DeleteStageLevelConfigsDto,
    ListStageLevelConfigsDto,
    CreateUserProgressDto,
    UpdateUserProgressDto,
    ListUserProgressDto,
    DeleteUserProgressDto,
    CreateGameMoveDto,
    UpdateGameMoveDto,
    ListGameMovesDto,
    DeleteGameMovesDto,
    UpdateBoardCountDto,
    CreateStageConfigWithLevelsDto,
    ListStageConfigWithLevelsDto,
} from './dto/admin.dto';

type StageConfigWithLevels = Prisma.StageConfigGetPayload<{
    include: {
        levels: {
            include: {
                level: {
                    select: {
                        id: true;
                        name: true;
                    };
                };
            };
        };
    };
}>;

type StageConfigWithBoardLinks = Prisma.StageConfigGetPayload<{
    include: {
        levels: {
            include: {
                level: true;
                stageLevelBoards: {
                    include: {
                        board: true;
                    };
                };
            };
        };
    };
}>;

type FormattedStageConfigResponse = {
    id: string;
    stageId: string;
    timeLimit: number;
    createdAt: Date;
    levels: {
        id: string;
        boardCount: number;
        level: {
            id: string;
            name: string;
        } | null;
    }[];
};

type StageLevelConfigMutationResult = Prisma.StageLevelConfigGetPayload<{
    select: {
        id: true;
        stageConfigId: true;
        levelId: true;
        boardCount: true;
        createdAt: true;
        updatedAt: true;
        deletedAt: true;
        isDeleted: true;
    };
}>;

@Injectable()
export class AdminService {
    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
    ) {}

    private async invalidateStageCache(stageId: string): Promise<void> {
        await this.redis.del(`stage:config:${stageId}`);
    }

    async invalidateStageCachePublic(stageId: string): Promise<void> {
        await this.invalidateStageCache(stageId);
    }

    async flushAllStageCaches(): Promise<void> {
        const keys = await this.redis.keys('stage:config:*');
        if (keys.length > 0) {
            await Promise.all(keys.map((k: string) => this.redis.del(k)));
        }
    }

    async upsertStage(dto: UpsertStageConfigDto) {
        const existing = await this.prisma.stageConfig.findFirst({
            where: {
                stageId: dto.stageId,
                isDeleted: false,
            },
        });

        let result: Awaited<ReturnType<typeof this.prisma.stageConfig.update>>;
        if (existing) {
            result = await this.prisma.stageConfig.update({
                where: { id: existing.id },
                data: { timeLimit: dto.timeLimit },
            });
        } else {
            result = await this.prisma.stageConfig.create({
                data: { stageId: dto.stageId, timeLimit: dto.timeLimit },
            });
        }

        await this.invalidateStageCache(dto.stageId);
        return result;
    }

    async createStageConfigWithLevels(dto: CreateStageConfigWithLevelsDto) {
        // 1. Validate all levelIds exist
        const levelIds = dto.levels.map((l) => l.levelId);
        const existingLevels = await this.prisma.level.findMany({
            where: { id: { in: levelIds }, isDeleted: false },
            select: { id: true },
        });

        if (existingLevels.length !== levelIds.length) {
            const foundIds = existingLevels.map((l) => l.id);
            const missingIds = levelIds.filter((id) => !foundIds.includes(id));
            throw new NotFoundException(`Levels not found or deleted: ${missingIds.join(', ')}`);
        }

        // 2. Upsert StageConfig
        let stageConfig = await this.prisma.stageConfig.findFirst({
            where: { stageId: dto.stageId, isDeleted: false },
        });

        if (stageConfig) {
            stageConfig = await this.prisma.stageConfig.update({
                where: { id: stageConfig.id },
                data: { timeLimit: dto.timeLimit },
            });
        } else {
            stageConfig = await this.prisma.stageConfig.create({
                data: { stageId: dto.stageId, timeLimit: dto.timeLimit },
            });
        }

        // 3. Upsert StageLevelConfigs
        for (const l of dto.levels) {
            const existingLevelConfig = await this.prisma.stageLevelConfig.findFirst({
                where: {
                    stageConfigId: stageConfig.id,
                    levelId: l.levelId,
                    isDeleted: false,
                },
            });

            if (existingLevelConfig) {
                await this.prisma.stageLevelConfig.update({
                    where: { id: existingLevelConfig.id },
                    data: { boardCount: l.boardCount },
                });
            } else {
                await this.prisma.stageLevelConfig.create({
                    data: {
                        stageConfigId: stageConfig.id,
                        levelId: l.levelId,
                        boardCount: l.boardCount,
                    },
                });
            }
        }

        await this.invalidateStageCache(dto.stageId);
        return stageConfig;
    }

    async listStageConfigWithLevels(dto: ListStageConfigWithLevelsDto): Promise<{
        data: FormattedStageConfigResponse[];
        totalCount: number;
    }> {
        const { stageId, skip, limit } = dto;

        const [items, totalCount] = await Promise.all([
            this.prisma.stageConfig.findMany({
                where: { ...(stageId ? { stageId } : {}), isDeleted: false },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    levels: {
                        where: { isDeleted: false },
                        include: { level: { select: { id: true, name: true } } },
                    },
                },
            }),
            this.prisma.stageConfig.count({
                where: { ...(stageId ? { stageId } : {}), isDeleted: false },
            }),
        ]);

        return { data: items.map((s) => this._formatStageConfigResponse(s)), totalCount };
    }

    private _formatStageConfigResponse(
        stageConfig: StageConfigWithLevels,
    ): FormattedStageConfigResponse {
        const levelOrder = ['easy', 'medium', 'hard'];
        const sortedLevels = [...stageConfig.levels].sort((a, b) => {
            const ai = levelOrder.indexOf(a.level?.name?.toLowerCase() ?? '');
            const bi = levelOrder.indexOf(b.level?.name?.toLowerCase() ?? '');
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

        return {
            id: stageConfig.id,
            stageId: stageConfig.stageId,
            timeLimit: stageConfig.timeLimit,
            createdAt: stageConfig.createdAt,
            levels: sortedLevels.map((slc) => ({
                id: slc.id,
                boardCount: slc.boardCount,
                level: slc.level,
            })),
        };
    }

    async removeStages(dto: DeleteStageConfigsDto) {
        const stages = await this.prisma.stageConfig.findMany({
            where: { id: { in: dto.ids }, isDeleted: false },
            select: { stageId: true },
        });

        const result = await this.prisma.stageConfig.updateMany({
            where: { id: { in: dto.ids }, isDeleted: false },
            data: { isDeleted: true, deletedAt: new Date() },
        });

        await Promise.all(stages.map((s) => this.invalidateStageCache(s.stageId)));
        return result;
    }

    async listStages(dto: ListStageConfigsDto) {
        const { stageId, page, limit } = dto;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            this.prisma.stageConfig.findMany({
                where: {
                    stageId: stageId ? { contains: stageId } : undefined,
                    isDeleted: false,
                },
                skip,
                take: limit,
                orderBy: { stageId: 'asc' },
                include: {
                    levels: {
                        where: { isDeleted: false },
                        include: {
                            level: true,
                            stageLevelBoards: { include: { board: true } },
                        },
                    },
                },
            }),
            this.prisma.stageConfig.count({
                where: {
                    stageId: stageId ? { contains: stageId } : undefined,
                    isDeleted: false,
                },
            }),
        ]);

        return { items, total, page, limit };
    }

    async getStage(id: string): Promise<StageConfigWithBoardLinks> {
        const stage = await this.prisma.stageConfig.findFirst({
            where: {
                OR: [{ id }, { stageId: id }],
                isDeleted: false,
            },

            include: {
                levels: {
                    include: {
                        level: true,
                        stageLevelBoards: {
                            orderBy: { sortOrder: 'asc' },
                            include: { board: true },
                        },
                    },
                },
            },
        });

        if (!stage) {
            throw new NotFoundException(`Stage ${id} not found`);
        }
        return stage;
    }

    async createLevel(dto: CreateLevelDto) {
        return this.prisma.level.create({
            data: { name: dto.name },
        });
    }

    async updateLevel(dto: UpdateLevelDto) {
        const existing = await this.prisma.level.findFirst({
            where: { id: dto.id, isDeleted: false },
        });
        if (!existing) {
            throw new NotFoundException(`Level ${dto.id} not found or already deleted`);
        }

        return this.prisma.level.update({
            where: { id: dto.id },
            data: { name: dto.name },
        });
    }

    async removeLevels(dto: DeleteLevelsDto) {
        return this.prisma.level.updateMany({
            where: { id: { in: dto.ids }, isDeleted: false },
            data: { isDeleted: true, deletedAt: new Date() },
        });
    }

    async listLevels(dto: ListLevelsDto) {
        const { name, page, limit } = dto;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            this.prisma.level.findMany({
                where: {
                    name: name ? { contains: name, mode: 'insensitive' } : undefined,
                    isDeleted: false,
                },
                skip,
                take: limit,
                orderBy: { name: 'asc' },
            }),
            this.prisma.level.count({
                where: {
                    name: name ? { contains: name, mode: 'insensitive' } : undefined,
                    isDeleted: false,
                },
            }),
        ]);

        return { items, total, page, limit };
    }

    async linkLevelToStage(dto: LinkLevelDto) {
        const [stage, level] = await Promise.all([
            this.prisma.stageConfig.findFirst({
                where: { id: dto.stageConfigId, isDeleted: false },
            }),
            this.prisma.level.findFirst({ where: { id: dto.levelId, isDeleted: false } }),
        ]);

        if (!stage) {
            throw new NotFoundException(`Stage ${dto.stageConfigId} not found`);
        }
        if (!level) {
            throw new NotFoundException(`Level ${dto.levelId} not found`);
        }

        const existing = await this.prisma.stageLevelConfig.findFirst({
            where: {
                stageConfigId: dto.stageConfigId,
                levelId: dto.levelId,
                isDeleted: false,
            },
        });

        let result: StageLevelConfigMutationResult;
        if (existing) {
            result = await this.prisma.stageLevelConfig.update({
                where: { id: existing.id },
                data: { boardCount: dto.boardCount },
            });
        } else {
            result = await this.prisma.stageLevelConfig.create({
                data: {
                    stageConfigId: dto.stageConfigId,
                    levelId: dto.levelId,
                    boardCount: dto.boardCount ?? 0,
                },
            });
        }

        await this.invalidateStageCache(stage.stageId);
        return result;
    }

    async removeStageLevelConfigs(dto: DeleteStageLevelConfigsDto) {
        const configs = await this.prisma.stageLevelConfig.findMany({
            where: { id: { in: dto.ids }, isDeleted: false },
            select: { stageConfig: { select: { stageId: true } } },
        });

        const result = await this.prisma.stageLevelConfig.updateMany({
            where: { id: { in: dto.ids }, isDeleted: false },
            data: { isDeleted: true, deletedAt: new Date() },
        });

        const stageIds = [...new Set(configs.map((c) => c.stageConfig.stageId))];
        await Promise.all(stageIds.map((id) => this.invalidateStageCache(id)));
        return result;
    }

    async updateBoardCount(dto: UpdateBoardCountDto) {
        const config = await this.prisma.stageLevelConfig.findFirst({
            where: { id: dto.stageLevelConfigId, isDeleted: false },
            include: { stageConfig: { select: { stageId: true } } },
        });

        if (!config) {
            throw new NotFoundException(`StageLevelConfig ${dto.stageLevelConfigId} not found`);
        }

        const result = await this.prisma.stageLevelConfig.update({
            where: { id: dto.stageLevelConfigId },
            data: { boardCount: dto.boardCount },
        });

        await this.invalidateStageCache(config.stageConfig.stageId);
        return result;
    }

    async listStageLevelConfigs(dto: ListStageLevelConfigsDto) {
        const { stageConfigId, page, limit } = dto;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            this.prisma.stageLevelConfig.findMany({
                where: {
                    stageConfigId,
                    isDeleted: false,
                },
                include: {
                    stageConfig: true,
                    level: true,
                    stageLevelBoards: {
                        where: { board: { isDeleted: false } },
                        include: { board: true },
                    },
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.stageLevelConfig.count({
                where: {
                    stageConfigId,
                    isDeleted: false,
                },
            }),
        ]);

        return { items, total, page, limit };
    }

    async addBoard(dto: CreateBoardDto) {
        const levelExists = await this.prisma.level.findFirst({
            where: { id: dto.levelId, isDeleted: false },
        });
        if (!levelExists) {
            throw new NotFoundException(`Level ${dto.levelId} not found`);
        }

        // Validate Solvability
        // const validation = PuzzleEngine.validateSolution(dto.grid);
        // if (!validation.valid) {
        //     throw new BadRequestException({
        //         message: 'Invalid Puzzle Board: Solvability check failed',
        //         errors: validation.errors
        //     });
        // }

        return this.prisma.board.create({
            data: {
                levelId: dto.levelId,
                name: dto.name,
                grid: dto.grid,
                gridX: dto.gridX,
                gridY: dto.gridY,
                timeLimit: dto.timeLimit ?? 120,
                color: dto.color,
            },
        });
    }

    async updateBoard(dto: UpdateBoardDto) {
        const existing = await this.prisma.board.findFirst({
            where: { id: dto.id, isDeleted: false },
        });
        if (!existing) {
            throw new NotFoundException(`Board ${dto.id} not found or already deleted`);
        }

        if (dto.grid) {
            const validation = PuzzleEngine.validateSolution(dto.grid);
            if (!validation.valid) {
                throw new BadRequestException({
                    message: 'Invalid Puzzle Board: Solvability check failed',
                    errors: validation.errors,
                });
            }
        }

        return this.prisma.board.update({
            where: { id: dto.id },
            data: {
                levelId: dto.levelId,
                name: dto.name,
                grid: dto.grid,
                gridX: dto.gridX,
                gridY: dto.gridY,
                timeLimit: dto.timeLimit,
                color: dto.color,
            },
        });
    }

    async removeBoards(dto: DeleteBoardsDto) {
        return this.prisma.board.updateMany({
            where: { id: { in: dto.ids }, isDeleted: false },
            data: { isDeleted: true, deletedAt: new Date() },
        });
    }

    async removeBoard(id: string) {
        const existing = await this.prisma.board.findFirst({
            where: { id, isDeleted: false },
        });
        if (!existing) {
            throw new NotFoundException(`Board ${id} not found or already deleted`);
        }

        await this.prisma.board.update({
            where: { id },
            data: { isDeleted: true, deletedAt: new Date() },
        });

        return {
            message: 'Board deleted successfully',
            id,
        };
    }

    async clearAllBoards() {
        return this.prisma.board.updateMany({
            where: { isDeleted: false },
            data: { isDeleted: true, deletedAt: new Date() },
        });
    }

    async listBoards(dto: ListBoardsDto) {
        const { levelId, name, page, limit } = dto;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            this.prisma.board.findMany({
                where: {
                    levelId,
                    name: name ? { contains: name, mode: 'insensitive' } : undefined,
                    isDeleted: false,
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { level: true },
            }),
            this.prisma.board.count({
                where: {
                    levelId,
                    name: name ? { contains: name, mode: 'insensitive' } : undefined,
                    isDeleted: false,
                },
            }),
        ]);

        return {
            items: items.map((board) => ({
                id: board.id,
                name: board.name,
                createdAt: board.createdAt,
                level: {
                    id: board.level.id,
                    name: board.level.name,
                },
                gridSize: {
                    x: board.gridX,
                    y: board.gridY,
                },
            })),
            totalCount: total,
        };
    }

    async getBoard(id: string) {
        const board = await this.prisma.board.findFirst({
            where: { id, isDeleted: false },
            include: { level: true },
        });

        if (!board) {
            throw new NotFoundException(`Board ${id} not found`);
        }

        return {
            id: board.id,
            name: board.name,
            createdAt: board.createdAt,
            level: {
                id: board.level.id,
                name: board.level.name,
            },
            gridSize: {
                x: board.gridX,
                y: board.gridY,
            },
            grid: board.grid,
            timeLimit: board.timeLimit,
            color: board.color,
        };
    }

    async selectBoardsToStageLevel(dto: SelectStageBoardsDto) {
        const config = await this.prisma.stageLevelConfig.findFirst({
            where: { id: dto.stageLevelConfigId },
            select: { stageConfig: { select: { stageId: true } } },
        });

        // Clear existing selections for this stage-level config if any
        await this.prisma.stageLevelBoard.deleteMany({
            where: { stageLevelConfigId: dto.stageLevelConfigId },
        });

        // Create new selections with sort order
        const result = await this.prisma.stageLevelConfig.update({
            where: { id: dto.stageLevelConfigId },
            data: {
                stageLevelBoards: {
                    create: dto.boardIds.map((id, index) => ({
                        boardId: id,
                        sortOrder: index,
                    })),
                },
            },
            include: { stageLevelBoards: { include: { board: true } } },
        });

        if (config) {
            await this.invalidateStageCache(config.stageConfig.stageId);
        }
        return result;
    }

    // ─── User Progress Management ──────────────────────────────────────────────

    async createUserProgress(dto: CreateUserProgressDto) {
        return this.prisma.userStageProgress.upsert({
            where: { userId_stageId: { userId: dto.userId, stageId: dto.stageId } },
            create: {
                userId: dto.userId,
                stageId: dto.stageId,
                score: dto.score ?? 0,
                boardsCompleted: dto.boardsCompleted ?? 0,
                status: dto.status ?? 0,
            },
            update: {
                score: dto.score,
                boardsCompleted: dto.boardsCompleted,
                status: dto.status,
            },
        });
    }

    async updateUserProgress(id: string, dto: UpdateUserProgressDto) {
        const existing = await this.prisma.userStageProgress.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`User progress record ${id} not found`);
        }

        return this.prisma.userStageProgress.update({
            where: { id },
            data: {
                score: dto.score,
                boardsCompleted: dto.boardsCompleted,
                status: dto.status,
                endedAt: dto.endedAt,
            },
        });
    }

    async removeUserProgress(id: string) {
        return this.prisma.userStageProgress.delete({ where: { id } });
    }

    async removeUserProgressMany(dto: DeleteUserProgressDto) {
        return this.prisma.userStageProgress.deleteMany({
            where: { id: { in: dto.ids } },
        });
    }

    async getUserProgress(id: string) {
        const progress = await this.prisma.userStageProgress.findUnique({ where: { id } });
        if (!progress) {
            throw new NotFoundException(`User progress record ${id} not found`);
        }
        return progress;
    }

    async listUserProgress(dto: ListUserProgressDto) {
        const { userId, stageId, status, page, limit } = dto;
        const skip = (page - 1) * limit;

        const where = {
            userId: userId || undefined,
            stageId: stageId || undefined,
            status: status !== undefined ? status : undefined,
        };

        const [items, total] = await Promise.all([
            this.prisma.userStageProgress.findMany({
                where,
                skip,
                take: limit,
                orderBy: { updatedAt: 'desc' },
            }),
            this.prisma.userStageProgress.count({ where }),
        ]);

        return { items, total, page, limit };
    }

    // ─── Game Move Management ───────────────────────────────────────────────────

    async createGameMove(dto: CreateGameMoveDto) {
        return this.prisma.gameMove.create({
            data: {
                sessionId: dto.sessionId,
                boardId: dto.boardId,
                x: dto.x,
                y: dto.y,
                success: dto.success,
            },
        });
    }

    async updateGameMove(id: string, dto: UpdateGameMoveDto) {
        const existing = await this.prisma.gameMove.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`Game move ${id} not found`);
        }

        return this.prisma.gameMove.update({
            where: { id },
            data: {
                success: dto.success,
            },
        });
    }

    async removeGameMoves(dto: DeleteGameMovesDto) {
        return this.prisma.gameMove.deleteMany({
            where: { id: { in: dto.ids } },
        });
    }

    async getGameMove(id: string) {
        const gameMove = await this.prisma.gameMove.findUnique({ where: { id } });
        if (!gameMove) {
            throw new NotFoundException(`Game move ${id} not found`);
        }
        return gameMove;
    }

    async listGameMoves(dto: ListGameMovesDto) {
        const { sessionId, boardId, page, limit } = dto;
        const skip = (page - 1) * limit;

        const where = {
            sessionId: sessionId || undefined,
            boardId: boardId || undefined,
        };

        const [items, total] = await Promise.all([
            this.prisma.gameMove.findMany({
                where,
                skip,
                take: limit,
                orderBy: { clickedAt: 'desc' },
                include: { session: true },
            }),
            this.prisma.gameMove.count({ where }),
        ]);

        return { items, total, page, limit };
    }
}
