import { randomUUID } from 'crypto';

import { USER_TYPES, TOKEN_TYPES } from '@common/constants';
import { RequireSession } from '@common/decorators/session.decorator';
import { SessionGuard } from '@common/guards/session.guard';
import { generateLoginToken } from '@common/utils/token.util';
import { config } from '@config';
import { Controller, Post, Body, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';

import { RedisService } from '../redis/redis.service';
import { GameSessionRestateService } from '../restate/game-session-restate.service';

import { GameStartDto } from './dto/game-start.dto';
import { GameService } from './game.service';

interface GameRequestUser {
    id: string;
    stageId?: string;
}

interface GameRequest extends ExpressRequest {
    user: GameRequestUser;
}

@ApiTags('Game')
@Controller('game')
export class GameController {
    constructor(
        private readonly gameService: GameService,
        private readonly redisService: RedisService,
        private readonly gameSessionRestate: GameSessionRestateService,
    ) {}

    /**
     * Mock Join endpoint for Postman testing.
     * Creates a temporary user and session in Redis, returns a JWT token.
     */
    @ApiOperation({ summary: 'Mock Join (Development Only)' })
    @Post('join')
    async join(@Body() body?: { name: string; stageId?: string | number }) {
        if (!config.security.enableDevAuth) {
            throw new NotFoundException();
        }

        const userId = randomUUID();
        const sessionId = randomUUID();
        const userName = body?.name || 'Player';
        const user = {
            id: userId,
            name: userName,
            stageId: body?.stageId ? body.stageId.toString() : '1', // Allow override for testing
            createdAt: new Date().toISOString(),
        };

        const session = {
            userId,
            adminId: null,
            userType: USER_TYPES.USER,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };

        // Persist mock user and session to Redis so guards / logic can find them
        await this.redisService.setUser(userId, user);
        await this.redisService.setSession(sessionId, session, 7 * 24 * 60 * 60);

        const token = generateLoginToken(userId, USER_TYPES.USER, sessionId);

        return {
            message: 'User joined successfully',
            token,
            user,
        };
    }

    /**
     * Start a new game session via HTTP.
     * Requires the login token returned by /join.
     */
    @ApiOperation({ summary: 'Start a new game session' })
    @ApiBearerAuth()
    @Post('start')
    @UseGuards(SessionGuard)
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.USER] })
    async start(@Request() req: GameRequest, @Body() body: GameStartDto) {
        const user = req.user;
        const stageId = body.stage ?? user.stageId ?? '1';
        const result = await this.gameSessionRestate.startGame(user.id, stageId);

        return {
            message: 'Game session generated',
            ...result,
        };
    }
}
