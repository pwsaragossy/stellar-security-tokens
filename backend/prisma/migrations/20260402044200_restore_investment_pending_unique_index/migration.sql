-- Restore partial unique index that was accidentally dropped by Prisma in migration 20260309085247.
-- Prisma DSL does not support partial (WHERE) indexes, so this must be maintained as raw SQL.
-- Purpose: Database-level backstop for the race condition guard in submitInvestmentTx.
-- Only one pending/in-flight investment per investor+offer is allowed.

CREATE UNIQUE INDEX IF NOT EXISTS "investments_investor_offer_pending_unique"
ON "investments" ("investor_id", "offer_id")
WHERE status IN ('pending_payment', 'trade_submitted');
