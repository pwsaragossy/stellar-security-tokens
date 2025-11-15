-- Migration: Add unique constraints to prevent duplicate data
-- Prevents duplicate transactions and duplicate payments

-- Prevent duplicate distributions from the same transaction
CREATE UNIQUE INDEX IF NOT EXISTS idx_distributions_tx_hash_unique 
  ON token_distributions(transaction_hash);

-- Prevent duplicate interest payments for same investor/asset/date/transaction
CREATE UNIQUE INDEX IF NOT EXISTS idx_interest_payments_unique 
  ON interest_payments(investor_id, asset_code, payment_date, transaction_hash);

-- Index for usdc_payment_hash uniqueness (if not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_distributions_usdc_hash_unique 
  ON token_distributions(usdc_payment_hash) 
  WHERE usdc_payment_hash IS NOT NULL;

