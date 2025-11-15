-- Migration: Create schema_migrations table for versioning
-- This table tracks which migrations have been executed

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW(),
  execution_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_migrations_executed_at 
  ON schema_migrations(executed_at DESC);

