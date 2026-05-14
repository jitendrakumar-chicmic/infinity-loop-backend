import { PrismaService } from '@common/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';

export interface DemoInfoResult {
    stageId: string;
    enableDemo: boolean;
    timeLimit: number;
    isEnabled: boolean;
    levels: {
        levelId: string;
        levelName: string;
        boardCount: number;
    }[];
}

@Injectable()
export class DemoService {
    constructor(private readonly prisma: PrismaService) {}

    async getDemoInfo(stageId: string): Promise<DemoInfoResult> {
        const stageConfig = await this.prisma.stageConfig.findFirst({
            where: { stageId, isDeleted: false },
            select: {
                enableDemo: true,
                timeLimit: true,
                isEnabled: true,
                levels: {
                    where: { isDeleted: false },
                    orderBy: { createdAt: 'asc' },
                    select: {
                        boardCount: true,
                        level: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!stageConfig) {
            throw new NotFoundException('STAGE_CONFIG_NOT_FOUND');
        }

        return {
            stageId,
            enableDemo: stageConfig.enableDemo,
            timeLimit: stageConfig.timeLimit,
            isEnabled: stageConfig.isEnabled,
            levels: stageConfig.levels.map((l) => ({
                levelId: l.level.id,
                levelName: l.level.name,
                boardCount: l.boardCount,
            })),
        };
    }
}
