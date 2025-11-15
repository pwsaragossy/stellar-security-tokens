-- Migration: Add configurable interest rate to tokens table
-- Allows different interest rates per token instead of hardcoded 10%

ALTER TABLE tokens 
  ADD COLUMN IF NOT EXISTS annual_interest_rate NUMERIC(10, 7) DEFAULT 10.0;

-- Add constraint to ensure interest rate is positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_token_interest_rate_positive'
  ) THEN
    ALTER TABLE tokens 
      ADD CONSTRAINT chk_token_interest_rate_positive 
      CHECK (annual_interest_rate >= 0 AND annual_interest_rate <= 100);
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN tokens.annual_interest_rate IS 'Annual interest rate percentage (e.g., 10.0 for 10% per year)';

