-- AlterTable
ALTER TABLE "offers" ADD COLUMN "is_token_locked" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "token_unlocked_at" TIMESTAMP(3);
