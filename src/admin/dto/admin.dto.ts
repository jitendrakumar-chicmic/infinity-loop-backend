import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// ─── Stage DTOs ──────────────────────────────────────────────────────────────

const UpsertStageConfigSchema = z.object({
    stageId: z.string().min(1),
    timeLimit: z.number().int().min(0),
});

export class UpsertStageConfigDto extends createZodDto(UpsertStageConfigSchema) {}

const DeleteStageConfigsSchema = z.object({
    ids: z.array(z.string().min(1)),
});

export class DeleteStageConfigsDto extends createZodDto(DeleteStageConfigsSchema) {}

const ListStageConfigsSchema = z.object({
    stageId: z.string().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export class ListStageConfigsDto extends createZodDto(ListStageConfigsSchema) {}

const CreateStageConfigWithLevelsSchema = z.object({
    stageId: z.string().min(1),
    timeLimit: z.number().int().min(0),
    levels: z
        .array(
            z.object({
                levelId: z.string().min(1),
                boardCount: z.number().int().min(0),
            }),
        )
        .min(1),
});

export class CreateStageConfigWithLevelsDto extends createZodDto(
    CreateStageConfigWithLevelsSchema,
) {}

const ListStageConfigWithLevelsSchema = z.object({
    stageId: z.string().min(1).optional(),
    skip: z.coerce.number().int().min(0).optional().default(0),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export class ListStageConfigWithLevelsDto extends createZodDto(ListStageConfigWithLevelsSchema) {}

// ─── Level DTOs ──────────────────────────────────────────────────────────────

const CreateLevelSchema = z.object({
    name: z.string().min(1),
});

export class CreateLevelDto extends createZodDto(CreateLevelSchema) {}

const UpdateLevelSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
});

export class UpdateLevelDto extends createZodDto(UpdateLevelSchema) {}

const DeleteLevelsSchema = z.object({
    ids: z.array(z.string().min(1)),
});

export class DeleteLevelsDto extends createZodDto(DeleteLevelsSchema) {}

const ListLevelsSchema = z.object({
    name: z.string().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export class ListLevelsDto extends createZodDto(ListLevelsSchema) {}

// ─── Stage-Level Link DTOs ───────────────────────────────────────────────────

const LinkLevelSchema = z.object({
    stageConfigId: z.string().min(1),
    levelId: z.string().min(1),
    boardCount: z.number().int().min(0).optional().default(0),
});

export class LinkLevelDto extends createZodDto(LinkLevelSchema) {}

const UpdateBoardCountSchema = z.object({
    stageLevelConfigId: z.string().min(1),
    boardCount: z.number().int().min(0),
});

export class UpdateBoardCountDto extends createZodDto(UpdateBoardCountSchema) {}

const DeleteStageLevelConfigsSchema = z.object({
    ids: z.array(z.string().min(1)),
});

export class DeleteStageLevelConfigsDto extends createZodDto(DeleteStageLevelConfigsSchema) {}

const ListStageLevelConfigsSchema = z.object({
    stageConfigId: z.string().min(1).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export class ListStageLevelConfigsDto extends createZodDto(ListStageLevelConfigsSchema) {}

// ─── Board DTOs ──────────────────────────────────────────────────────────────

const CreateBoardSchema = z.object({
    levelId: z.string().min(1),
    name: z.string().min(1),

    grid: z.array(z.array(z.number())),
    gridX: z.number().int().min(3).max(20),
    gridY: z.number().int().min(3).max(20),
    timeLimit: z.number().int().min(10).optional().default(120),
    color: z.string().optional(),
});

export class CreateBoardDto extends createZodDto(CreateBoardSchema) {}

const UpdateBoardSchema = z.object({
    id: z.string().min(1),
    levelId: z.string().min(1).optional(),

    name: z.string().min(1).optional(),
    grid: z.array(z.array(z.number())).optional(),
    gridX: z.number().int().min(3).max(20).optional(),
    gridY: z.number().int().min(3).max(20).optional(),
    timeLimit: z.number().int().min(10).optional(),
    color: z.string().optional(),
});

export class UpdateBoardDto extends createZodDto(UpdateBoardSchema) {}

const DeleteBoardsSchema = z.object({
    ids: z.array(z.string().min(1)),
});

export class DeleteBoardsDto extends createZodDto(DeleteBoardsSchema) {}

const ListBoardsSchema = z.object({
    levelId: z.string().min(1).optional(),
    name: z.string().optional(),

    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export class ListBoardsDto extends createZodDto(ListBoardsSchema) {}

const SelectStageBoardsSchema = z.object({
    stageLevelConfigId: z.string().min(1),
    boardIds: z.array(z.string().min(1)),
});

export class SelectStageBoardsDto extends createZodDto(SelectStageBoardsSchema) {}

// ─── Legacy DTOs (Keep for backward compatibility with frontend for now) ──────

const LegacyCreatePuzzleSchema = z.object({
    stage: z.number().int().min(1),
    level: z.union([z.number(), z.string()]),
    grid: z.array(z.array(z.number())),
    rows: z.number().int().min(1),
    cols: z.number().int().min(1),
});

export class CreatePuzzleDto extends createZodDto(LegacyCreatePuzzleSchema) {}

const LegacyCreatePoolSchema = z.object({
    stage: z.number().int().min(1),
    level: z.union([z.number(), z.string()]),
    difficulty: z.string().min(1),
    rows: z.number().int().min(1).optional(),
    cols: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
});

export class CreatePoolDto extends createZodDto(LegacyCreatePoolSchema) {}

// ─── User Progress DTOs ──────────────────────────────────────────────────────

const CreateUserProgressSchema = z.object({
    userId: z.string().min(1),
    stageId: z.string().min(1),
    score: z.number().int().min(0).optional().default(0),
    boardsCompleted: z.number().int().min(0).optional().default(0),
    status: z.number().int().min(0).max(2).optional().default(0), // 0: IN_PROGRESS, 1: COMPLETED, 2: FAILED
});

export class CreateUserProgressDto extends createZodDto(CreateUserProgressSchema) {}

const UpdateUserProgressSchema = z.object({
    score: z.number().int().min(0).optional(),
    boardsCompleted: z.number().int().min(0).optional(),
    status: z.number().int().min(0).max(2).optional(),
    endedAt: z.string().datetime().optional(),
});

export class UpdateUserProgressDto extends createZodDto(UpdateUserProgressSchema) {}

const ListUserProgressSchema = z.object({
    userId: z.string().optional(),
    stageId: z.string().optional(),
    status: z.coerce.number().int().min(0).max(2).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export class ListUserProgressDto extends createZodDto(ListUserProgressSchema) {}

const DeleteUserProgressSchema = z.object({
    ids: z.array(z.string().min(1)),
});

export class DeleteUserProgressDto extends createZodDto(DeleteUserProgressSchema) {}

// ─── Game Move DTOs ──────────────────────────────────────────────────────────

const CreateGameMoveSchema = z.object({
    sessionId: z.string().min(1),
    boardId: z.string().min(1),
    x: z.number().int(),
    y: z.number().int(),
    success: z.boolean(),
});

export class CreateGameMoveDto extends createZodDto(CreateGameMoveSchema) {}

const UpdateGameMoveSchema = z.object({
    success: z.boolean().optional(),
});

export class UpdateGameMoveDto extends createZodDto(UpdateGameMoveSchema) {}

const DeleteGameMovesSchema = z.object({
    ids: z.array(z.string().min(1)),
});

export class DeleteGameMovesDto extends createZodDto(DeleteGameMovesSchema) {}

const ListGameMovesSchema = z.object({
    sessionId: z.string().optional(),
    boardId: z.string().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export class ListGameMovesDto extends createZodDto(ListGameMovesSchema) {}
