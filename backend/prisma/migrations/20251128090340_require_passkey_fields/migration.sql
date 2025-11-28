/*
  Warnings:

  - Made the column `passkey_credential_id` on table `investors` required. This step will fail if there are existing NULL values in that column.
  - Made the column `passkey_public_key` on table `investors` required. This step will fail if there are existing NULL values in that column.
  - Made the column `stellar_contract_id` on table `investors` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "investors" ALTER COLUMN "passkey_credential_id" SET NOT NULL,
ALTER COLUMN "passkey_public_key" SET NOT NULL,
ALTER COLUMN "stellar_contract_id" SET NOT NULL;
