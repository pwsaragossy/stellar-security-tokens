/**
 * Setup e teardown do banco de dados de teste para integration tests
 */

import { query } from '../../config/database.js';

/**
 * Limpa todas as tabelas do banco de testes
 */
export const cleanDatabase = async () => {
  try {
    // Desabilitar temporariamente as constraints para limpeza completa
    await query('SET session_replication_role = replica');
    
    // Limpar todas as tabelas
    await query('DELETE FROM interest_payments');
    await query('DELETE FROM token_distributions');
    await query('DELETE FROM tokens');
    await query('DELETE FROM investors');
    
    // Reabilitar constraints
    await query('SET session_replication_role = DEFAULT');
    
    // Resetar sequences
    await query('ALTER SEQUENCE IF EXISTS investors_id_seq RESTART WITH 1');
    await query('ALTER SEQUENCE IF EXISTS tokens_id_seq RESTART WITH 1');
    await query('ALTER SEQUENCE IF EXISTS token_distributions_id_seq RESTART WITH 1');
    await query('ALTER SEQUENCE IF EXISTS interest_payments_id_seq RESTART WITH 1');
  } catch (error) {
    console.error('Error cleaning database:', error);
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
  try {
    const investorResult = await query(
      `INSERT INTO investors (name, email, document, stellar_public_key, kyc_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      ['Test Investor', 'test@example.com', '12345678900', 'GTEST1234567890123456789012345678901234567890123456', 'approved']
    );

    const tokenResult = await query(
      `INSERT INTO tokens (asset_code, issuer_public_key, total_supply, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      ['SIN01', 'GISSUER1234567890123456789012345678901234567890123456', 1000, 'Test Token']
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

