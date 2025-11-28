import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as investorController from '../../../src/controllers/investorController.js';

// Nota: Estes testes requerem refatoração para dependency injection ou PostgreSQL rodando

describe('InvestorController', () => {
  it('exports all required functions', () => {
    // Core passkey registration flow
    assert.ok(investorController.registerInvestorWithPasskey, 'registerInvestorWithPasskey should be exported');
    assert.ok(investorController.verifyEmail, 'verifyEmail should be exported');

    // Deprecated but still exported for backwards compatibility
    assert.ok(investorController.loginInvestor, 'loginInvestor should be exported (deprecated)');
    assert.ok(investorController.createSmartWallet, 'createSmartWallet should be exported (deprecated)');

    // Other investor operations
    assert.ok(investorController.whitelistInvestor, 'whitelistInvestor should be exported');
    assert.ok(investorController.getInvestors, 'getInvestors should be exported');
    assert.ok(investorController.getInvestorById, 'getInvestorById should be exported');
    assert.ok(investorController.updateInvestor, 'updateInvestor should be exported');
    // assert.ok(investorController.deleteInvestor, 'deleteInvestor should be exported'); // Not implemented yet
    assert.ok(investorController.getInvestorPortfolio, 'getInvestorPortfolio should be exported');
  });
});
