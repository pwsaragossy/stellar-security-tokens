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

    assert(
        controllerCode.includes("status: 'failed'") &&
        controllerCode.includes('Soroban sale is currently disabled'),
        'Marks investment as failed when kill switch active'
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
        controllerCode.includes("Legacy G-address wallets are no longer supported"),
        'Clear internal error message for G-address rejection'
    );

    // ─── Bonus: Soroban Contract Validation ───
    console.log('\n--- Bonus: Contract Validation ---');

    assert(
        controllerCode.includes('!offer.sorobanContractId'),
        'Validates offer has Soroban contract before trade'
    );

    assert(
        controllerCode.includes('initSorobanSale.js'),
        'Error message guides admin to run init script'
    );

    assert(
        controllerCode.includes("isContractTrade: true"),
        'Always returns isContractTrade: true (no legacy path)'
    );

    // ─── Bonus: PaymentMonitor removed ───
    console.log('\n--- Bonus: PaymentMonitor Removed ---');

    const indexCode = readFileSync(
        path.resolve(__dirname, '../../src/index.js'), 'utf-8'
    );

    assert(
        !indexCode.includes("getPaymentMonitor()"),
        'PaymentMonitor not called in startup'
    );

    assert(
        !indexCode.includes("paymentMonitor.start()"),
        'PaymentMonitor.start() not in startup'
    );

    assert(
        indexCode.includes('PaymentMonitor removed'),
        'Removal is documented in code comments'
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
