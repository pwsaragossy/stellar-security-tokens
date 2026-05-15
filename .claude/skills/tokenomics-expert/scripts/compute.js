/**
 * Independent Tokenomics Calculator
 *
 * Zero-dependency module that replicates the platform's yield math
 * from raw inputs. Use this to compute EXPECTED values for test
 * assertions — never trust the service code to validate itself.
 *
 * Source of truth: companyPayment.service.js (calculateBulletPayment,
 * calculateOwedAmount, getPeriodsPerYear)
 *
 * Precision: All financial amounts use round7 (Stellar USDC stroop precision).
 * round2 is retained for display-only helpers (year fractions, proportion display).
 */

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/**
 * round7 — Stellar USDC precision: Math.round(value * 10_000_000) / 10_000_000
 * (7 decimal places = 1 stroop, USDC's on-chain minimum unit).
 *
 * Replaces round2 for yield/payout math. round2 caused a ±$0.01 rounding
 * leak in multi-investor proportional splits.
 *
 * Multi-investor invariant: Σ(round7(part_i)) === round7(total)  (±1 stroop max)
 */
export function round7(value) {
  return Math.round(value * 10_000_000) / 10_000_000;
}

/**
 * round2 — cents precision: Math.round(value * 100) / 100
 *
 * DEPRECATED for yield/payout math (use round7). Retained for display helpers
 * where stroop precision is unnecessary.
 */
export function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Bullet payout: principal + simple interest over holding period.
 *
 * NOTE: `annualRate` here is whichever rate you want to compute against:
 *   - Pass `investorRate` to get the investor's net payout.
 *   - Pass `annualRate` to get the company's gross outflow.
 *   - The spread (annualRate − investorRate) × years × principal = platform fee.
 *
 * @param {number} invested   - USDC invested (e.g. 100)
 * @param {number} annualRate - Rate in percent (e.g. 12.0 for 12%)
 * @param {Date}   startDate  - offer.createdAt
 * @param {Date}   maturityDate - offer.maturityDate
 * @returns {{ principal, interest, totalPayout, yearsHeld }}
 */
export function bulletPayout(invested, annualRate, startDate, maturityDate) {
  const yearsHeld = (maturityDate - startDate) / MS_PER_YEAR;
  const interest = invested * (annualRate / 100) * yearsHeld;
  const totalPayout = invested + round7(interest);
  return {
    principal: invested,
    interest: round7(interest),
    totalPayout,
    yearsHeld: round2(yearsHeld * 365) / 365, // display only
  };
}

/**
 * Per-investor bullet split (proportional)
 *
 * @param {Array<{investorId, usdcAmount}>} investments
 * @param {number} annualRate
 * @param {Date}   startDate
 * @param {Date}   maturityDate
 * @returns {{ totalPrincipal, totalInterest, totalPayout, breakdown[] }}
 */
export function bulletBreakdown(investments, annualRate, startDate, maturityDate) {
  const totalInvested = investments.reduce((s, i) => s + i.usdcAmount, 0);
  const yearsToMaturity = (maturityDate - startDate) / MS_PER_YEAR;
  const totalInterest = totalInvested * (annualRate / 100) * yearsToMaturity;

  const breakdown = investments.map(inv => {
    const proportion = inv.usdcAmount / totalInvested;
    const interest = round7(totalInterest * proportion);
    return {
      investorId: inv.investorId,
      principal: inv.usdcAmount,
      interest,
      totalPayout: round7(inv.usdcAmount + interest),
    };
  });

  return {
    totalPrincipal: totalInvested,
    totalInterest: round7(totalInterest),
    totalPayout: totalInvested + round7(totalInterest),
    breakdown,
  };
}

/**
 * Monthly/quarterly dividend per investor per period
 *
 * @param {number} invested    - USDC invested
 * @param {number} annualRate  - Annual rate in percent
 * @param {string} paymentType - 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
 * @returns {number} Interest owed this period (round7)
 */
