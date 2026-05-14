import { TOKEN_TYPES, USER_TYPES } from '@common/constants';
import { RequireSession } from '@common/decorators/session.decorator';
import { SessionGuard } from '@common/guards/session.guard';
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { AdminService } from './admin.service';
import { LinkLevelDto, SelectStageBoardsDto } from './dto/admin.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    @ApiOperation({ summary: 'Link a level to a stage' })
    @Post('links')
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    async linkLevel(
        @Body() body: LinkLevelDto,
    ): Promise<Awaited<ReturnType<AdminService['linkLevelToStage']>>> {
        return this.adminService.linkLevelToStage(body);
    }

    @ApiOperation({ summary: 'Select specific boards for a stage-level configuration' })
    @Post('select-boards')
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    async selectBoards(
        @Body() body: SelectStageBoardsDto,
    ): Promise<Awaited<ReturnType<AdminService['selectBoardsToStageLevel']>>> {
        return this.adminService.selectBoardsToStageLevel(body);
    }

    // ─── Legacy Handlers (for backward compatibility) ────────────────────────

    // ─── Legacy Handlers (Removed because they relied on outdated logic) ──────
}
