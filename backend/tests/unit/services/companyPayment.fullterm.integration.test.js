/**
 * Full-term amount + maturity-boundary correctness driving the REAL
 * CompanyPaymentService.calculateOwedAmount (not a replica) via mocked prisma.
 *
 * Complements companyPayment.fullterm.test.js (pure schedule). Here we prove the
 * real amount-wiring (offer.investments reduce → per-investor interestOwed →
 * totalOwed) AND that the COUNT-based maturity gate fires at exactly the term
 * length — i.e. coupon 12 is still owed at count 11, and no 13th is owed.
 *
 * Requires node's module-mock flag. Excluded from the no-flag `test:unit` run by
 * the `integration` in the filename; runs under `test:unit:all` / `test:ci`:
 *   cd backend && NODE_ENV=test node --experimental-test-module-mocks \
 *     --import tsx --test tests/unit/services/companyPayment.fullterm.integration.test.js
 */
import { test, describe, mock } from 'node:test';
import assert from 'node:assert';

const round7 = (v) => Math.round(Number(v) * 10_000_000) / 10_000_000;

// One $1000 locked investment, 1-year monthly offer, investorRate 10 / annual 12.
const OFFER = {
    id: 1,
    assetCode: 'REALT1',
    offerName: 'Test Offer',
    paymentType: 'monthly',
    annualInterestRate: 12,
    investorRate: 10,
    isTokenLocked: true,
    paymentDay: 15,
    createdAt: new Date('2026-01-15T00:00:00Z'),
    maturityDate: new Date('2027-01-15T00:00:00Z'),
    nextPaymentDue: null,
    lastPaymentDate: null,
    paymentDueStatus: 'current',
    periodicPaymentsCompleted: 0, // mutated across the test to walk the term
    investments: [
        {
            investorId: 1,
            usdcAmount: '1000',
            status: 'distributed',
            investor: { name: 'Investor One', stellarContractId: 'CINVESTOR1' },
        },
    ],
};

// Stub ONLY prisma — calculateOwedAmount's locked path needs no other I/O.
mock.module('../../../src/config/prisma.js', {
    defaultExport: {
        offer: {
            findUnique: async () => OFFER,
            update: async () => ({}),
            findMany: async () => [],
        },
    },
});

const { CompanyPaymentService: CPS } = await import(
    '../../../src/services/companyPayment.service.js'
);

describe('Periodic yield — REAL calculateOwedAmount across a full term', () => {
    test('per-period amount + maturity boundary fire at exactly the term length', async () => {
        const EXPECTED_MONTHLY = round7((1000 * (10 / 100)) / 12); // 8.3333333

        // ── Period 1 (count 0): real service computes the coupon ──
        OFFER.periodicPaymentsCompleted = 0;
        const r0 = await CPS.calculateOwedAmount(1);
        assert.strictEqual(r0.investorCount, 1);
        assert.strictEqual(round7(r0.breakdown[0].interestOwed), EXPECTED_MONTHLY, 'real per-period coupon');
        assert.strictEqual(round7(r0.totalOwed), EXPECTED_MONTHLY, 'totalOwed aggregates the breakdown');
        assert.strictEqual(r0.totalExpectedPayments, 12, 'real term length = 12');
        assert.strictEqual(r0.maturityReached, false);

        // ── Walk the count gate to the end of the term ──
        // At count 11, coupon 12 is STILL owed and flagged as the last period.
        OFFER.periodicPaymentsCompleted = 11;
        const r11 = await CPS.calculateOwedAmount(1);
        assert.strictEqual(r11.maturityReached, false, 'coupon 12 still owed at count 11');
        assert.strictEqual(r11.isLastPeriod, true, 'period 12 flagged as the last');
        assert.strictEqual(
            round7(r11.breakdown[0].interestOwed),
            EXPECTED_MONTHLY,
            'amount identical on the final period — no compounding/drift'
        );

        // At count 12, the term is complete — no 13th coupon is owed.
        OFFER.periodicPaymentsCompleted = 12;
        const r12 = await CPS.calculateOwedAmount(1);
        assert.strictEqual(r12.maturityReached, true, 'after 12 coupons → maturity reached, no 13th');
    });

    test('cumulative over the term ≈ the annual figure (within rounding)', async () => {
        OFFER.periodicPaymentsCompleted = 0;
        const r = await CPS.calculateOwedAmount(1);
        const monthly = round7(r.breakdown[0].interestOwed);
        const annual = round7(1000 * (10 / 100));
        // 12 identical real coupons sum to within a few stroops of the annual yield.
        assert.ok(
            Math.abs(monthly * 12 - annual) <= 12e-7,
            `12 × real coupon (${monthly}) = ${round7(monthly * 12)} ≈ annual ${annual}`
        );
    });
});
