-- Auto-create test database if it doesn't exist
-- This runs on first Postgres container startup via docker-entrypoint-initdb.d

SELECT 'CREATE DATABASE stellar_tokens_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'stellar_tokens_test')\gexec
