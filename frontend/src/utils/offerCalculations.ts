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
