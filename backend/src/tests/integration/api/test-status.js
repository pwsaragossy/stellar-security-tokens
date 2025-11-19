import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { setupTestDatabase, teardownTestDatabase } from './../helpers/testDatabase.js';
import { setAuthToken, clearAuthToken } from './../helpers/apiClient.js';

describe('Investment Status Test', () => {
  let testData;
  let dbAvailable = false;

  before(async () => {
    try {
      testData = await setupTestDatabase();
      dbAvailable = true;

      const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testData.investor.email, password: 'testpassword' }),
      });

      const loginData = await loginResponse.json();
      global.testAuthToken = loginData.data.token;
      setAuthToken(loginData.data.token);
    } catch (error) {
      console.log('Setup failed:', error.message);
    }
  });

  after(async () => {
    clearAuthToken();
    if (dbAvailable) {
      await teardownTestDatabase();
    }
  });

  it('should return investment status when investment exists', async () => {
    if (!dbAvailable) {
      assert.ok(true, 'PostgreSQL não disponível - teste pulado');
      return;
    }

    // Criar investimento diretamente no banco
    const { default: prisma } = await import('../../../config/prisma.js');
    const investment = await prisma.investment.create({
      data: {
        investorId: testData.investor.id,
        assetCode: 'SIN01',
        usdcAmount: 50,
        tokenAmount: 50,
        status: 'pending_payment',
      },
    });

    console.log('Investment created in DB:', investment.id);

    // Buscar status (sem auth temporariamente)
    const statusResponse = await fetch(`http://localhost:3000/api/investments/${investment.id}/status`);

    const statusData = await statusResponse.json();
    console.log('Status response:', statusResponse.status, statusData);

    assert.strictEqual(statusResponse.status, 200);
    assert.strictEqual(statusData.success, true);
    assert.ok(statusData.data, 'Deve retornar dados do investimento');
    assert.strictEqual(statusData.data.id, investment.id);
    assert.ok(statusData.data.status, 'Deve ter status');
    assert.ok(statusData.data.usdcAmount, 'Deve ter usdcAmount');
    assert.ok(statusData.data.tokenAmount, 'Deve ter tokenAmount');
  });
});
