-- Prevent race condition: only one pending/trade_submitted investment per investor per offer.
-- This acts as a database-level atomic guard against concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS "investments_investor_offer_pending_unique"
ON "investments" ("investor_id", "offer_id")
WHERE "status" IN ('pending_payment', 'trade_submitted');
