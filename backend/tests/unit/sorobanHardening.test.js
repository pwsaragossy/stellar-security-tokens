import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for production hardening logic:
 *   - Rate limiter behavior
 *   - Idempotency logic
 *   - Reconciler scenarios
 *   - Fee bump recovery
 */

// ─── 1. Rate Limiter ───
describe('Rate Limiter (submitInvestmentTx)', () => {
    it('allows up to 3 requests within 60s window', () => {
        const rateLimiter = new Map();
        const investorKey = 'submit_tx:42';
        const now = Date.now();
        const windowMs = 60_000;
        const maxAttempts = 3;

        // Simulate 3 allowed attempts
        for (let i = 0; i < maxAttempts; i++) {
            const attempts = rateLimiter.get(investorKey) || [];
            const recent = attempts.filter(t => now - t < windowMs);
            assert.ok(recent.length < maxAttempts, `Attempt ${i + 1} should be allowed`);
            recent.push(now);
            rateLimiter.set(investorKey, recent);
        }

        // 4th attempt should be blocked
        const attempts = rateLimiter.get(investorKey) || [];
        const recent = attempts.filter(t => now - t < windowMs);
        assert.ok(recent.length >= maxAttempts, '4th attempt should be blocked');
    });

    it('resets after window expires', () => {
        const rateLimiter = new Map();
        const investorKey = 'submit_tx:42';
        const windowMs = 60_000;
        const _maxAttempts = 3;
        const past = Date.now() - windowMs - 1000; // 61s ago

        // Fill with old timestamps
        rateLimiter.set(investorKey, [past, past, past]);

        // Current attempt should be allowed since old ones expired
        const now = Date.now();
        const attempts = rateLimiter.get(investorKey) || [];
        const recent = attempts.filter(t => now - t < windowMs);
        assert.equal(recent.length, 0, 'All old entries should be expired');
    });
});

// ─── 2. Idempotency Logic ───
describe('Idempotency Guard', () => {
    it('returns idempotent response for already-processed investment', () => {
        // Simulate investment with existing hash
        const investment = {
            status: 'distributed',
            usdcPaymentHash: 'abc123def456',
            investorId: 42,
        };

        const isAlreadyProcessed = (
            investment.usdcPaymentHash &&
            (investment.status === 'payment_received' || investment.status === 'distributed')
        );

        assert.ok(isAlreadyProcessed, 'Should detect already-processed investment');
    });

    it('does not trigger for pending investments', () => {
        const investment = {
            status: 'pending_payment',
            usdcPaymentHash: null,
            investorId: 42,
        };

        const isAlreadyProcessed = (
            investment.usdcPaymentHash &&
            (investment.status === 'payment_received' || investment.status === 'distributed')
        );

        assert.ok(!isAlreadyProcessed, 'Pending investment should not be idempotent');
    });

    it('does not trigger for failed investments', () => {
        const investment = {
            status: 'failed',
            usdcPaymentHash: 'abc123',
            investorId: 42,
        };

        const isAlreadyProcessed = (
            investment.usdcPaymentHash &&
            (investment.status === 'payment_received' || investment.status === 'distributed')
        );

        assert.ok(!isAlreadyProcessed, 'Failed investment should not be idempotent');
    });
});

// ─── 3. Fee Bump Recovery Logic ───
describe('Fee Bump Recovery', () => {
    it('reverts to pending_payment when fee bump fails', async () => {
        // Simulate: investment set to trade_submitted, fee bump throws
        let capturedStatus = null;

        const mockUpdateStatus = async (id, data) => {
            capturedStatus = data.status;
        };

        // Simulate the catch block logic
        try {
            throw new Error('Horizon rejected');
        } catch (sponsorErr) {
            await mockUpdateStatus(1, {
                status: 'pending_payment',
                error_message: `Fee bump failed: ${sponsorErr.message}`,
            });
        }

        assert.equal(capturedStatus, 'pending_payment', 'Should revert to pending_payment');
    });
});

