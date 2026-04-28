-- CreateEnum
CREATE TYPE "AssetStage" AS ENUM ('under_development', 'completed', 'income_producing');

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "asset_stage" "AssetStage";
