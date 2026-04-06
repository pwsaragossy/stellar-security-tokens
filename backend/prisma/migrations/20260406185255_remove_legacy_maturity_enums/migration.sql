/*
  Warnings:

  - The values [maturity_clawback] on the enum `MultiSigOperationType` will be removed. If these variants are still used in the database, this will fail.
  - The values [batch_pending] on the enum `MultiSigTxStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MultiSigOperationType_new" AS ENUM ('token_issue', 'token_distribute', 'freeze_account', 'clawback', 'treasury_payment', 'trustline_auth', 'account_setup', 'sac_deploy', 'dividend_distribution', 'disable_clawback', 'sale_deploy', 'sale_create', 'contract_pause', 'contract_resume', 'contract_deposit_auth', 'contract_deposit_transfer', 'contract_price', 'contract_withdraw', 'contract_freeze', 'contract_drain', 'contract_propose_admin', 'contract_accept_admin', 'contract_upgrade', 'other');
ALTER TABLE "public"."multisig_transactions" ALTER COLUMN "operation_type" DROP DEFAULT;
ALTER TABLE "multisig_transactions" ALTER COLUMN "operation_type" TYPE "MultiSigOperationType_new" USING ("operation_type"::text::"MultiSigOperationType_new");
ALTER TYPE "MultiSigOperationType" RENAME TO "MultiSigOperationType_old";
ALTER TYPE "MultiSigOperationType_new" RENAME TO "MultiSigOperationType";
DROP TYPE "public"."MultiSigOperationType_old";
ALTER TABLE "multisig_transactions" ALTER COLUMN "operation_type" SET DEFAULT 'other';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "MultiSigTxStatus_new" AS ENUM ('pending', 'partially_signed', 'ready', 'submitted', 'executed', 'rejected', 'failed', 'expired');
ALTER TABLE "public"."multisig_transactions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "multisig_transactions" ALTER COLUMN "status" TYPE "MultiSigTxStatus_new" USING ("status"::text::"MultiSigTxStatus_new");
ALTER TYPE "MultiSigTxStatus" RENAME TO "MultiSigTxStatus_old";
ALTER TYPE "MultiSigTxStatus_new" RENAME TO "MultiSigTxStatus";
DROP TYPE "public"."MultiSigTxStatus_old";
ALTER TABLE "multisig_transactions" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;
