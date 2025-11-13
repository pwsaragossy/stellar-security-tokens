/**
 * Setup e teardown do banco de dados de teste para integration tests
 */

import { query } from '../../config/database.js';

/**
 * Limpa todas as tabelas do banco de testes
 */
export const cleanDatabase = async () => {
  try {
    await query('TRUNCATE TABLE interest_payments CASCADE');
    await query('TRUNCATE TABLE token_distributions CASCADE');
    await query('TRUNCATE TABLE tokens CASCADE');
    await query('TRUNCATE TABLE investors CASCADE');
  } catch (error) {
    console.error('Error cleaning database:', error);
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
      ['Test Investor', 'test@example.com', '12345678900', 'GTEST123456789012345678901234567890123456789012345678901234567', 'approved']
    );

    const tokenResult = await query(
      `INSERT INTO tokens (asset_code, issuer_public_key, total_supply, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      ['SIN01', 'GISSUER123456789012345678901234567890123456789012345678901234567', 1000, 'Test Token']
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

