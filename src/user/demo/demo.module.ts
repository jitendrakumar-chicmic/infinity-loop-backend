import { CommonModule } from '../../common/common.module';
import { Module } from '@nestjs/common';

import { RedisModule } from '../../redis/redis.module';

import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
    imports: [CommonModule, RedisModule],
    controllers: [DemoController],
    providers: [DemoService],
})
export class DemoModule {}
