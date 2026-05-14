import { TOKEN_TYPES, USER_TYPES } from '@common/constants';
import { RequireSession } from '@common/decorators/session.decorator';
import { SessionGuard } from '@common/guards/session.guard';
import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { AdminService } from './admin.service';
import {
    CreateUserProgressDto,
    UpdateUserProgressDto,
    ListUserProgressDto,
    DeleteUserProgressDto,
} from './dto/admin.dto';

@ApiTags('Admin / User Progress')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('admin/user-progress')
export class UserProgressController {
    constructor(private readonly adminService: AdminService) {}

    @ApiOperation({ summary: 'Create or Upsert user stage progress' })
    @Post()
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    async create(@Body() dto: CreateUserProgressDto) {
        return this.adminService.createUserProgress(dto);
    }

    @ApiOperation({ summary: 'List user progress records with filtering' })
    @Get()
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    async findAll(@Query() query: ListUserProgressDto) {
        return this.adminService.listUserProgress(query);
    }

    @ApiOperation({ summary: 'Get a single user progress record by ID' })
    @Get(':id')
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    async findOne(@Param('id') id: string) {
        return this.adminService.getUserProgress(id);
    }

    @ApiOperation({ summary: 'Update a user progress record' })
    @Patch(':id')
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    async update(@Param('id') id: string, @Body() dto: UpdateUserProgressDto) {
        return this.adminService.updateUserProgress(id, dto);
    }

    @ApiOperation({ summary: 'Delete a user progress record' })
    @Delete(':id')
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    async remove(@Param('id') id: string) {
        return this.adminService.removeUserProgress(id);
    }

    @ApiOperation({ summary: 'Bulk delete user progress records' })
    @Post('bulk-delete')
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    async removeMany(@Body() dto: DeleteUserProgressDto) {
        return this.adminService.removeUserProgressMany(dto);
    }
}
