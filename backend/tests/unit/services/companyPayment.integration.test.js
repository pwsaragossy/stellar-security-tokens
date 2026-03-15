/**
 * CompanyPaymentService Integration Tests (with mocks)
 *
 * Tests the WIRING of processSignedPayment:
 *   - Prisma InterestPayment creation with correct fee fields
 *   - FeeLog write (fire-and-forget)
 *   - AlertService.error() on payment failure
 *   - Return shape consistency (bullet vs periodic)
 *
 * Uses node:test mock.module() to replace external dependencies.
 */
import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

// ─── Mock state containers ────────────────────────────
const calls = {
    offerUpdate: [],
    offerFindUnique: [],
    interestPaymentCreate: [],
    feeLogCreate: [],
    stellarSubmit: [],
    alertError: [],
    configGetFloat: [],
};

function resetCalls() {
    Object.keys(calls).forEach(k => calls[k] = []);
}

// ─── Mock fixtures ────────────────────────────────────
const PERIODIC_OFFER = {
    id: 1,
    assetCode: 'REALT1',
    paymentType: 'monthly',
    annualInterestRate: 12,
    paymentDay: 15,
    createdAt: new Date('2024-01-01'),
    company: { stellarPublicKey: 'GCOMPANY...' },
};

const BULLET_OFFER = {
    id: 2,
    assetCode: 'BULLET1',
    paymentType: 'bullet',
    annualInterestRate: 10,
    maturityDate: new Date('2026-01-01'),
    createdAt: new Date('2024-01-01'),
    company: { stellarPublicKey: 'GCOMPANY...' },
};

const PERIODIC_BREAKDOWN = [
    { investorId: 1, tokenBalance: 500, interestOwed: 500, investorWallet: 'GINV1...' },
    { investorId: 2, tokenBalance: 500, interestOwed: 500, investorWallet: 'GINV2...' },
];

const BULLET_BREAKDOWN = [
    { investorId: 1, principal: 5000, interest: 1000, totalPayout: 6000, investorWallet: 'GINV1...' },
    { investorId: 2, principal: 5000, interest: 1000, totalPayout: 6000, investorWallet: 'GINV2...' },
];

// ─── Register module mocks BEFORE import ──────────────
mock.module('../../../src/config/prisma.js', {
    defaultExport: {
        offer: {
            update: async (args) => { calls.offerUpdate.push(args); return {}; },
            findUnique: async (args) => {
                calls.offerFindUnique.push(args);
                // Return the right offer based on the id
                const offerId = args.where.id;
                if (offerId === 2) return BULLET_OFFER;
                return PERIODIC_OFFER;
            },
            findMany: async () => [],
        },
        interestPayment: {
            create: async (args) => { calls.interestPaymentCreate.push(args); return { id: calls.interestPaymentCreate.length }; },
        },
        feeLog: {
            create: async (args) => { calls.feeLogCreate.push(args); return { id: calls.feeLogCreate.length }; },
        },
    },
});

mock.module('../../../src/services/stellar.service.js', {
    namedExports: {
        StellarService: {
            submitTransaction: async (xdr) => {
                calls.stellarSubmit.push(xdr);
                return { success: true, transactionHash: 'txhash_mock_123' };
            },
            buildUnsignedTransaction: async () => ({ toXDR: () => 'mock_xdr' }),
        },
    },
});

mock.module('../../../src/services/payment.service.js', {
    namedExports: {
        PaymentService: {
            getTokenHolders: async () => [
                { investorId: 1, investorWallet: 'GINV1...', balance: 500 },
                { investorId: 2, investorWallet: 'GINV2...', balance: 500 },
            ],
        },
    },
});

mock.module('../../../src/services/email.service.js', {
    namedExports: {
        EmailService: { sendPaymentNotification: async () => {} },
    },
});

mock.module('../../../src/services/alert.service.js', {
    namedExports: {
        AlertService: {
            error: async (msg, meta) => { calls.alertError.push({ msg, meta }); },
            info: async () => {},
            warning: async () => {},
            critical: async () => {},
            notify: async () => {},
        },
    },
});

mock.module('../../../src/services/config.service.js', {
    namedExports: {
        ConfigService: {
            getFloat: async (key, defaultVal) => {
                calls.configGetFloat.push({ key, defaultVal });
                return 2; // 2% fee
            },
        },
    },
});

mock.module('../../../src/config/stellar.js', {
    namedExports: {
        getUsdcIssuer: () => 'GUSDC...',
    },
});

mock.module('../../../src/services/KeyManager.js', {
    namedExports: {
        keyManager: {
            getTreasuryPublicKey: () => 'GTREASURY...',
        },
    },
});

mock.module('../../../src/utils/logger.js', {
    defaultExport: {
        scope: () => ({
            info: () => {},
            warn: () => {},
            error: () => {},
            debug: () => {},
        }),
    },
});

