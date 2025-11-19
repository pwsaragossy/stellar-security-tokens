import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('InvestmentMetricsController - Structure Tests', () => {
  test('InvestmentMetricsController exports correctly', async () => {
    const { InvestmentMetricsController } = await import('../../../src/controllers/investmentMetricsController.js');
    assert.ok(InvestmentMetricsController, 'InvestmentMetricsController should be exported');
    assert.ok(typeof InvestmentMetricsController === 'function', 'InvestmentMetricsController should be a class');
  });

  test('InvestmentMetricsController has all required static methods', async () => {
    const { InvestmentMetricsController } = await import('../../../src/controllers/investmentMetricsController.js');
    
    const requiredMethods = [
      'getMetrics',
      'getStatistics',
      'getPendingInvestments',
    ];

    for (const methodName of requiredMethods) {
      assert.ok(
        typeof InvestmentMetricsController[methodName] === 'function',
        `${methodName} should be exported as a static method`
      );
    }
  });
});

