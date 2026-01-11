-- CreateEnum
CREATE TYPE "KYCStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('pending', 'approved', 'suspended', 'rejected');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('pending_review', 'under_review', 'approved', 'rejected', 'active', 'closed');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('monthly', 'bullet', 'quarterly', 'semi_annual', 'annual');

-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('collateral', 'sale');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PaymentDueStatus" AS ENUM ('current', 'upcoming', 'due', 'overdue', 'defaulted');

-- CreateEnum
CREATE TYPE "InvestmentStatus" AS ENUM ('pending_payment', 'payment_received', 'distributed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "CompanyUserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "PlatformAdminRole" AS ENUM ('admin', 'manager', 'super_admin');

-- CreateEnum
CREATE TYPE "MultiSigTxStatus" AS ENUM ('pending', 'executed', 'rejected', 'failed');

-- CreateTable
CREATE TABLE "investors" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "document" VARCHAR(100) NOT NULL,
    "kyc_status" "KYCStatus" NOT NULL DEFAULT 'pending',
    "password_hash" VARCHAR(255),
    "last_login" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stellar_contract_id" VARCHAR(56) NOT NULL,
    "passkey_credential_id" TEXT NOT NULL,
    "passkey_public_key" BYTEA,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verification_token" VARCHAR(64),
    "email_verification_expiry" TIMESTAMP,

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" SERIAL NOT NULL,
    "asset_code" VARCHAR(12) NOT NULL,
    "issuer_public_key" VARCHAR(56) NOT NULL,
    "total_supply" DECIMAL(20,7) NOT NULL,
    "description" TEXT,
    "annual_interest_rate" DECIMAL(10,7) DEFAULT 10.0,
    "offer_id" INTEGER,
    "issued_by" INTEGER,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_distributions" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "asset_code" VARCHAR(12) NOT NULL,
    "amount" DECIMAL(20,7) NOT NULL,
    "transaction_hash" VARCHAR(64) NOT NULL,
    "usdc_payment_hash" VARCHAR(64),
    "offer_id" INTEGER,
    "memo" VARCHAR(28),
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP,
    "approval_notes" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interest_payments" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "asset_code" VARCHAR(12) NOT NULL,
    "token_balance" DECIMAL(20,7) NOT NULL,
    "interest_rate" DECIMAL(10,7) NOT NULL,
    "interest_amount" DECIMAL(20,7) NOT NULL,
    "usdc_amount" DECIMAL(20,7) NOT NULL,
    "transaction_hash" VARCHAR(64) NOT NULL,
    "payment_date" DATE NOT NULL,
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "email_sent_at" TIMESTAMP,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "offer_id" INTEGER,
    "payment_type" "PaymentType" NOT NULL DEFAULT 'monthly',
    "is_bullet_payment" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interest_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "cnpj" VARCHAR(18) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "legal_representative" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "phone" VARCHAR(20),
    "status" "CompanyStatus" NOT NULL DEFAULT 'pending',
    "kyc_status" "KYCStatus" NOT NULL DEFAULT 'pending',
    "kyc_documents" JSONB NOT NULL DEFAULT '{}',
    "stellar_public_key" VARCHAR(56),
    "stellar_contract_id" VARCHAR(56),
    "passkey_credential_id" TEXT,
    "passkey_public_key" BYTEA,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_users" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "name" VARCHAR(255) NOT NULL,
    "role" "CompanyUserRole" NOT NULL DEFAULT 'user',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "stellar_public_key" VARCHAR(56),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stellar_contract_id" VARCHAR(56),
    "passkey_credential_id" TEXT,
    "passkey_public_key" BYTEA,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verification_token" VARCHAR(64),
    "email_verification_expiry" TIMESTAMP,

    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" "PlatformAdminRole" NOT NULL DEFAULT 'admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "stellar_public_key" VARCHAR(56),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "requested_by" INTEGER NOT NULL,
    "asset_code" VARCHAR(12) NOT NULL,
    "offer_name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "collateral_type" TEXT DEFAULT 'real_estate',
    "collateral_description" TEXT,
    "collateral_value" DECIMAL(20,2),
    "collateral_ltv" DECIMAL(5,2),
    "total_supply" DECIMAL(20,7) NOT NULL,
    "annual_interest_rate" DECIMAL(10,7),
    "offer_type" "OfferType" NOT NULL,
    "offer_rules" JSONB NOT NULL DEFAULT '{}',
    "status" "OfferStatus" NOT NULL DEFAULT 'pending_review',
    "rejection_reason" TEXT,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP,
    "legal_documents" JSONB NOT NULL DEFAULT '{}',
    "due_diligence_notes" TEXT,
    "payment_type" "PaymentType" NOT NULL DEFAULT 'monthly',
    "maturity_date" TIMESTAMP(3),
    "bullet_payment_amount" DECIMAL(20,7),
    "payment_frequency" INTEGER NOT NULL DEFAULT 1,
    "payment_day" INTEGER NOT NULL DEFAULT 1,
    "next_payment_due" TIMESTAMP(3),
    "last_payment_date" TIMESTAMP(3),
    "payment_due_status" "PaymentDueStatus" NOT NULL DEFAULT 'current',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investments" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "offer_id" INTEGER,
    "asset_code" VARCHAR(12) NOT NULL,
    "usdc_amount" DECIMAL(20,7) NOT NULL,
    "token_amount" DECIMAL(20,7) NOT NULL,
    "status" "InvestmentStatus" NOT NULL DEFAULT 'pending_payment',
    "usdc_payment_hash" VARCHAR(64),
    "distribution_tx_hash" VARCHAR(64),
    "memo" VARCHAR(28),
    "error_message" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_webauthn_credentials" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "device_name" VARCHAR(255),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP,

    CONSTRAINT "investor_webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_user_webauthn_credentials" (
    "id" SERIAL NOT NULL,
    "company_user_id" INTEGER NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "device_name" VARCHAR(255),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP,

    CONSTRAINT "company_user_webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admin_webauthn_credentials" (
    "id" SERIAL NOT NULL,
    "platform_admin_id" INTEGER NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "device_name" VARCHAR(255),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP,

    CONSTRAINT "platform_admin_webauthn_credentials_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "multisig_transactions" (
    "id" SERIAL NOT NULL,
    "xdr" TEXT NOT NULL,
    "description" VARCHAR(255),
    "status" "MultiSigTxStatus" NOT NULL DEFAULT 'pending',
    "initiator_id" INTEGER,
    "signatures" JSONB NOT NULL DEFAULT '[]',
    "network" TEXT NOT NULL DEFAULT 'testnet',
    "threshold_met" BOOLEAN NOT NULL DEFAULT false,
    "hash" VARCHAR(64),
    "error_message" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "multisig_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "user_type" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "action_link" VARCHAR(255),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reminders" (
    "id" SERIAL NOT NULL,
    "offer_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "reminder_type" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "amount_due" DECIMAL(20,7) NOT NULL,
    "sent_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_via" TEXT NOT NULL DEFAULT 'email',
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged_at" TIMESTAMP,

    CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_penalties" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "offer_id" INTEGER NOT NULL,
    "penalty_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(20,7),
    "percentage_rate" DECIMAL(5,4),
    "days_late" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "enforced_at" TIMESTAMP,
    "paid_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_penalties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investors_email_key" ON "investors"("email");

-- CreateIndex
CREATE UNIQUE INDEX "investors_document_key" ON "investors"("document");

-- CreateIndex
CREATE INDEX "investors_email_idx" ON "investors"("email");

-- CreateIndex
CREATE INDEX "investors_document_idx" ON "investors"("document");

-- CreateIndex
CREATE INDEX "investors_stellar_contract_id_idx" ON "investors"("stellar_contract_id");

-- CreateIndex
CREATE INDEX "investors_email_verified_idx" ON "investors"("email_verified");

-- CreateIndex
CREATE INDEX "investors_kyc_status_created_at_idx" ON "investors"("kyc_status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_asset_code_key" ON "tokens"("asset_code");

-- CreateIndex
CREATE INDEX "tokens_asset_code_idx" ON "tokens"("asset_code");

-- CreateIndex
CREATE INDEX "tokens_offer_id_idx" ON "tokens"("offer_id");

-- CreateIndex
CREATE INDEX "tokens_issued_by_idx" ON "tokens"("issued_by");

-- CreateIndex
CREATE INDEX "token_distributions_investor_id_idx" ON "token_distributions"("investor_id");

-- CreateIndex
CREATE INDEX "token_distributions_asset_code_idx" ON "token_distributions"("asset_code");

-- CreateIndex
CREATE INDEX "token_distributions_transaction_hash_idx" ON "token_distributions"("transaction_hash");

-- CreateIndex
CREATE INDEX "token_distributions_usdc_payment_hash_idx" ON "token_distributions"("usdc_payment_hash");

-- CreateIndex
CREATE INDEX "token_distributions_offer_id_idx" ON "token_distributions"("offer_id");

-- CreateIndex
CREATE INDEX "token_distributions_investor_id_asset_code_created_at_idx" ON "token_distributions"("investor_id", "asset_code", "created_at" DESC);

-- CreateIndex
CREATE INDEX "token_distributions_approval_status_idx" ON "token_distributions"("approval_status");

-- CreateIndex
CREATE INDEX "token_distributions_approved_by_idx" ON "token_distributions"("approved_by");

-- CreateIndex
CREATE UNIQUE INDEX "token_distributions_transaction_hash_key" ON "token_distributions"("transaction_hash");

-- CreateIndex
CREATE UNIQUE INDEX "token_distributions_investor_id_asset_code_usdc_payment_has_key" ON "token_distributions"("investor_id", "asset_code", "usdc_payment_hash");

-- CreateIndex
CREATE INDEX "interest_payments_investor_id_idx" ON "interest_payments"("investor_id");

-- CreateIndex
CREATE INDEX "interest_payments_asset_code_idx" ON "interest_payments"("asset_code");

-- CreateIndex
CREATE INDEX "interest_payments_payment_date_idx" ON "interest_payments"("payment_date");

-- CreateIndex
CREATE INDEX "interest_payments_status_idx" ON "interest_payments"("status");

-- CreateIndex
CREATE INDEX "interest_payments_offer_id_idx" ON "interest_payments"("offer_id");

-- CreateIndex
CREATE INDEX "interest_payments_investor_id_asset_code_payment_date_idx" ON "interest_payments"("investor_id", "asset_code", "payment_date" DESC);

-- CreateIndex
CREATE INDEX "interest_payments_investor_id_payment_date_idx" ON "interest_payments"("investor_id", "payment_date");

-- CreateIndex
CREATE INDEX "interest_payments_payment_date_asset_code_idx" ON "interest_payments"("payment_date" DESC, "asset_code");

-- CreateIndex
CREATE INDEX "interest_payments_payment_type_idx" ON "interest_payments"("payment_type");

-- CreateIndex
CREATE UNIQUE INDEX "interest_payments_investor_id_asset_code_payment_date_trans_key" ON "interest_payments"("investor_id", "asset_code", "payment_date", "transaction_hash");

-- CreateIndex
CREATE UNIQUE INDEX "companies_cnpj_key" ON "companies"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "companies_email_key" ON "companies"("email");

-- CreateIndex
CREATE INDEX "companies_email_idx" ON "companies"("email");

-- CreateIndex
CREATE INDEX "companies_cnpj_idx" ON "companies"("cnpj");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");

-- CreateIndex
CREATE INDEX "companies_kyc_status_idx" ON "companies"("kyc_status");

-- CreateIndex
CREATE INDEX "companies_stellar_public_key_idx" ON "companies"("stellar_public_key");

-- CreateIndex
CREATE INDEX "companies_stellar_contract_id_idx" ON "companies"("stellar_contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_email_key" ON "company_users"("email");

-- CreateIndex
CREATE INDEX "company_users_email_idx" ON "company_users"("email");

-- CreateIndex
CREATE INDEX "company_users_company_id_idx" ON "company_users"("company_id");

-- CreateIndex
CREATE INDEX "company_users_is_active_idx" ON "company_users"("is_active");

-- CreateIndex
CREATE INDEX "company_users_stellar_public_key_idx" ON "company_users"("stellar_public_key");

-- CreateIndex
CREATE INDEX "company_users_stellar_contract_id_idx" ON "company_users"("stellar_contract_id");

-- CreateIndex
CREATE INDEX "company_users_email_verified_idx" ON "company_users"("email_verified");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE INDEX "platform_admins_email_idx" ON "platform_admins"("email");

-- CreateIndex
CREATE INDEX "platform_admins_role_idx" ON "platform_admins"("role");

-- CreateIndex
CREATE INDEX "platform_admins_is_active_idx" ON "platform_admins"("is_active");

-- CreateIndex
CREATE INDEX "platform_admins_stellar_public_key_idx" ON "platform_admins"("stellar_public_key");

-- CreateIndex
CREATE UNIQUE INDEX "offers_asset_code_key" ON "offers"("asset_code");

-- CreateIndex
CREATE INDEX "offers_company_id_idx" ON "offers"("company_id");

-- CreateIndex
CREATE INDEX "offers_status_idx" ON "offers"("status");

-- CreateIndex
CREATE INDEX "offers_asset_code_idx" ON "offers"("asset_code");

-- CreateIndex
CREATE INDEX "offers_offer_type_idx" ON "offers"("offer_type");

-- CreateIndex
CREATE INDEX "offers_reviewed_by_idx" ON "offers"("reviewed_by");

-- CreateIndex
CREATE INDEX "offers_payment_type_idx" ON "offers"("payment_type");

-- CreateIndex
CREATE INDEX "offers_payment_due_status_idx" ON "offers"("payment_due_status");

-- CreateIndex
CREATE INDEX "offers_next_payment_due_idx" ON "offers"("next_payment_due");

-- CreateIndex
CREATE INDEX "investments_investor_id_idx" ON "investments"("investor_id");

-- CreateIndex
CREATE INDEX "investments_offer_id_idx" ON "investments"("offer_id");

-- CreateIndex
CREATE INDEX "investments_status_idx" ON "investments"("status");

-- CreateIndex
CREATE INDEX "investments_asset_code_idx" ON "investments"("asset_code");

-- CreateIndex
CREATE INDEX "investments_usdc_payment_hash_idx" ON "investments"("usdc_payment_hash");

-- CreateIndex
CREATE INDEX "investments_distribution_tx_hash_idx" ON "investments"("distribution_tx_hash");

-- CreateIndex
CREATE INDEX "investments_created_at_idx" ON "investments"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "investments_investor_id_offer_id_usdc_payment_hash_key" ON "investments"("investor_id", "offer_id", "usdc_payment_hash");

-- CreateIndex
CREATE UNIQUE INDEX "investor_webauthn_credentials_credential_id_key" ON "investor_webauthn_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "investor_webauthn_credentials_investor_id_idx" ON "investor_webauthn_credentials"("investor_id");

-- CreateIndex
CREATE INDEX "investor_webauthn_credentials_credential_id_idx" ON "investor_webauthn_credentials"("credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_webauthn_credentials_investor_id_credential_id_key" ON "investor_webauthn_credentials"("investor_id", "credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_user_webauthn_credentials_credential_id_key" ON "company_user_webauthn_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "company_user_webauthn_credentials_company_user_id_idx" ON "company_user_webauthn_credentials"("company_user_id");

-- CreateIndex
CREATE INDEX "company_user_webauthn_credentials_credential_id_idx" ON "company_user_webauthn_credentials"("credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_user_webauthn_credentials_company_user_id_credentia_key" ON "company_user_webauthn_credentials"("company_user_id", "credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admin_webauthn_credentials_credential_id_key" ON "platform_admin_webauthn_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "platform_admin_webauthn_credentials_platform_admin_id_idx" ON "platform_admin_webauthn_credentials"("platform_admin_id");

-- CreateIndex
CREATE INDEX "platform_admin_webauthn_credentials_credential_id_idx" ON "platform_admin_webauthn_credentials"("credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admin_webauthn_credentials_platform_admin_id_crede_key" ON "platform_admin_webauthn_credentials"("platform_admin_id", "credential_id");

-- CreateIndex
CREATE INDEX "fee_logs_category_idx" ON "fee_logs"("category");

-- CreateIndex
CREATE INDEX "fee_logs_created_at_idx" ON "fee_logs"("created_at");

-- CreateIndex
CREATE INDEX "multisig_transactions_status_idx" ON "multisig_transactions"("status");

-- CreateIndex
CREATE INDEX "multisig_transactions_initiator_id_idx" ON "multisig_transactions"("initiator_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_user_type_idx" ON "notifications"("user_id", "user_type");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at" DESC);

-- CreateIndex
CREATE INDEX "payment_reminders_offer_id_idx" ON "payment_reminders"("offer_id");

-- CreateIndex
CREATE INDEX "payment_reminders_company_id_idx" ON "payment_reminders"("company_id");

-- CreateIndex
CREATE INDEX "payment_reminders_due_date_idx" ON "payment_reminders"("due_date");

-- CreateIndex
CREATE INDEX "payment_reminders_reminder_type_idx" ON "payment_reminders"("reminder_type");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reminders_offer_id_reminder_type_due_date_key" ON "payment_reminders"("offer_id", "reminder_type", "due_date");

-- CreateIndex
CREATE INDEX "company_penalties_company_id_idx" ON "company_penalties"("company_id");

-- CreateIndex
CREATE INDEX "company_penalties_offer_id_idx" ON "company_penalties"("offer_id");

-- CreateIndex
CREATE INDEX "company_penalties_status_idx" ON "company_penalties"("status");

-- CreateIndex
CREATE INDEX "company_penalties_penalty_type_idx" ON "company_penalties"("penalty_type");

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_distributions" ADD CONSTRAINT "token_distributions_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_distributions" ADD CONSTRAINT "token_distributions_asset_code_fkey" FOREIGN KEY ("asset_code") REFERENCES "tokens"("asset_code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_distributions" ADD CONSTRAINT "token_distributions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_distributions" ADD CONSTRAINT "token_distributions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_payments" ADD CONSTRAINT "interest_payments_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_payments" ADD CONSTRAINT "interest_payments_asset_code_fkey" FOREIGN KEY ("asset_code") REFERENCES "tokens"("asset_code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_payments" ADD CONSTRAINT "interest_payments_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_asset_code_fkey" FOREIGN KEY ("asset_code") REFERENCES "tokens"("asset_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_webauthn_credentials" ADD CONSTRAINT "investor_webauthn_credentials_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_webauthn_credentials" ADD CONSTRAINT "company_user_webauthn_credentials_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_admin_webauthn_credentials" ADD CONSTRAINT "platform_admin_webauthn_credentials_platform_admin_id_fkey" FOREIGN KEY ("platform_admin_id") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multisig_transactions" ADD CONSTRAINT "multisig_transactions_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_penalties" ADD CONSTRAINT "company_penalties_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
