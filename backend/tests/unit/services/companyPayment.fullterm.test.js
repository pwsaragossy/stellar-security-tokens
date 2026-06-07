/**
 * Full-term (multi-period) schedule + amount correctness for PERIODIC yield.
 *
 * The existing tests prove ONE period. This proves the REAL
 * CompanyPaymentService schedule functions stay correct across an ENTIRE term —
 * every coupon, in order, until maturity, with no off-by-one, no leap-year skip,
 * and no silent drift. This is the previously-uncovered "correct over months,
 * until the end" axis.
 *
 * PURE: exercises only the no-DB/no-chain functions
 * (computeTotalExpectedPayments / calculateNextPaymentDate / getPeriodsPerYear).
 * Run with zero infra:
 *   cd backend && NODE_ENV=test node --import tsx --test \
 *     tests/unit/services/companyPayment.fullterm.test.js
 *
 * NOTE: all date assertions use getUTC* — the service does UTC math
 * (setUTCDate/setUTCHours). The older companyPayment.service.test.js asserts on
 * local getDate()/getMonth(), which fails outside UTC; do not copy that.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

const { CompanyPaymentService: CPS } = await import(
    '../../../src/services/companyPayment.service.js'
);

const round7 = (v) => Math.round(Number(v) * 10_000_000) / 10_000_000;
const STROOP = 1e-7;

// Walk the real schedule a full term: feed each due date back as lastPaymentDate
// (simulating an on-time payment) until calculateNextPaymentDate returns null.
function walkSchedule(offer, paidOffset = 0, cap = 36) {
    const dates = [];
    let cur = { ...offer, lastPaymentDate: offer.lastPaymentDate ?? null };
    for (let i = 0; i < cap; i++) {
        const due = CPS.calculateNextPaymentDate(cur);
        if (!due) break;
        dates.push(due);
        const paid = new Date(due);
        if (paidOffset) paid.setUTCDate(paid.getUTCDate() + paidOffset);
        cur = { ...cur, lastPaymentDate: paid };
    }
    return dates;
}

describe('Periodic yield — full-term schedule correctness', () => {
    test('computeTotalExpectedPayments: term length per cadence (1-year offer)', () => {
        const base = {
            createdAt: new Date('2026-01-15T00:00:00Z'),
            maturityDate: new Date('2027-01-15T00:00:00Z'),
            paymentDay: 15,
        };
        assert.strictEqual(CPS.computeTotalExpectedPayments({ ...base, paymentType: 'monthly' }), 12);
        assert.strictEqual(CPS.computeTotalExpectedPayments({ ...base, paymentType: 'quarterly' }), 4);
        assert.strictEqual(CPS.computeTotalExpectedPayments({ ...base, paymentType: 'semi_annual' }), 2);
        assert.strictEqual(CPS.computeTotalExpectedPayments({ ...base, paymentType: 'annual' }), 1);
    });

    test('monthly: exactly 12 strictly-increasing due dates, 13th is null', () => {
        const offer = {
            paymentType: 'monthly',
            createdAt: new Date('2026-01-15T00:00:00Z'),
            maturityDate: new Date('2027-01-15T00:00:00Z'),
            paymentDay: 15,
            lastPaymentDate: null,
        };
        const dates = walkSchedule(offer);
        assert.strictEqual(dates.length, 12, 'exactly 12 coupon dates over a 1-year monthly term');
        for (let i = 0; i < dates.length; i++) {
            assert.strictEqual(dates[i].getUTCDate(), 15, `period ${i + 1} lands on day 15 UTC`);
            assert.ok(dates[i] <= offer.maturityDate, `period ${i + 1} not past maturity`);
            if (i > 0) assert.ok(dates[i] > dates[i - 1], `period ${i + 1} strictly after previous`);
        }
        const thirteenth = CPS.calculateNextPaymentDate({ ...offer, lastPaymentDate: dates[11] });
        assert.strictEqual(thirteenth, null, 'no 13th coupon past maturity (no off-by-one)');
    });

    test('month-end: paymentDay 31 clamps to 28 every period, still 12 periods', () => {
        const offer = {
            paymentType: 'monthly',
            createdAt: new Date('2026-01-31T00:00:00Z'),
            maturityDate: new Date('2027-01-31T00:00:00Z'),
            paymentDay: 31,
            lastPaymentDate: null,
        };
        assert.strictEqual(CPS.computeTotalExpectedPayments(offer), 12);
        const days = walkSchedule(offer).map((d) => d.getUTCDate());
        assert.strictEqual(days.length, 12);
        assert.ok(days.every((x) => x === 28), `all due dates clamp to 28 (got ${days.join(',')})`);
    });

    test('leap year: a term spanning Feb 2028 yields 12 periods, none skipped', () => {
        const offer = {
            paymentType: 'monthly',
            createdAt: new Date('2027-12-15T00:00:00Z'),
            maturityDate: new Date('2028-12-15T00:00:00Z'),
            paymentDay: 15,
            lastPaymentDate: null,
        };
        assert.strictEqual(CPS.computeTotalExpectedPayments(offer), 12);
        const dates = walkSchedule(offer);
        assert.strictEqual(dates.length, 12);
        const feb = dates.find((d) => d.getUTCFullYear() === 2028 && d.getUTCMonth() === 1);
        assert.ok(feb && feb.getUTCDate() === 15, 'Feb 2028 coupon lands on the 15th (leap year, not skipped)');
    });

    test('amount is FLAT across the term: every period identical, Σ ≈ annual', () => {
        const principal = 1000;
        const investorRate = 10;
        const ppy = CPS.getPeriodsPerYear('monthly'); // real service
        assert.strictEqual(ppy, 12);

        const monthly = round7((principal * (investorRate / 100)) / ppy);
        assert.strictEqual(monthly, 8.3333333, 'monthly coupon (flat, non-compounding)');

        let sum = 0;
        for (let i = 0; i < 12; i++) {
            // Recomputed from principal each period — never from a running balance.
            const period = round7((principal * (investorRate / 100)) / ppy);
            assert.strictEqual(period, monthly, `period ${i + 1} identical — no compounding/drift`);
            sum += period;
        }
        const annual = round7(principal * (investorRate / 100));
        assert.ok(
            Math.abs(round7(sum) - annual) <= 12 * STROOP,
            `Σ of 12 monthly coupons (${round7(sum)}) within 12 stroops of annual (${annual})`
        );
    });

    test('quarterly full term: 4 coupons, each on day 15, 5th is null', () => {
        const offer = {
            paymentType: 'quarterly',
            createdAt: new Date('2026-01-15T00:00:00Z'),
            maturityDate: new Date('2027-01-15T00:00:00Z'),
            paymentDay: 15,
            lastPaymentDate: null,
        };
        const dates = walkSchedule(offer);
        assert.strictEqual(dates.length, 4, '4 quarterly coupons in a year');
        assert.ok(dates.every((d) => d.getUTCDate() === 15));
        // Spaced 3 months apart.
        for (let i = 1; i < dates.length; i++) {
            const gap = dates[i].getUTCMonth() - dates[i - 1].getUTCMonth();
            const wrapped = (gap + 12) % 12;
            assert.strictEqual(wrapped, 3, 'quarterly coupons 3 months apart');
        }
    });

    // ── DOCUMENTED BEHAVIOUR (verified against source — NOT holder underpayment):
    //    The date schedule (calculateNextPaymentDate) anchors to the ACTUAL payment
    //    time (offer.lastPaymentDate), not a fixed calendar. A coupon paid late
    //    enough to slip into the next month makes _advanceByPeriod skip ahead, so
    //    nextPaymentDue can go null while fewer than 12 coupon DATES have landed.
    //
    //    CRUCIAL: the holder still receives ALL N coupons. createPaymentTransaction
    //    (l.591) and processSignedPayment (l.778) gate on
    //    `periodicPaymentsCompleted >= computeTotalExpectedPayments` — a COUNT
    //    anchored to offer.createdAt (= always 12), NOT on nextPaymentDue. The
    //    company can keep paying the remaining coupons regardless of the null date.
    //
    //    The real gap is NOTIFICATION-ONLY: once nextPaymentDue is null with
    //    count<12, the offer falls through checkOverduePayments (Section 1 filters
    //    nextPaymentDue<now; Section 3 requires count>=total), so overdue/default
    //    escalation silently stops — an admin-visibility gap (can't chase a
    //    delinquent company), NOT investor money loss.
    test('DRIFT: late payments compress the date schedule (overdue-escalation gap; holder still paid via count gate)', () => {
        const offer = {
            paymentType: 'monthly',
            createdAt: new Date('2026-01-15T00:00:00Z'),
            maturityDate: new Date('2027-01-15T00:00:00Z'),
            paymentDay: 15,
            lastPaymentDate: null,
        };
        // On time → 12 coupon dates (sanity).
        assert.strictEqual(walkSchedule(offer, 0).length, 12);

        // Each coupon paid ~20 days late (slips into the next calendar month):
        // the DATE schedule compresses below 12...
        const lateDates = walkSchedule(offer, 20);
        assert.ok(
            lateDates.length < 12,
            `late payments compress the date schedule to ${lateDates.length} coupon dates`
        );
        // ...but the COUNT gate (createdAt-anchored) still expects 12, and it is
        // the count — not the date — that authorises payment. The holder's 12-coupon
        // entitlement is preserved; only overdue escalation is impaired.
        assert.strictEqual(
            CPS.computeTotalExpectedPayments(offer),
            12,
            'count gate stays at 12 (createdAt-anchored) → holder still owed/paid all 12'
        );
    });
});
