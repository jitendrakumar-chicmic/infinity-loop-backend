import { SqsService } from '../aws/sqs.service';
import { PrismaService } from '@common/prisma/prisma.service';
import { GAME_CONFIG_EVENT_TYPE } from '@common/constants';
import { config } from '@config';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Message } from '@aws-sdk/client-sqs';

import { buildDefaultStageConfig } from './stage-config.default';

interface StageGameEvent {
    stage_id: string;
    game_type: string;
    time_limit?: number;
    enable_demo?: boolean;
}

@Injectable()
export class StageConfigEventsService implements OnModuleInit {
    private readonly logger = new Logger(StageConfigEventsService.name);

    constructor(
        private readonly sqs: SqsService,
        private readonly prisma: PrismaService,
    ) {}

    onModuleInit() {
        this.sqs.subscribe((message) => this.handle(message));
    }

    private async handle(message: Message): Promise<void> {
        const eventType = message.MessageAttributes?.['event_type']?.StringValue;

        if (
            eventType !== GAME_CONFIG_EVENT_TYPE.STAGE_ATTACHED &&
            eventType !== GAME_CONFIG_EVENT_TYPE.STAGE_DETACHED
        ) {
            return;
        }

        let body: StageGameEvent;
        try {
            body = JSON.parse(message.Body ?? '{}');
        } catch {
            this.logger.warn(`Failed to parse SQS message body: ${message.MessageId}`);
            return;
        }

        if (body.game_type !== config.gameTypeKey) {
            this.logger.debug(
                `Ignoring ${eventType} for game_type=${body.game_type} (expected ${config.gameTypeKey})`,
            );
            return;
        }

        const { stage_id: stageId } = body;

        if (!stageId) {
            this.logger.warn(`Missing stage_id in ${eventType} message ${message.MessageId}`);
            return;
        }

        if (eventType === GAME_CONFIG_EVENT_TYPE.STAGE_ATTACHED) {
            await this.handleAttached(stageId, body.time_limit, body.enable_demo);
        } else {
            await this.handleDetached(stageId);
        }
    }

    private async handleAttached(stageId: string, timeLimit?: number, enableDemo?: boolean): Promise<void> {
        const existing = await this.prisma.stageConfig.findFirst({
            where: { stageId, isDeleted: false },
            select: { id: true, isEnabled: true },
        });

        if (existing) {
            const updateData: { isEnabled?: boolean; timeLimit?: number; enableDemo?: boolean } = {};
            if (!existing.isEnabled) updateData.isEnabled = true;
            if (timeLimit !== undefined) updateData.timeLimit = timeLimit;
            if (enableDemo !== undefined) updateData.enableDemo = enableDemo;

            if (Object.keys(updateData).length > 0) {
                await this.prisma.stageConfig.update({
                    where: { id: existing.id },
                    data: updateData,
                });
                this.logger.log(`[${stageId}] Updated existing stage config: ${JSON.stringify(updateData)}`);
            }
            return;
        }

        const defaults = await buildDefaultStageConfig(stageId, this.prisma);
        if (!defaults) {
            this.logger.warn(`[${stageId}] No eligible levels found for default config`);
            return;
        }

        const stageConfig = await this.prisma.stageConfig.create({
            data: {
                stageId: defaults.stageId,
                timeLimit: timeLimit ?? defaults.timeLimit,
                enableDemo: enableDemo ?? defaults.enableDemo,
                isEnabled: true,
            },
        });

        let levelsWithBoards = 0;

        for (const level of defaults.levels) {
            const slc = await this.prisma.stageLevelConfig.create({
                data: {
                    stageConfigId: stageConfig.id,
                    levelId: level.levelId,
                    boardCount: level.boardCount,
                },
            });

            // Assign the first available board for this level
            const board = await this.prisma.board.findFirst({
                where: { levelId: level.levelId, isDeleted: false },
                orderBy: { createdAt: 'asc' },
                select: { id: true },
            });

            if (board) {
                await this.prisma.stageLevelBoard.create({
                    data: {
                        stageLevelConfigId: slc.id,
                        boardId: board.id,
                        sortOrder: 0,
                    },
                });
                levelsWithBoards++;
            } else {
                this.logger.warn(`[${stageId}] No boards found for level ${level.levelId}`);
            }
        }

        this.logger.log(
            `[${stageId}] Created default stage config with ${defaults.levels.length} level(s), ${levelsWithBoards} with boards assigned`,
        );
    }

    private async handleDetached(stageId: string): Promise<void> {
        const existing = await this.prisma.stageConfig.findFirst({
            where: { stageId, isDeleted: false },
            select: { id: true },
        });

        if (!existing) {
            return;
        }

        await this.prisma.stageConfig.update({
            where: { id: existing.id },
            data: { isEnabled: false },
        });

        this.logger.log(`[${stageId}] Disabled stage config`);
    }
}
