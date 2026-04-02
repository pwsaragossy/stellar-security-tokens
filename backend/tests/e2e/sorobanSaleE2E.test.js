#!/usr/bin/env node
/**
 * E2E Verification: Soroban Token Sale Integration
 *
 * Tests the deployed contract + SorobanSaleService integration:
 *   1. Query version() — verify contract is alive
 *   2. Attempt getOffer() — verify read-only queries work
 *   3. Test SorobanSaleService.buildTradeXdr() simulation
 *   4. Test parseContractError() mapping
 *
 * NOTE: Full trade() E2E requires:
 *   - An initialized sale (create() called by admin)
 *   - Sell tokens deposited into the contract
 *   - A funded buyer with USDC
 *   - Passkey signing (manual via frontend)
 *
 * Usage: node backend/tests/e2e/sorobanSaleE2E.test.js
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Deployed contract on testnet
const CONTRACT_ID = process.env.TEST_SALE_CONTRACT_ID || 'CCFAC4GCDKFRBFWHA7H62YCQKRYXCS3HKXD23OBD45XQXG6DRIFA7QIY';
const OPS_PUBLIC = process.env.OPERATIONS_PUBLIC_KEY;
const USDC_SAC = process.env.USDC_SAC_CONTRACT_ID;

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✅ ${testName}`);
        passed++;
    } else {
        console.error(`  ❌ ${testName}`);
        failed++;
    }
}

async function main() {
    console.log('\n═══════════════════════════════════════');
    console.log('  Soroban Token Sale — E2E Verification');
    console.log('═══════════════════════════════════════\n');
    console.log(`Contract:  ${CONTRACT_ID}`);
    console.log(`Ops Key:   ${OPS_PUBLIC}`);
    console.log(`USDC SAC:  ${USDC_SAC}\n`);

    // ─── Test 1: Import SorobanSaleService ───
    console.log('--- Test 1: SorobanSaleService Import ---');
    let SorobanSaleService;
    try {
        ({ SorobanSaleService } = await import('../../src/services/sorobanSale.service.js'));
        assert(!!SorobanSaleService, 'SorobanSaleService imported successfully');
        assert(typeof SorobanSaleService.buildTradeXdr === 'function', 'buildTradeXdr() exists');
        assert(typeof SorobanSaleService.getOffer === 'function', 'getOffer() exists');
        assert(typeof SorobanSaleService.parseContractError === 'function', 'parseContractError() exists');
        assert(typeof SorobanSaleService.getVersion === 'function', 'getVersion() exists');
    } catch (err) {
        console.error('  ❌ Failed to import SorobanSaleService:', err.message);
        failed++;
        process.exit(1);
    }

    // ─── Test 2: version() query ───
    console.log('\n--- Test 2: version() Query ---');
    try {
        const version = await SorobanSaleService.getVersion(CONTRACT_ID);
        assert(version === 3, `version() returned ${version} (expected 3)`);
    } catch (err) {
        console.error('  ❌ version() failed:', err.message);
        failed++;
    }

    // ─── Test 3: getOffer() on non-existent contract ───
    console.log('\n--- Test 3: getOffer() on Non-Existent Contract ---');
    // Use a deterministic C-address that has never been deployed on any network
    const DEAD_CONTRACT = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
    try {
        await SorobanSaleService.getOffer(DEAD_CONTRACT);
        assert(false, 'getOffer() should fail on non-existent contract');
    } catch (err) {
        assert(
            err.message.includes('Simulation failed') || err.message.includes('HostError') || err.message.includes('not found'),
            `getOffer() correctly fails: "${err.message.substring(0, 80)}..."`
        );
    }

    // ─── Test 4: Error Mapping ───
    console.log('\n--- Test 4: Error → HTTP Mapping ---');
    const err3 = SorobanSaleService.toHttpError(3);
    assert(err3.httpStatus === 400, `SaleError::NotActive → HTTP ${err3.httpStatus}`);
    assert(err3.code === 'NotActive', `SaleError::NotActive code = "${err3.code}"`);

    const err7 = SorobanSaleService.toHttpError(7);
    assert(err7.httpStatus === 410, `SaleError::Expired → HTTP ${err7.httpStatus}`);

    const err10 = SorobanSaleService.toHttpError(10);
    assert(err10.httpStatus === 403, `SaleError::BuyerBlocked → HTTP ${err10.httpStatus}`);

    const errUnknown = SorobanSaleService.toHttpError(999);
    assert(errUnknown.httpStatus === 500, `Unknown error → HTTP ${errUnknown.httpStatus}`);

    // ─── Test 5: buildTradeXdr() validation ───
    console.log('\n--- Test 5: buildTradeXdr() Input Validation ---');
    try {
        await SorobanSaleService.buildTradeXdr('INVALID', OPS_PUBLIC, 100);
        assert(false, 'Should reject invalid contract ID');
    } catch (err) {
        assert(err.message.includes('Invalid contract ID'), `Rejects invalid contract ID: "${err.message}"`);
    }

    try {
        await SorobanSaleService.buildTradeXdr(CONTRACT_ID, 'GBAD', 100);
        assert(false, 'Should reject invalid buyer address');
    } catch (err) {
        assert(err.message.includes('Invalid buyer'), `Rejects invalid buyer: "${err.message}"`);
    }

    try {
        await SorobanSaleService.buildTradeXdr(CONTRACT_ID, CONTRACT_ID, -10);
        assert(false, 'Should reject negative amount');
    } catch (err) {
        assert(err.message.includes('positive'), `Rejects negative amount: "${err.message}"`);
    }

    // ─── Test 6: SorobanEventIndexer Import ───
    console.log('\n--- Test 6: SorobanEventIndexer Import ---');
    try {
        const { SorobanEventIndexer } = await import('../../src/services/sorobanEventIndexer.js');
        assert(!!SorobanEventIndexer, 'SorobanEventIndexer imported successfully');
        assert(typeof SorobanEventIndexer.pollAll === 'function', 'pollAll() exists');
        assert(typeof SorobanEventIndexer.parseEvent === 'function', 'parseEvent() exists');
        assert(typeof SorobanEventIndexer.start === 'function', 'start() exists');
        assert(typeof SorobanEventIndexer.stop === 'function', 'stop() exists');
    } catch (err) {
        console.error('  ❌ Failed to import SorobanEventIndexer:', err.message);
        failed++;
    }

    // ─── Test 7: Offer model new methods ───
    console.log('\n--- Test 7: Offer Model Methods ---');
    try {
        const { Offer } = await import('../../src/models/Offer.js');
        assert(typeof Offer.findByContractId === 'function', 'Offer.findByContractId() exists');
        assert(typeof Offer.setSorobanContractId === 'function', 'Offer.setSorobanContractId() exists');
    } catch (err) {
        console.error('  ❌ Offer model methods:', err.message);
        failed++;
    }

    // ─── Summary ───
    console.log('\n═══════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════\n');

    if (failed > 0) {
        console.log('⚠️  Some tests failed. Review the output above.');
        process.exit(1);
    } else {
        console.log('✅ All integration tests passed!');
        console.log(`\n📋 Next steps for full E2E trade test:`);
        console.log(`   1. Initialize contract: stellar contract invoke --id ${CONTRACT_ID} -- create ...`);
        console.log(`   2. Deposit sell tokens into contract`);
        console.log(`   3. Set sale active: set_active --active true`);
        console.log(`   4. Frontend: investor purchases via passkey → buildTradeXdr → sign → submitInvestmentTx`);
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
