/**
 * Safe USDC ↔ stroops conversion and Soroban contract fee invariants.
 *
 * Avoids IEEE-754 precision loss by using string/Decimal paths for large values.
 * Mirrors on-chain caps: YieldDistributor 70% fee cap, MaturitySettlement max_fee_bps.
 */

export const STROOPS_PER_USDC = 10_000_000;
export const STROOPS_DECIMALS = 7;
export const MAX_YIELD_SPREAD_RATIO = 0.7;
export const DEFAULT_SETTLEMENT_MAX_FEE_BPS = 500;

export class SpreadRatioExceededError extends Error {
    constructor(spreadRatio, annualRate, investorRate) {
        const minInvestorRate = annualRate > 0 ? round7(annualRate / (1 + MAX_YIELD_SPREAD_RATIO)) : 0;
        super(
            `Yield spread ratio ${spreadRatio.toFixed(4)} exceeds YieldDistributor contract cap of ${MAX_YIELD_SPREAD_RATIO}. ` +
            `With annual rate ${annualRate}%, investor rate must be at least ${minInvestorRate}% (annualRate / 1.7).`,
        );
        this.name = 'SpreadRatioExceededError';
        this.code = 'E_SPREAD_RATIO_EXCEEDED';
        this.httpStatus = 400;
        this.spreadRatio = spreadRatio;
        this.annualRate = annualRate;
        this.investorRate = investorRate;
    }
}

export class SettlementFeeCapExceededError extends Error {
    constructor(platformFee, totalPayout, maxFeeBps) {
        const maxAllowed = round7(totalPayout * maxFeeBps / 10_000);
        const ratioPct = totalPayout > 0 ? round7((platformFee / totalPayout) * 100) : 0;
        super(
            `Platform fee ${platformFee} USDC (${ratioPct}% of payout) exceeds settlement contract cap of ${maxFeeBps / 100}% ` +
            `(max allowed: ${maxAllowed} USDC on ${totalPayout} USDC payout).`,
        );
        this.name = 'SettlementFeeCapExceededError';
        this.code = 'E_SETTLEMENT_FEE_CAP';
        this.httpStatus = 400;
        this.platformFee = platformFee;
        this.totalPayout = totalPayout;
        this.maxFeeBps = maxFeeBps;
    }
}

export class DepositInsufficientError extends Error {
    constructor(depositAmount, requiredAmount) {
        super(
            `Deposit ${depositAmount} USDC is insufficient for settlement: requires at least ${requiredAmount} USDC ` +
            `(sum of per-investor payouts + platform fee).`,
        );
        this.name = 'DepositInsufficientError';
        this.code = 'E_DEPOSIT_INSUFFICIENT';
        this.httpStatus = 400;
        this.depositAmount = depositAmount;
        this.requiredAmount = requiredAmount;
    }
}

/** Round to Stellar USDC precision (7 decimal places). */
export const round7 = (v) => Math.round(Number(v) * STROOPS_PER_USDC) / STROOPS_PER_USDC;

/**
 * Normalize any USDC amount to a fixed 7-decimal string without float scaling.
 * @param {number|string|bigint|{ toFixed: function }} amount
 * @returns {string}
 */
export function usdcToFixedString(amount) {
    if (amount == null || amount === '') {
        throw new Error('Amount is required');
    }

    if (typeof amount === 'bigint') {
        const whole = amount / BigInt(STROOPS_PER_USDC);
        const frac = amount % BigInt(STROOPS_PER_USDC);
        const fracStr = frac.toString().padStart(STROOPS_DECIMALS, '0');
        return `${whole}.${fracStr}`;
    }

    if (typeof amount === 'object' && typeof amount.toFixed === 'function') {
        return amount.toFixed(STROOPS_DECIMALS);
    }

    if (typeof amount === 'number') {
        if (!Number.isFinite(amount)) {
            throw new Error(`Invalid USDC amount: ${amount}`);
        }
        return amount.toFixed(STROOPS_DECIMALS);
    }

    const raw = typeof amount === 'string' ? amount.trim() : String(amount);
    if (!/^-?\d+(\.\d+)?$/.test(raw)) {
        throw new Error(`Invalid USDC amount: ${amount}`);
    }

    const negative = raw.startsWith('-');
    const normalized = negative ? raw.slice(1) : raw;
    const [wholePart, fracPart = ''] = normalized.split('.');
    const fracPadded = `${fracPart}${'0'.repeat(STROOPS_DECIMALS)}`.slice(0, STROOPS_DECIMALS);
    return `${negative ? '-' : ''}${wholePart}.${fracPadded}`;
}

