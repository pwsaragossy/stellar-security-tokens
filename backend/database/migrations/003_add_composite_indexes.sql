-- Migration: Add composite indexes for frequently used queries
-- Optimizes queries that filter by multiple columns

-- Index for approved investors ordered by creation date (common query)
CREATE INDEX IF NOT EXISTS idx_investors_kyc_created 
  ON investors(kyc_status, created_at DESC) 
  WHERE kyc_status = 'approved';

-- Composite index for interest payments by investor, asset, and date
CREATE INDEX IF NOT EXISTS idx_interest_payments_investor_asset_date 
  ON interest_payments(investor_id, asset_code, payment_date DESC);

-- Composite index for distributions by investor, asset, and creation date
CREATE INDEX IF NOT EXISTS idx_distributions_investor_asset_created 
  ON token_distributions(investor_id, asset_code, created_at DESC);

-- Partial index for pending payments (most frequently queried status)
CREATE INDEX IF NOT EXISTS idx_interest_payments_pending 
  ON interest_payments(investor_id, payment_date) 
  WHERE status = 'pending';

-- Index for completed payments (for reporting)
CREATE INDEX IF NOT EXISTS idx_interest_payments_completed_date 
  ON interest_payments(payment_date DESC, asset_code) 
  WHERE status = 'completed';

