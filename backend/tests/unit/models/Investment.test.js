import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Investment Model - Structure Tests', () => {
  test('Investment model exports correctly', async () => {
    const { Investment } = await import('../../../src/models/Investment.js');
    assert.ok(Investment, 'Investment should be exported');
    assert.ok(typeof Investment === 'function', 'Investment should be a class');
  });

  test('Investment model has all required static methods', async () => {
    const { Investment } = await import('../../../src/models/Investment.js');
    
    const requiredMethods = [
      'create',
      'findById',
      'findByUSDC',
      'findByStatus',
      'findPendingByInvestor',
      'updateStatus',
      'findByInvestor',
      'findByOffer',
    ];

    for (const methodName of requiredMethods) {
      assert.ok(
        typeof Investment[methodName] === 'function',
        `${methodName} should be exported as a function`
      );
    }
  });
});

