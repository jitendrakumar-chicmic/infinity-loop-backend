-- CreateTable
CREATE TABLE "levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "name" TEXT,
    "grid_x" INTEGER NOT NULL,
    "grid_y" INTEGER NOT NULL,
    "grid" JSONB NOT NULL,
    "time_limit" INTEGER NOT NULL DEFAULT 120,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_config" (
    "id" TEXT NOT NULL,
    "active_level_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "updated_by" TEXT,

    CONSTRAINT "game_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "board_id" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "score" INTEGER,
    "current_grid" JSONB NOT NULL,
    "move_count" INTEGER NOT NULL DEFAULT 0,
    "is_cheating" BOOLEAN NOT NULL DEFAULT false,
    "cheating_reason" TEXT,
    "total_score" INTEGER NOT NULL DEFAULT 0,
    "total_moves" INTEGER NOT NULL DEFAULT 0,
    "total_time_sec" INTEGER NOT NULL DEFAULT 0,
    "termination_reason" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_session_boards" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "grid_x" INTEGER NOT NULL,
    "grid_y" INTEGER NOT NULL,
    "time_limit" INTEGER NOT NULL,
    "color" TEXT,
    "original_grid" JSONB NOT NULL,
    "scrambled_grid" JSONB NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "move_count" INTEGER NOT NULL DEFAULT 0,
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "is_solved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "game_session_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_configs" (
    "id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "time_limit" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stage_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_level_configs" (
    "id" TEXT NOT NULL,
    "stage_config_id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "board_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stage_level_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_level_boards" (
    "id" TEXT NOT NULL,
    "stage_level_config_id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_level_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_moves" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_stage_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "boards_completed" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stage_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "levels_is_deleted_idx" ON "levels"("is_deleted");

-- CreateIndex
CREATE INDEX "boards_level_id_is_deleted_idx" ON "boards"("level_id", "is_deleted");

-- CreateIndex
CREATE INDEX "game_sessions_user_id_stage_id_status_idx" ON "game_sessions"("user_id", "stage_id", "status");

-- CreateIndex
CREATE INDEX "game_sessions_user_id_idx" ON "game_sessions"("user_id");

-- CreateIndex
CREATE INDEX "game_sessions_status_idx" ON "game_sessions"("status");

-- CreateIndex
CREATE INDEX "game_sessions_board_id_is_deleted_idx" ON "game_sessions"("board_id", "is_deleted");

-- CreateIndex
CREATE INDEX "stage_configs_is_deleted_idx" ON "stage_configs"("is_deleted");

-- CreateIndex
CREATE INDEX "stage_level_configs_level_id_is_deleted_idx" ON "stage_level_configs"("level_id", "is_deleted");

-- CreateIndex
CREATE INDEX "game_moves_session_id_clicked_at_idx" ON "game_moves"("session_id", "clicked_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_stage_progress_user_id_stage_id_key" ON "user_stage_progress"("user_id", "stage_id");

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_session_boards" ADD CONSTRAINT "game_session_boards_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_session_boards" ADD CONSTRAINT "game_session_boards_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_level_configs" ADD CONSTRAINT "stage_level_configs_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_level_configs" ADD CONSTRAINT "stage_level_configs_stage_config_id_fkey" FOREIGN KEY ("stage_config_id") REFERENCES "stage_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_level_boards" ADD CONSTRAINT "stage_level_boards_stage_level_config_id_fkey" FOREIGN KEY ("stage_level_config_id") REFERENCES "stage_level_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_level_boards" ADD CONSTRAINT "stage_level_boards_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_moves" ADD CONSTRAINT "game_moves_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
