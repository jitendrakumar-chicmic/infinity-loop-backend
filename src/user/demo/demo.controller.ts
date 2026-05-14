import { REQUEST_CONTEXT, TOKEN_TYPES, USER_TYPES } from '@common/constants';
import { RequireSession } from '@common/decorators/session.decorator';
import { SessionGuard } from '@common/guards/session.guard';
import { Controller, Get, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';

import { DemoService } from './demo.service';

interface DemoRequest extends ExpressRequest {
    [REQUEST_CONTEXT.USER]?: { id: string; stageId?: string };
}

@ApiTags('User Demo')
@ApiBearerAuth()
@Controller('v1/user/demo')
@UseGuards(SessionGuard)
export class DemoController {
    constructor(private readonly demoService: DemoService) {}

    @ApiOperation({ summary: 'Get demo info and game details before game starts' })
    @Get()
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.USER] })
    getDemo(@Request() req: DemoRequest) {
        const user = req[REQUEST_CONTEXT.USER];
        const stageId = user?.stageId;
        if (!stageId) {
            throw new NotFoundException('STAGE_ID_MISSING');
        }
        return this.demoService.getDemoInfo(stageId);
    }
}
