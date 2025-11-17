-- Migration: Add stellar_public_key to all user types
-- Todos os usuários (investors, company_users, platform_admins, companies) precisam ter wallet Stellar

-- Adicionar stellar_public_key a company_users (primeiro como nullable)
-- Verificar se a tabela existe antes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_users') THEN
ALTER TABLE company_users 
ADD COLUMN IF NOT EXISTS stellar_public_key VARCHAR(56) NULL;
  END IF;
END $$;

-- Criar índice e constraint apenas se a tabela existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_users') THEN
CREATE INDEX IF NOT EXISTS idx_company_users_stellar_key 
ON company_users(stellar_public_key);

ALTER TABLE company_users
DROP CONSTRAINT IF EXISTS chk_company_users_stellar_public_key_format;

ALTER TABLE company_users
ADD CONSTRAINT chk_company_users_stellar_public_key_format 
CHECK (
  stellar_public_key IS NULL OR
  (LENGTH(stellar_public_key) = 56 AND stellar_public_key ~ '^G[A-Z0-9]{55}$')
);
  END IF;
END $$;

-- Tornar NOT NULL após popular (se necessário, fazer em migration separada após popular dados)
-- ALTER TABLE company_users ALTER COLUMN stellar_public_key SET NOT NULL;

-- Adicionar stellar_public_key a platform_admins (primeiro como nullable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_admins') THEN
ALTER TABLE platform_admins 
ADD COLUMN IF NOT EXISTS stellar_public_key VARCHAR(56) NULL;

CREATE INDEX IF NOT EXISTS idx_platform_admins_stellar_key 
ON platform_admins(stellar_public_key);

ALTER TABLE platform_admins
DROP CONSTRAINT IF EXISTS chk_platform_admins_stellar_public_key_format;

ALTER TABLE platform_admins
ADD CONSTRAINT chk_platform_admins_stellar_public_key_format 
CHECK (
  stellar_public_key IS NULL OR
  (LENGTH(stellar_public_key) = 56 AND stellar_public_key ~ '^G[A-Z0-9]{55}$')
);
  END IF;
END $$;

-- Tornar NOT NULL após popular (se necessário, fazer em migration separada após popular dados)
-- ALTER TABLE platform_admins ALTER COLUMN stellar_public_key SET NOT NULL;

-- Adicionar stellar_public_key a companies (primeiro como nullable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'companies') THEN
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS stellar_public_key VARCHAR(56) NULL;

CREATE INDEX IF NOT EXISTS idx_companies_stellar_key 
ON companies(stellar_public_key);

ALTER TABLE companies
DROP CONSTRAINT IF EXISTS chk_companies_stellar_public_key_format;

ALTER TABLE companies
ADD CONSTRAINT chk_companies_stellar_public_key_format 
CHECK (
  stellar_public_key IS NULL OR
  (LENGTH(stellar_public_key) = 56 AND stellar_public_key ~ '^G[A-Z0-9]{55}$')
);
  END IF;
END $$;

-- Tornar NOT NULL após popular (se necessário, fazer em migration separada após popular dados)
-- ALTER TABLE companies ALTER COLUMN stellar_public_key SET NOT NULL;

-- Tornar stellar_public_key obrigatório em investors (se ainda não for)
-- Primeiro verificar se há valores NULL e tratar
DO $$
BEGIN
  -- Se houver investors sem stellar_public_key, precisamos tratar isso
  -- Por enquanto, apenas adicionamos a constraint se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'chk_stellar_public_key_format' 
    AND table_name = 'investors'
  ) THEN
    ALTER TABLE investors
    ADD CONSTRAINT chk_stellar_public_key_format 
    CHECK (
      stellar_public_key IS NULL OR 
      (LENGTH(stellar_public_key) = 56 AND stellar_public_key ~ '^G[A-Z0-9]{55}$')
    );
  END IF;
END $$;

-- Comentários (apenas se as tabelas existirem)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_users') THEN
COMMENT ON COLUMN company_users.stellar_public_key IS 'Chave pública Stellar (wallet) do usuário da empresa - obrigatória';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_admins') THEN
COMMENT ON COLUMN platform_admins.stellar_public_key IS 'Chave pública Stellar (wallet) do administrador - obrigatória';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'companies') THEN
COMMENT ON COLUMN companies.stellar_public_key IS 'Chave pública Stellar (wallet) da empresa - obrigatória';
  END IF;
END $$;

