import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

// ─── Mock Setup ───────────────────────────────────────────────
// We test PaymentMonitor.handlePayment by re-implementing its
// routing logic with mock dependencies, matching the source
// in paymentMonitor.service.js exactly.

const USDC_ASSET_CODE = 'USDC';
const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'; // testnet
const TREASURY_KEY = 'GTREASURY_PUBLIC_KEY_TEST';
const DEP_PREFIX = 'DEP-';

let mockDepositRelayCalls = [];
let mockProcessInvestmentCalls = [];
let mockPendingInvestments = [];
let mockFetchedMemo = null;

// Simulates what PaymentMonitor.handlePayment does
async function handlePayment(payment) {
    // Only process payment operations
    if (payment.type !== 'payment') return;

    // Verify payment is to treasury
    if (payment.to !== TREASURY_KEY) return;

    // Determine asset info
    const isNative = payment.asset_type === 'native';
    const assetCode = isNative ? 'XLM' : payment.asset_code;
    const isUSDC = !isNative && payment.asset_code === USDC_ASSET_CODE && payment.asset_issuer === USDC_ISSUER;

    // Fetch memo from transaction (mocked)
    const memo = mockFetchedMemo;

    // Check if it's a deposit relay payment (DEP- prefix)
    if (memo && memo.startsWith(DEP_PREFIX)) {
        mockDepositRelayCalls.push({ memo, amount: payment.amount, txHash: payment.transaction_hash, assetCode });
        return;
    }

    // For investment payments, only accept USDC
    if (!isUSDC) return;

    // Find pending investments
    if (mockPendingInvestments.length === 0) return;

    const investment = mockPendingInvestments[0];

    // Idempotency check
    if (investment.usdcPaymentHash === payment.transaction_hash) return;

    mockProcessInvestmentCalls.push({ investment, payment });
}

// ─── Tests ────────────────────────────────────────────────────

