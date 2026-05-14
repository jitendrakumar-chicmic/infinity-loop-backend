import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const GeneratePuzzleSchema = z.object({
    rows: z.coerce.number().int().min(3).max(20).default(5),
    cols: z.coerce.number().int().min(3).max(20).default(5),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    limit: z.coerce.number().int().min(1).max(50).optional().default(1),
});

export class GeneratePuzzleDto extends createZodDto(GeneratePuzzleSchema) {}
