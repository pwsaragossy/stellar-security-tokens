import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('InvestmentMetricsService - Structure Tests', () => {
  test('InvestmentMetricsService exports correctly', async () => {
    const { InvestmentMetricsService } = await import('../../../src/services/investmentMetrics.service.js');
    assert.ok(InvestmentMetricsService, 'InvestmentMetricsService should be exported');
    assert.ok(typeof InvestmentMetricsService === 'function', 'InvestmentMetricsService should be a class');
  });

  test('InvestmentMetricsService has all required static methods', async () => {
    const { InvestmentMetricsService } = await import('../../../src/services/investmentMetrics.service.js');
    
    const requiredMethods = [
      'getMetrics',
      'getStatisticsByPeriod',
      'getPendingInvestments',
    ];

    for (const methodName of requiredMethods) {
      assert.ok(
        typeof InvestmentMetricsService[methodName] === 'function',
        `${methodName} should be exported as a static method`
      );
    }
  });
});

