import { TOKEN_TYPES, USER_TYPES } from '@common/constants';
import { RequireSession } from '@common/decorators/session.decorator';
import { Transactional } from '@common/decorators/transactional.decorator';
import { SessionGuard } from '@common/guards/session.guard';
import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Param,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { AdminService } from './admin.service';
import {
    UpsertStageConfigDto,
    DeleteStageConfigsDto,
    ListStageConfigsDto,
    LinkLevelDto,
    DeleteStageLevelConfigsDto,
    ListStageLevelConfigsDto,
    UpdateBoardCountDto,
    CreateStageConfigWithLevelsDto,
    ListStageConfigWithLevelsDto,
} from './dto/admin.dto';

@ApiTags('Admin — Stage Configs')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('v1/stage-configs')
export class StageConfigController {
    constructor(private readonly stageConfigService: AdminService) {}

    @Put()
    @ApiOperation({
        summary: 'Create a stage config and link levels with board counts in one call',
    })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    createWithLevels(@Body() dto: CreateStageConfigWithLevelsDto) {
        return this.stageConfigService.createStageConfigWithLevels(dto);
    }

    @Get('with-levels')
    @ApiOperation({ summary: 'List stage configs with linked levels for a given stageId' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional({ readOnly: true })
    listWithLevels(@Query() dto: ListStageConfigWithLevelsDto) {
        return this.stageConfigService.listStageConfigWithLevels(dto);
    }

    @Post()
    @ApiOperation({ summary: 'Create a new stage configuration' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    create(@Body() dto: UpsertStageConfigDto) {
        return this.stageConfigService.upsertStage(dto);
    }

    @Delete()
    @ApiOperation({ summary: 'Batch delete stage configurations' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    remove(@Body() dto: DeleteStageConfigsDto) {
        return this.stageConfigService.removeStages(dto);
    }

    @Get()
    @ApiOperation({ summary: 'List stage configurations with level details' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional({ readOnly: true })
    list(@Query() dto: ListStageConfigsDto) {
        return this.stageConfigService.listStages(dto);
    }

    @Delete('cache')
    @ApiOperation({
        summary: 'Flush all stage config Redis caches (call after editing boards/levels)',
    })
    async flushAllCaches() {
        await this.stageConfigService.flushAllStageCaches();
        return { message: 'Stage config caches cleared' };
    }

    @Delete('cache/:stageId')
    @ApiOperation({ summary: 'Flush Redis cache for a specific stage' })
    async flushStageCache(@Param('stageId') stageId: string) {
        await this.stageConfigService.invalidateStageCachePublic(stageId);
        return { message: `Stage config cache cleared for stage ${stageId}` };
    }
}

@ApiTags('Admin — Stage Level Configs')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('v1/stage-configs')
export class StageLevelConfigController {
    constructor(private readonly stageConfigService: AdminService) {}

    @Post('link-level')
    @ApiOperation({ summary: 'Link a level to a stage with board count' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    linkLevel(@Body() dto: LinkLevelDto) {
        return this.stageConfigService.linkLevelToStage(dto);
    }

    @Get('link-level')
    @ApiOperation({ summary: 'List level links for stage configurations' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional({ readOnly: true })
    listStageLevels(@Query() dto: ListStageLevelConfigsDto) {
        return this.stageConfigService.listStageLevelConfigs(dto);
    }

    @Delete('link-level')
    @ApiOperation({ summary: 'Remove a level link from a stage' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    removeStageLevel(@Body() dto: DeleteStageLevelConfigsDto) {
        return this.stageConfigService.removeStageLevelConfigs(dto);
    }

    @Patch('link-level/board-count')
    @ApiOperation({ summary: 'Update board count for a stage-level config' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    updateBoardCount(@Body() dto: UpdateBoardCountDto) {
        return this.stageConfigService.updateBoardCount(dto);
    }
}
