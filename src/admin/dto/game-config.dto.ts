import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CreateGameConfigSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    backgroundSoundUrl: z.string().url().optional().or(z.string().length(0)).or(z.literal('')),
    tapSoundUrl: z.string().url().optional().or(z.string().length(0)).or(z.literal('')),
    activeLevelId: z.string().optional(),
});

export class CreateGameConfigDto extends createZodDto(CreateGameConfigSchema) {}

const UpdateGameConfigSchema = CreateGameConfigSchema.partial();

export class UpdateGameConfigDto extends createZodDto(UpdateGameConfigSchema) {}
