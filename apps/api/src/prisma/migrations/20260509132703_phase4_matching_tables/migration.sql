-- CreateEnum
CREATE TYPE "MatchingQueueStatus" AS ENUM ('WAITING', 'MATCHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchingSessionStatus" AS ENUM ('COUNTDOWN', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "MatchingEndReason" AS ENUM ('TIMEOUT', 'USER_LEFT', 'MANUAL');

-- CreateTable
CREATE TABLE "matching_queue" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "MatchingQueueStatus" NOT NULL DEFAULT 'WAITING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matching_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_sessions" (
    "id" SERIAL NOT NULL,
    "user1_id" INTEGER NOT NULL,
    "user2_id" INTEGER NOT NULL,
    "livekit_room_name" VARCHAR(255) NOT NULL,
    "status" "MatchingSessionStatus" NOT NULL DEFAULT 'COUNTDOWN',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "end_reason" "MatchingEndReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matching_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_reactions" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "theme_id" INTEGER NOT NULL,
    "choice_id" INTEGER,
    "round_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matching_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "matching_queue_user_id_key" ON "matching_queue"("user_id");

-- CreateIndex
CREATE INDEX "matching_queue_status_created_at_idx" ON "matching_queue"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "matching_sessions_livekit_room_name_key" ON "matching_sessions"("livekit_room_name");

-- CreateIndex
CREATE INDEX "matching_sessions_user1_id_status_idx" ON "matching_sessions"("user1_id", "status");

-- CreateIndex
CREATE INDEX "matching_sessions_user2_id_status_idx" ON "matching_sessions"("user2_id", "status");

-- CreateIndex
CREATE INDEX "matching_reactions_session_id_idx" ON "matching_reactions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "matching_reactions_session_id_user_id_round_number_key" ON "matching_reactions"("session_id", "user_id", "round_number");

-- AddForeignKey
ALTER TABLE "matching_queue" ADD CONSTRAINT "matching_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_sessions" ADD CONSTRAINT "matching_sessions_user1_id_fkey" FOREIGN KEY ("user1_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_sessions" ADD CONSTRAINT "matching_sessions_user2_id_fkey" FOREIGN KEY ("user2_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_reactions" ADD CONSTRAINT "matching_reactions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "matching_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_reactions" ADD CONSTRAINT "matching_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_reactions" ADD CONSTRAINT "matching_reactions_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "talk_themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_reactions" ADD CONSTRAINT "matching_reactions_choice_id_fkey" FOREIGN KEY ("choice_id") REFERENCES "talk_theme_choices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
