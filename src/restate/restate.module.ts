import { Module, forwardRef } from '@nestjs/common';

import { GameModule } from '../game/game.module';

import { GameExpiryService } from './game-expiry.service';
import { GameSessionRestateService } from './game-session-restate.service';
import { RestateEndpointService } from './restate-endpoint.service';

@Module({
    imports: [forwardRef(() => GameModule)],
    providers: [GameExpiryService, GameSessionRestateService, RestateEndpointService],
    exports: [GameExpiryService, GameSessionRestateService],
})
export class RestateModule {}
