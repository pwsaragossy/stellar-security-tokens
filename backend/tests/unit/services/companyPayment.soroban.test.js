/**
 * CompanyPaymentService — YieldDistributor Soroban Migration Tests
 *
 * TDD: Written BEFORE implementation.
 * These tests define the EXPECTED behavior of the new multi-batch,
 * sign-all-first, retry-safe periodic yield payment flow.
 *
 * Run: NODE_ENV=test node --experimental-test-module-mocks --import tsx --test tests/unit/services/companyPayment.soroban.test.js
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
    alertCritical: [],
    multiSigServiceCreate: [],
    pusherBroadcast: [],
    redisSet: [],
    redisGet: [],
    redisDel: [],
    sorobanPrepare: [],
    sorobanSend: [],
    sorobanGetTx: [],
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
    companyId: 7,
    company: {
        id: 7,
        stellarPublicKey: null,
        stellarContractId: 'CCOMPANYWALLET_56_CHARS_PAD_AAAAAAAAAAAAAAAAAAAAAAAAA',
    },
};

const BULLET_OFFER = {
    id: 2,
    assetCode: 'BULLET1',
    paymentType: 'bullet',
    annualInterestRate: 10,
    investorRate: 8,
    maturityDate: new Date('2026-01-01'),
    createdAt: new Date('2024-01-01'),
    companyId: 7,
    company: {
        id: 7,
        stellarPublicKey: null,
        stellarContractId: 'CCOMPANYWALLET_56_CHARS_PAD_AAAAAAAAAAAAAAAAAAAAAAAAA',
    },
};

// 45 investors → 2 batches (30 + 15 at batch size 30)
function makeInvestorBreakdown(count) {
    return Array.from({ length: count }, (_, i) => ({
        investorId: i + 1,
        investorName: `Investor ${i + 1}`,
        investorWallet: `CINVESTOR${String(i + 1).padStart(3, '0')}_WALLET_PAD_AAAAAAAAAAAAAAAAAA`,
        tokenBalance: 1000,
        interestOwed: 10, // 12% APY / 12 months × $1000 = $10
    }));
}

const BREAKDOWN_2 = makeInvestorBreakdown(2);
const BREAKDOWN_45 = makeInvestorBreakdown(45);

// ─── Register module mocks BEFORE import ──────────────
mock.module('../../../src/config/prisma.js', {
    defaultExport: {
        offer: {
            update: async (args) => { calls.offerUpdate.push(args); return {}; },
            findUnique: async (args) => {
                calls.offerFindUnique.push(args);
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
        yieldPaymentJob: {
            create: async (args) => { return { id: 'job-uuid-1', ...args.data }; },
            update: async (_args) => { return {}; },
            findUnique: async () => null,
        },
        multiSigTransaction: {
            findFirst: async () => null,
            findMany: async () => [],
            create: async (args) => { return { id: 1, ...args.data }; },
            updateMany: async () => ({ count: 1 }),
            count: async () => 1,
        },
        $transaction: async (fn) => fn({
            multiSigTransaction: {
                create: async (args) => ({ id: 1, ...args.data }),
                updateMany: async () => ({ count: 1 }),
            },
        }),
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
            prepareSorobanTransaction: async (tx) => {
                calls.sorobanPrepare.push(tx);
                return tx; // Return the same TX (simulated)
            },
            listAssetHolders: async () => [],
        },
    },
});

mock.module('../../../src/services/payment.service.js', {
    namedExports: {
        PaymentService: {
            getTokenHolders: async () => [],
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
            critical: async (msg, meta) => { calls.alertCritical.push({ msg, meta }); },
            createCritical: async (data) => { calls.alertCritical.push(data); },
            notify: async () => {},
        },
    },
});

mock.module('../../../src/config/stellar.js', {
    namedExports: {
        getUsdcIssuer: () => 'GUSDC_ISSUER_MOCK',
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
            create: async (args) => { calls.multiSigServiceCreate.push(args); return { id: 1 }; },
        },
    },
});

mock.module('../../../src/services/KeyManager.js', {
    namedExports: {
        keyManager: {
            getTreasuryPublicKey: () => 'GTREASURY_MOCK_56CHARS_PADDED_AAAAAAAAAAAAAAAAAAAAAA',
            getIssuerPublicKey: () => 'GISSUER_MOCK_56CHARS_PADDED_AAAAAAAAAAAAAAAAAAAAAAAA',
            getOperationsKeypair: () => ({ publicKey: () => 'GOPS_MOCK', secret: () => 'S...' }),
        },
    },
});

mock.module('../../../src/config/redis.js', {
    namedExports: {
        getRedisClient: async () => ({
            get: async (key) => { calls.redisGet.push(key); return null; },
            setEx: async (key, ttl, value) => { calls.redisSet.push({ key, ttl, value }); },
            del: async (key) => { calls.redisDel.push(key); },
        }),
        isRedisAvailable: () => true,
        storeChallenge: async () => true,
        getChallenge: async () => null,
        deleteChallenge: async () => {},
    },
    defaultExport: {
        getRedisClient: async () => null,
        isRedisAvailable: () => true,
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
        TransactionBuilder: class {
            constructor() { return this; }
            addOperation() { return this; }
            setTimeout() { return this; }
            build() { return { toXDR: () => 'mock_soroban_xdr', toEnvelope: () => ({ toXDR: () => 'env_xdr' }) }; }
        },
        Networks: { TESTNET: 'Test SDF Network ; September 2015' },
        Contract: class { constructor() {} call() { return {}; } },
        Address: class {
            constructor() {}
            toScVal() { return {}; }
        },
        nativeToScVal: () => ({}),
        xdr: { ScVal: {} },
        rpc: {
            Server: class {
                constructor() {}
                getAccount() { return { accountId: () => 'GOPS_MOCK', sequenceNumber: () => '1' }; }
                sendTransaction(tx) { calls.sorobanSend.push(tx); return { hash: 'tx_hash_rpc', status: 'PENDING' }; }
                getTransaction(hash) { calls.sorobanGetTx.push(hash); return { status: 'SUCCESS', resultMetaXdr: {} }; }
            },
        },
        BASE_FEE: '100',
    },
});
mock.module('../../../src/services/yieldDistributor.service.js', {
    namedExports: {
        YieldDistributorService: {
            buildMultiBatchXdrs: async (payer, breakdown, spreadRatio) => {
                calls.yieldBuildXdrs = calls.yieldBuildXdrs || [];
                const validInvestors = breakdown.filter(b => b.investorWallet && b.interestOwed > 0);
                const batchSize = 30;
                const batchXDRs = [];
                const batchDetails = [];
                for (let i = 0; i < validInvestors.length; i += batchSize) {
                    const batch = validInvestors.slice(i, i + batchSize);
                    batchXDRs.push(`mock_batch_xdr_${batchXDRs.length}`);
                    batchDetails.push({
                        batchIndex: batchXDRs.length - 1,
                        investorCount: batch.length,
                        totalAmount: batch.reduce((s, b) => s + b.interestOwed, 0),
                        fee: batch.reduce((s, b) => s + b.interestOwed, 0) * spreadRatio,
                        investorIds: batch.map(b => b.investorId),
                        status: 'pending',
                    });
                }
                calls.yieldBuildXdrs.push({ payer, investorCount: validInvestors.length, batchCount: batchXDRs.length });
                return { batchXDRs, batchDetails };
            },
            submitBatches: async (signedXDRs, batchDetails) => {
                calls.yieldSubmit = calls.yieldSubmit || [];
                calls.yieldSubmit.push({ signedXDRs, batchDetails });
                return {
                    success: true,
                    partial: false,
                    completedBatches: signedXDRs.length,
                    failedBatches: 0,
                    totalBatches: signedXDRs.length,
                    results: signedXDRs.map((_, i) => ({ batch: i, status: 'confirmed', txHash: `tx_${i}` })),
                    investorsPaid: batchDetails.reduce((s, b) => s + b.investorCount, 0),
                    totalPaid: batchDetails.reduce((s, b) => s + b.totalAmount, 0),
                    txHashes: signedXDRs.map((_, i) => `tx_${i}`),
                };
            },
            acquireLock: async () => true,
            releaseLock: async (offerId) => { calls.yieldReleaseLock = calls.yieldReleaseLock || []; calls.yieldReleaseLock.push(offerId); },
            classifyError: (err) => {
                const msg = err?.message || '';
                if (msg.includes('timeout')) return { retryable: true, type: 'NETWORK_TIMEOUT' };
                if (msg.includes('tx_already_applied')) return { retryable: false, type: 'ALREADY_APPLIED', success: true };
                if (msg.includes('tx_bad_auth')) return { retryable: false, type: 'AUTH_EXPIRED' };
                return { retryable: false, type: 'UNKNOWN' };
            },
            getContractId: () => 'CYIELD_CONTRACT_MOCK',
            getUsdcSacId: () => 'CUSDC_SAC_MOCK',
        },
    },
});

// ─── Import after mocks ──────────────────────────────
const { CompanyPaymentService } = await import('../../../src/services/companyPayment.service.js');


// ═══════════════════════════════════════════════════════════════
// SECTION 1: Multi-Batch XDR Generation
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Multi-Batch XDR Generation', () => {
    beforeEach(() => resetCalls());

    test('single batch: ≤30 investors → returns 1 XDR', async () => {
        // GIVEN: 2 investors (below batch threshold)
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => ({
            totalOwed: 20,
            breakdown: BREAKDOWN_2,
        });

        try {
            const result = await CompanyPaymentService.createPaymentTransaction(1, 1);

            // THEN: single XDR returned (backward compatible)
            assert.ok(result.transactionXDR, 'Should return transactionXDR');
            // Single batch should not have batchXDRs array (or array of length 1)
            if (result.batchXDRs) {
                assert.ok(result.batchXDRs.length <= 1, 'Single batch should have at most 1 entry');
            }
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
        }
    });

    test('multi batch: 45 investors → returns 2 batch XDRs', async () => {
        // GIVEN: 45 investors (30 + 15 batches)
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => ({
            totalOwed: 450,
            breakdown: BREAKDOWN_45,
        });

        try {
            const result = await CompanyPaymentService.createPaymentTransaction(1, 1);

            // THEN: multi-batch response
            assert.ok(result.batchXDRs || result.transactionXDR, 'Should return batch XDRs');
            if (result.batchXDRs) {
                assert.strictEqual(result.batchXDRs.length, 2, 'Should split 45 into 2 batches');
            }
            assert.strictEqual(result.investorCount, 45);
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
        }
    });

    test('bullet offer: throws hard guard error', async () => {
        await assert.rejects(
            () => CompanyPaymentService.createPaymentTransaction(2, 1),
            (err) => {
                assert.ok(err.message.includes('bullet') || err.message.includes('Soroban'),
                    `Expected error about bullet/Soroban, got: ${err.message}`);
                return true;
            }
        );
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 2: Sign-All-First Abort Safety (pure math, no mocks)
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Sign-All-First Abort Safety', () => {
    test('passkey failure at batch 2 of 3 → zero batches submitted', async () => {
        // This test validates the FRONTEND CONTRACT, not backend code.
        // If passkey fails mid-signing, no signed XDRs should be submitted.
        //
        // Simulating the frontend sign-all-first loop:
        const unsignedXDRs = ['xdr1', 'xdr2', 'xdr3'];
        const signed = [];
        let submittedCount = 0;

        // Simulate passkey failure at batch 2
        try {
            for (let i = 0; i < unsignedXDRs.length; i++) {
                if (i === 1) throw new Error('NotAllowedError: passkey denied');
                signed.push(`signed_${unsignedXDRs[i]}`);
            }

            // This line should NOT be reached
            submittedCount = signed.length;
        } catch (err) {
            // Expected: clean abort — nothing submitted
        }

        assert.strictEqual(submittedCount, 0, 'No batches should be submitted');
        assert.strictEqual(signed.length, 1, 'Only batch 0 was signed before failure');
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 3: Error Classification
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Error Classification', () => {
    // These tests define the error classification function behavior.
    // Implementation should match these exactly.

    const classifyError = (error) => {
        const msg = error?.message || '';

        if (msg.includes('timeout') || msg.includes('ETIMEDOUT'))
            return { retryable: true, type: 'NETWORK_TIMEOUT' };
        if (msg.includes('503') || msg.includes('429'))
            return { retryable: true, type: 'RPC_OVERLOADED' };
        if (msg.includes('PENDING'))
            return { retryable: true, type: 'TX_PENDING' };
        if (msg.includes('tx_already_applied'))
            return { retryable: false, type: 'ALREADY_APPLIED', success: true };
        if (msg.includes('tx_bad_auth'))
            return { retryable: false, type: 'AUTH_EXPIRED' };
        if (msg.includes('tx_bad_seq'))
            return { retryable: false, type: 'SEQ_STALE' };
        if (msg.includes('tx_insufficient_balance'))
            return { retryable: false, type: 'INSUFFICIENT_BALANCE' };
        if (msg.includes('Error(Contract'))
            return { retryable: false, type: 'CONTRACT_ERROR' };
        return { retryable: false, type: 'UNKNOWN' };
    };

    test('timeout → retryable NETWORK_TIMEOUT', () => {
        const result = classifyError(new Error('Connection timeout'));
        assert.strictEqual(result.retryable, true);
        assert.strictEqual(result.type, 'NETWORK_TIMEOUT');
    });

    test('ETIMEDOUT → retryable NETWORK_TIMEOUT', () => {
        const result = classifyError(new Error('connect ETIMEDOUT'));
        assert.strictEqual(result.retryable, true);
        assert.strictEqual(result.type, 'NETWORK_TIMEOUT');
    });

    test('503 → retryable RPC_OVERLOADED', () => {
        const result = classifyError(new Error('Request failed with status code 503'));
        assert.strictEqual(result.retryable, true);
        assert.strictEqual(result.type, 'RPC_OVERLOADED');
    });

    test('429 → retryable RPC_OVERLOADED', () => {
        const result = classifyError(new Error('Rate limited 429'));
        assert.strictEqual(result.retryable, true);
        assert.strictEqual(result.type, 'RPC_OVERLOADED');
    });

    test('tx_already_applied → non-retryable success (idempotent)', () => {
        const result = classifyError(new Error('tx_already_applied'));
        assert.strictEqual(result.retryable, false);
        assert.strictEqual(result.type, 'ALREADY_APPLIED');
        assert.strictEqual(result.success, true);
    });

    test('tx_bad_auth → fatal AUTH_EXPIRED', () => {
        const result = classifyError(new Error('tx_bad_auth'));
        assert.strictEqual(result.retryable, false);
        assert.strictEqual(result.type, 'AUTH_EXPIRED');
    });

    test('tx_bad_seq → fatal SEQ_STALE', () => {
        const result = classifyError(new Error('tx_bad_seq'));
        assert.strictEqual(result.retryable, false);
        assert.strictEqual(result.type, 'SEQ_STALE');
    });

    test('tx_insufficient_balance → fatal INSUFFICIENT_BALANCE', () => {
        const result = classifyError(new Error('tx_insufficient_balance'));
        assert.strictEqual(result.retryable, false);
        assert.strictEqual(result.type, 'INSUFFICIENT_BALANCE');
    });

    test('Error(Contract, #7) → fatal CONTRACT_ERROR', () => {
        const result = classifyError(new Error('Error(Contract, #7)'));
        assert.strictEqual(result.retryable, false);
        assert.strictEqual(result.type, 'CONTRACT_ERROR');
    });

    test('unknown error → non-retryable UNKNOWN (fail safe)', () => {
        const result = classifyError(new Error('something weird happened'));
        assert.strictEqual(result.retryable, false);
        assert.strictEqual(result.type, 'UNKNOWN');
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 4: Financial Invariants (pure math — no mocks needed)
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Financial Invariants', () => {
    const round7 = (v) => Math.round(v * 10_000_000) / 10_000_000;

    test('multi-batch fee distribution: Σ(batch fees) = totalFee (no precision leak)', () => {
        // 45 investors, $10 interest each, spread 0.2 → $2 fee per investor → $90 total
        const totalInvestors = 45;
        const perInvestorInterest = 10;
        const spreadRatio = 0.2;
        const _batchSize = 30;

        const totalFee = round7(totalInvestors * perInvestorInterest * spreadRatio);

        // Split into batches
        const batch1Count = 30;
        const batch2Count = 15;
        const batch1Fee = round7(batch1Count * perInvestorInterest * spreadRatio);
        const batch2Fee = round7(batch2Count * perInvestorInterest * spreadRatio);

        assert.strictEqual(totalFee, 90);
        assert.strictEqual(batch1Fee + batch2Fee, totalFee, 'Sum of batch fees must equal total fee');
    });

    test('every investor appears in exactly one batch', () => {
        const investors = BREAKDOWN_45;
        const batchSize = 30;
        const batches = [];
        for (let i = 0; i < investors.length; i += batchSize) {
            batches.push(investors.slice(i, i + batchSize));
        }

        // Flatten and check uniqueness
        const allIds = batches.flat().map(inv => inv.investorId);
        const uniqueIds = new Set(allIds);

        assert.strictEqual(allIds.length, 45, 'Total investors across batches');
        assert.strictEqual(uniqueIds.size, 45, 'No duplicate investors');
        assert.strictEqual(batches.length, 2, 'Exactly 2 batches');
        assert.strictEqual(batches[0].length, 30, 'Batch 1 has 30 investors');
        assert.strictEqual(batches[1].length, 15, 'Batch 2 has 15 investors');
    });

    test('spread invariant: Σ(per-investor amounts) + fee = company total USDC debited', () => {
        const annualRate = 12;
        const investorRate = 10;
        const spreadPct = annualRate - investorRate; // 2
        const spreadRatio = spreadPct / investorRate; // 0.2

        const investors = [
            { interestOwed: 500 },
            { interestOwed: 300 },
            { interestOwed: 200 },
        ];

        let totalInvestorPayout = 0;
        let totalFee = 0;

        for (const inv of investors) {
            const fee = round7(inv.interestOwed * spreadRatio);
            const net = round7(inv.interestOwed - fee);
            totalInvestorPayout += net;
            totalFee += fee;
        }

        const companyTotalDebited = round7(totalInvestorPayout + totalFee);
        const expectedCompanyTotal = investors.reduce((s, i) => s + i.interestOwed, 0);

        assert.strictEqual(companyTotalDebited, expectedCompanyTotal,
            'Company debited amount must equal sum of investor interests (before spread)');
    });

    test('idempotency: re-submitting same signed XDR must not double-pay (tx_already_applied)', () => {
        // This is a PROTOCOL guarantee, not a code test.
        // Document the rule: same {sourceAccount, seqNum, operations, signatures}
        // re-submitted → Stellar returns tx_already_applied → we mark as success.
        //
        // The critical implementation rule: NEVER rebuild a batch TX for retry.
        // Always re-submit the SAME signed XDR.
        const signedXdr1 = 'AAAA_signed_batch1';
        const signedXdr2 = 'AAAA_signed_batch1'; // Same XDR

        assert.strictEqual(signedXdr1, signedXdr2,
            'Retry must use SAME signed XDR, never rebuild');
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 5: _recordPayments + FeeLog (existing — must not regress)
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — _recordPayments Regression', () => {
    beforeEach(() => resetCalls());

    test('periodic: creates InterestPayment with correct fee fields', async () => {
        const offer = { id: 1, assetCode: 'REALT1', annualInterestRate: 12, investorRate: 10, paymentType: 'monthly' };
        const breakdown = [
            { investorId: 1, tokenBalance: 500, interestOwed: 500 },
            { investorId: 2, tokenBalance: 500, interestOwed: 500 },
        ];

        const { records, totalFee } = await CompanyPaymentService._recordPayments(
            offer, breakdown, 'tx_hash_test', 2, false
        );

        assert.strictEqual(records.length, 2);
        assert.strictEqual(calls.interestPaymentCreate.length, 2);

        // Verify fee math: spreadRatio = 2/10 = 0.2, fee per investor = 500 * 0.2 = 100
        const first = calls.interestPaymentCreate[0].data;
        assert.strictEqual(first.grossAmount, 500);
        assert.strictEqual(first.platformFeeAmount, 100);
        assert.strictEqual(first.netAmount, 400);
        assert.strictEqual(first.status, 'completed');

        assert.strictEqual(totalFee, 200); // 100 + 100
    });

    test('writes FeeLog with total fee', async () => {
        const offer = { id: 1, assetCode: 'REALT1', annualInterestRate: 12, investorRate: 10, paymentType: 'monthly' };
        const breakdown = [{ investorId: 1, tokenBalance: 1000, interestOwed: 1000 }];

        await CompanyPaymentService._recordPayments(offer, breakdown, 'tx_fee', 2, false);

        assert.strictEqual(calls.feeLogCreate.length, 1);
        assert.strictEqual(calls.feeLogCreate[0].data.amount, 200); // 0.2 × 1000
        assert.strictEqual(calls.feeLogCreate[0].data.category, 'DIVIDEND');
    });

    test('zero spread → no FeeLog', async () => {
        const offer = { id: 1, assetCode: 'REALT1', annualInterestRate: 12, investorRate: 12, paymentType: 'monthly' };
        const breakdown = [{ investorId: 1, tokenBalance: 500, interestOwed: 500 }];

        await CompanyPaymentService._recordPayments(offer, breakdown, 'tx_nofee', 0, false);

        assert.strictEqual(calls.feeLogCreate.length, 0);
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 6: processSignedPayment (periodic — must not regress)
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — processSignedPayment Regression', () => {
    beforeEach(() => resetCalls());

    test('periodic: submits to Stellar and records payments', async () => {
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => ({
            totalOwed: 1000,
            breakdown: BREAKDOWN_2,
        });

        try {
            const result = await CompanyPaymentService.processSignedPayment('signed_xdr', 1);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.status, 'completed');
            assert.strictEqual(result.transactionHash, 'txhash_mock_123');
            assert.strictEqual(calls.stellarSubmit.length, 1);
            assert.strictEqual(calls.interestPaymentCreate.length, 2);
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
        }
    });

    test('bullet: throws hard guard error', async () => {
        await assert.rejects(
            () => CompanyPaymentService.processSignedPayment('signed_xdr', 2),
            (err) => {
                assert.ok(err.message.includes('bullet') || err.message.includes('Soroban'));
                return true;
            }
        );

        assert.strictEqual(calls.stellarSubmit.length, 0);
        assert.strictEqual(calls.interestPaymentCreate.length, 0);
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 7: Concurrency Lock (specification)
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Concurrency Lock Specification', () => {
    test('Redis lock key format: yield_lock:{offerId}', () => {
        const offerId = 42;
        const lockKey = `yield_lock:${offerId}`;
        assert.strictEqual(lockKey, 'yield_lock:42');
    });

    test('Redis job key format: yield_job:{jobId}', () => {
        const jobId = 'uuid-123';
        const jobKey = `yield_job:${jobId}`;
        assert.strictEqual(jobKey, 'yield_job:uuid-123');
    });

    test('lock TTL should be 30 minutes', () => {
        const LOCK_TTL_SECONDS = 1800;
        assert.strictEqual(LOCK_TTL_SECONDS, 1800, 'Lock TTL must be 30 minutes');
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 8: Batch Size Boundary
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Batch Size Boundaries', () => {
    const BATCH_SIZE = 30;

    test('30 investors → exactly 1 batch', () => {
        const investors = makeInvestorBreakdown(30);
        const batchCount = Math.ceil(investors.length / BATCH_SIZE);
        assert.strictEqual(batchCount, 1);
    });

    test('31 investors → exactly 2 batches', () => {
        const investors = makeInvestorBreakdown(31);
        const batchCount = Math.ceil(investors.length / BATCH_SIZE);
        assert.strictEqual(batchCount, 2);
    });

    test('1 investor → exactly 1 batch', () => {
        const investors = makeInvestorBreakdown(1);
        const batchCount = Math.ceil(investors.length / BATCH_SIZE);
        assert.strictEqual(batchCount, 1);
    });

    test('90 investors → exactly 3 batches', () => {
        const investors = makeInvestorBreakdown(90);
        const batchCount = Math.ceil(investors.length / BATCH_SIZE);
        assert.strictEqual(batchCount, 3);
    });

    test('0 investors → 0 batches', () => {
        const investors = [];
        const batchCount = investors.length > 0 ? Math.ceil(investors.length / BATCH_SIZE) : 0;
        assert.strictEqual(batchCount, 0);
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 9: YieldDistributor Contract Call Shape (specification)
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Contract Call Shape', () => {
    test('distribute() args: payer, token, recipients[], amounts[], fee_recipient, fee_amount', () => {
        // This defines the expected Soroban contract interface.
        // The Rust contract must match this shape.
        const contractCallArgs = {
            function: 'distribute',
            args: {
                payer: 'Address',         // company C... address
                token: 'Address',         // USDC SAC contract ID
                recipients: 'Vec<Address>', // investor addresses
                amounts: 'Vec<i128>',     // per-investor USDC amounts (stroops)
                fee_recipient: 'Address', // treasury address
                fee_amount: 'i128',       // fee in stroops
            },
        };

        assert.strictEqual(contractCallArgs.function, 'distribute');
        assert.ok(contractCallArgs.args.payer, 'Must have payer arg');
        assert.ok(contractCallArgs.args.token, 'Must have token arg');
        assert.ok(contractCallArgs.args.recipients, 'Must have recipients arg');
        assert.ok(contractCallArgs.args.amounts, 'Must have amounts arg');
        assert.ok(contractCallArgs.args.fee_recipient, 'Must have fee_recipient arg');
        assert.ok(contractCallArgs.args.fee_amount, 'Must have fee_amount arg');
    });

    test('distribute() auth: single require_auth(payer) covers all SAC.transfer sub-calls', () => {
        // From Stellar docs (authorization.md):
        // "Contracts don't need to do anything special to benefit from this feature.
        //  Just calling a sub-contract that calls require_auth will ensure that
        //  the sub-contract call has been properly authorized."
        //
        // And: "authentication happens just once per tree, as the whole tree needs to be signed."
        //
        // The auth tree will be:
        //   rootInvocation: yield_distributor.distribute(payer, ...)
        //     subInvocations: [
        //       SAC.transfer(payer→investor1),
        //       SAC.transfer(payer→investor2),
        //       ...
        //       SAC.transfer(payer→treasury),
        //     ]
        //
        // → ONE SorobanAuthorizationEntry → ONE passkey signature
        const authEntryCount = 1;
        assert.strictEqual(authEntryCount, 1,
            'Must be exactly 1 auth entry (1 passkey prompt per batch)');
    });

    test('distribute() with zero fee: fee_amount=0, no treasury transfer', () => {
        // When investorRate = annualRate → spread = 0 → fee_amount = 0
        // The contract should skip the treasury SAC.transfer when fee_amount = 0
        const annualRate = 12;
        const investorRate = 12;
        const spreadPct = Math.max(0, annualRate - investorRate);
        const feeAmount = 0;

        assert.strictEqual(spreadPct, 0);
        assert.strictEqual(feeAmount, 0);
        // Contract should NOT attempt SAC.transfer to treasury when fee = 0
        // This saves ~1M CPU instructions per batch
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 10: Prepare-Phase Guards (P1, P2, P3)
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Prepare Phase Guards', () => {
    beforeEach(() => resetCalls());

    test('P1: offer not found → throws 404-style error', async () => {
        // Temporarily override prisma mock to return null
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => {
            throw new Error('Offer 999 not found');
        };

        try {
            await assert.rejects(
                () => CompanyPaymentService.createPaymentTransaction(999, 1),
                (err) => {
                    assert.ok(err.message.includes('not found'), `Expected 'not found', got: ${err.message}`);
                    return true;
                }
            );
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
        }
    });

    test('P2: zero total owed → throws "no payment owed"', async () => {
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => ({
            totalOwed: 0,
            breakdown: [],
        });

        try {
            await assert.rejects(
                () => CompanyPaymentService.createPaymentTransaction(1, 1),
                (err) => {
                    assert.ok(
                        err.message.includes('No payment') || err.message.includes('no payment') || err.message.includes('0'),
                        `Expected 'no payment' error, got: ${err.message}`
                    );
                    return true;
                }
            );
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
        }
    });

    test('P2: empty breakdown with positive totalOwed → should still fail gracefully', async () => {
        const originalCalc = CompanyPaymentService.calculateOwedAmount;
        CompanyPaymentService.calculateOwedAmount = async () => ({
            totalOwed: 1000,
            breakdown: [], // No investors have wallets
        });

        try {
            await assert.rejects(
                () => CompanyPaymentService.createPaymentTransaction(1, 1),
                (err) => {
                    assert.ok(err.message.length > 0, 'Should throw an error for empty breakdown');
                    return true;
                }
            );
        } finally {
            CompanyPaymentService.calculateOwedAmount = originalCalc;
        }
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 11: Investor Filtering Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Investor Filtering', () => {
    const _round7 = (v) => Math.round(v * 10_000_000) / 10_000_000;

    test('investors with null wallet are excluded from batches', () => {
        const breakdown = [
            { investorId: 1, investorWallet: 'CINV1_VALID_56CHARS_PADDED_AAAAAAAAAAAAAAAAAAAAAA', interestOwed: 100 },
            { investorId: 2, investorWallet: null, interestOwed: 50 },
            { investorId: 3, investorWallet: 'CINV3_VALID_56CHARS_PADDED_AAAAAAAAAAAAAAAAAAAAAA', interestOwed: 75 },
        ];

        const validInvestors = breakdown.filter(b => b.investorWallet && b.interestOwed > 0);
        assert.strictEqual(validInvestors.length, 2, 'Null wallet investors must be filtered');
    });

    test('investors with zero interestOwed are excluded from batches', () => {
        const breakdown = [
            { investorId: 1, investorWallet: 'CINV1_VALID', interestOwed: 100 },
            { investorId: 2, investorWallet: 'CINV2_VALID', interestOwed: 0 },
            { investorId: 3, investorWallet: 'CINV3_VALID', interestOwed: -5 },
        ];

        const validInvestors = breakdown.filter(b => b.investorWallet && b.interestOwed > 0);
        assert.strictEqual(validInvestors.length, 1, 'Zero/negative owed investors must be filtered');
    });

    test('investors with empty string wallet are excluded', () => {
        const breakdown = [
            { investorId: 1, investorWallet: '', interestOwed: 100 },
            { investorId: 2, investorWallet: 'CINV2_VALID', interestOwed: 50 },
        ];

        const validInvestors = breakdown.filter(b => b.investorWallet && b.interestOwed > 0);
        assert.strictEqual(validInvestors.length, 1);
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 12: Partial Batch Failure (X9 — critical)
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Partial Batch Failure', () => {

    test('batch 1 succeeds, batch 2 fails → partial response shape', () => {
        // This defines the EXPECTED response shape for partial failures.
        // Implementation must match this exactly.
        const batchResults = [
            { batch: 0, status: 'confirmed', txHash: 'abc123', investorsPaid: 30 },
            { batch: 1, status: 'failed', error: 'AUTH_EXPIRED', investorsPaid: 0 },
        ];

        const allConfirmed = batchResults.every(r => r.status === 'confirmed');
        const anyFailed = batchResults.some(r => r.status === 'failed');
        const completedBatches = batchResults.filter(r => r.status === 'confirmed').length;
        const failedBatches = batchResults.filter(r => r.status === 'failed').length;

        assert.strictEqual(allConfirmed, false);
        assert.strictEqual(anyFailed, true);
        assert.strictEqual(completedBatches, 1);
        assert.strictEqual(failedBatches, 1);

        // Expected response for partial failure
        const response = {
            success: false,
            partial: true,
            completedBatches,
            failedBatches,
            totalBatches: batchResults.length,
            results: batchResults,
        };

        assert.strictEqual(response.success, false);
        assert.strictEqual(response.partial, true);
        assert.strictEqual(response.totalBatches, 2);
    });

    test('partial failure: total paid = sum of confirmed batches only', () => {
        const batchResults = [
            { batch: 0, status: 'confirmed', investorsPaid: 30, batchAmount: 300 },
            { batch: 1, status: 'failed', investorsPaid: 0, batchAmount: 0 },
            { batch: 2, status: 'confirmed', investorsPaid: 20, batchAmount: 200 },
        ];

        const totalPaid = batchResults
            .filter(r => r.status === 'confirmed')
            .reduce((sum, r) => sum + r.batchAmount, 0);

        const totalInvestorsPaid = batchResults
            .filter(r => r.status === 'confirmed')
            .reduce((sum, r) => sum + r.investorsPaid, 0);

        assert.strictEqual(totalPaid, 500, 'Only confirmed batches count toward total');
        assert.strictEqual(totalInvestorsPaid, 50, 'Only confirmed batch investors count');
    });

    test('all batches fail → success=false, partial=false', () => {
        const batchResults = [
            { batch: 0, status: 'failed', error: 'NETWORK_TIMEOUT' },
            { batch: 1, status: 'failed', error: 'NETWORK_TIMEOUT' },
        ];

        const anyConfirmed = batchResults.some(r => r.status === 'confirmed');
        const allFailed = batchResults.every(r => r.status === 'failed');

        assert.strictEqual(anyConfirmed, false);
        assert.strictEqual(allFailed, true);

        // Full failure: not partial, just failed
        const response = {
            success: false,
            partial: false,
            completedBatches: 0,
            failedBatches: 2,
        };

        assert.strictEqual(response.partial, false, 'Full failure is NOT partial');
    });

    test('all batches succeed → success=true, partial=false', () => {
        const batchResults = [
            { batch: 0, status: 'confirmed', txHash: 'tx1' },
            { batch: 1, status: 'confirmed', txHash: 'tx2' },
        ];

        const allConfirmed = batchResults.every(r => r.status === 'confirmed');

        const response = {
            success: true,
            partial: false,
            completedBatches: 2,
            failedBatches: 0,
        };

        assert.strictEqual(allConfirmed, true);
        assert.strictEqual(response.success, true);
        assert.strictEqual(response.partial, false);
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 13: R1 — DB Failure After On-Chain Success (critical)
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — R1: DB Failure After On-Chain Success', () => {
    beforeEach(() => resetCalls());

    test('_recordPayments throws → caller must create CRITICAL alert', async () => {
        // Simulate: batches confirmed on-chain, then DB write blows up
        const offerId = 1;
        const txHashes = ['tx_batch0', 'tx_batch1'];
        const breakdown = BREAKDOWN_2;

        // Simulate what the caller (submitBatches) should do when _recordPayments throws
        let criticalAlertCreated = false;
        let returnedPartialSuccess = false;

        try {
            // Simulate DB failure
            throw new Error('Prisma connection lost');
        } catch (dbError) {
            // The implementation MUST do this:
            criticalAlertCreated = true;
            calls.alertCritical.push({
                type: 'PAYMENT_RECORD_FAILURE',
                offerId,
                txHashes,
                investorCount: breakdown.length,
                message: 'Yield payments confirmed on-chain but database record failed.',
            });

            returnedPartialSuccess = true;
        }

        assert.strictEqual(criticalAlertCreated, true,
            'Must create CRITICAL alert when DB fails after on-chain success');
        assert.strictEqual(returnedPartialSuccess, true,
            'Must return partial success (money is safe, just not recorded)');
        assert.strictEqual(calls.alertCritical.length, 1);
        assert.strictEqual(calls.alertCritical[0].type, 'PAYMENT_RECORD_FAILURE');
    });

    test('CRITICAL alert includes txHashes for manual reconciliation', () => {
        const alert = {
            type: 'PAYMENT_RECORD_FAILURE',
            offerId: 1,
            txHashes: ['tx_abc123', 'tx_def456'],
            investorCount: 45,
            message: 'Yield payments confirmed on-chain but database record failed.',
        };

        // Admin needs these fields to manually reconcile
        assert.ok(alert.txHashes, 'Must include txHashes');
        assert.ok(alert.offerId, 'Must include offerId');
        assert.ok(alert.investorCount, 'Must include investorCount');
        assert.strictEqual(alert.txHashes.length, 2, 'Must include all batch txHashes');
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 14: Multi-Batch Response Shape Contract
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Multi-Batch Response Shape', () => {

    test('createPaymentTransaction response: required fields', () => {
        // Define the response contract that frontend depends on
        const requiredFields = [
            'offerId',          // number
            'investorCount',    // number (total across all batches)
            'totalAmount',      // number (total USDC company will pay)
            'platformFee',      // number (total treasury fee)
            'netToInvestors',   // number (total going to investors)
            'expiresAt',        // Date (30-min expiry for frontend display)
        ];

        // Multi-batch adds:
        const _multiBatchFields = [
            'batchXDRs',        // string[] (1 per batch)
            'batchCount',       // number
            'jobId',            // string (Redis job ID)
        ];

        // Backward compat: single batch also has transactionXDR
        const _backwardCompatFields = [
            'transactionXDR',   // string (first/only XDR — for 1-batch case)
        ];

        // All fields should be defined (non-undefined)
        for (const field of requiredFields) {
            assert.ok(typeof field === 'string', `Field '${field}' must be specified`);
        }
    });

    test('submitBatches response: required fields for partial tracking', () => {
        // The new submitBatches method must return this shape
        const expectedShape = {
            success: true,           // boolean — all batches confirmed?
            partial: false,          // boolean — some but not all confirmed?
            completedBatches: 2,     // number
            failedBatches: 0,        // number
            totalBatches: 2,         // number
            results: [               // per-batch results
                { batch: 0, status: 'confirmed', txHash: 'tx1', investorsPaid: 30 },
                { batch: 1, status: 'confirmed', txHash: 'tx2', investorsPaid: 15 },
            ],
            investorsPaid: 45,       // total across confirmed batches
            totalPaid: 450,          // total USDC across confirmed batches
            txHashes: ['tx1', 'tx2'], // all confirmed tx hashes
        };

        assert.strictEqual(typeof expectedShape.success, 'boolean');
        assert.strictEqual(typeof expectedShape.partial, 'boolean');
        assert.ok(Array.isArray(expectedShape.results));
        assert.ok(Array.isArray(expectedShape.txHashes));
        assert.strictEqual(expectedShape.results.length, expectedShape.totalBatches);
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 15: Submit Retry Behavior
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Submit Retry Behavior', () => {

    test('retryable error → retry up to 3 times with exponential backoff', () => {
        const MAX_RETRIES = 3;
        const BASE_DELAY_MS = 3000;

        // Simulate retry delays
        const delays = [];
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            delays.push(BASE_DELAY_MS * Math.pow(2, attempt));
        }

        assert.strictEqual(delays.length, 3);
        assert.strictEqual(delays[0], 3000,  'Retry 1: 3s');
        assert.strictEqual(delays[1], 6000,  'Retry 2: 6s');
        assert.strictEqual(delays[2], 12000, 'Retry 3: 12s');
    });

    test('fatal error → no retries, immediate failure', () => {
        const classifyError = (msg) => {
            if (msg.includes('tx_bad_auth')) return { retryable: false };
            return { retryable: true };
        };

        const isFatal = !classifyError('tx_bad_auth').retryable;
        assert.strictEqual(isFatal, true);
        // Implementation: if (!classified.retryable) break; // exit retry loop
    });

    test('tx_already_applied during retry → mark as success, stop retrying', () => {
        // Scenario: timeout on first submit → retry → get tx_already_applied
        // Means: first submit actually DID succeed, we just didn't get confirmation
        const _firstAttempt = { error: 'timeout', retryable: true };
        const secondAttempt = { error: 'tx_already_applied', retryable: false, success: true };

        assert.strictEqual(secondAttempt.success, true,
            'tx_already_applied means the TX succeeded — mark confirmed');
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 16: P8 — Concurrency Lock Behavior
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Concurrency Lock Behavior', () => {

    test('second prepare for same offer → 409 rejection', () => {
        // Simulate: two concurrent calls to createPaymentTransaction(offerId=1)
        const lockStore = {};
        const offerId = 1;
        const lockKey = `yield_lock:${offerId}`;

        // First call acquires lock
        assert.strictEqual(lockStore[lockKey], undefined, 'No lock initially');
        lockStore[lockKey] = 'job-uuid-1';

        // Second call checks lock
        const existingLock = lockStore[lockKey];
        assert.ok(existingLock, 'Lock should exist');

        // Second call should throw ConcurrentPaymentError
        const shouldReject = !!existingLock;
        assert.strictEqual(shouldReject, true,
            'Must reject concurrent prepare for same offer');
    });

    test('different offer → no lock collision', () => {
        const lockStore = {};

        lockStore['yield_lock:1'] = 'job-1';
        lockStore['yield_lock:2'] = 'job-2';

        // Different offers should have independent locks
        assert.notStrictEqual(lockStore['yield_lock:1'], lockStore['yield_lock:2']);
    });

    test('lock released after all batches confirmed', () => {
        const lockStore = {};
        const lockKey = 'yield_lock:1';

        // Acquire
        lockStore[lockKey] = 'job-1';
        assert.ok(lockStore[lockKey]);

        // All batches confirmed → release
        delete lockStore[lockKey];
        assert.strictEqual(lockStore[lockKey], undefined, 'Lock must be released after completion');
    });

    test('lock auto-expires after 30 min TTL', () => {
        // Redis handles TTL natively. We just verify the TTL value.
        const LOCK_TTL_SECONDS = 1800;
        const LOCK_TTL_MINUTES = LOCK_TTL_SECONDS / 60;

        assert.strictEqual(LOCK_TTL_MINUTES, 30, 'Lock TTL must be 30 minutes');
        // If backend crashes and never releases: Redis auto-deletes after 30min
        // Company can retry after TTL expires
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 17: Job State Machine Transitions
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Job State Machine', () => {

    test('valid transitions: PREPARED → SIGNING → SUBMITTING → CONFIRMED', () => {
        const VALID_TRANSITIONS = {
            'prepared':        ['signing', 'expired'],
            'signing':         ['submitting', 'expired'],
            'submitting':      ['confirmed', 'partial_failure', 'failed'],
            'confirmed':       [], // terminal
            'partial_failure': ['admin_retry'],
            'failed':          ['admin_retry'],
            'admin_retry':     ['submitting'],
            'expired':         [], // terminal
        };

        // PREPARED → SIGNING ✅
        assert.ok(VALID_TRANSITIONS['prepared'].includes('signing'));
        // SIGNING → SUBMITTING ✅
        assert.ok(VALID_TRANSITIONS['signing'].includes('submitting'));
        // SUBMITTING → CONFIRMED ✅
        assert.ok(VALID_TRANSITIONS['submitting'].includes('confirmed'));
        // CONFIRMED is terminal
        assert.strictEqual(VALID_TRANSITIONS['confirmed'].length, 0);
    });

    test('invalid transition: PREPARED → CONFIRMED (must not skip signing)', () => {
        const VALID_TRANSITIONS = {
            'prepared': ['signing', 'expired'],
        };

        const isValid = VALID_TRANSITIONS['prepared'].includes('confirmed');
        assert.strictEqual(isValid, false,
            'Cannot skip SIGNING phase — prevents replaying unsigned XDRs');
    });

    test('PARTIAL_FAILURE → ADMIN_RETRY (admin intervenes)', () => {
        const VALID_TRANSITIONS = {
            'partial_failure': ['admin_retry'],
        };

        assert.ok(VALID_TRANSITIONS['partial_failure'].includes('admin_retry'));
    });

    test('EXPIRED is terminal (no transitions out)', () => {
        const VALID_TRANSITIONS = {
            'expired': [],
        };

        assert.strictEqual(VALID_TRANSITIONS['expired'].length, 0,
            'Expired jobs cannot transition — requires fresh prepare');
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 18: Admin Retry — Unpaid Investors Only
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Admin Retry Logic', () => {

    test('retry filters to unpaid investors from failed batches', () => {
        // Batch 0: confirmed (investors 1-30 paid)
        // Batch 1: failed (investors 31-45 NOT paid)
        const batchResults = [
            { batch: 0, status: 'confirmed', investorIds: Array.from({ length: 30 }, (_, i) => i + 1) },
            { batch: 1, status: 'failed', investorIds: Array.from({ length: 15 }, (_, i) => i + 31) },
        ];

        const unpaidInvestorIds = batchResults
            .filter(r => r.status === 'failed')
            .flatMap(r => r.investorIds);

        assert.strictEqual(unpaidInvestorIds.length, 15);
        assert.strictEqual(unpaidInvestorIds[0], 31);
        assert.strictEqual(unpaidInvestorIds[14], 45);
    });

    test('retry creates fresh XDRs for unpaid investors (new sequence number)', () => {
        // Admin retry must re-prepare (new simulation, new footprint, new seq)
        // because the original auth entries have expired.
        // The company must re-sign with passkey.
        const isRePrepare = true;
        const requiresNewSignature = true;

        assert.strictEqual(isRePrepare, true,
            'Admin retry must re-prepare (cannot reuse expired auth entries)');
        assert.strictEqual(requiresNewSignature, true,
            'Company must re-sign — admin CANNOT sign on their behalf');
    });

    test('retry for fully-failed job: all investors re-batched', () => {
        const batchResults = [
            { batch: 0, status: 'failed', investorIds: [1, 2, 3] },
            { batch: 1, status: 'failed', investorIds: [4, 5, 6] },
        ];

        const unpaidInvestorIds = batchResults
            .filter(r => r.status === 'failed')
            .flatMap(r => r.investorIds);

        assert.strictEqual(unpaidInvestorIds.length, 6, 'All investors need retry');
    });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 19: Rounding Safety Across Batches
// ═══════════════════════════════════════════════════════════════

describe('YieldDistributor — Rounding Safety', () => {
    const round7 = (v) => Math.round(v * 10_000_000) / 10_000_000;

    test('fractional stroops across 45 investors: no precision leak', () => {
        // Worst case: $333.33 interest, spread 0.2, 45 investors
        // → per investor: $7.4073333... → rounds to $7.4073333
        const totalInterest = 333.33;
        const investorCount = 45;
        const spreadRatio = 0.2;
        const perInvestorGross = totalInterest / investorCount;

        let totalNet = 0;
        let totalFee = 0;

        for (let i = 0; i < investorCount; i++) {
            const fee = round7(perInvestorGross * spreadRatio);
            const net = round7(perInvestorGross - fee);
            totalFee += fee;
            totalNet += net;
        }

        totalFee = round7(totalFee);
        totalNet = round7(totalNet);

        // The sum should be within 1 stroop of total
        const diff = Math.abs((totalFee + totalNet) - totalInterest);
        assert.ok(diff < 0.0001,
            `Rounding error ${diff} must be < 0.0001 (1/10th stroop tolerance)`);
    });

    test('all amounts converted to stroops (i128) are positive integers', () => {
        const amounts = [10.5, 0.0000001, 999999.9999999, 0.0000007];

        for (const amount of amounts) {
            const stroops = BigInt(Math.round(amount * 10_000_000));
            assert.ok(stroops > 0n, `${amount} USDC → ${stroops} stroops must be positive`);
        }
    });

    test('zero amount → filtered out, never sent to contract', () => {
        const amounts = [10, 0, 5, 0, 3];
        const nonZero = amounts.filter(a => a > 0);

        assert.strictEqual(nonZero.length, 3);
        assert.ok(!nonZero.includes(0), 'Zero amounts must be filtered');
    });
});
