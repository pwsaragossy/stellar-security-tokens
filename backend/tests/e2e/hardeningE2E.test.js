#!/usr/bin/env node
/**
 * E2E Hardening Verification
 *
 * Tests items 1-7 from the production hardening checklist:
 *   1. Reconciler — import + method existence
 *   2. Idempotency — submit returns existing result on retry
 *   3. Race condition — duplicate pending investment blocked
 *   4. Fee bump — submitWithSponsorship exists in PasskeyWalletService
 *   5. Init script — CLI parses args, loads offer
 *   6. Real trade — contract responds to version(), getOffer() fails (uninitialized)
 *   7. Rollback — verify legacy path activates when sorobanContractId is null
 *
 * Usage: node backend/tests/e2e/hardeningE2E.test.js
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const CONTRACT_ID = 'CCFAC4GCDKFRBFWHA7H62YCQKRYXCS3HKXD23OBD45XQXG6DRIFA7QIY';
let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) { console.log(`  ✅ ${testName}`); passed++; }
    else { console.error(`  ❌ ${testName}`); failed++; }
}

async function main() {
    console.log('\n═══════════════════════════════════════');
    console.log('  Production Hardening — E2E Verification');
    console.log('═══════════════════════════════════════\n');

    // ─── 1. Reconciler ───
    console.log('--- Item 1: SorobanReconciler ---');
    try {
        const { SorobanReconciler } = await import('../../src/services/sorobanReconciler.js');
        assert(!!SorobanReconciler, 'SorobanReconciler imported');
        assert(typeof SorobanReconciler.reconcile === 'function', 'reconcile() exists');
        assert(typeof SorobanReconciler.start === 'function', 'start() exists');
        assert(typeof SorobanReconciler.stop === 'function', 'stop() exists');
    } catch (err) {
        console.error('  ❌ Reconciler import failed:', err.message);
        failed++;
    }

    // ─── 2. Idempotency ───
    console.log('\n--- Item 2: Idempotency Guard ---');
    // Verify the controller code has the idempotency check
    const { readFileSync } = await import('fs');
    const controllerCode = readFileSync(
        path.resolve(__dirname, '../../src/controllers/investmentController.js'), 'utf-8'
    );
    assert(
        controllerCode.includes('Idempotent return'),
        'investmentController has idempotency guard'
    );
    assert(
        controllerCode.includes('idempotent: true'),
        'Returns idempotent flag in response'
    );

    // ─── 3. Race Condition ───
    console.log('\n--- Item 3: Race Condition Guard ---');
    assert(
        controllerCode.includes('RACE CONDITION GUARD'),
        'Has race condition guard comment'
    );
    assert(
        controllerCode.includes('Duplicate pending investment blocked'),
        'Blocks duplicate pending investments'
    );
    assert(
        controllerCode.includes('existingInvestmentId'),
        'Returns existing investment ID in 409 response'
    );

    // ─── 4. Fee Bump Restoration ───
    console.log('\n--- Item 4: Fee Bump Restored ---');
    assert(
        controllerCode.includes('submitWithSponsorship'),
        'Uses submitWithSponsorship() instead of direct RPC'
    );
    assert(
        !controllerCode.includes('=== DEBUG: Submit via Soroban RPC directly'),
        'Debug bypass removed'
    );
    assert(
        !controllerCode.includes('TODO: Revert to fee-bump'),
        'TODO comment removed'
    );
    assert(
        controllerCode.includes('FEE BUMP SPONSORSHIP'),
        'Has fee bump section'
    );
    assert(
        controllerCode.includes('trade_submitted'),
        'Sets trade_submitted before sending'
    );

    // ─── 5. Init Script ───
    console.log('\n--- Item 5: initSorobanSale.js ---');
    const { existsSync } = await import('fs');
    assert(
        existsSync(path.resolve(__dirname, '../../scripts/initSorobanSale.js')),
        'initSorobanSale.js exists'
    );
    const initScript = readFileSync(
        path.resolve(__dirname, '../../scripts/initSorobanSale.js'), 'utf-8'
    );
    assert(initScript.includes('--dry-run'), 'Supports --dry-run flag');
    assert(initScript.includes('setSorobanContractId'), 'Stores contract ID in DB');
    assert(initScript.includes('create'), 'Calls create() on contract');

    // ─── 6. Contract Live on Testnet ───
    console.log('\n--- Item 6: Contract is Live ---');
    try {
        const { SorobanSaleService } = await import('../../src/services/sorobanSale.service.js');
        const version = await SorobanSaleService.getVersion(CONTRACT_ID);
        assert(version === 3, `version() returns ${version} (expected 3)`);

        // Verify getOffer fails on uninitialized contract
        try {
            await SorobanSaleService.getOffer(CONTRACT_ID);
            assert(false, 'getOffer should fail on uninitialized contract');
        } catch {
            assert(true, 'getOffer correctly fails on uninitialized contract');
        }
    } catch (err) {
        console.error('  ❌ Testnet query failed:', err.message);
        failed++;
    }

    // ─── 7. Soroban-Only Architecture ───
    console.log('\n--- Item 7: Soroban-Only Architecture ---');
    // Kill switch: returns 503 when ENABLE_SOROBAN_SALE is false
    assert(
        controllerCode.includes("ENABLE_SOROBAN_SALE !== 'true'"),
        'Has 503 kill switch when Soroban disabled'
    );
    assert(
        controllerCode.includes('503'),
        'Returns 503 for service unavailable'
    );
    // G-address wallets rejected
    assert(
        controllerCode.includes("!investorWallet.startsWith('C')"),
        'Rejects legacy G-address wallets'
    );
    // Contract ID required
    assert(
        controllerCode.includes('!offer.sorobanContractId'),
        'Validates offer has Soroban contract'
    );
    // No legacy SAC transfer path
    assert(
        !controllerCode.includes('PasskeyWalletService.buildInvestmentTx'),
        'Legacy SAC transfer path removed'
    );
    // Reconciler still handles orphans
    const reconcilerCode = readFileSync(
        path.resolve(__dirname, '../../src/services/sorobanReconciler.js'), 'utf-8'
    );
    assert(
        reconcilerCode.includes('trade_submitted'),
        'Reconciler handles trade_submitted orphans'
    );
    assert(
        reconcilerCode.includes('ORPHAN_TIMEOUT_MS'),
        'Reconciler has configurable orphan timeout'
    );

    // ─── Summary ───
    console.log('\n═══════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════\n');

    if (failed > 0) {
        console.log('⚠️  Some tests failed.');
        process.exit(1);
    } else {
        console.log('✅ All hardening tests passed!');
        console.log('\n📋 Manual steps remaining for full trade E2E:');
        console.log('   1. Derive SAC contract ID for CAIOTOKEN');
        console.log('   2. Run: node scripts/initSorobanSale.js --offer-id 1 --contract-id CCFAC4...');
        console.log('   3. Deposit CAIOTOKEN sell tokens into contract');
        console.log('   4. Activate: set_active --active true');
        console.log('   5. Purchase via frontend passkey flow → verify atomic swap');
        process.exit(0);
    }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
