import { test, describe } from 'node:test';
import assert from 'node:assert';

// Nota: Estes testes requerem refatoração para dependency injection ou PostgreSQL rodando

describe('InvestorController - Structure Tests', () => {
  test('InvestorController exports all required functions', async () => {
    const controllers = await import('../../../src/controllers/investorController.js');

    const requiredFunctions = [
      'createInvestor',
      'registerInvestor',
      'loginInvestor',
      'whitelistInvestor',
      'getInvestors',
      'getInvestorById',
      'getInvestorBalance',
      'getInvestorPayments',
      'updateInvestor',
      'getInvestorPortfolio',
      'getInvestorMetrics',
      // Passkey Wallet functions
      'registerInvestorWithPasskey',
      'verifyEmail',
      'resendVerificationEmail',
      'createSmartWallet',
      'getWalletStatus',
      'getPasskeyConfig',
    ];

    for (const funcName of requiredFunctions) {
      assert.ok(
        typeof controllers[funcName] === 'function',
        `${funcName} should be exported`
      );
    }
  });
});
