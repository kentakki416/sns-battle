-- CreateEnum
CREATE TYPE "StampCategory" AS ENUM ('GENERAL', 'BATTLE', 'MATCHING');

-- CreateEnum
CREATE TYPE "AnimationType" AS ENUM ('NONE', 'FLOAT', 'BOUNCE', 'EXPLODE', 'SHAKE');

-- CreateEnum
CREATE TYPE "TalkThemeCategory" AS ENUM ('MATCHING', 'BATTLE');

-- CreateEnum
CREATE TYPE "TalkThemeType" AS ENUM ('CHOICE', 'FREE_TALK');

-- CreateTable
CREATE TABLE "follows" (
    "id" SERIAL NOT NULL,
    "follower_id" INTEGER NOT NULL,
    "followee_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" SERIAL NOT NULL,
    "blocker_id" INTEGER NOT NULL,
    "blocked_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stamp_masters" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "image_url" VARCHAR(500),
    "emoji" VARCHAR(10) NOT NULL,
    "category" "StampCategory" NOT NULL,
    "animation_type" "AnimationType" NOT NULL DEFAULT 'FLOAT',
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "price" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stamp_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talk_themes" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "type" "TalkThemeType" NOT NULL,
    "category" "TalkThemeCategory" NOT NULL DEFAULT 'MATCHING',
    "duration" INTEGER NOT NULL DEFAULT 20,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talk_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talk_theme_choices" (
    "id" SERIAL NOT NULL,
    "theme_id" INTEGER NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "emoji" VARCHAR(10) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talk_theme_choices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follows_follower_id_idx" ON "follows"("follower_id");

-- CreateIndex
CREATE INDEX "follows_followee_id_idx" ON "follows"("followee_id");

-- CreateIndex
CREATE UNIQUE INDEX "follows_follower_id_followee_id_key" ON "follows"("follower_id", "followee_id");

-- CreateIndex
CREATE INDEX "blocks_blocker_id_idx" ON "blocks"("blocker_id");

-- CreateIndex
CREATE INDEX "blocks_blocked_id_idx" ON "blocks"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_blocker_id_blocked_id_key" ON "blocks"("blocker_id", "blocked_id");

-- CreateIndex
CREATE INDEX "stamp_masters_category_is_active_sort_order_idx" ON "stamp_masters"("category", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "talk_themes_category_is_active_sort_order_idx" ON "talk_themes"("category", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "talk_theme_choices_theme_id_sort_order_idx" ON "talk_theme_choices"("theme_id", "sort_order");

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_fkey" FOREIGN KEY ("followee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_theme_choices" ADD CONSTRAINT "talk_theme_choices_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "talk_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
