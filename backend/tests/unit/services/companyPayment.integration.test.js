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
    stellarClawback: [],
    stellarListHolders: [],
    alertError: [],
    configGetFloat: [],
    multiSigCreate: [],
    multiSigUpdateMany: [],
    multiSigServiceCreate: [],
    pusherBroadcast: [],
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
    investorRate: 10,        // spread = 2pp → spreadRatio = 2/10 = 0.2
    paymentDay: 15,
    createdAt: new Date('2024-01-01'),
    company: { stellarPublicKey: 'GCOMPANY...' },
};

const BULLET_OFFER = {
    id: 2,
    assetCode: 'BULLET1',
    paymentType: 'bullet',
    annualInterestRate: 10,
    investorRate: 8,          // spread = 2pp → spreadRatio = 2/8 = 0.25
    maturityDate: new Date('2026-01-01'),
    createdAt: new Date('2024-01-01'),
    company: { stellarPublicKey: 'GCOMPANY...' },
};

const PERIODIC_BREAKDOWN = [
    { investorId: 1, tokenBalance: 500, interestOwed: 500, investorWallet: 'GINV1...' },
    { investorId: 2, tokenBalance: 500, interestOwed: 500, investorWallet: 'GINV2...' },
];

const _BULLET_BREAKDOWN = [
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
        multiSigTransaction: {
            findFirst: async () => null,  // No pre-existing admin-visible TXs
            findMany: async () => [],     // No pre-existing pending TXs for this operation
            create: async (args) => { calls.multiSigCreate.push(args); return { id: calls.multiSigCreate.length, ...args.data }; },
            updateMany: async (args) => { calls.multiSigUpdateMany.push(args); return { count: 1 }; },
            count: async () => 1,
        },
        $transaction: async (fn) => {
            // Execute the callback with the same prisma mock (simulate Prisma interactive transaction)
            const txProxy = {
                multiSigTransaction: {
                    create: async (args) => { calls.multiSigCreate.push(args); return { id: calls.multiSigCreate.length, ...args.data }; },
                    updateMany: async (args) => { calls.multiSigUpdateMany.push(args); return { count: 1 }; },
                },
            };
            return fn(txProxy);
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
            listAssetHolders: async (assetCode) => {
                calls.stellarListHolders.push(assetCode);
                return [
                    { publicKey: 'GINV1_56CHARS_PADDED_TO_56_CHARACTERS_AAAAAAAAAAAAAAAA', balance: '5000.0000000' },
                    { publicKey: 'GINV2_56CHARS_PADDED_TO_56_CHARACTERS_BBBBBBBBBBBBBBBB', balance: '5000.0000000' },
                ];
            },
            clawbackTokens: async (wallet, amount, assetCode) => {
                calls.stellarClawback.push({ wallet, amount, assetCode });
                return { success: true, transactionHash: 'clawback_tx_mock' };
            },
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

// ConfigService mock removed — the service uses yield spread (annualRate - investorRate),
// not ConfigService.getFloat('DIVIDEND_FEE_PERCENT'). That key was removed.

mock.module('../../../src/config/stellar.js', {
    namedExports: {
        getUsdcIssuer: () => 'GUSDC...',
        getNetworkPassphrase: () => 'Test SDF Network ; September 2015',
        getSorobanRpcUrl: () => 'https://soroban-testnet.stellar.org',
    },
});

mock.module('../../../src/config/pusher.js', {
    namedExports: {
        broadcast: (...args) => { calls.pusherBroadcast.push(args); },
    },
});

mock.module('../../../src/services/multiSigTransaction.service.js', {
    namedExports: {
        MultiSigTransactionService: {
            create: async (args) => { calls.multiSigServiceCreate.push(args); return { id: calls.multiSigServiceCreate.length }; },
        },
    },
});

mock.module('../../../src/services/KeyManager.js', {
    namedExports: {
        keyManager: {
            getTreasuryPublicKey: () => 'GTREASURY...',
            getIssuerPublicKey: () => 'GISSUER...',
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
        Contract: class { constructor() {} call() { return {}; } },
        Address: class { constructor() {} },
        nativeToScVal: () => ({}),
        xdr: { ScVal: {} },
        rpc: { Server: class { constructor() {} } },
        BASE_FEE: '100',
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

            // Verify fee breakdown: spreadRatio = 2/10 = 0.2, fee = 500 × 0.2 = 100, net = 400
            const firstPayment = calls.interestPaymentCreate[0].data;
            assert.strictEqual(firstPayment.grossAmount, 500);
            assert.strictEqual(firstPayment.netAmount, 400);
            assert.strictEqual(firstPayment.platformFeeAmount, 100);
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
            assert.strictEqual(feeLog.amount, 200);  // spreadRatio 0.2 × $1000
            assert.strictEqual(feeLog.assetCode, 'REALT1');
            assert.strictEqual(feeLog.category, 'DIVIDEND');
            assert.strictEqual(feeLog.sourceId, 1);  // offerId
            assert.strictEqual(feeLog.transactionHash, 'txhash_mock_123');
            assert.ok(feeLog.description.includes('Periodic'));
            assert.ok(feeLog.description.includes('2pp'));
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


// ═══════════════════════════════════════════════════════
// BULLET GUARD TESTS
// ═══════════════════════════════════════════════════════
//
//  The legacy clawback-based bullet pipeline has been removed (Apr 2026).
//  processSignedPayment now throws a hard guard for bullet offers.
//  Maturity payments go through SorobanSettlementService.executeFullSettlement().
//

describe('processSignedPayment – Bullet Guard (Soroban migration)', () => {
    beforeEach(() => resetCalls());

    test('bullet offer throws hard guard error', async () => {
        await assert.rejects(
            () => CompanyPaymentService.processSignedPayment('signed_xdr', 2),
            (err) => {
                assert.ok(err.message.includes('bullet') || err.message.includes('Soroban'),
                    `Expected error about bullet/Soroban, got: ${err.message}`);
                return true;
            }
        );

        // No Stellar submission
        assert.strictEqual(calls.stellarSubmit.length, 0);
        // No InterestPayments
        assert.strictEqual(calls.interestPaymentCreate.length, 0);
        // No multisig creation
        assert.strictEqual(calls.multiSigServiceCreate.length, 0);
    });

    test('periodic: still submits directly and records payments', async () => {
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => ({
            totalOwed: 1000,
            breakdown: PERIODIC_BREAKDOWN,
        });

        try {
            const result = await CompanyPaymentService.processSignedPayment('signed_xdr', 1);

            assert.strictEqual(calls.stellarSubmit.length, 1);
            assert.strictEqual(result.status, 'completed');
            assert.strictEqual(result.success, true);
            assert.strictEqual(calls.interestPaymentCreate.length, 2);
            assert.strictEqual(calls.stellarClawback.length, 0);

            const closeCall = calls.offerUpdate.find(c => c.data.status === 'closed');
            assert.strictEqual(closeCall, undefined);
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
        }
    });
});


describe('_recordPayments – DRY helper', () => {
    beforeEach(() => resetCalls());

    test('bullet: records InterestPayments with fee on INTEREST only', async () => {
        // investorRate=8, spreadPct=2, spreadRatio=2/8=0.25
        const offer = { id: 2, assetCode: 'BULLET1', annualInterestRate: 10, investorRate: 8, paymentType: 'bullet' };
        const breakdown = [
            { investorId: 1, principal: 5000, interest: 1000, totalPayout: 6000 },
        ];

        const { records, _totalFee } = await CompanyPaymentService._recordPayments(
            offer, breakdown, 'tx_hash_test', 2, true
        );

        assert.strictEqual(records.length, 1);
        assert.strictEqual(calls.interestPaymentCreate.length, 1);

        const created = calls.interestPaymentCreate[0].data;
        assert.strictEqual(created.grossAmount, 6000);       // principal + interest
        assert.strictEqual(created.tokenBalance, 5000);       // principal as token balance
        assert.strictEqual(created.platformFeeAmount, 250);   // spreadRatio 0.25 × 1000
        assert.strictEqual(created.netAmount, 5000 + 750);    // principal + (interest - fee)
        assert.strictEqual(created.status, 'completed');
    });

    test('periodic: records InterestPayments with spread on everything', async () => {
        // investorRate=10, spreadPct=2, spreadRatio=2/10=0.2
        const offer = { id: 1, assetCode: 'REALT1', annualInterestRate: 12, investorRate: 10, paymentType: 'monthly' };
        const breakdown = [
            { investorId: 1, tokenBalance: 500, interestOwed: 500 },
        ];

        const { records, _totalFee } = await CompanyPaymentService._recordPayments(
            offer, breakdown, 'tx_hash_periodic', 2, false
        );

        assert.strictEqual(records.length, 1);
        const created = calls.interestPaymentCreate[0].data;
        assert.strictEqual(created.grossAmount, 500);
        assert.strictEqual(created.platformFeeAmount, 100);   // spreadRatio 0.2 × 500
        assert.strictEqual(created.netAmount, 400);            // 500 - 100
    });

    test('writes FeeLog when totalFee > 0', async () => {
        // investorRate=8, spreadPct=2, spreadRatio=2/8=0.25
        const offer = { id: 2, assetCode: 'BULLET1', annualInterestRate: 10, investorRate: 8, paymentType: 'bullet' };
        const breakdown = [
            { investorId: 1, principal: 5000, interest: 1000, totalPayout: 6000 },
        ];

        await CompanyPaymentService._recordPayments(offer, breakdown, 'tx_hash_fee', 2, true);

        assert.strictEqual(calls.feeLogCreate.length, 1);
        assert.strictEqual(calls.feeLogCreate[0].data.category, 'DIVIDEND');
        assert.strictEqual(calls.feeLogCreate[0].data.amount, 250); // spreadRatio 0.25 × 1000
        assert.ok(calls.feeLogCreate[0].data.description.includes('Bullet maturity'));
    });

    test('skips FeeLog when spread is 0', async () => {
        // investorRate = annualRate → spread = 0 → no fee
        const offer = { id: 1, assetCode: 'REALT1', annualInterestRate: 12, investorRate: 12, paymentType: 'monthly' };
        const breakdown = [
            { investorId: 1, tokenBalance: 500, interestOwed: 500 },
        ];

        await CompanyPaymentService._recordPayments(offer, breakdown, 'tx_hash_nofee', 0, false);

        assert.strictEqual(calls.feeLogCreate.length, 0, 'No FeeLog when spread is 0');
    });
});

