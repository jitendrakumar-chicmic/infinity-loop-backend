import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Check the health of the service' })
    async check() {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            details: {
                database: 'down',
                redis: 'down',
            },
        };

        try {
            await this.prisma.$queryRaw`SELECT 1`;
            health.details.database = 'up';
        } catch {
            health.status = 'error';
            health.details.database = 'down';
        }

        try {
            // Accessing private client is not ideal, but we can use a generic ping if available
            // Or just try to set/get a test key
            await this.redis.set('health-check', 'ok', 10);
            health.details.redis = 'up';
        } catch {
            health.status = 'error';
            health.details.redis = 'down';
        }

        return health;
    }
}
