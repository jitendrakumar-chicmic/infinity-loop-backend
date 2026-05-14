import { PrismaService } from '@common/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma';

type GameConfigUpsertInput = Prisma.GameConfigUncheckedCreateInput;
type ActiveStageConfig = Prisma.StageConfigGetPayload<{
    select: {
        id: true;
        stageId: true;
        timeLimit: true;
        createdAt: true;
        updatedAt: true;
        deletedAt: true;
        isDeleted: true;
    };
}> & { timeLimitSec: number };

@Injectable()
export class GameConfigService {
    constructor(private prisma: PrismaService) {}

    /**
     * Fetch the global game configuration.
     * Returns the first record as there's only one global config.
     */
    async getGlobalConfig() {
        const config = await this.prisma.gameConfig.findFirst({
            where: { isDeleted: false },
        });

        if (!config) {
            // Optional: return a default object instead of throwing
            return null;
        }

        return config;
    }

    /**
     * Create or update the global game configuration.
     */
    async upsertGlobalConfig(data: GameConfigUpsertInput) {
        const existing = await this.prisma.gameConfig.findFirst({
            where: { isDeleted: false },
        });

        if (existing) {
            return this.prisma.gameConfig.update({
                where: { id: existing.id },
                data: {
                    ...data,
                    updatedAt: new Date(),
                },
            });
        }

        return this.prisma.gameConfig.create({
            data: {
                ...data,
            },
        });
    }

    /**
     * Fetch the active configuration for a given stage.
     */
    async getActiveConfig(stageId: string, gameType?: string): Promise<ActiveStageConfig> {
        void gameType;
        const config = await this.prisma.stageConfig.findFirst({
            where: { stageId, isDeleted: false },
            select: {
                id: true,
                stageId: true,
                timeLimit: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
                isDeleted: true,
            },
        });

        if (!config) {
            throw new NotFoundException(`No active configuration for stage ${stageId}`);
        }

        return {
            ...config,
            timeLimitSec: config.timeLimit, // Mapping for backward compatibility in Gateway
        };
    }

    /**
     * Upsert a stage configuration.
     */
    async upsertStageConfig(data: { stageId: string; timeLimit: number }) {
        const existing = await this.prisma.stageConfig.findFirst({
            where: { stageId: data.stageId, isDeleted: false },
        });

        if (existing) {
            return this.prisma.stageConfig.update({
                where: { id: existing.id },
                data: { timeLimit: data.timeLimit },
            });
        }

        return this.prisma.stageConfig.create({
            data: { stageId: data.stageId, timeLimit: data.timeLimit },
        });
    }

    async listStageConfigs() {
        return this.prisma.stageConfig.findMany({
            orderBy: { stageId: 'asc' },
        });
    }
}
