import { test, describe } from 'node:test';
import assert from 'node:assert';

// Nota: Estes testes requerem refatoração para dependency injection ou PostgreSQL rodando
// O KYCService depende do Investor model que usa banco de dados real

describe('KYCService - Structure Tests', () => {
  test('KYCService exports correctly', async () => {
    const { KYCService } = await import('../../../src/services/kyc.service.js');
    assert.ok(KYCService);
    assert.ok(typeof KYCService.verifyInvestor === 'function');
    assert.ok(typeof KYCService.approveInvestor === 'function');
    assert.ok(typeof KYCService.rejectInvestor === 'function');
    assert.ok(typeof KYCService.getKYCStatus === 'function');
  });

  test('KYCService has all required static methods', async () => {
    const { KYCService } = await import('../../../src/services/kyc.service.js');
    
    const requiredMethods = [
      'verifyInvestor',
      'approveInvestor',
      'rejectInvestor',
      'getKYCStatus',
    ];

    for (const method of requiredMethods) {
      assert.ok(
        typeof KYCService[method] === 'function',
        `KYCService.${method} should be a function`
      );
    }
  });
});
