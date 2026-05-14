import { TOKEN_TYPES, USER_TYPES } from '@common/constants';
import { RequireSession } from '@common/decorators/session.decorator';
import { SessionGuard } from '@common/guards/session.guard';
import { Controller, Get, Post, Body, UsePipes, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';

import { GameConfigService } from '../game/game-config.service';

import { CreateGameConfigDto } from './dto/game-config.dto';

@ApiTags('Admin - Game Config')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('admin/game-config')
@UsePipes(ZodValidationPipe)
export class AdminGameConfigController {
    constructor(private readonly gameConfigService: GameConfigService) {}

    @ApiOperation({ summary: 'Get global game configuration' })
    @Get()
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    async getGlobalConfig() {
        return this.gameConfigService.getGlobalConfig();
    }

    @ApiOperation({ summary: 'Create or Update global game configuration' })
    @Post()
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    async upsertGlobalConfig(@Body() body: CreateGameConfigDto) {
        return this.gameConfigService.upsertGlobalConfig(body);
    }
}
