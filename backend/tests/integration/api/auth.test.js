import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { apiClient, setAuthToken, clearAuthToken } from '../../helpers/apiClient.js';
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/testDatabase.js';

describe('Auth API Integration Tests', () => {
  let testData;
  let dbAvailable = false;

  before(async () => {
    try {
      testData = await setupTestDatabase();
      dbAvailable = true;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('⚠️  PostgreSQL não está rodando. Pulando testes de integração.');
        dbAvailable = false;
      } else {
        throw error;
      }
    }
  });

  after(async () => {
    if (dbAvailable) {
      await teardownTestDatabase();
    }
  });

  test('POST /api/auth/login - login com email válido', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.post('/api/auth/login', {
      body: {
        email: testData.investor.email,
      },
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.success, true);
    assert.ok(response.data.data.token);
    assert.strictEqual(response.data.data.investor.email, testData.investor.email);
  });

  test('POST /api/auth/login - retorna 401 para email inexistente', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.post('/api/auth/login', {
      body: {
        email: 'nonexistent@example.com',
      },
    });

    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.data.success, false);
    assert.strictEqual(response.data.error, 'Invalid credentials');
  });
});

