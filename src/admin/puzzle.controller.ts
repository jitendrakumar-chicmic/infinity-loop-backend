import { TOKEN_TYPES, USER_TYPES } from '@common/constants';
import { RequireSession } from '@common/decorators/session.decorator';
import { SessionGuard } from '@common/guards/session.guard';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { GeneratePuzzleDto } from './dto/puzzle-generate.dto';
import { PuzzleService } from './puzzle.service';

@ApiTags('Admin — Puzzle Generator')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('v1/puzzles')
export class PuzzleController {
    constructor(private readonly puzzleService: PuzzleService) {}

    @Get('generate')
    @ApiOperation({ summary: 'Generate solvable puzzle preview (solved + scrambled)' })
    @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.ADMIN] })
    generate(@Query() dto: GeneratePuzzleDto): ReturnType<PuzzleService['generatePreview']> {
        return this.puzzleService.generatePreview(dto);
    }
}
