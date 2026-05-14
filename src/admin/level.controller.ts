import { TOKEN_TYPES, USER_TYPES, STATUS_CODES } from '@common/constants';
import { RequireSession } from '@common/decorators/session.decorator';
import { Transactional } from '@common/decorators/transactional.decorator';
import { SessionGuard } from '@common/guards/session.guard';
import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Query,
    HttpCode,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { AdminService } from './admin.service';
import { CreateLevelDto, UpdateLevelDto, DeleteLevelsDto, ListLevelsDto } from './dto/admin.dto';

@ApiTags('Admin — Levels')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('v1/levels')
export class LevelController {
    constructor(private readonly levelService: AdminService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new difficulty level' })
    @HttpCode(STATUS_CODES.CREATED)
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    create(@Body() dto: CreateLevelDto) {
        return this.levelService.createLevel(dto);
    }

    @Put()
    @ApiOperation({ summary: 'Update an existing difficulty level' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    update(@Body() dto: UpdateLevelDto) {
        return this.levelService.updateLevel(dto);
    }

    @Delete()
    @ApiOperation({ summary: 'Batch delete difficulty levels' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    remove(@Body() dto: DeleteLevelsDto) {
        return this.levelService.removeLevels(dto);
    }

    @Get()
    @ApiOperation({ summary: 'List difficulty levels with pagination' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional({ readOnly: true })
    list(@Query() dto: ListLevelsDto) {
        return this.levelService.listLevels(dto);
    }
}
