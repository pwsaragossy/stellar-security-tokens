import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('InvestmentController - Structure Tests', () => {
  test('InvestmentController exports all required functions', async () => {
    const controllers = await import('../../../src/controllers/investmentController.js');
    
    const requiredFunctions = [
      'purchaseInvestment',
      'getInvestmentStatus',
    ];

    for (const funcName of requiredFunctions) {
      assert.ok(
        typeof controllers[funcName] === 'function',
        `${funcName} should be exported`
      );
    }
  });
});
