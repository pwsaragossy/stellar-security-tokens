-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('monthly', 'bullet', 'quarterly', 'semi_annual');

-- AlterTable
ALTER TABLE "company_users" ADD COLUMN     "email_verification_expiry" TIMESTAMP,
ADD COLUMN     "email_verification_token" VARCHAR(64),
ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passkey_credential_id" TEXT,
ADD COLUMN     "passkey_public_key" BYTEA,
ADD COLUMN     "stellar_contract_id" VARCHAR(56),
ALTER COLUMN "password_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "interest_payments" ADD COLUMN     "is_bullet_payment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payment_type" "PaymentType" NOT NULL DEFAULT 'monthly';

-- AlterTable
ALTER TABLE "investors" ADD COLUMN     "email_verification_expiry" TIMESTAMP,
ADD COLUMN     "email_verification_token" VARCHAR(64),
ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passkey_credential_id" TEXT,
ADD COLUMN     "passkey_public_key" BYTEA,
ADD COLUMN     "stellar_contract_id" VARCHAR(56);

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "bullet_payment_amount" DECIMAL(20,7),
ADD COLUMN     "maturity_date" TIMESTAMP(3),
ADD COLUMN     "payment_frequency" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "payment_type" "PaymentType" NOT NULL DEFAULT 'monthly';

-- CreateIndex
CREATE INDEX "company_users_stellar_contract_id_idx" ON "company_users"("stellar_contract_id");

-- CreateIndex
CREATE INDEX "company_users_email_verified_idx" ON "company_users"("email_verified");

-- CreateIndex
CREATE INDEX "interest_payments_payment_type_idx" ON "interest_payments"("payment_type");

-- CreateIndex
CREATE INDEX "investors_stellar_contract_id_idx" ON "investors"("stellar_contract_id");

-- CreateIndex
CREATE INDEX "investors_email_verified_idx" ON "investors"("email_verified");

-- CreateIndex
CREATE INDEX "offers_payment_type_idx" ON "offers"("payment_type");
