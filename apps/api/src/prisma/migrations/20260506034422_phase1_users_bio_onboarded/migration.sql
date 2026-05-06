-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "is_onboarded" BOOLEAN NOT NULL DEFAULT false;
