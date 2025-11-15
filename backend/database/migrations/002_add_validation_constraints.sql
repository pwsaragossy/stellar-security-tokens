-- Migration: Add validation constraints for data integrity
-- Validates email format, Stellar public keys, positive amounts, and transaction hashes

-- Email format validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_email_format'
  ) THEN
    ALTER TABLE investors 
      ADD CONSTRAINT chk_email_format 
      CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  END IF;
END $$;

-- Stellar public key format validation (56 chars, starts with G)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_stellar_public_key_format'
  ) THEN
    ALTER TABLE investors 
      ADD CONSTRAINT chk_stellar_public_key_format 
      CHECK (
        stellar_public_key IS NULL OR 
        (LENGTH(stellar_public_key) = 56 AND stellar_public_key ~ '^G[A-Z0-9]{55}$')
      );
  END IF;
END $$;

-- Validate positive amounts in token_distributions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_distribution_amount_positive'
  ) THEN
    ALTER TABLE token_distributions 
      ADD CONSTRAINT chk_distribution_amount_positive 
      CHECK (amount > 0);
  END IF;
END $$;

-- Validate positive amounts in interest_payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_interest_amounts_positive'
  ) THEN
    ALTER TABLE interest_payments 
      ADD CONSTRAINT chk_interest_amounts_positive 
      CHECK (
        token_balance >= 0 AND 
        interest_rate >= 0 AND 
        interest_amount >= 0 AND 
        usdc_amount >= 0
      );
  END IF;
END $$;

-- Validate transaction hash format (64 hex characters)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_distribution_tx_hash_format'
  ) THEN
    ALTER TABLE token_distributions 
      ADD CONSTRAINT chk_distribution_tx_hash_format 
      CHECK (transaction_hash ~ '^[a-f0-9]{64}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_interest_tx_hash_format'
  ) THEN
    ALTER TABLE interest_payments 
      ADD CONSTRAINT chk_interest_tx_hash_format 
      CHECK (transaction_hash ~ '^[a-f0-9]{64}$');
  END IF;
END $$;

-- Validate usdc_payment_hash format if present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_usdc_payment_hash_format'
  ) THEN
    ALTER TABLE token_distributions 
      ADD CONSTRAINT chk_usdc_payment_hash_format 
      CHECK (usdc_payment_hash IS NULL OR usdc_payment_hash ~ '^[a-f0-9]{64}$');
  END IF;
END $$;

