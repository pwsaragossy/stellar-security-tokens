import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';

describe('PaymentService Unit Tests', async () => {
  let PaymentService;

  beforeEach(async () => {
    // Mock all dependencies to ensure clean load of PaymentService
    const module = await esmock('../../../src/services/payment.service.js', {
      '../../../src/config/prisma.js': { default: {} },
      '../../../src/services/stellar.service.js': { StellarService: { getAccountRPC: async () => ({}) } },
      '../../../src/services/email.service.js': { EmailService: {} },
      '../../../src/services/config.service.js': { ConfigService: {} },
      '../../../src/config/stellar.js': {
        stellarServer: {},
        getDistributorKeypair: () => { },
        buildTransaction: () => { },
        buildTransactionWithAccount: () => { },
        getSorobanRpcUrl: () => 'http://mock-rpc',
        getSorobanServer: () => ({
          getAccount: async () => ({ sequence: '1' }),
          simulateTransaction: async () => ({ result: { retval: {} } }),
        }),
        getIssuerKeypair: () => { },
      },
      '../../../src/services/transactionManager.service.js': { TransactionManager: {} }
    });
    PaymentService = module.PaymentService;
  });

  describe('Structure & Exports', () => {
    test('PaymentService exports correctly', () => {
      assert.ok(PaymentService);
    });

    test('PaymentService has required methods', () => {
      const requiredMethods = [
        'getBalanceSource',
        'getOnChainTokenBalance',
        'processBulletPayments',
        'getExpiredBulletOffers',
        'getInvestorsWithBalancesByOffer',
        'processAllScheduledPayments'
      ];
      requiredMethods.forEach(method => {
        assert.strictEqual(typeof PaymentService[method], 'function', `${method} should be a function`);
      });
    });
  });
});
