-- CreateEnum
CREATE TYPE "RampOrderStatus" AS ENUM ('created', 'funded', 'completed', 'finalized', 'failed', 'refunded', 'canceled', 'expired');

-- CreateEnum
CREATE TYPE "RampOrderType" AS ENUM ('onramp', 'offramp');

-- CreateEnum
CREATE TYPE "RampBankAccountStatus" AS ENUM ('pending', 'awaiting_deposit_verification', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "RampWalletKycStatus" AS ENUM ('not_started', 'proposed', 'approved', 'approved_chain_deploying', 'rejected');

-- AlterTable
ALTER TABLE "investors" ADD COLUMN     "address_line1" VARCHAR(255),
ADD COLUMN     "address_line2" VARCHAR(255),
ADD COLUMN     "city" VARCHAR(120),
ADD COLUMN     "country" VARCHAR(2) DEFAULT 'BR',
ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "family_name" VARCHAR(120),
ADD COLUMN     "given_name" VARCHAR(120),
ADD COLUMN     "occupation" VARCHAR(120),
ADD COLUMN     "phone" VARCHAR(32),
ADD COLUMN     "postal_code" VARCHAR(20),
ADD COLUMN     "region" VARCHAR(120);

-- CreateTable
CREATE TABLE "ramp_customers" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "etherfuse_customer_id" UUID NOT NULL,
    "account_type" VARCHAR(20) NOT NULL DEFAULT 'personal',
    "kyc_status" "RampWalletKycStatus" NOT NULL DEFAULT 'not_started',
    "kyc_rejection_reason" TEXT,
    "last_synced_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ramp_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ramp_wallets" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "etherfuse_wallet_id" UUID NOT NULL,
    "public_key" VARCHAR(64) NOT NULL,
    "blockchain" VARCHAR(20) NOT NULL DEFAULT 'stellar',
    "kyc_status" "RampWalletKycStatus" NOT NULL DEFAULT 'not_started',
    "claimed_ownership" BOOLEAN NOT NULL DEFAULT false,
    "is_authenticated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ramp_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ramp_bank_accounts" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "etherfuse_bank_account_id" UUID NOT NULL,
    "label" VARCHAR(120),
    "pix_key" VARCHAR(255),
    "pix_key_type" VARCHAR(20),
    "abbr_pix_key" VARCHAR(64),
    "status" "RampBankAccountStatus" NOT NULL DEFAULT 'pending',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ramp_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ramp_quotes" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "etherfuse_quote_id" UUID NOT NULL,
    "order_type" "RampOrderType" NOT NULL,
    "blockchain" VARCHAR(20) NOT NULL DEFAULT 'stellar',
    "source_asset" VARCHAR(120) NOT NULL,
    "target_asset" VARCHAR(120) NOT NULL,
    "source_amount" DECIMAL(20,7) NOT NULL,
    "destination_amount" DECIMAL(20,7),
    "fee_bps" INTEGER,
    "fee_amount" DECIMAL(20,7),
    "exchange_rate" VARCHAR(64),
    "wallet_address" VARCHAR(64),
    "expires_at" TIMESTAMP NOT NULL,
    "raw_response" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ramp_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ramp_orders" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "etherfuse_order_id" UUID NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "wallet_id" INTEGER NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "order_type" "RampOrderType" NOT NULL,
    "status" "RampOrderStatus" NOT NULL DEFAULT 'created',
    "amount_in_fiat" DECIMAL(20,7),
    "amount_in_tokens" DECIMAL(20,7),
    "source_asset" VARCHAR(120),
    "target_asset" VARCHAR(120),
    "pix_instructions" JSONB,
    "pix_expires_at" TIMESTAMP,
    "confirmed_tx_signature" VARCHAR(128),
    "stellar_claimable_balance_id" VARCHAR(80),
    "stellar_claim_transaction" TEXT,
    "burn_transaction" TEXT,
    "withdraw_anchor_account" VARCHAR(64),
    "withdraw_memo" VARCHAR(128),
    "withdraw_memo_type" VARCHAR(16),
    "status_page" VARCHAR(512),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "funded_at" TIMESTAMP,
    "completed_at" TIMESTAMP,

    CONSTRAINT "ramp_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ramp_webhook_events" (
    "id" SERIAL NOT NULL,
    "event_type" VARCHAR(40) NOT NULL,
    "resource_id" VARCHAR(64) NOT NULL,
    "resource_status" VARCHAR(40) NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "processed_at" TIMESTAMP,
    "processing_error" TEXT,
    "received_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ramp_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ramp_customers_investor_id_key" ON "ramp_customers"("investor_id");

-- CreateIndex
CREATE UNIQUE INDEX "ramp_customers_etherfuse_customer_id_key" ON "ramp_customers"("etherfuse_customer_id");

-- CreateIndex
CREATE INDEX "ramp_customers_etherfuse_customer_id_idx" ON "ramp_customers"("etherfuse_customer_id");

-- CreateIndex
CREATE INDEX "ramp_customers_kyc_status_idx" ON "ramp_customers"("kyc_status");

-- CreateIndex
CREATE UNIQUE INDEX "ramp_wallets_etherfuse_wallet_id_key" ON "ramp_wallets"("etherfuse_wallet_id");

-- CreateIndex
CREATE INDEX "ramp_wallets_public_key_idx" ON "ramp_wallets"("public_key");

-- CreateIndex
CREATE INDEX "ramp_wallets_kyc_status_idx" ON "ramp_wallets"("kyc_status");

-- CreateIndex
CREATE UNIQUE INDEX "ramp_wallets_investor_id_public_key_key" ON "ramp_wallets"("investor_id", "public_key");

-- CreateIndex
CREATE UNIQUE INDEX "ramp_bank_accounts_etherfuse_bank_account_id_key" ON "ramp_bank_accounts"("etherfuse_bank_account_id");

-- CreateIndex
CREATE INDEX "ramp_bank_accounts_investor_id_deleted_at_idx" ON "ramp_bank_accounts"("investor_id", "deleted_at");

-- CreateIndex
CREATE INDEX "ramp_bank_accounts_status_idx" ON "ramp_bank_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ramp_quotes_etherfuse_quote_id_key" ON "ramp_quotes"("etherfuse_quote_id");

-- CreateIndex
CREATE INDEX "ramp_quotes_investor_id_created_at_idx" ON "ramp_quotes"("investor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ramp_quotes_expires_at_idx" ON "ramp_quotes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ramp_orders_etherfuse_order_id_key" ON "ramp_orders"("etherfuse_order_id");

-- CreateIndex
CREATE INDEX "ramp_orders_investor_id_created_at_idx" ON "ramp_orders"("investor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ramp_orders_status_idx" ON "ramp_orders"("status");

-- CreateIndex
CREATE INDEX "ramp_orders_order_type_status_idx" ON "ramp_orders"("order_type", "status");

-- CreateIndex
CREATE INDEX "ramp_orders_pix_expires_at_idx" ON "ramp_orders"("pix_expires_at");

-- CreateIndex
CREATE INDEX "ramp_webhook_events_resource_id_idx" ON "ramp_webhook_events"("resource_id");

-- CreateIndex
CREATE INDEX "ramp_webhook_events_received_at_idx" ON "ramp_webhook_events"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "ramp_webhook_events_event_type_resource_id_resource_status_key" ON "ramp_webhook_events"("event_type", "resource_id", "resource_status");

-- AddForeignKey
ALTER TABLE "ramp_customers" ADD CONSTRAINT "ramp_customers_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ramp_wallets" ADD CONSTRAINT "ramp_wallets_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ramp_bank_accounts" ADD CONSTRAINT "ramp_bank_accounts_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ramp_quotes" ADD CONSTRAINT "ramp_quotes_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ramp_orders" ADD CONSTRAINT "ramp_orders_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ramp_orders" ADD CONSTRAINT "ramp_orders_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "ramp_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ramp_orders" ADD CONSTRAINT "ramp_orders_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "ramp_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ramp_orders" ADD CONSTRAINT "ramp_orders_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "ramp_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
