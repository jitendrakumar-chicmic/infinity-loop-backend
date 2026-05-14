import { PrismaClient } from "../generated/prisma/client";
import * as PuzzleEngine from "../src/game/engine/puzzle.engine";
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = "postgresql://chicmic@localhost:5432/infinity_loop_game";

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("🚀 Starting Bulk Board Generation...");

  // 1. Get all StageLevelConfig entries
  const configEntries = await prisma.stageLevelConfig.findMany({
    include: {
      stageConfig: true,
      level: true
    },
    where: { deletedAt: null }
  });

  console.log(`Found ${configEntries.length} level configurations.`);

  for (const entry of configEntries) {
    const stageId = entry.stageConfig.stageId;
    const levelName = entry.level.name;
    console.log(`--- Stage ${stageId} | Level ${levelName} ---`);
    
    // Target 20 puzzles per level
    const targetBoardCount = 20;
    const currentCount = await prisma.board.count({
        where: { levelId: entry.levelId, deletedAt: null }
    });

    if (currentCount >= targetBoardCount) {
        console.log(`Already has ${currentCount} boards. Skipping.`);
        continue;
    }

    const needed = targetBoardCount - currentCount;
    console.log(`Generating ${needed} new boards...`);

    for (let i = 0; i < needed; i++) {
        // Grid sizes based on level name if not specified
        const gridSize = PuzzleEngine.getGridSizeForLevel(1); // Default
        let rows = 5, cols = 5;
        
        if (levelName.toLowerCase() === 'easy') { rows = 3; cols = 3; }
        if (levelName.toLowerCase() === 'medium') { rows = 5; cols = 5; }
        if (levelName.toLowerCase() === 'hard') { rows = 7; cols = 7; }

        const difficulty = levelName.toLowerCase();
        const seed = `board-${entry.id}-idx-${i}-${Date.now()}`;

        const puzzle = PuzzleEngine.createPuzzle({
            rows,
            cols,
            level: 1, // Logic handled by difficulty string in engine
            difficulty,
            seed
        });

        await prisma.board.create({
            data: {
                levelId: entry.levelId,
                name: `Auto Board ${i} for ${levelName}`,
                gridX: cols,
                gridY: rows,
                grid: puzzle.solvedGrid,
                timeLimit: 120
            }
        });
    }
  }

  console.log("✅ Bulk generation complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
