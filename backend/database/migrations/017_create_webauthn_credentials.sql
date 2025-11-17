-- Migration: Create WebAuthn credentials tables
-- Tabelas para armazenar credenciais WebAuthn (passkeys) para todos os tipos de usuários

-- Credenciais WebAuthn para Investors
CREATE TABLE IF NOT EXISTS investor_webauthn_credentials (
  id SERIAL PRIMARY KEY,
  investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  UNIQUE(investor_id, credential_id)
);

CREATE INDEX IF NOT EXISTS idx_investor_webauthn_investor_id ON investor_webauthn_credentials(investor_id);
CREATE INDEX IF NOT EXISTS idx_investor_webauthn_credential_id ON investor_webauthn_credentials(credential_id);

-- Credenciais WebAuthn para Company Users
CREATE TABLE IF NOT EXISTS company_user_webauthn_credentials (
  id SERIAL PRIMARY KEY,
  company_user_id INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  UNIQUE(company_user_id, credential_id)
);

CREATE INDEX IF NOT EXISTS idx_company_user_webauthn_user_id ON company_user_webauthn_credentials(company_user_id);
CREATE INDEX IF NOT EXISTS idx_company_user_webauthn_credential_id ON company_user_webauthn_credentials(credential_id);

-- Credenciais WebAuthn para Platform Admins
CREATE TABLE IF NOT EXISTS platform_admin_webauthn_credentials (
  id SERIAL PRIMARY KEY,
  platform_admin_id INTEGER NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  UNIQUE(platform_admin_id, credential_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_webauthn_admin_id ON platform_admin_webauthn_credentials(platform_admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_webauthn_credential_id ON platform_admin_webauthn_credentials(credential_id);

COMMENT ON TABLE investor_webauthn_credentials IS 'Credenciais WebAuthn (passkeys) para investidores';
COMMENT ON TABLE company_user_webauthn_credentials IS 'Credenciais WebAuthn (passkeys) para usuários de empresas';
COMMENT ON TABLE platform_admin_webauthn_credentials IS 'Credenciais WebAuthn (passkeys) para administradores da plataforma';

