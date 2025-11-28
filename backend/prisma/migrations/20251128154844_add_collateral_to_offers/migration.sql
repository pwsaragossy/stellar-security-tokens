-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "collateral_description" TEXT,
ADD COLUMN     "collateral_ltv" DECIMAL(5,2),
ADD COLUMN     "collateral_type" TEXT DEFAULT 'real_estate',
ADD COLUMN     "collateral_value" DECIMAL(20,2);
