import { query } from '../config/database.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Legacy inline migrations (for backward compatibility)
const legacyMigrations = [
  {
    version: '001',
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
    version: '002',
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
    version: '003',
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
    version: '004',
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
    version: '005',
    name: 'add_usdc_payment_hash_to_token_distributions',
    sql: `
      ALTER TABLE token_distributions 
      ADD COLUMN IF NOT EXISTS usdc_payment_hash VARCHAR(64) NULL;
      
      CREATE INDEX IF NOT EXISTS idx_distributions_usdc_hash ON token_distributions(usdc_payment_hash);
    `,
  },
];

/**
 * Initialize schema_migrations table if it doesn't exist
 */
const initSchemaMigrations = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW(),
        execution_time_ms INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_migrations_executed_at 
        ON schema_migrations(executed_at DESC);
    `);
  } catch (error) {
    // Table might already exist, ignore error
    if (!error.message.includes('already exists')) {
      throw error;
    }
  }
};

/**
 * Get list of executed migrations
 */
const getExecutedMigrations = async () => {
  try {
    const result = await query('SELECT version FROM schema_migrations ORDER BY version');
    return new Set(result.rows.map(row => row.version));
  } catch (error) {
    // Table doesn't exist yet, return empty set
    return new Set();
  }
};

/**
 * Record migration execution
 */
const recordMigration = async (version, name, executionTime) => {
  await query(
    'INSERT INTO schema_migrations (version, name, executed_at, execution_time_ms) VALUES ($1, $2, NOW(), $3)',
    [version, name, executionTime]
  );
};

/**
 * Load SQL migrations from files
 */
const loadSqlMigrations = async () => {
  const migrationsDir = join(__dirname, 'migrations');
  const files = await readdir(migrationsDir);
  const sqlFiles = files
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort alphabetically to maintain order

  const migrations = [];
  for (const file of sqlFiles) {
    const version = file.split('_')[0]; // Extract version from filename (e.g., "001" from "001_create_...")
    const name = file.replace('.sql', '').replace(/^\d+_/, ''); // Remove version prefix and extension
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    
    migrations.push({ version, name, sql });
  }

  return migrations;
};

/**
 * Run a single migration
 */
const runMigration = async (migration) => {
  const startTime = Date.now();
  console.log(`Running migration: ${migration.version} - ${migration.name}`);
  
  try {
    await query(migration.sql);
    const executionTime = Date.now() - startTime;
    await recordMigration(migration.version, migration.name, executionTime);
    console.log(`✓ Migration ${migration.version} - ${migration.name} completed (${executionTime}ms)`);
    return true;
  } catch (error) {
    console.error(`✗ Migration ${migration.version} - ${migration.name} failed:`, error.message);
    throw error;
  }
};

/**
 * Main migration runner
 */
const runMigrations = async () => {
  try {
    console.log('Starting database migrations...\n');

    // Initialize schema_migrations table
    await initSchemaMigrations();

    // Get executed migrations
    const executedMigrations = await getExecutedMigrations();

    // Load all migrations (legacy + SQL files)
    const allMigrations = [...legacyMigrations];
    
    try {
      const sqlMigrations = await loadSqlMigrations();
      allMigrations.push(...sqlMigrations);
    } catch (error) {
      // Migrations directory might not exist, continue with legacy only
      if (error.code !== 'ENOENT') {
        throw error;
      }
      console.warn('⚠️  Migrations directory not found, using legacy migrations only');
    }

    // Sort migrations by version
    allMigrations.sort((a, b) => a.version.localeCompare(b.version));

    // Filter out already executed migrations
    const pendingMigrations = allMigrations.filter(
      migration => !executedMigrations.has(migration.version)
    );

    if (pendingMigrations.length === 0) {
      console.log('✓ All migrations are up to date!');
      process.exit(0);
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s)\n`);

    // Run pending migrations
    for (const migration of pendingMigrations) {
      await runMigration(migration);
    }

    console.log('\n✓ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration error:', error);
    process.exit(1);
  }
};

runMigrations();

