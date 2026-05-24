/** Offer calculation utilities — single source of truth for yield math.
 *
 * Used by: InvestmentCalculator, YieldTimeline, InvestmentDialog, OfferDetails.
 * Formulas aligned with backend (tokenomics-expert SKILL.md v3).
 */

/** Stellar USDC precision — 7 decimal places = 1 stroop */
export const round7 = (v: number): number => Math.round(v * 10_000_000) / 10_000_000;

/** Payment frequency → periods per year. Bullet = 0 (no periodic payments). */
export const PERIODS_PER_YEAR: Record<string, number> = {
    monthly: 12,
    quarterly: 4,
    semi_annual: 2,
    annual: 1,
    bullet: 0,
};

/** Human-readable payment schedule labels (full form). */
export const PAYMENT_LABELS: Record<string, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    semi_annual: 'Semi-Annual',
    annual: 'Annual',
    bullet: 'Bullet (At Maturity)',
};

/** Short suffix labels for calculator display. */
export const PERIOD_LABELS: Record<string, string> = {
    monthly: '/mo',
    quarterly: '/qtr',
    semi_annual: '/half',
    annual: '/yr',
};

/**
 * Returns the investor-facing yield rate with null/NaN fallback.
 * Priority: investorRate → annualRate → 0
 */
export function getEffectiveRate(
    investorRate: number | null | undefined,
    annualRate: number | null | undefined,
): number {
    const rate = investorRate ?? annualRate ?? 0;
    return isNaN(rate) ? 0 : Number(rate);
}

/**
 * Compute periodic yield for display.
 * Calculate with round7() for Stellar precision, display with .toFixed(2).
 */
export function computePeriodicYield(
    amount: number,
    ratePercent: number,
    paymentType: string,
): number {
    const periods = PERIODS_PER_YEAR[paymentType] || 0;
    if (periods === 0 || ratePercent === 0 || amount <= 0) return 0;
    return round7(amount * (ratePercent / 100) / periods);
}

/**
 * Compute total projected return from now until maturity.
 * Returns null if offer is perpetual, matured, or zero-rate.
 */
export function computeTotalReturn(
    amount: number,
    ratePercent: number,
    maturityDate: string | null | undefined,
): { totalInterest: number; yearsRemaining: number } | null {
    if (!maturityDate || ratePercent === 0 || amount <= 0) return null;
    const yearsRemaining = (new Date(maturityDate).getTime() - Date.now()) / (365 * 24 * 60 * 60 * 1000);
    if (yearsRemaining <= 0) return null; // matured — no projection
    const totalInterest = round7(amount * (ratePercent / 100) * yearsRemaining);
    return { totalInterest, yearsRemaining };
}

/**
 * Compute annualized IRR via Newton-Raphson.
 *
 * Only meaningful for debt/collateral offers with maturity (where IRR ≠ APY).
 * Returns null for: equity/sale, perpetual, zero-rate, or non-convergence.
 * Formulas verified against tokenomics-expert SKILL.md v3.2.
 *
 * @param unitPrice     Price per token in USDC
 * @param ratePercent   Annual yield rate (investor-facing, from getEffectiveRate)
 * @param paymentType   'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'bullet'
 * @param maturityDate  ISO date string
 * @param offerType     'collateral' | 'sale'
 */
export function computeIRR(
    unitPrice: number,
    ratePercent: number,
    paymentType: string,
    maturityDate: string | null,
    offerType: 'collateral' | 'sale',
): number | null {
    // Guard: only meaningful for debt with maturity
    if (offerType !== 'collateral' || !maturityDate || ratePercent <= 0 || unitPrice <= 0) return null;

    const periods = PERIODS_PER_YEAR[paymentType] || 0;
    const matDate = new Date(maturityDate);
    const yearsToMaturity = (matDate.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000);
    if (yearsToMaturity <= 0) return null; // matured

    // Build cash flow array
    const cfs: number[] = [-unitPrice]; // t=0: pay unit price

    if (periods === 0) {
        // Bullet: no periodic payments, lump sum at maturity
        const totalPayout = unitPrice * (1 + (ratePercent / 100) * yearsToMaturity);
        cfs.push(totalPayout);
    } else {
        // Periodic: yield per period + principal return at end
        const totalPeriods = Math.round(yearsToMaturity * periods);
        if (totalPeriods <= 0) return null;
        const periodicYield = unitPrice * (ratePercent / 100) / periods;
        for (let i = 1; i < totalPeriods; i++) {
            cfs.push(periodicYield);
        }
        cfs.push(periodicYield + unitPrice); // last period: yield + principal
    }

    // Newton-Raphson: solve Σ CF_t / (1+r)^t = 0
    let r = ratePercent / 100 / (periods || 1); // seed: periodic rate for faster convergence
    for (let iter = 0; iter < 100; iter++) {
        let npv = 0, dnpv = 0;
        for (let t = 0; t < cfs.length; t++) {
            const disc = Math.pow(1 + r, t);
            npv += cfs[t] / disc;
            dnpv -= t * cfs[t] / Math.pow(1 + r, t + 1);
        }
        if (Math.abs(dnpv) < 1e-12) break; // derivative too small
        const step = npv / dnpv;
        r -= step;
        if (Math.abs(step) < 1e-7) {
            // Converged — convert periodic rate to annual
            const annualIRR = periods > 0
                ? (Math.pow(1 + r, periods) - 1) * 100
                : r * 100;
            if (!isFinite(annualIRR) || annualIRR < 0) return null;
            return Math.round(annualIRR * 10) / 10; // 1 decimal place
        }
    }
    return null; // didn't converge
}
