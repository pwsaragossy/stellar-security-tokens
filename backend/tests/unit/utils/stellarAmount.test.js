/**
 * stellarAmount.js — TDD for safe USDC/stroops conversion and contract fee invariants.
 *
 * Run: NODE_ENV=test node --import tsx --test tests/unit/utils/stellarAmount.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
    usdcToStroops,
    stroopsToUsdc,
    round7,
    computeSpreadRatio,
    validateYieldSpreadRatio,
    validateSettlementFeeCap,
    sumBreakdownPayouts,
    computeSettlementDepositAmount,
    validateDepositCoverage,
    decimalSupplyToStroops,
    MAX_YIELD_SPREAD_RATIO,
    DEFAULT_SETTLEMENT_MAX_FEE_BPS,
    SpreadRatioExceededError,
    SettlementFeeCapExceededError,
    DepositInsufficientError,
} from '../../../src/utils/stellarAmount.js';

describe('stellarAmount — usdcToStroops', () => {
    test('should_convert_whole_usdc_to_stroops', () => {
        assert.strictEqual(usdcToStroops(1), 10_000_000n);
        assert.strictEqual(usdcToStroops(100), 1_000_000_000n);
    });

    test('should_round_fractional_usdc_to_nearest_stroop', () => {
        assert.strictEqual(usdcToStroops(1.0000001), 10_000_001n);
        assert.strictEqual(usdcToStroops(0.0000001), 1n);
    });

    test('should_use_string_path_for_large_total_supply_without_precision_loss', () => {
        // 1 billion tokens × 1e7 stroops > Number.MAX_SAFE_INTEGER
        const supply = '1000000000.0000000';
        assert.strictEqual(decimalSupplyToStroops(supply), 10_000_000_000_000_000n);
    });

    test('should_handle_prisma_decimal_like_objects', () => {
        const decimalLike = { toFixed: (n) => (1000000000).toFixed(n) };
        assert.strictEqual(decimalSupplyToStroops(decimalLike), 10_000_000_000_000_000n);
    });

    test('should_reject_non_positive_amounts', () => {
        assert.throws(() => usdcToStroops(0), /positive/i);
        assert.throws(() => usdcToStroops(-1), /positive/i);
    });

    test('should_allow_zero_stroops_when_configured', () => {
        assert.strictEqual(usdcToStroops(0, { allowZero: true }), 0n);
    });
});

describe('stellarAmount — stroopsToUsdc', () => {
    test('should_convert_stroops_back_to_usdc', () => {
        assert.strictEqual(stroopsToUsdc(10_000_000n), 1);
        assert.strictEqual(stroopsToUsdc(1n), 0.0000001);
    });
});

describe('stellarAmount — yield spread ratio', () => {
    test('should_compute_spread_ratio_from_rates', () => {
        assert.strictEqual(computeSpreadRatio(12, 10), 0.2);
        assert.strictEqual(computeSpreadRatio(10, 5), 1.0);
    });

    test('should_return_zero_when_investor_rate_is_zero', () => {
        assert.strictEqual(computeSpreadRatio(12, 0), 0);
    });

    test('should_pass_when_spread_ratio_within_70_percent_cap', () => {
        assert.doesNotThrow(() => validateYieldSpreadRatio(0.2));
        assert.doesNotThrow(() => validateYieldSpreadRatio(MAX_YIELD_SPREAD_RATIO));
    });

    test('should_throw_when_spread_ratio_exceeds_70_percent_cap', () => {
        assert.throws(
            () => validateYieldSpreadRatio(0.875),
            SpreadRatioExceededError,
        );
        assert.throws(
            () => validateYieldSpreadRatio(1.0),
            (err) => err.code === 'E_SPREAD_RATIO_EXCEEDED' && err.httpStatus === 400,
        );
    });
});

describe('stellarAmount — settlement fee cap', () => {
    test('should_pass_when_fee_within_max_fee_bps', () => {
        // 5% of 105000 = 5250; fee 5000 OK
        assert.doesNotThrow(() =>
            validateSettlementFeeCap(5000, 105_000, DEFAULT_SETTLEMENT_MAX_FEE_BPS),
        );
    });

    test('should_throw_when_fee_exceeds_max_fee_bps', () => {
        // 9.5% of 105000 = 9975 > 5% cap (5250)
        assert.throws(
            () => validateSettlementFeeCap(9975, 105_000, DEFAULT_SETTLEMENT_MAX_FEE_BPS),
            SettlementFeeCapExceededError,
        );
    });

    test('should_allow_zero_fee', () => {
        assert.doesNotThrow(() => validateSettlementFeeCap(0, 100_000, 500));
    });
});

describe('stellarAmount — deposit coverage invariant', () => {
    const breakdown = [
        { totalPayout: 505.0025 },
        { totalPayout: 505.0025 },
    ];

    test('should_sum_per_investor_payouts_with_round7', () => {
        assert.strictEqual(sumBreakdownPayouts(breakdown), 1010.005);
    });

    test('should_compute_deposit_from_breakdown_sum_not_aggregate', () => {
        const platformFee = 100;
        assert.strictEqual(
            computeSettlementDepositAmount(breakdown, platformFee),
            1110.005,
        );
    });

    test('should_pass_when_deposit_covers_breakdown_plus_fee', () => {
        validateDepositCoverage(1110.005, breakdown, 100);
    });

    test('should_throw_when_deposit_based_on_aggregate_is_too_low', () => {
        // Aggregate totalPayout might be 1010.004999 while sum is 1010.005
        assert.throws(
            () => validateDepositCoverage(1110.004, breakdown, 100),
            DepositInsufficientError,
        );
    });
});

describe('stellarAmount — round7', () => {
    test('should_round_to_seven_decimal_places', () => {
        assert.strictEqual(round7(1.23456789), 1.2345679);
    });
});
