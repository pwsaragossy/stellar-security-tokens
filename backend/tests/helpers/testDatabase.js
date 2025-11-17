/**
 * Setup e teardown do banco de dados de teste para integration tests
 */

import { query } from '../../config/database.js';

/**
 * Limpa todas as tabelas do banco de testes
 */
export const cleanDatabase = async () => {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
  
  try {
    if (isTestEnv) {
      console.log('[testDatabase] Starting database cleanup...');
    }
    
    // Desabilitar temporariamente as constraints para limpeza completa
    await query('SET session_replication_role = replica');
    
    // Limpar todas as tabelas usando TRUNCATE (mais eficiente e limpa sequences também)
    // Ordem: primeiro tabelas que referenciam outras
    const tablesToClean = [
      'interest_payments',
      'token_distributions',
      'investments',
      'offers',
      'company_user_webauthn_credentials',
      'platform_admin_webauthn_credentials',
      'investor_webauthn_credentials',
      'company_users',
      'platform_admins',
      'companies',
      'tokens',
      'investors'
    ];
    
    // Abordagem mais robusta: primeiro DELETE, depois TRUNCATE, depois resetar sequences
    // Isso garante que mesmo se TRUNCATE falhar, os dados serão limpos
    
    // Passo 1: DELETE de todas as tabelas (mais seguro, funciona mesmo com foreign keys se session_replication_role = replica)
    // Ordem específica para garantir que dependências são removidas primeiro
    if (isTestEnv) {
      console.log('[testDatabase] Step 1: Deleting all data from tables...');
    }
    
    // Delete in dependency order to avoid foreign key violations
    const deleteOrder = [
      'interest_payments',
      'token_distributions',
      'investments',  // References tokens, must be deleted first
      'offers',       // May reference tokens
      'company_user_webauthn_credentials',
      'platform_admin_webauthn_credentials',
      'investor_webauthn_credentials',
      'company_users',
      'platform_admins',
      'companies',
      'tokens',       // Delete after dependencies
      'investors'
    ];
    
    for (const table of deleteOrder) {
      try {
        const result = await query(`DELETE FROM ${table}`);
        if (isTestEnv && result.rowCount > 0) {
          console.log(`[testDatabase] Deleted ${result.rowCount} rows from ${table}`);
        }
      } catch (deleteError) {
        if (!deleteError.message?.includes('does not exist')) {
          if (isTestEnv) {
            console.warn(`[testDatabase] Warning deleting from ${table}:`, deleteError.message);
          }
        }
      }
    }
    
    // Extra cleanup: explicitly delete tokens by asset_code to ensure they're gone
    try {
      await query(`DELETE FROM tokens WHERE asset_code = 'SIN01'`);
    } catch (e) {
      // Ignore if table doesn't exist or already deleted
    }
    
    // Passo 2: TRUNCATE para resetar sequences (mais eficiente)
    if (isTestEnv) {
      console.log('[testDatabase] Step 2: TRUNCATE to reset sequences...');
    }
    try {
      const tablesList = tablesToClean.join(', ');
      await query(`TRUNCATE TABLE ${tablesList} RESTART IDENTITY CASCADE`);
      if (isTestEnv) {
        console.log('[testDatabase] TRUNCATE on all tables succeeded');
      }
    } catch (e) {
      if (isTestEnv) {
        console.log('[testDatabase] TRUNCATE on all tables failed, trying one by one:', e.message);
      }
      // Se TRUNCATE falhar, tentar uma por uma
      for (const table of tablesToClean) {
        try {
          await query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
        } catch (truncateError) {
          if (isTestEnv) {
            console.warn(`[testDatabase] TRUNCATE failed for ${table}:`, truncateError.message);
          }
          // Não falhar - DELETE já limpou os dados
        }
      }
    }
    
    // Reabilitar constraints
    await query('SET session_replication_role = DEFAULT');
    
    // Passo 3: Resetar todas as sequences explicitamente para garantir que estão resetadas
    // Isso é crítico mesmo após TRUNCATE RESTART IDENTITY, pois pode haver problemas de timing
    if (isTestEnv) {
      console.log('[testDatabase] Step 3: Explicitly resetting all sequences...');
    }
    const sequencesResult = await query(`
      SELECT sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
      ORDER BY sequence_name
    `);
    
    for (const row of sequencesResult.rows) {
      try {
        // Usar RESTART WITH 1 explicitamente
        await query(`ALTER SEQUENCE ${row.sequence_name} RESTART WITH 1`);
        if (isTestEnv) {
          // Verificar se realmente resetou
          const checkResult = await query(`SELECT last_value FROM ${row.sequence_name}`);
          console.log(`[testDatabase] Reset sequence ${row.sequence_name} to ${checkResult.rows[0].last_value}`);
        }
      } catch (e) {
        if (isTestEnv) {
          console.warn(`[testDatabase] Failed to reset sequence ${row.sequence_name}:`, e.message);
        }
        // Não falhar - tentar continuar
      }
    }
    
    // Passo 4: Verificar se há dados residuais e sequences corretas
    if (isTestEnv) {
      try {
        const investorsCount = await query('SELECT COUNT(*) as count FROM investors');
        const tokensCount = await query('SELECT COUNT(*) as count FROM tokens');
        const investorsSeq = await query("SELECT last_value FROM investors_id_seq");
        const tokensSeq = await query("SELECT last_value FROM tokens_id_seq");
        
        console.log(`[testDatabase] Cleanup verification:`);
        console.log(`  - Investors: ${investorsCount.rows[0].count} rows, sequence: ${investorsSeq.rows[0].last_value}`);
        console.log(`  - Tokens: ${tokensCount.rows[0].count} rows, sequence: ${tokensSeq.rows[0].last_value}`);
        
        if (investorsCount.rows[0].count > 0 || tokensCount.rows[0].count > 0) {
          console.warn('[testDatabase] WARNING: Data still exists after cleanup!');
        }
        if (investorsSeq.rows[0].last_value !== '1' || tokensSeq.rows[0].last_value !== '1') {
          console.warn('[testDatabase] WARNING: Sequences not reset correctly!');
        }
      } catch (e) {
        // Ignorar erros de verificação (tabelas podem não existir ainda)
        if (isTestEnv) {
          console.log('[testDatabase] Could not verify cleanup (this is OK if tables are new):', e.message);
        }
      }
    }
    
    if (isTestEnv) {
      console.log('[testDatabase] Database cleanup completed');
    }
  } catch (error) {
    console.error('[testDatabase] Error cleaning database:', error);
    // Tentar reabilitar constraints mesmo em caso de erro
    try {
      await query('SET session_replication_role = DEFAULT');
    } catch (e) {
      // Ignorar erro ao reabilitar
    }
    throw error;
  }
};

