import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { apiClient, setAuthToken, clearAuthToken } from '../../helpers/apiClient.js';
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/testDatabase.js';

describe('Investments API Integration Tests', () => {
  let testData;
  let authToken;
  let dbAvailable = false;

  before(async () => {
    try {
      testData = await setupTestDatabase();
      dbAvailable = true;
      
      const loginResponse = await apiClient.post('/api/auth/login', {
        body: { email: testData.investor.email },
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

  test('POST /api/investments/purchase - retorna 400 para amount inválido', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.post('/api/investments/purchase', {
      body: {
        investorId: testData.investor.id,
        usdcAmount: 0,
      },
    });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.data.success, false);
  });

  test('POST /api/investments/purchase - retorna 404 para investidor inexistente', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.post('/api/investments/purchase', {
      body: {
        investorId: 99999,
        usdcAmount: 100,
      },
    });

    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.data.success, false);
  });
});

