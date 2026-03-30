/*
  Warnings:

  - You are about to drop the column `platform_fee_bps` on the `offers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "offers" DROP COLUMN "platform_fee_bps";
