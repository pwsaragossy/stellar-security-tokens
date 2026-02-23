import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('InvestorController', () => {
  it('exports all required functions', async () => {
    const investorController = await import('../../../src/controllers/investorController.js');

    // Core passkey registration flow
    assert.ok(investorController.registerInvestorWithPasskey, 'registerInvestorWithPasskey should be exported');
    assert.ok(investorController.verifyEmail, 'verifyEmail should be exported');
    assert.ok(investorController.getInvestorPortfolio, 'getInvestorPortfolio should be exported');
    assert.ok(investorController.initiateDeposit, 'initiateDeposit should be exported');
    assert.ok(investorController.getInvestorDeposits, 'getInvestorDeposits should be exported');
  });
});
