/*
  Warnings:

  - You are about to drop the column `hash` on the `multisig_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `network` on the `multisig_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `signatures` on the `multisig_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `threshold_met` on the `multisig_transactions` table. All the data in the column will be lost.
  - Added the required column `expires_at` to the `multisig_transactions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `network_passphrase` to the `multisig_transactions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('pending', 'received', 'forwarding', 'completed', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "MultiSigOperationType" AS ENUM ('token_issue', 'token_distribute', 'freeze_account', 'clawback', 'treasury_payment', 'trustline_auth', 'account_setup', 'other');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MultiSigTxStatus" ADD VALUE 'partially_signed';
ALTER TYPE "MultiSigTxStatus" ADD VALUE 'ready';
ALTER TYPE "MultiSigTxStatus" ADD VALUE 'submitted';
ALTER TYPE "MultiSigTxStatus" ADD VALUE 'expired';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "cnpj" DROP NOT NULL,
ALTER COLUMN "legal_representative" DROP NOT NULL;

-- AlterTable
ALTER TABLE "multisig_transactions" DROP COLUMN "hash",
DROP COLUMN "network",
DROP COLUMN "signatures",
DROP COLUMN "threshold_met",
ADD COLUMN     "collected_signatures" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "expires_at" TIMESTAMP NOT NULL,
ADD COLUMN     "initiator_type" VARCHAR(50),
ADD COLUMN     "ledger" INTEGER,
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "network_passphrase" VARCHAR(100) NOT NULL,
ADD COLUMN     "operation_type" "MultiSigOperationType" NOT NULL DEFAULT 'other',
ADD COLUMN     "required_signers" TEXT[],
ADD COLUMN     "submitted_at" TIMESTAMP,
ADD COLUMN     "threshold_required" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tx_hash" VARCHAR(64);

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "unit_price" DECIMAL(20,7) NOT NULL DEFAULT 1.0;

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "issuance_transaction_hash" VARCHAR(64),
ADD COLUMN     "sac_contract_id" VARCHAR(56);

-- CreateTable
CREATE TABLE "deposits" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "memo" VARCHAR(28) NOT NULL,
    "expected_amount" DECIMAL(20,7),
    "actual_amount" DECIMAL(20,7),
    "status" "DepositStatus" NOT NULL DEFAULT 'pending',
    "incoming_tx_hash" VARCHAR(64),
    "outgoing_tx_hash" VARCHAR(64),
    "error_message" TEXT,
    "expires_at" TIMESTAMP NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deposits_memo_key" ON "deposits"("memo");

-- CreateIndex
CREATE INDEX "deposits_memo_idx" ON "deposits"("memo");

-- CreateIndex
CREATE INDEX "deposits_investor_id_idx" ON "deposits"("investor_id");

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE INDEX "multisig_transactions_operation_type_idx" ON "multisig_transactions"("operation_type");

-- CreateIndex
CREATE INDEX "multisig_transactions_expires_at_idx" ON "multisig_transactions"("expires_at");

-- CreateIndex
CREATE INDEX "multisig_transactions_tx_hash_idx" ON "multisig_transactions"("tx_hash");

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
