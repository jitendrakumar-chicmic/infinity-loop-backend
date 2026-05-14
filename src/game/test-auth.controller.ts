import { randomUUID } from 'crypto';

import { USER_TYPES, UserType } from '@common/constants';
import { generateLoginToken } from '@common/utils/token.util';
import { config } from '@config';
import { Controller, Post, Body, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';

import { RedisService } from '../redis/redis.service';

/**
 * TEST ONLY CONTROLLER
 * Used to generate valid tokens and persist sessions to Redis for E2E testing.
 * DO NOT USE IN PRODUCTION.
 */

@ApiTags('Test Auth (Dev Utility)')
@Controller('test-auth')
export class TestAuthController {
    constructor(private readonly redisService: RedisService) {}

    @ApiOperation({ summary: 'Generate a test token and session' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', example: 'user-123' },
                name: { type: 'string', example: 'Test Player' },
                stageId: { type: 'number', example: 100 },
                userType: { type: 'number', example: 1, description: '1 for User, 2 for Admin' },
            },
        },
    })
    @Post('token')
    async generateTestToken(
        @Body()
        body: {
            userId?: string;
            name?: string;
            stageId?: string | number;
            userType?: number;
        },
    ) {
        if (!config.security.enableDevAuth) {
            throw new NotFoundException();
        }

        const userId = body.userId || randomUUID();
        const sessionId = randomUUID();
        const userType = body.userType || USER_TYPES.USER;
        const stageId = body.stageId ? body.stageId.toString() : '1';

        const user = {
            id: userId,
            name: body.name || 'Test User',
            stageId,
            createdAt: new Date().toISOString(),
        };

        const session = {
            userId,
            adminId: null,
            userType,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        };

        // Persist to Redis
        await this.redisService.setUser(userId, user);
        await this.redisService.setSession(sessionId, session, 24 * 60 * 60);

        const token = generateLoginToken(userId, userType as UserType, sessionId);

        return {
            token,
            userId,
            sessionId,
            user,
            session,
        };
    }
}
