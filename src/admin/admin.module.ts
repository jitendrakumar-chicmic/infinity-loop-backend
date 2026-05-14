import { PrismaModule } from '@common/prisma/prisma.module';
import { Module } from '@nestjs/common';

import { AwsModule } from '../aws/aws.module';
import { GameModule } from '../game/game.module';

import { AdminGameConfigController } from './admin-game-config.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { BoardController } from './board.controller';
import { GameMoveController } from './game-move.controller';
import { LevelController } from './level.controller';
import { PuzzleController } from './puzzle.controller';
import { PuzzleService } from './puzzle.service';
import { StageConfigEventsService } from './stage-config-events.service';
import { StageConfigController, StageLevelConfigController } from './stage-config.controller';
import { UserProgressController } from './user-progress.controller';

@Module({
    imports: [PrismaModule, GameModule, AwsModule],
    controllers: [
        AdminController,
        LevelController,
        StageConfigController,
        StageLevelConfigController,
        BoardController,
        PuzzleController,
        UserProgressController,
        GameMoveController,
        AdminGameConfigController,
    ],
    providers: [AdminService, PuzzleService, StageConfigEventsService],
})
export class AdminModule {}