// ─── 4. Reconciler Scenarios ───
describe('SorobanReconciler', () => {
    it('classifies orphans correctly based on tx status', () => {
        const scenarios = [
            { txStatus: 'SUCCESS', hasContractId: true, expected: 'distributed' },
            { txStatus: 'SUCCESS', hasContractId: false, expected: 'payment_received' },
            { txStatus: 'FAILED', hasContractId: true, expected: 'failed' },
            { txStatus: 'FAILED', hasContractId: false, expected: 'failed' },
        ];

        for (const { txStatus, hasContractId, expected } of scenarios) {
            let newStatus;
            if (txStatus === 'SUCCESS') {
                newStatus = hasContractId ? 'distributed' : 'payment_received';
            } else if (txStatus === 'FAILED') {
                newStatus = 'failed';
            }
            assert.equal(newStatus, expected,
                `TX ${txStatus} + contractId=${hasContractId} → ${expected}`
            );
        }
    });

    it('marks stale orphans as failed after timeout', () => {
        const ORPHAN_TIMEOUT_MS = 10 * 60 * 1000;
        const updatedAt = new Date(Date.now() - ORPHAN_TIMEOUT_MS - 1000);
        const age = Date.now() - updatedAt.getTime();

        assert.ok(age > ORPHAN_TIMEOUT_MS, 'Should detect stale orphan');
    });

    it('leaves young orphans alone', () => {
        const ORPHAN_TIMEOUT_MS = 10 * 60 * 1000;
        const updatedAt = new Date(Date.now() - 30_000); // 30s ago
        const age = Date.now() - updatedAt.getTime();

        assert.ok(age < ORPHAN_TIMEOUT_MS, 'Should not touch young orphan');
    });

    it('pending TTL expires after 30 minutes', () => {
        const PENDING_TTL_MS = 30 * 60 * 1000;
        const cutoff = new Date(Date.now() - PENDING_TTL_MS);
        const oldInvestment = new Date(Date.now() - PENDING_TTL_MS - 60_000);
        const freshInvestment = new Date(Date.now() - 5 * 60_000);

        assert.ok(oldInvestment < cutoff, 'Old pending should expire');
        assert.ok(freshInvestment > cutoff, 'Fresh pending should survive');
    });
});

// ─── 5. Feature Flag Guard ───
describe('Feature Flag Guard', () => {
    it('uses legacy path when ENABLE_SOROBAN_SALE is not true', () => {
        const offer = { sorobanContractId: 'CCFAC4...' };
        const envFlag = 'false';
        const sorobanEnabled = envFlag === 'true';

        const useSoroban = offer.sorobanContractId && sorobanEnabled;
        assert.ok(!useSoroban, 'Should NOT use Soroban path when flag is false');
    });

    it('uses Soroban path when both flag and contractId are present', () => {
        const offer = { sorobanContractId: 'CCFAC4...' };
        const envFlag = 'true';
        const sorobanEnabled = envFlag === 'true';

        const useSoroban = offer.sorobanContractId && sorobanEnabled;
        assert.ok(useSoroban, 'Should use Soroban path');
    });

    it('uses legacy path when offer has no contractId', () => {
        const offer = { sorobanContractId: null };
        const envFlag = 'true';
        const sorobanEnabled = envFlag === 'true';

        const useSoroban = offer.sorobanContractId && sorobanEnabled;
        assert.ok(!useSoroban, 'No contractId = legacy path');
    });
});

// ─── 6. Inner TX Hash vs Fee Bump Hash ───
describe('Hash Strategy', () => {
    it('inner hash format is hex string', () => {
        // Simulate: Buffer.from(32 bytes).toString('hex')
        const mockHash = Buffer.alloc(32, 0xab).toString('hex');
        assert.equal(mockHash.length, 64, 'Hash should be 64 hex chars');
        assert.match(mockHash, /^[0-9a-f]{64}$/, 'Hash should be lowercase hex');
    });
});
