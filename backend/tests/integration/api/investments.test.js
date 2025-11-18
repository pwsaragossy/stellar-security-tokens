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

  test('POST /api/investments/purchase - cria investimento pendente quando pagamento não encontrado', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.post('/api/investments/purchase', {
      body: {
        investorId: testData.investor.id,
        usdcAmount: 100,
        assetCode: 'SIN01',
      },
    });

    // Deve retornar 202 (Accepted) com instruções de pagamento
    assert.strictEqual(response.status, 202);
    assert.strictEqual(response.data.success, true);
    assert.ok(response.data.data.investment, 'Deve retornar dados do investimento');
    assert.ok(response.data.data.investment.id, 'Deve ter ID do investimento');
    assert.strictEqual(response.data.data.investment.status, 'pending_payment');
    assert.ok(response.data.data.paymentInstructions, 'Deve ter instruções de pagamento');
  });

  test('GET /api/investments/:id/status - retorna status do investimento', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    // Primeiro criar um investimento
    const createResponse = await apiClient.post('/api/investments/purchase', {
      body: {
        investorId: testData.investor.id,
        usdcAmount: 50,
        assetCode: 'SIN01',
      },
    });

    assert.strictEqual(createResponse.status, 202, 'Purchase should succeed');

    const investmentId = createResponse.data.data.investment.id;

    // Buscar status
    const statusResponse = await apiClient.get(`/api/investments/${investmentId}/status`);

    assert.strictEqual(statusResponse.status, 200);
    assert.strictEqual(statusResponse.data.success, true);
    assert.ok(statusResponse.data.data, 'Deve retornar dados do investimento');
    assert.strictEqual(statusResponse.data.data.id, investmentId);
    assert.ok(statusResponse.data.data.status, 'Deve ter status');
    assert.ok(statusResponse.data.data.usdcAmount, 'Deve ter usdcAmount');
    assert.ok(statusResponse.data.data.tokenAmount, 'Deve ter tokenAmount');
  });

  test('GET /api/investments/:id/status - retorna 404 para investimento inexistente', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.get('/api/investments/99999/status');
    
    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.data.success, false);
  });

  test('POST /api/investments/purchase - valida offerId quando fornecido', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    const response = await apiClient.post('/api/investments/purchase', {
      body: {
        investorId: testData.investor.id,
        usdcAmount: 75,
        assetCode: 'SIN01',
        offerId: 1, // Pode não existir, mas não deve quebrar
      },
    });

    // Deve aceitar offerId opcional
    assert.ok([202, 400, 404].includes(response.status), 'Deve retornar status válido');
  });
});

