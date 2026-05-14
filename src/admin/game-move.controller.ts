import { TOKEN_TYPES, USER_TYPES, STATUS_CODES } from '@common/constants';
import { RequireSession } from '@common/decorators/session.decorator';
import { Transactional } from '@common/decorators/transactional.decorator';
import { SessionGuard } from '@common/guards/session.guard';
import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Query,
    UseGuards,
    HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { AdminService } from './admin.service';
import {
    CreateGameMoveDto,
    UpdateGameMoveDto,
    ListGameMovesDto,
    DeleteGameMovesDto,
} from './dto/admin.dto';

@ApiTags('Admin / Game Moves')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('admin/game-moves')
export class GameMoveController {
    constructor(private readonly adminService: AdminService) {}

    @ApiOperation({ summary: 'Create a new game move' })
    @Post()
    @HttpCode(STATUS_CODES.CREATED)
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    async create(@Body() body: CreateGameMoveDto) {
        return this.adminService.createGameMove(body);
    }

    @ApiOperation({ summary: 'List game moves with pagination and filters' })
    @Get()
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional({ readOnly: true })
    async list(@Query() query: ListGameMovesDto) {
        return this.adminService.listGameMoves(query);
    }

    @ApiOperation({ summary: 'Get a specific game move by id' })
    @Get(':id')
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional({ readOnly: true })
    async get(@Param('id') id: string) {
        return this.adminService.getGameMove(id);
    }

    @ApiOperation({ summary: 'Update a specific game move' })
    @Patch(':id')
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    async update(@Param('id') id: string, @Body() body: UpdateGameMoveDto) {
        return this.adminService.updateGameMove(id, body);
    }

    @ApiOperation({ summary: 'Delete multiple game moves' })
    @Post('delete-many')
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    async removeMany(@Body() body: DeleteGameMovesDto) {
        return this.adminService.removeGameMoves(body);
    }
}
