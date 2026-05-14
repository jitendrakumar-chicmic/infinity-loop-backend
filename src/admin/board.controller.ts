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
    Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { AdminService } from './admin.service';
import { CreateBoardDto, UpdateBoardDto, DeleteBoardsDto, ListBoardsDto } from './dto/admin.dto';

@ApiTags('Admin — Boards')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('v1/boards')
export class BoardController {
    constructor(private readonly boardService: AdminService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new puzzle board' })
    @HttpCode(STATUS_CODES.CREATED)
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    create(@Body() dto: CreateBoardDto) {
        return this.boardService.addBoard(dto);
    }

    @Put()
    @ApiOperation({ summary: 'Update an existing puzzle board' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    update(@Body() dto: UpdateBoardDto) {
        return this.boardService.updateBoard(dto);
    }

    @Delete('clear-all')
    @ApiOperation({ summary: 'Clear ALL puzzle boards' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    clearAll() {
        return this.boardService.clearAllBoards();
    }

    @Delete()
    @ApiOperation({ summary: 'Batch delete puzzle boards' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    remove(@Body() dto: DeleteBoardsDto) {
        return this.boardService.removeBoards(dto);
    }

    @Get()
    @ApiOperation({ summary: 'List puzzle boards with pagination' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional({ readOnly: true })
    list(@Query() dto: ListBoardsDto) {
        return this.boardService.listBoards(dto);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single puzzle board' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional({ readOnly: true })
    get(@Param('id') id: string) {
        return this.boardService.getBoard(id);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a single puzzle board' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    @Transactional()
    removeOne(@Param('id') id: string) {
        return this.boardService.removeBoard(id);
    }
}