/**
 * Convert USDC (human-readable) to stroops (i128-safe BigInt).
 * Uses string arithmetic — safe for billion-token supplies.
 * @param {number|string|bigint|{ toFixed: function }} amount
 * @param {{ allowZero?: boolean }} [options]
 * @returns {bigint}
 */
export function usdcToStroops(amount, { allowZero = false } = {}) {
    const fixed = usdcToFixedString(amount);
    if (fixed.startsWith('-') || (!allowZero && fixed === '0.0000000')) {
        throw new Error('Amount must be a positive number');
    }

    const [wholePart, fracPart] = fixed.split('.');
    const combined = `${wholePart}${fracPart}`.replace(/^0+(?=\d)/, '') || '0';
    return BigInt(combined);
}

/** Alias for token supply deposits (same 7-decimal semantics as USDC). */
export const decimalSupplyToStroops = usdcToStroops;

/**
 * Convert stroops to USDC float (for display only — prefer BigInt for logic).
 * @param {bigint|number|string} stroops
 * @returns {number}
 */
export function stroopsToUsdc(stroops) {
    const value = typeof stroops === 'bigint' ? stroops : BigInt(stroops);
    const whole = value / BigInt(STROOPS_PER_USDC);
    const frac = value % BigInt(STROOPS_PER_USDC);
    return round7(Number(whole) + Number(frac) / STROOPS_PER_USDC);
}

/**
 * Compute yield spread ratio: (annualRate - investorRate) / investorRate.
 * @param {number} annualRate
 * @param {number} investorRate
 * @returns {number}
 */
export function computeSpreadRatio(annualRate, investorRate) {
    const annual = Number(annualRate) || 0;
    const investor = Number(investorRate) || 0;
    if (investor <= 0) return 0;
    const spreadPct = Math.max(0, annual - investor);
    return spreadPct / investor;
}

/**
 * Validate spread ratio against YieldDistributor contract 70% cap.
 * @throws {SpreadRatioExceededError}
 */
export function validateYieldSpreadRatio(spreadRatio, annualRate = null, investorRate = null) {
    if (spreadRatio > MAX_YIELD_SPREAD_RATIO) {
        throw new SpreadRatioExceededError(spreadRatio, annualRate, investorRate);
    }
}

/**
 * Validate platform fee against MaturitySettlement max_fee_bps cap.
 * @throws {SettlementFeeCapExceededError}
 */
export function validateSettlementFeeCap(platformFee, totalPayout, maxFeeBps = DEFAULT_SETTLEMENT_MAX_FEE_BPS) {
    if (platformFee <= 0 || totalPayout <= 0 || maxFeeBps <= 0) return;

    const maxAllowed = round7(totalPayout * maxFeeBps / 10_000);
    if (round7(platformFee) > maxAllowed) {
        throw new SettlementFeeCapExceededError(round7(platformFee), totalPayout, maxFeeBps);
    }
}

/**
 * Sum a numeric field across breakdown entries with round7.
 * @param {Array<Object>} breakdown
 * @param {string} field
 * @returns {number}
 */
export function sumBreakdownPayouts(breakdown, field = 'totalPayout') {
    const sum = (breakdown || []).reduce((s, row) => s + (Number(row[field]) || 0), 0);
    return round7(sum);
}

/**
 * Required deposit = Σ per-investor payouts + platform fee (round7 at each step).
 */
export function computeSettlementDepositAmount(breakdown, platformFee, field = 'totalPayout') {
    return round7(sumBreakdownPayouts(breakdown, field) + round7(platformFee));
}

const DEPOSIT_TOLERANCE = 0.0000001; // 1 stroop

/**
 * Ensure deposit covers per-investor payout sum + fee (not aggregate-rounded total).
 * @throws {DepositInsufficientError}
 */
export function validateDepositCoverage(depositAmount, breakdown, platformFee, field = 'totalPayout') {
    const required = computeSettlementDepositAmount(breakdown, platformFee, field);
    if (round7(depositAmount) + DEPOSIT_TOLERANCE < required) {
        throw new DepositInsufficientError(round7(depositAmount), required);
    }
}