mock.module('@stellar/stellar-sdk', {
    namedExports: {
        Keypair: { fromSecret: () => ({}) },
        Asset: class { constructor() {} },
        Operation: { payment: (args) => args },
        TransactionBuilder: class {},
        Networks: { TESTNET: 'Test SDF Network ; September 2015' },
    },
});

// ─── Import after mocks ──────────────────────────────
const { CompanyPaymentService } = await import('../../../src/services/companyPayment.service.js');

// ═══════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════

describe('processSignedPayment – Periodic (mocked)', () => {
    beforeEach(() => resetCalls());

    test('records InterestPayment with correct fee breakdown for each investor', async () => {
        // Mock calculateOwedAmount to return periodic breakdown
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => ({
            totalOwed: 1000,
            breakdown: PERIODIC_BREAKDOWN,
        });

        try {
            const result = await CompanyPaymentService.processSignedPayment('signed_xdr', 1);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.transactionHash, 'txhash_mock_123');
            assert.strictEqual(result.investorsPaid, 2);
            assert.strictEqual(result.totalPaid, 1000);

            // Should have created 2 InterestPayment records
            assert.strictEqual(calls.interestPaymentCreate.length, 2);

            // Verify fee breakdown: 2% of $500 = $10 fee, $490 net
            const firstPayment = calls.interestPaymentCreate[0].data;
            assert.strictEqual(firstPayment.grossAmount, 500);
            assert.strictEqual(firstPayment.netAmount, 490);
            assert.strictEqual(firstPayment.platformFeeAmount, 10);
            assert.strictEqual(firstPayment.transactionHash, 'txhash_mock_123');
            assert.strictEqual(firstPayment.status, 'completed');
            assert.strictEqual(firstPayment.assetCode, 'REALT1');
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
        }
    });

    test('writes FeeLog with total fee after successful payment', async () => {
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => ({
            totalOwed: 1000,
            breakdown: PERIODIC_BREAKDOWN,
        });

        try {
            await CompanyPaymentService.processSignedPayment('signed_xdr', 1);

            // FeeLog should have been written
            assert.strictEqual(calls.feeLogCreate.length, 1);

            const feeLog = calls.feeLogCreate[0].data;
            assert.strictEqual(feeLog.amount, 20);  // 2% of $1000
            assert.strictEqual(feeLog.assetCode, 'REALT1');
            assert.strictEqual(feeLog.category, 'DIVIDEND');
            assert.strictEqual(feeLog.sourceId, 1);  // offerId
            assert.strictEqual(feeLog.transactionHash, 'txhash_mock_123');
            assert.ok(feeLog.description.includes('Periodic'));
            assert.ok(feeLog.description.includes('2%'));
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
        }
    });

    test('return shape uses recordedBreakdown (not paymentDetails)', async () => {
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => ({
            totalOwed: 1000,
            breakdown: PERIODIC_BREAKDOWN,
        });

        try {
            const result = await CompanyPaymentService.processSignedPayment('signed_xdr', 1);

            // This was the bug: previously used paymentDetails.breakdown.length
            // which didn't exist in bullet context. Now uses recordedBreakdown.
            assert.strictEqual(typeof result.investorsPaid, 'number');
            assert.strictEqual(result.investorsPaid, 2);
            assert.strictEqual(typeof result.totalPaid, 'number');
            assert.strictEqual(result.totalPaid, 1000);
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
        }
    });
});

describe('processSignedPayment – Bullet (mocked)', () => {
    beforeEach(() => resetCalls());

    test('records InterestPayment with fee on INTEREST only, principal untaxed', async () => {
        const originalCalc = CompanyPaymentService.calculateBulletPayment;
        CompanyPaymentService.calculateBulletPayment = async () => ({
            totalPrincipal: 10000,
            totalInterest: 2000,
            totalPayout: 12000,
            breakdown: BULLET_BREAKDOWN,
        });

        try {
            const result = await CompanyPaymentService.processSignedPayment('signed_xdr', 2);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.investorsPaid, 2);
            assert.strictEqual(result.totalPaid, 12000);

            // 2 InterestPayment records
            assert.strictEqual(calls.interestPaymentCreate.length, 2);

            // Verify each: interest = 1000, fee = 2% × 1000 = 20, net interest = 980
            const first = calls.interestPaymentCreate[0].data;
            assert.strictEqual(first.grossAmount, 6000);                // totalPayout
            assert.strictEqual(first.netAmount, 5000 + 980);            // principal + netInterest
            assert.strictEqual(first.platformFeeAmount, 20);            // fee on interest only
            assert.strictEqual(first.tokenBalance, 5000);               // principal recorded
            assert.strictEqual(first.assetCode, 'BULLET1');
            assert.strictEqual(first.paymentType, 'bullet');
        } finally {
            CompanyPaymentService.calculateBulletPayment = originalCalc;
        }
    });

    test('FeeLog records fee on interest only for bullet', async () => {
        const originalCalc = CompanyPaymentService.calculateBulletPayment;
        CompanyPaymentService.calculateBulletPayment = async () => ({
            totalPrincipal: 10000,
            totalInterest: 2000,
            totalPayout: 12000,
            breakdown: BULLET_BREAKDOWN,
        });

        try {
            await CompanyPaymentService.processSignedPayment('signed_xdr', 2);

            assert.strictEqual(calls.feeLogCreate.length, 1);

            const feeLog = calls.feeLogCreate[0].data;
            // Total fee = 2 investors × $20 = $40 (NOT $240)
            assert.strictEqual(feeLog.amount, 40);
            assert.strictEqual(feeLog.category, 'DIVIDEND');
            assert.ok(feeLog.description.includes('Bullet'));
        } finally {
            CompanyPaymentService.calculateBulletPayment = originalCalc;
        }
    });

    test('return shape is consistent for bullet branch', async () => {
        const originalCalc = CompanyPaymentService.calculateBulletPayment;
        CompanyPaymentService.calculateBulletPayment = async () => ({
            totalPrincipal: 10000,
            totalInterest: 2000,
            totalPayout: 12000,
            breakdown: BULLET_BREAKDOWN,
        });

        try {
            const result = await CompanyPaymentService.processSignedPayment('signed_xdr', 2);

            // Must not throw — this was the return-shape bug fix
            assert.strictEqual(result.investorsPaid, 2);
            assert.strictEqual(result.totalPaid, 12000);
            assert.strictEqual(result.transactionHash, 'txhash_mock_123');
        } finally {
            CompanyPaymentService.calculateBulletPayment = originalCalc;
        }
    });
});