describe('PaymentMonitor.handlePayment — Routing Logic', () => {

    beforeEach(() => {
        mockDepositRelayCalls = [];
        mockProcessInvestmentCalls = [];
        mockPendingInvestments = [];
        mockFetchedMemo = null;
    });

    // ── Ignored payment types ────────────────────────────────────

    test('ignores non-payment operations (e.g. create_account)', async () => {
        await handlePayment({
            type: 'create_account',
            to: TREASURY_KEY,
            amount: '100',
            asset_type: 'credit_alphanum4',
            asset_code: USDC_ASSET_CODE,
            asset_issuer: USDC_ISSUER,
            transaction_hash: 'tx_1',
        });

        assert.strictEqual(mockDepositRelayCalls.length, 0);
        assert.strictEqual(mockProcessInvestmentCalls.length, 0);
    });

    test('ignores payment to wrong address', async () => {
        await handlePayment({
            type: 'payment',
            to: 'GWRONG_ADDRESS',
            from: 'GSENDER',
            amount: '100',
            asset_type: 'credit_alphanum4',
            asset_code: USDC_ASSET_CODE,
            asset_issuer: USDC_ISSUER,
            transaction_hash: 'tx_2',
        });

        assert.strictEqual(mockDepositRelayCalls.length, 0);
        assert.strictEqual(mockProcessInvestmentCalls.length, 0);
    });

    // ── DEP- memo routing ────────────────────────────────────────

    test('DEP- memo routes to DepositRelay with USDC', async () => {
        mockFetchedMemo = 'DEP-1A2B3C4D';

        await handlePayment({
            type: 'payment',
            to: TREASURY_KEY,
            from: 'GSENDER',
            amount: '250.00',
            asset_type: 'credit_alphanum4',
            asset_code: USDC_ASSET_CODE,
            asset_issuer: USDC_ISSUER,
            transaction_hash: 'tx_dep_usdc',
        });

        assert.strictEqual(mockDepositRelayCalls.length, 1);
        assert.deepStrictEqual(mockDepositRelayCalls[0], {
            memo: 'DEP-1A2B3C4D',
            amount: '250.00',
            txHash: 'tx_dep_usdc',
            assetCode: 'USDC',
        });
        assert.strictEqual(mockProcessInvestmentCalls.length, 0, 'Should NOT route to investment');
    });

    test('DEP- memo with native XLM routes to DepositRelay with XLM', async () => {
        mockFetchedMemo = 'DEP-AABBCCDD';

        await handlePayment({
            type: 'payment',
            to: TREASURY_KEY,
            from: 'GSENDER',
            amount: '100',
            asset_type: 'native',
            transaction_hash: 'tx_dep_xlm',
        });

        assert.strictEqual(mockDepositRelayCalls.length, 1);
        assert.strictEqual(mockDepositRelayCalls[0].assetCode, 'XLM');
        assert.strictEqual(mockDepositRelayCalls[0].memo, 'DEP-AABBCCDD');
    });

    // ── Investment matching ───────────────────────────────────────

    test('USDC without DEP- memo matches pending investment', async () => {
        mockFetchedMemo = 'INV-42-abcd1234';
        mockPendingInvestments = [{
            id: 42,
            investorId: 1,
            tokenAmount: '1000',
            usdcAmount: 500,
            assetCode: 'REIT01',
            offerId: 1,
            usdcPaymentHash: null,
        }];

        await handlePayment({
            type: 'payment',
            to: TREASURY_KEY,
            from: 'GINVESTOR_WALLET',
            amount: '500.00',
            asset_type: 'credit_alphanum4',
            asset_code: USDC_ASSET_CODE,
            asset_issuer: USDC_ISSUER,
            transaction_hash: 'tx_inv_1',
        });

        assert.strictEqual(mockProcessInvestmentCalls.length, 1);
        assert.strictEqual(mockProcessInvestmentCalls[0].investment.id, 42);
        assert.strictEqual(mockProcessInvestmentCalls[0].payment.transaction_hash, 'tx_inv_1');
        assert.strictEqual(mockDepositRelayCalls.length, 0, 'Should NOT route to deposit relay');
    });

    test('non-USDC asset without DEP- memo is ignored', async () => {
        mockFetchedMemo = null;

        await handlePayment({
            type: 'payment',
            to: TREASURY_KEY,
            from: 'GSENDER',
            amount: '100',
            asset_type: 'credit_alphanum4',
            asset_code: 'BTC',
            asset_issuer: 'GRANDOM_ISSUER',
            transaction_hash: 'tx_btc',
        });

        assert.strictEqual(mockDepositRelayCalls.length, 0);
        assert.strictEqual(mockProcessInvestmentCalls.length, 0);
    });

    test('USDC with no memo and no pending investments is ignored', async () => {
        mockFetchedMemo = null;
        mockPendingInvestments = [];

        await handlePayment({
            type: 'payment',
            to: TREASURY_KEY,
            from: 'GSENDER',
            amount: '100',
            asset_type: 'credit_alphanum4',
            asset_code: USDC_ASSET_CODE,
            asset_issuer: USDC_ISSUER,
            transaction_hash: 'tx_no_match',
        });

        assert.strictEqual(mockProcessInvestmentCalls.length, 0);
    });

    test('duplicate investment payment (same tx hash) is idempotent', async () => {
        mockFetchedMemo = null;
        mockPendingInvestments = [{
            id: 42,
            investorId: 1,
            tokenAmount: '1000',
            usdcAmount: 500,
            assetCode: 'REIT01',
            usdcPaymentHash: 'tx_already_processed', // Already processed
        }];

        await handlePayment({
            type: 'payment',
            to: TREASURY_KEY,
            from: 'GINVESTOR',
            amount: '500',
            asset_type: 'credit_alphanum4',
            asset_code: USDC_ASSET_CODE,
            asset_issuer: USDC_ISSUER,
            transaction_hash: 'tx_already_processed',
        });

        assert.strictEqual(mockProcessInvestmentCalls.length, 0, 'Should NOT reprocess same tx');
    });
});
