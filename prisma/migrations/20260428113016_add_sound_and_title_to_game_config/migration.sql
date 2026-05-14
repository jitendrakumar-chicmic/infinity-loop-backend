/*
  Warnings:

  - You are about to drop the column `time_limit_sec` on the `game_sessions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "game_config" ADD COLUMN     "background_sound_url" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "tap_sound_url" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "game_sessions" DROP COLUMN "time_limit_sec";