export function dividendPerPeriod(invested, annualRate, paymentType = 'monthly') {
  const periods = { monthly: 12, quarterly: 4, semi_annual: 2, annual: 1, bullet: 1 };
  const periodsPerYear = periods[paymentType] || 12;
  return round7(invested * (annualRate / 100) / periodsPerYear);
}

/**
 * Platform fee on yield (legacy DIVIDEND_FEE_PERCENT model — DEPRECATED).
 *
 * The current platform uses the `investorRate` spread model instead: the company
 * pays `annualRate`, the investor receives `investorRate`, and the platform keeps
 * the difference (computed off-chain at payout time). Use `bulletPayout` /
 * `dividendPerPeriod` with the appropriate rate to compute either side.
 *
 * Retained for backwards compatibility with tests of the old fee_bps flow.
 *
 * @param {number} interest    - Total interest amount
 * @param {number} feePercent  - Fee as percentage (e.g. 2.0 = 2%)
 * @returns {{ fee, netToInvestors }}
 */
export function platformFee(interest, feePercent = 0) {
  const fee = round7(interest * (feePercent / 100));
  return { fee, netToInvestors: round7(interest - fee) };
}

// ─── Risk & Default ─────────────────────────────────────────

const GRACE_PERIOD_DAYS = 10;
const LATE_FEE_PERCENT_PER_DAY = 0;  // MVP: disabled
const DEFAULT_FEE_PERCENT = 0;       // MVP: disabled

/**
 * Late fee accrual (daily, during grace period)
 * Source: companyPayment.service.js:947
 *
 * @param {number} totalOwed - Total owed amount
 * @param {number} daysOverdue - Days past due
 * @param {number} [ratePerDay] - Override daily rate (default: MVP=0)
 * @returns {number}
 */
export function lateFee(totalOwed, daysOverdue, ratePerDay = LATE_FEE_PERCENT_PER_DAY) {
  return round7(totalOwed * ratePerDay * daysOverdue);
}

/**
 * Default fee (one-time, after grace period breached)
 * Source: companyPayment.service.js:926
 *
 * @param {number} totalOwed - Total payout owed
 * @param {number} [rate] - Override rate (default: MVP=0)
 * @returns {number}
 */
export function defaultFee(totalOwed, rate = DEFAULT_FEE_PERCENT) {
  return round7(totalOwed * rate);
}

/**
 * Pro-rata collateral share per investor
 *
 * @param {number} investorAmount - Investor's investment or token balance
 * @param {number} totalAmount - Sum of all investments or token balances
 * @param {number} collateralValue - Total collateral value
 * @returns {{ proportion, collateralShare }}
 */
export function collateralShare(investorAmount, totalAmount, collateralValue) {
  const proportion = totalAmount > 0 ? investorAmount / totalAmount : 0;
  return {
    proportion: round2(proportion * 10000) / 10000, // display precision
    collateralShare: round7(collateralValue * proportion),
  };
}

/**
 * Check if an offer should be considered defaulted
 *
 * @param {Date} dueDate - nextPaymentDue or maturityDate
 * @param {Date} [now] - Current date (default: new Date())
 * @param {number} [graceDays] - Override grace period
 * @returns {{ daysOverdue, status: 'current'|'due'|'overdue'|'defaulted' }}
 */
export function paymentDueStatus(dueDate, now = new Date(), graceDays = GRACE_PERIOD_DAYS) {
  const daysOverdue = Math.floor((now - dueDate) / (24 * 60 * 60 * 1000));
  if (daysOverdue <= 0) return { daysOverdue: 0, status: 'current' };
  if (daysOverdue === 0) return { daysOverdue: 0, status: 'due' };
  if (daysOverdue <= graceDays) return { daysOverdue, status: 'overdue' };
  return { daysOverdue, status: 'defaulted' };
}
