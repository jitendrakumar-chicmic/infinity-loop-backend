import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding initial architecture...');

  // 1. Create Stage 1
  const stage1 = await prisma.stageConfig.upsert({
    where: { id: 'stage1-config' },
    update: {},
    create: {
      id: 'stage1-config',
      stageId: '1',
      timeLimit: 300,
    },
  });
  console.log('✅ Stage 1 created');

  // 2. Create Levels
  const easy = await prisma.level.upsert({
    where: { id: 'level-easy' },
    update: {},
    create: {
      id: 'level-easy',
      name: 'Easy',
    },
  });
  console.log('✅ Level "Easy" created');

  // 3. Link Level to Stage
  await prisma.stageLevelConfig.upsert({
    where: { id: 'stage1-easy' },
    update: {},
    create: {
      id: 'stage1-easy',
      stageConfigId: stage1.id,
      levelId: easy.id,
      boardCount: 1,
    },
  });
  console.log('✅ Stage 1 linked to Easy level');

  // 4. Create a Sample Board (3x3 Square Loop)
  const sampleGrid = [
    [6, 10, 12],
    [5, 0, 5],
    [3, 10, 9]
  ];

  await prisma.board.create({
    data: {
      levelId: easy.id,
      name: 'Sample Square Loop',
      gridX: 3,
      gridY: 3,
      grid: sampleGrid,
      timeLimit: 120,
    },
  });
  console.log('✅ Sample Board created');

  console.log('✨ Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
