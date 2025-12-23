/*
  Warnings:

  - You are about to drop the column `stellar_public_key` on the `investors` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "investors_stellar_public_key_idx";

-- AlterTable
ALTER TABLE "investors" DROP COLUMN "stellar_public_key",
ALTER COLUMN "passkey_public_key" DROP NOT NULL;

-- CreateTable
CREATE TABLE "system_config" (
    "key" VARCHAR(50) NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "fee_logs" (
    "id" SERIAL NOT NULL,
    "amount" DECIMAL(20,7) NOT NULL,
    "asset_code" VARCHAR(12) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "source_id" INTEGER,
    "description" TEXT,
    "transaction_hash" VARCHAR(64),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_logs_category_idx" ON "fee_logs"("category");

-- CreateIndex
CREATE INDEX "fee_logs_created_at_idx" ON "fee_logs"("created_at");
