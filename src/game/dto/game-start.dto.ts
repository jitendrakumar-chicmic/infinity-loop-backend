import { GAME_STAGES } from '@common/constants';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const GameStartSchema = z.object({
    stage: z.coerce
        .number()
        .int()
        .min(GAME_STAGES.MIN)
        .max(GAME_STAGES.MAX)
        .transform((value) => value.toString()),
    level: z.coerce.number().int().min(1).max(10).optional(),
    token: z.string().min(1).optional(),
});

export class GameStartDto extends createZodDto(GameStartSchema) {}
export type GameStartPayload = z.infer<typeof GameStartSchema>;
