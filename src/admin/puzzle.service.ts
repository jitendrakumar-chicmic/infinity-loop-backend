import { Injectable } from '@nestjs/common';

import * as PuzzleEngine from '../game/engine/puzzle.engine';

import { GeneratePuzzleDto } from './dto/puzzle-generate.dto';

interface PuzzlePreviewResult {
    seed: string;
    difficulty: GeneratePuzzleDto['difficulty'];
    rows: number;
    cols: number;
    solvedGrid: number[][];
    scrambledGrid: number[][];
    solvedValidation: ReturnType<typeof PuzzleEngine.validateSolution>;
}

@Injectable()
export class PuzzleService {
    generatePreview(dto: GeneratePuzzleDto): PuzzlePreviewResult[] {
        const { rows, cols, difficulty, limit } = dto;

        // Map difficulty to engine "level" for fill ratio
        let level = 5;
        if (difficulty === 'easy') {
            level = 2;
        }
        if (difficulty === 'hard') {
            level = 10;
        }

        const results: PuzzlePreviewResult[] = [];

        for (let i = 0; i < (limit || 1); i++) {
            const seed = `preview-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`;

            // 1. Generate Solved Shape ("fullyshape not breaked")
            const solved = PuzzleEngine.generateSolvedPuzzle(rows, cols, seed, level);

            // 2. Generate Scrambled Shape ("breaked for same shape")
            const scrambled = PuzzleEngine.scramblePuzzle(solved.grid, seed);

            const solvedValidation = PuzzleEngine.validateSolution(solved.grid);

            results.push({
                seed,
                difficulty,
                rows,
                cols,
                solvedGrid: solved.grid,
                scrambledGrid: scrambled.scrambledGrid,
                solvedValidation,
            });
        }

        return results;
    }
}
