-- AlterTable
ALTER TABLE "interest_payments" ADD COLUMN "gross_amount" DECIMAL(20,7),
ADD COLUMN "net_amount" DECIMAL(20,7),
ADD COLUMN "platform_fee_amount" DECIMAL(20,7);
