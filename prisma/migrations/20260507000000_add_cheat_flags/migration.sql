-- CreateTable
CREATE TABLE "cheat_flags" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "session_board_id" TEXT,
    "flag_type" INTEGER NOT NULL,
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cheat_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cheat_flags_user_id_idx" ON "cheat_flags"("user_id");

-- CreateIndex
CREATE INDEX "cheat_flags_session_id_idx" ON "cheat_flags"("session_id");
