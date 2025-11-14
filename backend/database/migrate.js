import { query } from '../config/database.js';

const migrations = [
  {
    name: 'create_investors_table',
    sql: `
      CREATE TABLE IF NOT EXISTS investors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        document VARCHAR(100) NOT NULL UNIQUE,
        stellar_public_key VARCHAR(56),
        kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_investors_email ON investors(email);
      CREATE INDEX IF NOT EXISTS idx_investors_document ON investors(document);
      CREATE INDEX IF NOT EXISTS idx_investors_stellar_key ON investors(stellar_public_key);
    `,
  },
  {
    name: 'create_tokens_table',
    sql: `
      CREATE TABLE IF NOT EXISTS tokens (
        id SERIAL PRIMARY KEY,
        asset_code VARCHAR(12) NOT NULL UNIQUE,
        issuer_public_key VARCHAR(56) NOT NULL,
        total_supply NUMERIC(20, 7) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_tokens_asset_code ON tokens(asset_code);
    `,
  },
  {
    name: 'create_token_distributions_table',
    sql: `
      CREATE TABLE IF NOT EXISTS token_distributions (
        id SERIAL PRIMARY KEY,
        investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
        asset_code VARCHAR(12) NOT NULL REFERENCES tokens(asset_code) ON DELETE CASCADE,
        amount NUMERIC(20, 7) NOT NULL,
        transaction_hash VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_distributions_investor ON token_distributions(investor_id);
      CREATE INDEX IF NOT EXISTS idx_distributions_asset ON token_distributions(asset_code);
      CREATE INDEX IF NOT EXISTS idx_distributions_tx_hash ON token_distributions(transaction_hash);
    `,
  },
  {
    name: 'create_interest_payments_table',
    sql: `
      CREATE TABLE IF NOT EXISTS interest_payments (
        id SERIAL PRIMARY KEY,
        investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
        asset_code VARCHAR(12) NOT NULL REFERENCES tokens(asset_code) ON DELETE CASCADE,
        token_balance NUMERIC(20, 7) NOT NULL,
        interest_rate NUMERIC(10, 7) NOT NULL,
        interest_amount NUMERIC(20, 7) NOT NULL,
        usdc_amount NUMERIC(20, 7) NOT NULL,
        transaction_hash VARCHAR(64) NOT NULL,
        payment_date DATE NOT NULL,
        email_sent BOOLEAN DEFAULT FALSE,
        email_sent_at TIMESTAMP,
        retry_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_interest_payments_investor ON interest_payments(investor_id);
      CREATE INDEX IF NOT EXISTS idx_interest_payments_asset ON interest_payments(asset_code);
      CREATE INDEX IF NOT EXISTS idx_interest_payments_date ON interest_payments(payment_date);
      CREATE INDEX IF NOT EXISTS idx_interest_payments_status ON interest_payments(status);
    `,
  },
  {
    name: 'add_usdc_payment_hash_to_token_distributions',
    sql: `
      ALTER TABLE token_distributions 
      ADD COLUMN IF NOT EXISTS usdc_payment_hash VARCHAR(64) NULL;
      
      CREATE INDEX IF NOT EXISTS idx_distributions_usdc_hash ON token_distributions(usdc_payment_hash);
    `,
  },
];

const runMigrations = async () => {
  try {
    console.log('Starting database migrations...');

    for (const migration of migrations) {
      console.log(`Running migration: ${migration.name}`);
      await query(migration.sql);
      console.log(`✓ Migration ${migration.name} completed`);
    }

    console.log('All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

runMigrations();

