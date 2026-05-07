-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "coin_balance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "location" VARCHAR(100),
ADD COLUMN     "mbti" VARCHAR(4);

-- CreateTable
CREATE TABLE "hobby_masters" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hobby_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_hobbies" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "hobby_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_hobbies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "preferred_genders" "Gender"[],
    "age_min" INTEGER,
    "age_max" INTEGER,
    "preferred_locations" TEXT[],
    "preferred_mbti" TEXT[],
    "preferred_hobby_ids" INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matching_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hobby_masters_name_key" ON "hobby_masters"("name");

-- CreateIndex
CREATE INDEX "hobby_masters_is_active_sort_order_idx" ON "hobby_masters"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "user_hobbies_user_id_idx" ON "user_hobbies"("user_id");

-- CreateIndex
CREATE INDEX "user_hobbies_hobby_id_idx" ON "user_hobbies"("hobby_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_hobbies_user_id_hobby_id_key" ON "user_hobbies"("user_id", "hobby_id");

-- CreateIndex
CREATE UNIQUE INDEX "matching_preferences_user_id_key" ON "matching_preferences"("user_id");

-- CreateIndex
CREATE INDEX "matching_preferences_user_id_idx" ON "matching_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "user_hobbies" ADD CONSTRAINT "user_hobbies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hobbies" ADD CONSTRAINT "user_hobbies_hobby_id_fkey" FOREIGN KEY ("hobby_id") REFERENCES "hobby_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_preferences" ADD CONSTRAINT "matching_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
