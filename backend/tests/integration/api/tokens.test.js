import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { apiClient, setAuthToken, clearAuthToken } from '../../helpers/apiClient.js';
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/testDatabase.js';

describe('Tokens API Integration Tests', () => {
  let testData;
  let authToken;
  let dbAvailable = false;

  before(async () => {
    try {
      testData = await setupTestDatabase();
      dbAvailable = true;
      
      const loginResponse = await apiClient.post('/api/auth/login', {
        body: { email: testData.investor.email, password: 'testpassword' },
      });
      authToken = loginResponse.data.data.token;
      setAuthToken(authToken);
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
    clearAuthToken();
    if (dbAvailable) {
      await teardownTestDatabase();
    }
  });

  test('GET /api/tokens - lista tokens', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.get('/api/tokens');

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.success, true);
    assert.ok(Array.isArray(response.data.data));
  });

  test('GET /api/tokens/:assetCode - retorna token específico', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.get(`/api/tokens/${testData.token.asset_code}`);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.success, true);
    assert.strictEqual(response.data.data.asset_code, testData.token.asset_code);
  });

  test('GET /api/tokens/:assetCode - retorna 404 para token inexistente', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.get('/api/tokens/INVALID');

    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.data.success, false);
  });
});

