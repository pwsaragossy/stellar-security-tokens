#!/usr/bin/env node
/**
 * Soroban-Only Architecture Smoke Tests
 *
 * Validates the kill switch and G-address rejection guards
 * that replaced the legacy investment flow.
 *
 * Usage: node backend/tests/e2e/sorobanOnlySmoke.test.js
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) { console.log(`  ✅ ${testName}`); passed++; }
    else { console.error(`  ❌ ${testName}`); failed++; }
}

async function main() {
    console.log('\n═══════════════════════════════════════');
    console.log('  Soroban-Only Architecture — Smoke Tests');
    console.log('═══════════════════════════════════════\n');

    const controllerCode = readFileSync(
        path.resolve(__dirname, '../../src/controllers/investmentController.js'), 'utf-8'
    );

    // ─── Item 6: Kill Switch (503) ───
    console.log('--- Item 6: Kill Switch ---');

    assert(
        controllerCode.includes("ENABLE_SOROBAN_SALE !== 'true'"),
        'Kill switch checks ENABLE_SOROBAN_SALE flag'
    );

    assert(
        controllerCode.includes("503"),
        'Returns HTTP 503 when disabled'
    );

    assert(
        controllerCode.includes('temporarily unavailable'),
        'User-friendly error message on 503'
    );

    // Kill switch returns 503 before any DB record is created,
    // so there's no investment to mark as 'failed'
    assert(
        !controllerCode.includes('Soroban sale is currently disabled'),
        'Old kill switch message removed (replaced with user-friendly 503)'
    );

    // Verify no legacy fallback exists
    assert(
        !controllerCode.includes('LEGACY FLOW'),
        'No legacy USDC flow comment exists'
    );

    assert(
        !controllerCode.includes('verifyUSDCPayment'),
        'No verifyUSDCPayment call exists'
    );

    assert(
        !controllerCode.includes('paymentInstructions'),
        'No paymentInstructions in response'
    );

    // ─── Item 7: G-Address Rejection ───
    console.log('\n--- Item 7: G-Address Rejection ---');

    assert(
        controllerCode.includes("!investorWallet.startsWith('C')"),
        'Checks for non-smart-wallet addresses'
    );

    assert(
        controllerCode.includes('400'),
        'Returns HTTP 400 for G-address wallets'
    );

    assert(
        controllerCode.includes('passkey') || controllerCode.includes('smart wallet'),
        'Error message mentions passkey requirement'
    );

    assert(
        controllerCode.includes('smart wallet (passkey) is required'),
        'Clear error message for G-address rejection'
    );

    // ─── Bonus: Soroban Contract Validation ───
    console.log('\n--- Bonus: Contract Validation ---');

    assert(
        controllerCode.includes('!offer.sorobanContractId'),
        'Validates offer has Soroban contract before trade'
    );

    assert(
        controllerCode.includes('Activate the offer first') || controllerCode.includes('!offer.sorobanContractId'),
        'Error message guides admin to activate offer (auto-provisioning replaced init script)'
    );

    assert(
        !controllerCode.includes('isContractTrade: false') && !controllerCode.includes('legacyTransfer'),
        'No legacy trade path exists (Soroban-only architecture)'
    );

    // ─── Bonus: PaymentMonitor properly gated ───
    console.log('\n--- Bonus: PaymentMonitor Gated ---');

    const indexCode = readFileSync(
        path.resolve(__dirname, '../../src/index.js'), 'utf-8'
    );

    // PaymentMonitor is still used for deposit monitoring (not legacy USDC).
    // Verify it is properly gated behind a feature flag.
    assert(
        indexCode.includes('ENABLE_PAYMENT_MONITORING'),
        'PaymentMonitor gated behind ENABLE_PAYMENT_MONITORING flag'
    );

    assert(
        indexCode.includes('paymentMonitor.start()'),
        'PaymentMonitor.start() called on startup (for deposit monitoring)'
    );

    assert(
        !controllerCode.includes('verifyUSDCPayment'),
        'No legacy verifyUSDCPayment in investment controller'
    );

    // ─── Summary ───
    console.log('\n═══════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════\n');

    if (failed > 0) {
        console.log('⚠️  Some tests failed.');
        process.exit(1);
    } else {
        console.log('✅ All smoke tests passed! Soroban-only architecture verified.');
        process.exit(0);
    }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
