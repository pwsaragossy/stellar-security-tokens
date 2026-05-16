-- CreateTable
CREATE TABLE "investor_relayer_wallets" (
    "id" SERIAL NOT NULL,
    "investor_id" INTEGER NOT NULL,
    "public_key" VARCHAR(56) NOT NULL,
    "encrypted_seed" TEXT NOT NULL,
    "encryption_version" INTEGER NOT NULL DEFAULT 1,
    "trustlines_established" BOOLEAN NOT NULL DEFAULT false,
    "provisioning_tx_hash" VARCHAR(64),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_relayer_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investor_relayer_wallets_investor_id_key" ON "investor_relayer_wallets"("investor_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_relayer_wallets_public_key_key" ON "investor_relayer_wallets"("public_key");

-- CreateIndex
CREATE INDEX "investor_relayer_wallets_public_key_idx" ON "investor_relayer_wallets"("public_key");

-- AddForeignKey
ALTER TABLE "investor_relayer_wallets" ADD CONSTRAINT "investor_relayer_wallets_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
