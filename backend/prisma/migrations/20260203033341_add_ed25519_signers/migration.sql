-- CreateTable
CREATE TABLE "investor_ed25519_signers" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "public_key" VARCHAR(56) NOT NULL,
    "name" VARCHAR(255) NOT NULL DEFAULT 'Ledger',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP,

    CONSTRAINT "investor_ed25519_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_user_ed25519_signers" (
    "id" SERIAL NOT NULL,
    "company_user_id" INTEGER NOT NULL,
    "public_key" VARCHAR(56) NOT NULL,
    "name" VARCHAR(255) NOT NULL DEFAULT 'Ledger',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP,

    CONSTRAINT "company_user_ed25519_signers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investor_ed25519_signers_public_key_key" ON "investor_ed25519_signers"("public_key");

-- CreateIndex
CREATE INDEX "investor_ed25519_signers_investor_id_idx" ON "investor_ed25519_signers"("investor_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_ed25519_signers_investor_id_public_key_key" ON "investor_ed25519_signers"("investor_id", "public_key");

-- CreateIndex
CREATE UNIQUE INDEX "company_user_ed25519_signers_public_key_key" ON "company_user_ed25519_signers"("public_key");

-- CreateIndex
CREATE INDEX "company_user_ed25519_signers_company_user_id_idx" ON "company_user_ed25519_signers"("company_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_user_ed25519_signers_company_user_id_public_key_key" ON "company_user_ed25519_signers"("company_user_id", "public_key");

-- AddForeignKey
ALTER TABLE "investor_ed25519_signers" ADD CONSTRAINT "investor_ed25519_signers_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_ed25519_signers" ADD CONSTRAINT "company_user_ed25519_signers_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
