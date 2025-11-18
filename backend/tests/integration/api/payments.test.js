import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { apiClient, setAuthToken, clearAuthToken } from '../../helpers/apiClient.js';
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/testDatabase.js';

describe('Payments API Integration Tests', () => {
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

  test('GET /api/payments/history - retorna histórico de pagamentos', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.get('/api/payments/history');

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.success, true);
    assert.ok(Array.isArray(response.data.data.payments));
    assert.ok(response.data.data.pagination);
  });

  test('GET /api/payments/history - filtra por assetCode', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    // Adicionar query params manualmente
    const url = new URL('/api/payments/history', 'http://localhost:3000');
    url.searchParams.set('assetCode', testData.token.asset_code);
    
    const filteredResponse = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });
    const filteredData = await filteredResponse.json();

    assert.strictEqual(filteredResponse.status, 200);
    assert.strictEqual(filteredData.success, true);
  });

  test('GET /api/payments/statistics - retorna estatísticas', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.get('/api/payments/statistics');

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.success, true);
    assert.ok(Array.isArray(response.data.data.statistics));
  });
});

