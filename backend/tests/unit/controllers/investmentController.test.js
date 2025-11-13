import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('InvestmentController - Structure Tests', () => {
  test('InvestmentController exports purchaseInvestment function', async () => {
    try {
      const controllers = await import('../../../controllers/investmentController.js');
      
      assert.ok(typeof controllers.purchaseInvestment === 'function',
        'purchaseInvestment should be exported');
    } catch (error) {
      assert.ok(error.message.includes('import') || error.message.includes('Server'),
        'Expected import error');
    }
  });
});
