import { SessionGuard } from '@common/guards/session.guard';
import { config } from '@config';
import { Module, forwardRef } from '@nestjs/common';

import { AwsModule } from '../aws/aws.module';
import { CommonModule } from '../common/common.module';
import { RedisModule } from '../redis/redis.module';
import { RestateModule } from '../restate/restate.module';

import { GameConfigService } from './game-config.service';
import { GameEventsService } from './game-events.service';
import { GameController } from './game.controller';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { TestAuthController } from './test-auth.controller';

@Module({
    imports: [RedisModule, CommonModule, AwsModule, forwardRef(() => RestateModule)],
    controllers: config.security.enableDevAuth
        ? [GameController, TestAuthController]
        : [GameController],
    providers: [GameGateway, GameService, GameConfigService, SessionGuard, GameEventsService],
    exports: [GameConfigService, GameService, GameEventsService],
})
export class GameModule {}
