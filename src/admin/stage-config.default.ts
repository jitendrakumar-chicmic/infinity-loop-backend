import { DEFAULT_STAGE_CONFIG } from '@common/constants';
import { PrismaService } from '@common/prisma/prisma.service';

export async function buildDefaultStageConfig(stageId: string, prisma: PrismaService) {
    const allLevels = await prisma.level.findMany({
        where: { isDemo: false, isDeleted: false },
        select: {
            id: true,
            _count: { select: { boards: { where: { isDeleted: false } } } },
        },
        orderBy: { createdAt: 'asc' },
    });
    
    const levels = allLevels.filter(
        (level) => level._count.boards >= DEFAULT_STAGE_CONFIG.BOARD_COUNT,
    );

    if (levels.length === 0) {
        return null;
    }

    return {
        stageId,
        timeLimit: DEFAULT_STAGE_CONFIG.TIME_LIMIT,
        enableDemo: false,
        levels: levels.map((level, index) => ({
            levelId: level.id,
            boardCount: DEFAULT_STAGE_CONFIG.BOARD_COUNT,
            order: index,
        })),
    };
}