/**
 * Cria dados de teste básicos no banco
 */
export const seedTestData = async () => {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
  
  try {
    // Verificar sequences antes de inserir
    if (isTestEnv) {
      try {
        const investorsSeq = await query("SELECT last_value FROM investors_id_seq");
        const tokensSeq = await query("SELECT last_value FROM tokens_id_seq");
        console.log(`[testDatabase] Sequences before insert - investors_id_seq: ${investorsSeq.rows[0].last_value}, tokens_id_seq: ${tokensSeq.rows[0].last_value}`);
      } catch (e) {
        // Ignorar se sequences não existirem ainda
      }
    }
    
    // Chaves Stellar válidas: 56 caracteres, começando com G seguido de 55 caracteres alfanuméricos
    // Formato: G + 55 caracteres [A-Z0-9]
    const investorStellarKey = 'G' + 'TEST1234567890123456789012345678901234567890123456789012345'.substring(0, 55);
    const issuerStellarKey = 'G' + 'ISSUER12345678901234567890123456789012345678901234567890123456'.substring(0, 55);
    
    // Usar email e document únicos baseados em timestamp para evitar conflitos
    const timestamp = Date.now();
    const uniqueEmail = `test-${timestamp}@example.com`;
    const uniqueDocument = `${timestamp % 100000000000}`.padStart(11, '0'); // 11 dígitos
    
    if (isTestEnv) {
      console.log(`[testDatabase] Seeding test data with email: ${uniqueEmail}, document: ${uniqueDocument}`);
    }
    
    const investorResult = await query(
      `INSERT INTO investors (name, email, document, stellar_public_key, kyc_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      ['Test Investor', uniqueEmail, uniqueDocument, investorStellarKey, 'approved']
    );

    // Use INSERT ... ON CONFLICT to handle existing token
    // This prevents duplicate key errors if cleanup didn't fully remove the token
    const tokenResult = await query(
      `INSERT INTO tokens (asset_code, issuer_public_key, total_supply, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (asset_code) 
       DO UPDATE SET 
         issuer_public_key = EXCLUDED.issuer_public_key,
         total_supply = EXCLUDED.total_supply,
         description = EXCLUDED.description,
         updated_at = NOW()
       RETURNING *`,
      ['SIN01', issuerStellarKey, 1000, 'Test Token']
    );

    return {
      investor: investorResult.rows[0],
      token: tokenResult.rows[0],
    };
  } catch (error) {
    console.error('Error seeding test data:', error);
    throw error;
  }
};

/**
 * Setup antes de cada teste de integração
 */
export const setupTestDatabase = async () => {
  await cleanDatabase();
  return await seedTestData();
};

/**
 * Teardown após cada teste de integração
 */
export const teardownTestDatabase = async () => {
  await cleanDatabase();
};

