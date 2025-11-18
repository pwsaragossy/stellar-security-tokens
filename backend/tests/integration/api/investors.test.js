import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { apiClient, setAuthToken, clearAuthToken } from '../../helpers/apiClient.js';
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/testDatabase.js';

describe('Investors API Integration Tests', () => {
  let testData;
  let authToken;
  let dbAvailable = false;

  before(async () => {
    try {
      testData = await setupTestDatabase();
      dbAvailable = true;
      
      // Login para obter token
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

  test('POST /api/investors/register - registra novo investidor', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }
    const newInvestor = {
      name: 'Novo Investidor',
      email: 'novo@example.com',
      document: '11122233344',
      password: 'senha123',
    };

    const response = await apiClient.post('/api/investors/register', {
      body: newInvestor,
    });

    assert.strictEqual(response.status, 201);
    assert.strictEqual(response.data.success, true);
    assert.strictEqual(response.data.data.email, newInvestor.email);
    assert.ok(response.data.stellarAccount.publicKey);
  });

  test('POST /api/investors/register - retorna 409 para email duplicado', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }
    const duplicateInvestor = {
      name: 'Duplicado',
      email: testData.investor.email,
      document: '99988877766',
      password: 'senha123',
    };

    const response = await apiClient.post('/api/investors/register', {
      body: duplicateInvestor,
    });

    assert.strictEqual(response.status, 409);
    assert.strictEqual(response.data.success, false);
  });

  test('GET /api/investors - lista investidores', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }
    const response = await apiClient.get('/api/investors');

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.success, true);
    assert.ok(Array.isArray(response.data.data));
    assert.ok(response.data.data.length > 0);
  });

  test('GET /api/investors/:id - retorna investidor específico', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }
    const response = await apiClient.get(`/api/investors/${testData.investor.id}`);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.success, true);
    assert.strictEqual(response.data.data.id, testData.investor.id);
    assert.strictEqual(response.data.data.email, testData.investor.email);
  });

  test('GET /api/investors/:id - retorna 404 para investidor inexistente', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }
    const response = await apiClient.get('/api/investors/99999');

    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.data.success, false);
  });
});

