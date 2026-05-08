/*
  Warnings:

  - You are about to drop the `stamp_masters` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('STAMP', 'EFFECT', 'BOOST', 'DECORATION', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('MATCHING', 'BATTLE', 'STREAMING', 'PROFILE');

-- CreateEnum
CREATE TYPE "EffectType" AS ENUM ('CONFETTI', 'FIREWORKS', 'HEARTS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BoostType" AS ENUM ('MATCH_PRIORITY', 'EXTEND_TIME', 'SKIP_QUEUE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PURCHASE', 'SPEND', 'BONUS', 'REFUND');

-- DropTable
DROP TABLE "stamp_masters";

-- DropEnum
DROP TYPE "StampCategory";

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "type" "ItemType" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_scopes" (
    "item_id" INTEGER NOT NULL,
    "scope" "Scope" NOT NULL,

    CONSTRAINT "item_scopes_pkey" PRIMARY KEY ("item_id","scope")
);

-- CreateTable
CREATE TABLE "stamp_details" (
    "item_id" INTEGER NOT NULL,
    "emoji" VARCHAR(10) NOT NULL,
    "image_url" VARCHAR(500),
    "animation_type" "AnimationType" NOT NULL DEFAULT 'FLOAT',

    CONSTRAINT "stamp_details_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "effect_details" (
    "item_id" INTEGER NOT NULL,
    "effect_type" "EffectType" NOT NULL,
    "preview_url" VARCHAR(500),
    "duration_ms" INTEGER NOT NULL DEFAULT 3000,

    CONSTRAINT "effect_details_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "boost_details" (
    "item_id" INTEGER NOT NULL,
    "boost_type" "BoostType" NOT NULL,
    "duration_seconds" INTEGER,

    CONSTRAINT "boost_details_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "user_inventory" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "user_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_transactions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "TransactionType" NOT NULL,
    "related_item_id" INTEGER,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "items_type_is_active_sort_order_idx" ON "items"("type", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "item_scopes_scope_item_id_idx" ON "item_scopes"("scope", "item_id");

-- CreateIndex
CREATE INDEX "user_inventory_user_id_idx" ON "user_inventory"("user_id");

-- CreateIndex
CREATE INDEX "user_inventory_expires_at_idx" ON "user_inventory"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_inventory_user_id_item_id_key" ON "user_inventory"("user_id", "item_id");

-- CreateIndex
CREATE INDEX "coin_transactions_user_id_created_at_idx" ON "coin_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "coin_transactions_related_item_id_idx" ON "coin_transactions"("related_item_id");

-- AddForeignKey
ALTER TABLE "item_scopes" ADD CONSTRAINT "item_scopes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamp_details" ADD CONSTRAINT "stamp_details_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "effect_details" ADD CONSTRAINT "effect_details_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boost_details" ADD CONSTRAINT "boost_details_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_related_item_id_fkey" FOREIGN KEY ("related_item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