describe('processSignedPayment – FeeLog resilience', () => {
    beforeEach(() => resetCalls());

    test('FeeLog failure does NOT break payment recording', async () => {
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => ({
            totalOwed: 1000,
            breakdown: PERIODIC_BREAKDOWN,
        });

        // Make feeLog.create throw
        const { default: prisma } = await import('../../../src/config/prisma.js');
        const originalFeeLogCreate = prisma.feeLog.create;
        prisma.feeLog.create = async () => { throw new Error('DB constraint violation'); };

        try {
            const result = await CompanyPaymentService.processSignedPayment('signed_xdr', 1);

            // Payment still succeeds despite FeeLog failure
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.investorsPaid, 2);

            // InterestPayments were still created
            assert.strictEqual(calls.interestPaymentCreate.length, 2);
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
            prisma.feeLog.create = originalFeeLogCreate;
        }
    });

    test('FeeLog skipped when total fee is zero (0% fee config)', async () => {
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => ({
            totalOwed: 1000,
            breakdown: PERIODIC_BREAKDOWN,
        });

        // Override ConfigService to return 0% fee
        const { ConfigService } = await import('../../../src/services/config.service.js');
        const originalGetFloat = ConfigService.getFloat;
        ConfigService.getFloat = async () => 0;

        try {
            await CompanyPaymentService.processSignedPayment('signed_xdr', 1);

            // FeeLog should NOT have been written (fee = 0)
            assert.strictEqual(calls.feeLogCreate.length, 0);
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
            ConfigService.getFloat = originalGetFloat;
        }
    });
});

describe('processSignedPayment – AlertService', () => {
    beforeEach(() => resetCalls());

    test('AlertService.error() called when payment submission fails', async () => {
        // Override StellarService to fail
        const { StellarService } = await import('../../../src/services/stellar.service.js');
        const originalSubmit = StellarService.submitTransaction;
        StellarService.submitTransaction = async () => ({ success: false, error: 'TX timeout' });

        try {
            await assert.rejects(
                () => CompanyPaymentService.processSignedPayment('bad_xdr', 1),
                (err) => {
                    assert.ok(err.message.includes('TX timeout'));
                    return true;
                }
            );

            // AlertService.error should have been called
            assert.strictEqual(calls.alertError.length, 1);
            assert.ok(calls.alertError[0].msg.includes('Payment submission failed'));
            assert.strictEqual(calls.alertError[0].meta.offerId, 1);
        } finally {
            StellarService.submitTransaction = originalSubmit;
        }
    });

    test('AlertService failure does NOT prevent error re-throw', async () => {
        const { StellarService } = await import('../../../src/services/stellar.service.js');
        const { AlertService } = await import('../../../src/services/alert.service.js');
        const originalSubmit = StellarService.submitTransaction;
        const originalAlertError = AlertService.error;

        // Both StellarService and AlertService fail
        StellarService.submitTransaction = async () => ({ success: false, error: 'Network error' });
        AlertService.error = async () => { throw new Error('Slack webhook down'); };

        try {
            await assert.rejects(
                () => CompanyPaymentService.processSignedPayment('bad_xdr', 1),
                (err) => {
                    // Original error is preserved, not replaced by AlertService error
                    assert.ok(err.message.includes('Network error'));
                    return true;
                }
            );
        } finally {
            StellarService.submitTransaction = originalSubmit;
            AlertService.error = originalAlertError;
        }
    });
});
