#!/usr/bin/env node
/**
 * Contract Management E2E Test — Full Admin Suite (Testnet)
 *
 * Three-layer admin action verification:
 *   Layer 1: Soroban sale contract management (8 actions via /api/admin/contracts)
 *   Layer 2: Classic Stellar token admin (5 actions via /api/tokens)
 *   Layer 3: RWA discoverability (stellar.toml + Stellar Expert)
 *
 * Uses throwaway testnet keypairs — zero interaction with real platform keys.
 * Uses supertest against the real Express app (full HTTP pipeline).
 * Requires: Docker up (Postgres), internet (testnet), compiled WASM.
 *
 * Usage: node --import tsx backend/tests/e2e/contractManagement.test.js
 */

import {
  Keypair, Asset, Operation, TransactionBuilder, BASE_FEE, Networks,
  Contract, Address, nativeToScVal, rpc,
} from '@stellar/stellar-sdk';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════
// PHASE 0: Bootstrap throwaway keys BEFORE importing services
// ═══════════════════════════════════════════════════════════════

const testIssuer = Keypair.random();
const testDistributor = Keypair.random();
const testTreasury = Keypair.random();
const testOps = Keypair.random();
const testInvestor = Keypair.random();

// Unique asset code per run to avoid collisions
const ASSET_CODE = 'M' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
const TOKEN_AMOUNT = '500';
const FIXED_FEE = 5;
const SELL_PRICE = 10_000_000;   // 1 token = 1 USDC
const BUY_PRICE = 10_000_000;

// Override env BEFORE any service import
process.env.KEY_MANAGEMENT_MODE = 'env';
process.env.NODE_ENV = 'test';   // Bypasses rate limiting + skips Redis
process.env.STELLAR_NETWORK = 'testnet';
process.env.STELLAR_HORIZON_URL = 'https://horizon-testnet.stellar.org';
process.env.HORIZON_URL = 'https://horizon-testnet.stellar.org';
process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
process.env.ISSUER_SECRET_KEY = testIssuer.secret();
process.env.ISSUER_PUBLIC_KEY = testIssuer.publicKey();
process.env.DISTRIBUTOR_SECRET_KEY = testDistributor.secret();
process.env.DISTRIBUTOR_PUBLIC_KEY = testDistributor.publicKey();
process.env.TREASURY_SECRET_KEY = testTreasury.secret();
process.env.TREASURY_PUBLIC_KEY = testTreasury.publicKey();
process.env.OPERATIONS_SECRET_KEY = testOps.secret();
process.env.OPERATIONS_PUBLIC_KEY = testOps.publicKey();
process.env.USDC_ISSUER = testIssuer.publicKey();
// NOTE: Legacy DIVIDEND_FEE_PERCENT removed — replaced by investorRate/annualRate spread model
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-jwt-secret-32chars-min!!';

// Load .env for DATABASE_URL and other infra vars (dotenv won't override our overrides above)
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Now import services (they read env at construction)
const { default: prisma } = await import('../../src/config/prisma.js');
const { StellarService } = await import('../../src/services/stellar.service.js');
const { SorobanSaleService } = await import('../../src/services/sorobanSale.service.js');
const { keyManager } = await import('../../src/services/KeyManager.js');
const {
  stellarServer, getNetworkPassphrase, getSorobanRpcUrl,
} = await import('../../src/config/stellar.js');
const { generateToken } = await import('../../src/middleware/auth.js');

// Import Express app + supertest
const { default: app } = await import('../../src/app.js');
const { default: supertest } = await import('supertest');
const request = supertest(app);

// ═══════════════════════════════════════════════════════════════
// Test Harness
// ═══════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
const testIds = {};

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ ${testName}`);
    failed++;
  }
}

async function fundAccount(publicKey) {
  const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Friendbot failed for ${publicKey}: ${res.statusText}`);
  await res.json();
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Mint test USDC from testIssuer to a target account.
 * Creates trustline + authorizes + pays in one atomic TX.
 */
async function mintTestUSDC(targetKeypair, amount) {
  const usdcAsset = new Asset('USDC', testIssuer.publicKey());
  const issuerAccount = await stellarServer.loadAccount(testIssuer.publicKey());

  const tx = new TransactionBuilder(issuerAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: usdcAsset, source: targetKeypair.publicKey() }))
    .addOperation(Operation.setTrustLineFlags({
      trustor: targetKeypair.publicKey(),
      asset: usdcAsset,
      flags: { authorized: true },
      source: testIssuer.publicKey(),
    }))
    .addOperation(Operation.payment({
      destination: targetKeypair.publicKey(),
      asset: usdcAsset,
      amount: amount.toString(),
      source: testIssuer.publicKey(),
    }))
    .setTimeout(120)
    .build();

  tx.sign(testIssuer);
  tx.sign(targetKeypair);
  await stellarServer.submitTransaction(tx);
}

/**
 * Upload WASM to testnet and return the hash.
 */
async function uploadWasm() {
  const wasmPath = path.resolve(__dirname, '../../../contracts/token_sale/target/wasm32v1-none/release/token_sale.wasm');
  const wasmBytes = fs.readFileSync(wasmPath);
  console.log(`  WASM size: ${wasmBytes.length} bytes`);

  const issuerAccount = await StellarService.getAccountRPC(testIssuer.publicKey());
  const uploadOp = Operation.uploadContractWasm({ wasm: wasmBytes });

  let tx = new TransactionBuilder(issuerAccount, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(uploadOp)
    .setTimeout(300)
    .build();

  tx = await StellarService.prepareSorobanTransaction(tx);
  tx.sign(testIssuer);

  const rpcServer = new rpc.Server(getSorobanRpcUrl());
  const sendResult = await rpcServer.sendTransaction(tx);

  let result = sendResult;
  if (result.status === 'PENDING') {
    const maxWait = 60000;
    const interval = 3000;
    let waited = 0;
    while (waited < maxWait) {
      await sleep(interval);
      waited += interval;
      result = await rpcServer.getTransaction(sendResult.hash);
      if (result.status !== 'NOT_FOUND') break;
    }
  }

  if (result.status !== 'SUCCESS') {
    throw new Error(`WASM upload failed: ${result.status}`);
  }

  const wasmHash = crypto.createHash('sha256').update(wasmBytes).digest('hex');
  return wasmHash;
}

/**
 * Sign a Soroban XDR with issuer, submit via RPC, and poll for result.
 */
async function signAndSubmitSoroban(xdrString) {
  const { Transaction } = await import('@stellar/stellar-sdk');
  const tx = new Transaction(xdrString, Networks.TESTNET);
  tx.sign(testIssuer);

  const rpcServer = new rpc.Server(getSorobanRpcUrl());
  const sendResult = await rpcServer.sendTransaction(tx);

  let result = sendResult;
  if (result.status === 'PENDING') {
    const maxWait = 60000;
    const interval = 3000;
    let waited = 0;
    while (waited < maxWait) {
      await sleep(interval);
      waited += interval;
      result = await rpcServer.getTransaction(sendResult.hash);
      if (result.status !== 'NOT_FOUND') break;
    }
  }

  if (result.status !== 'SUCCESS') {
    throw new Error(`Soroban TX failed: ${result.status} (hash: ${sendResult.hash})`);
  }
  return { hash: sendResult.hash, result };
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Contract Management E2E — Full Admin Suite (Testnet)');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Asset:       ${ASSET_CODE}`);
  console.log(`Issuer:      ${testIssuer.publicKey()}`);
  console.log(`Distributor: ${testDistributor.publicKey()}`);
  console.log(`Treasury:    ${testTreasury.publicKey()}`);
  console.log(`Investor:    ${testInvestor.publicKey()}`);
  console.log(`KeyMode:     ${keyManager.mode}\n`);

  assert(keyManager.mode === 'env', 'KeyManager running in env mode');

  let adminToken = null;
  let saleContractId = null;
  let tokenSacId = null;
  let usdcSacId = null;
  let offerId = null;

  try {
    // ─── PHASE 1: SETUP ───────────────────────────────────────
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  PHASE 1: SETUP (fund + issue + DB seed)   ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // 1a. Fund all accounts
    console.log('--- Funding accounts via friendbot ---');
    await Promise.all([
      fundAccount(testIssuer.publicKey()),
      fundAccount(testDistributor.publicKey()),
      fundAccount(testTreasury.publicKey()),
      fundAccount(testOps.publicKey()),
      fundAccount(testInvestor.publicKey()),
    ]);
    assert(true, 'All 5 accounts funded via friendbot');
    await sleep(3000);

    // 1b. Setup issuer thresholds (OPS key as signer with weight=2)
    console.log('\n--- Setting up issuer thresholds ---');
    const thresholdResult = await SorobanSaleService.buildIssuerThresholdSetupXdr();
    const { Transaction: TxClass } = await import('@stellar/stellar-sdk');
    const thresholdTx = new TxClass(thresholdResult.xdr, Networks.TESTNET);
    thresholdTx.sign(testIssuer);
    await stellarServer.submitTransaction(thresholdTx);
    assert(true, 'Issuer thresholds set (OPS weight=2, med=2, high=10)');
    await sleep(2000);

    // 1c. Set issuer flags
    console.log('\n--- Setting issuer flags ---');
    const issuerResult = await StellarService.createIssuerAccount();
    assert(issuerResult.success, 'Issuer flags set (auth_required, auth_revocable, auth_clawback_enabled)');

    // 1d. Issue security token + deploy SAC
    console.log('\n--- Issuing security token (forSaleContract=true) ---');
    const issueResult = await StellarService.issueSecurityToken(ASSET_CODE, TOKEN_AMOUNT, {
      forSaleContract: true,
    });
    assert(issueResult.success, `Issued ${ASSET_CODE} (flags + SAC deployed)`);
    tokenSacId = issueResult.sacContractId;
    assert(!!tokenSacId, `Token SAC: ${tokenSacId?.slice(0, 12)}…`);

    // 1e. Deploy USDC SAC
    console.log('\n--- Deploying USDC SAC ---');
    const usdcAsset = new Asset('USDC', testIssuer.publicKey());
    await mintTestUSDC(testDistributor, 1); // Create asset on-chain
    await StellarService.deploySACForAsset('USDC', testIssuer.publicKey());
    usdcSacId = StellarService.getSACContractId(usdcAsset);
    assert(!!usdcSacId, `USDC SAC: ${usdcSacId?.slice(0, 12)}…`);
    process.env.USDC_SAC_CONTRACT_ID = usdcSacId;

    // 1f. Mint test USDC (trustlines)
    console.log('\n--- Minting test USDC ---');
    await mintTestUSDC(testInvestor, 500);
    await mintTestUSDC(testTreasury, 0.0000001);
    assert(true, 'Test USDC minted to investor (500), treasury (trustline)');

    // 1g. Create DB records
    console.log('\n--- Creating DB records ---');

    const admin = await prisma.platformAdmin.create({
      data: {
        name: `E2E Admin ${ASSET_CODE}`,
        email: `admin-${ASSET_CODE.toLowerCase()}@mgmt.test`,
        passwordHash: 'not-used-in-env-mode',
        role: 'super_admin',
        isActive: true,
      },
    });
    testIds.adminId = admin.id;

    adminToken = generateToken({
      userId: admin.id,
      email: admin.email,
      role: 'platform_admin',
      userType: 'platform_admin',
    });
    assert(!!adminToken, `Admin JWT generated for admin #${admin.id}`);

    const company = await prisma.company.create({
      data: {
        name: `Test Company ${ASSET_CODE}`,
        email: `company-${ASSET_CODE.toLowerCase()}@mgmt.test`,
        cnpj: `00.000.000/${ASSET_CODE}`,
        stellarPublicKey: testIssuer.publicKey(),  // Company uses issuer key in test
        status: 'approved',
      },
    });
    testIds.companyId = company.id;

    const companyUser = await prisma.companyUser.create({
      data: {
        companyId: company.id,
        email: `admin-${ASSET_CODE.toLowerCase()}@mgmt.test`,
        name: 'Test Admin',
        role: 'admin',
        isActive: true,
      },
    });

    // Mock IPFS document hashes for TOML/RWA discoverability tests
    const MOCK_IPFS_HASH_CONTRACT = 'QmTestContract' + ASSET_CODE + 'abcdef1234567890abcdef1234';
    const MOCK_IPFS_HASH_PROSPECTUS = 'QmTestProspectus' + ASSET_CODE + 'abcdef1234567890abcd';

    const offer = await prisma.offer.create({
      data: {
        companyId: company.id,
        requestedBy: companyUser.id,
        offerName: `Contract Mgmt Test ${ASSET_CODE}`,
        assetCode: ASSET_CODE,
        description: `E2E contract management test for ${ASSET_CODE}`,
        totalSupply: parseInt(TOKEN_AMOUNT),
        unitPrice: 1.0,
        annualInterestRate: 12,
        investorRate: 10,
        offerType: 'sale',
        paymentType: 'bullet',
        maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year out
        status: 'active',
        isTokenLocked: true,
        processingFee: FIXED_FEE,
        legalDocuments: {
          contract: { hash: MOCK_IPFS_HASH_CONTRACT, fileName: 'contract.pdf', uploadedAt: new Date().toISOString() },
          prospectus: { hash: MOCK_IPFS_HASH_PROSPECTUS, fileName: 'prospectus.pdf', uploadedAt: new Date().toISOString() },
        },
      },
    });
    offerId = offer.id;
    testIds.offerId = offer.id;

    const token = await prisma.token.create({
      data: {
        offerId: offer.id,
        assetCode: ASSET_CODE,
        issuerPublicKey: testIssuer.publicKey(),
        sacContractId: tokenSacId,
        totalSupply: parseInt(TOKEN_AMOUNT),
        annualInterestRate: 12,
      },
    });
    testIds.tokenId = token.id;
    assert(true, `DB records: Admin(${admin.id}), Company(${company.id}), Offer(${offer.id}), Token(${token.id})`);

    // ─── PHASE 2: DEPLOY SALE CONTRACT ────────────────────────
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  PHASE 2: DEPLOY (WASM + contract + sale)  ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // 2a. Upload WASM
    console.log('--- Uploading sale contract WASM ---');
    const wasmHash = await uploadWasm();
    assert(!!wasmHash, `WASM hash: ${wasmHash.slice(0, 16)}…`);
    process.env.SALE_WASM_HASH = wasmHash;

    // 2b. Deploy sale contract
    console.log('\n--- Deploying sale contract ---');
    const salt = crypto.createHash('sha256').update(`radox:mgmt:${offer.id}`).digest();
    const deployResult = await SorobanSaleService.buildDeployXdr(
      testIssuer.publicKey(), wasmHash, salt,
    );
    saleContractId = deployResult.contractId;
    assert(!!saleContractId, `Sale contract: ${saleContractId.slice(0, 12)}…`);
    await signAndSubmitSoroban(deployResult.xdr);
    assert(true, 'Sale contract deployed on-chain');
    await sleep(3000);

    // 2c. Initialize sale (create)
    console.log('\n--- Initializing sale (create) ---');
    const createResult = await SorobanSaleService.buildCreateSaleXdr(
      saleContractId, testIssuer.publicKey(), {
        admin: testIssuer.publicKey(),
        seller: testIssuer.publicKey(),
        sellToken: tokenSacId,
        buyToken: usdcSacId,
        treasury: testTreasury.publicKey(),
        company: testIssuer.publicKey(), // Company = issuer for simplicity
        fixedFee: BigInt(FIXED_FEE * 10_000_000),
        sellPrice: SELL_PRICE,
        buyPrice: BUY_PRICE,
        deadlineLedger: 0,
        minBuyAmount: 0n,
        maxBuyPerBuyer: 0n,
      },
    );
    await signAndSubmitSoroban(createResult.xdr);
    assert(true, 'Sale initialized (create)');
    await sleep(3000);

    // 2d. Authorize sale contract to hold sell tokens
    console.log('\n--- Authorizing sale contract on token SAC ---');
    await SorobanSaleService.authorizeBuyerOnSac(tokenSacId, saleContractId);
    assert(true, 'Sale contract authorized on token SAC');

    // 2e. Deposit sell tokens (issuer → contract via SAC transfer)
    console.log('\n--- Depositing tokens into sale contract ---');
    const depositAmount = BigInt(100 * 10_000_000); // 100 tokens
    const depositXdr = await SorobanSaleService.buildSacTransferXdr(
      tokenSacId, testIssuer.publicKey(), saleContractId, depositAmount,
    );
    await signAndSubmitSoroban(depositXdr.xdr);
    assert(true, `Deposited 100 ${ASSET_CODE} into sale contract`);
    await sleep(2000);

    // 2f. Activate sale
    console.log('\n--- Activating sale ---');
    const activateResult = await SorobanSaleService.buildSetActiveXdr(saleContractId, true);
    await signAndSubmitSoroban(activateResult.xdr);
    assert(true, 'Sale activated');

    // Verify sale is live
    const offerState = await SorobanSaleService.getOffer(saleContractId);
    assert(offerState !== null, 'Contract get_offer() returns sale data');

    // Update DB with contract ID
    await prisma.offer.update({
      where: { id: offer.id },
      data: { sorobanContractId: saleContractId, sorobanInitStatus: 'active' },
    });

    // ═══════════════════════════════════════════════════════════
    // LAYER 1: SOROBAN SALE CONTRACT MANAGEMENT (8 actions)
    // ═══════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║  LAYER 1: SOROBAN CONTRACT MANAGEMENT (supertest) ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // ── 3A: PAUSE ──
    console.log('--- 3A: Pause ---');
    const pauseRes = await request
      .post(`/api/admin/contracts/${offerId}/pause`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(202);
    assert(pauseRes.status === 202, 'POST /pause → 202');
    await sleep(5000);

    const afterPause = await SorobanSaleService.getOffer(saleContractId);
    assert(afterPause.is_active === false, 'On-chain: is_active === false after pause');

    // ── 3B: RESUME ──
    console.log('\n--- 3B: Resume ---');
    const resumeRes = await request
      .post(`/api/admin/contracts/${offerId}/resume`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(202);
    assert(resumeRes.status === 202, 'POST /resume → 202');
    await sleep(5000);

    const afterResume = await SorobanSaleService.getOffer(saleContractId);
    assert(afterResume.is_active === true, 'On-chain: is_active === true after resume');

    // ── 3C: DEPOSIT (2-step) ──
    console.log('\n--- 3C: Deposit (2-step: API authorize + inline transfer) ---');
    const balanceBefore = await SorobanSaleService.getBalance(saleContractId);
    console.log(`  Balance before deposit: ${balanceBefore}`);

    const depositRes = await request
      .post(`/api/admin/contracts/${offerId}/deposit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 50 })
      .expect(202);
    assert(depositRes.status === 202, 'POST /deposit → 202 (step 1: authorize)');
    await sleep(5000);

    // Step 2: Inline SAC transfer (supplements the API which only handles step 1)
    const step2Amount = BigInt(50 * 10_000_000);
    const step2Xdr = await SorobanSaleService.buildSacTransferXdr(
      tokenSacId, testIssuer.publicKey(), saleContractId, step2Amount,
    );
    await signAndSubmitSoroban(step2Xdr.xdr);
    await sleep(3000);

    const balanceAfterDeposit = await SorobanSaleService.getBalance(saleContractId);
    console.log(`  Balance after deposit: ${balanceAfterDeposit}`);
    assert(
      balanceAfterDeposit > balanceBefore,
      `On-chain: balance increased (${balanceBefore} → ${balanceAfterDeposit})`,
    );

    // ── 3D: PRICE UPDATE ──
    console.log('\n--- 3D: Price Update ---');
    const newSellPrice = 20_000_000; // 2 USDC per token
    const newBuyPrice = 20_000_000;
    const priceRes = await request
      .post(`/api/admin/contracts/${offerId}/price`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sellPrice: newSellPrice, buyPrice: newBuyPrice })
      .expect(202);
    assert(priceRes.status === 202, 'POST /price → 202');
    await sleep(5000);

    const afterPrice = await SorobanSaleService.getOffer(saleContractId);
    // Price values are in Soroban u32 format
    const returnedSellPrice = typeof afterPrice.sell_price === 'bigint'
      ? Number(afterPrice.sell_price)
      : afterPrice.sell_price;
    const returnedBuyPrice = typeof afterPrice.buy_price === 'bigint'
      ? Number(afterPrice.buy_price)
      : afterPrice.buy_price;
    assert(returnedSellPrice === newSellPrice, `On-chain: sell_price === ${newSellPrice} (got ${returnedSellPrice})`);
    assert(returnedBuyPrice === newBuyPrice, `On-chain: buy_price === ${newBuyPrice} (got ${returnedBuyPrice})`);

    // ── 3E: FREEZE BUYER (Soroban) ──
    console.log('\n--- 3E: Freeze Buyer (Soroban) ---');
    const freezeRes = await request
      .post(`/api/admin/contracts/${offerId}/freeze`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ buyerAddress: testInvestor.publicKey(), frozen: true })
      .expect(202);
    assert(freezeRes.status === 202, 'POST /freeze {frozen: true} → 202');
    await sleep(5000);

    const frozenState = await SorobanSaleService.isFrozen(saleContractId, testInvestor.publicKey());
    assert(frozenState === true, `On-chain: isFrozen(${testInvestor.publicKey().slice(0, 8)}…) === true`);

    // ── 3F: UNFREEZE BUYER ──
    console.log('\n--- 3F: Unfreeze Buyer ---');
    const unfreezeRes = await request
      .post(`/api/admin/contracts/${offerId}/freeze`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ buyerAddress: testInvestor.publicKey(), frozen: false })
      .expect(202);
    assert(unfreezeRes.status === 202, 'POST /freeze {frozen: false} → 202');
    await sleep(5000);

    const unfrozenState = await SorobanSaleService.isFrozen(saleContractId, testInvestor.publicKey());
    assert(unfrozenState === false, `On-chain: isFrozen(${testInvestor.publicKey().slice(0, 8)}…) === false`);

    // ── 3G: EXTEND TTL ──
    console.log('\n--- 3G: Extend TTL ---');
    const ttlRes = await request
      .post(`/api/admin/contracts/${offerId}/ttl`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert(ttlRes.status === 200, `POST /ttl → ${ttlRes.status} (expected 200)`);

    // ── 3H: WITHDRAW (partial) ──
    console.log('\n--- 3H: Withdraw (partial) ---');
    const balanceBeforeWithdraw = await SorobanSaleService.getBalance(saleContractId);
    console.log(`  Balance before withdraw: ${balanceBeforeWithdraw}`);

    const withdrawRes = await request
      .post(`/api/admin/contracts/${offerId}/withdraw`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 10 })
      .expect(202);
    assert(withdrawRes.status === 202, 'POST /withdraw {amount: 10} → 202');
    await sleep(5000);

    const balanceAfterWithdraw = await SorobanSaleService.getBalance(saleContractId);
    console.log(`  Balance after withdraw: ${balanceAfterWithdraw}`);
    assert(
      balanceAfterWithdraw < balanceBeforeWithdraw,
      `On-chain: balance decreased (${balanceBeforeWithdraw} → ${balanceAfterWithdraw})`,
    );

    // ── 3I: EMERGENCY DRAIN ──
    console.log('\n--- 3I: Emergency Drain ---');

    // First: Verify that omitting X-Confirm returns 400
    const drainNoConfirm = await request
      .post(`/api/admin/contracts/${offerId}/drain`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert(drainNoConfirm.status === 400, 'POST /drain without X-Confirm → 400');

    // Now with X-Confirm: true
    const drainRes = await request
      .post(`/api/admin/contracts/${offerId}/drain`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Confirm', 'true')
      .expect(202);
    assert(drainRes.status === 202, 'POST /drain with X-Confirm → 202');
    await sleep(5000);

    const balanceAfterDrain = await SorobanSaleService.getBalance(saleContractId);
    assert(
      balanceAfterDrain === 0n || balanceAfterDrain === BigInt(0),
      `On-chain: balance === 0 after drain (got ${balanceAfterDrain})`,
    );

    // ═══════════════════════════════════════════════════════════
    // LAYER 2: CLASSIC TOKEN ADMIN (5 actions)
    // ═══════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║  LAYER 2: CLASSIC STELLAR TOKEN ADMIN (supertest)  ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // Setup: Create investor trustline, authorize, distribute tokens
    console.log('--- Setup: Investor trustline + authorize + distribute ---');
    const securityAsset = new Asset(ASSET_CODE, testIssuer.publicKey());
    const investorAcct = await stellarServer.loadAccount(testInvestor.publicKey());

    // Create classic trustline for security token
    const trustlineTx = new TransactionBuilder(investorAcct, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.changeTrust({ asset: securityAsset }))
      .setTimeout(120)
      .build();
    trustlineTx.sign(testInvestor);
    await stellarServer.submitTransaction(trustlineTx);

    // Authorize investor trustline
    const issuerAcctForAuth = await stellarServer.loadAccount(testIssuer.publicKey());
    const authTx = new TransactionBuilder(issuerAcctForAuth, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.setTrustLineFlags({
        trustor: testInvestor.publicKey(),
        asset: securityAsset,
        flags: { authorized: true },
        source: testIssuer.publicKey(),
      }))
      .addOperation(Operation.payment({
        destination: testInvestor.publicKey(),
        asset: securityAsset,
        amount: '50',
        source: testIssuer.publicKey(),
      }))
      .setTimeout(120)
      .build();
    authTx.sign(testIssuer);
    await stellarServer.submitTransaction(authTx);
    assert(true, 'Investor: trustline created, authorized, 50 tokens distributed');
    await sleep(2000);

    // ── 4A: FREEZE ACCOUNT (Classic Stellar) ──
    console.log('\n--- 4A: Freeze Account (Classic trustline) ---');
    const freezeAcctRes = await request
      .post('/api/tokens/freeze')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        investorPublicKey: testInvestor.publicKey(),
        assetCode: ASSET_CODE,
      });
    assert(freezeAcctRes.status === 200, `POST /tokens/freeze → ${freezeAcctRes.status}`);
    await sleep(3000);

    // Verify on-chain: investor trustline is_authorized should be false
    const frozenAcct = await stellarServer.loadAccount(testInvestor.publicKey());
    const frozenBalance = frozenAcct.balances.find(
      b => b.asset_code === ASSET_CODE && b.asset_issuer === testIssuer.publicKey(),
    );
    assert(
      frozenBalance && frozenBalance.is_authorized === false,
      `On-chain: trustline is_authorized === false (frozen)`,
    );

    // ── 4B: UNFREEZE ACCOUNT ──
    console.log('\n--- 4B: Unfreeze Account ---');
    const unfreezeAcctRes = await request
      .post('/api/tokens/unfreeze')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        investorPublicKey: testInvestor.publicKey(),
        assetCode: ASSET_CODE,
      });
    assert(unfreezeAcctRes.status === 200, `POST /tokens/unfreeze → ${unfreezeAcctRes.status}`);
    await sleep(3000);

    const unfrozenAcct = await stellarServer.loadAccount(testInvestor.publicKey());
    const unfrozenBalance = unfrozenAcct.balances.find(
      b => b.asset_code === ASSET_CODE && b.asset_issuer === testIssuer.publicKey(),
    );
    assert(
      unfrozenBalance && unfrozenBalance.is_authorized === true,
      `On-chain: trustline is_authorized === true (unfrozen)`,
    );

    // ── 4C: LIST ASSET HOLDERS ──
    console.log('\n--- 4C: List Asset Holders ---');
    const holdersRes = await request
      .get(`/api/tokens/${ASSET_CODE}/holders`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert(holdersRes.status === 200, `GET /tokens/${ASSET_CODE}/holders → ${holdersRes.status}`);

    const holders = holdersRes.body?.data || [];
    const investorHolder = holders.find(
      h => h.publicKey === testInvestor.publicKey(),
    );
    assert(!!investorHolder, `Holders list includes investor ${testInvestor.publicKey().slice(0, 8)}…`);

    // ── 4D: CLAWBACK TOKENS ──
    console.log('\n--- 4D: Clawback Tokens ---');
    const clawbackRes = await request
      .post('/api/tokens/clawback')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        investorPublicKey: testInvestor.publicKey(),
        assetCode: ASSET_CODE,
        amount: 20,
      });
    assert(clawbackRes.status === 200, `POST /tokens/clawback {amount: 20} → ${clawbackRes.status}`);
    await sleep(3000);

    const afterClawback = await stellarServer.loadAccount(testInvestor.publicKey());
    const clawedBalance = afterClawback.balances.find(
      b => b.asset_code === ASSET_CODE && b.asset_issuer === testIssuer.publicKey(),
    );
    const clawedAmount = clawedBalance ? parseFloat(clawedBalance.balance) : 0;
    assert(
      clawedAmount <= 30.0000001 && clawedAmount >= 29.9999999,
      `On-chain: investor balance ≈ 30 after clawback of 20 (got ${clawedAmount})`,
    );

    // ── 4E: DISABLE CLAWBACK ──
    console.log('\n--- 4E: Disable Clawback ---');
    const disableRes = await request
      .post('/api/tokens/disable-clawback')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        investorPublicKey: testInvestor.publicKey(),
        assetCode: ASSET_CODE,
      });
    assert(
      disableRes.status === 200 || disableRes.status === 202,
      `POST /tokens/disable-clawback → ${disableRes.status}`,
    );

    // ═══════════════════════════════════════════════════════════
    // LAYER 3: RWA DISCOVERABILITY
    // ═══════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║  LAYER 3: RWA DISCOVERABILITY                      ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // ── 5A: stellar.toml VERIFICATION ──
    console.log('--- 5A: stellar.toml verification ---');
    const tomlRes = await request.get('/.well-known/stellar.toml');
    assert(tomlRes.status === 200, 'GET /.well-known/stellar.toml → 200');
    assert(
      tomlRes.headers['content-type']?.includes('text/plain'),
      `Content-Type: ${tomlRes.headers['content-type']}`,
    );

    const tomlBody = tomlRes.text;
    assert(tomlBody.includes(ASSET_CODE), `stellar.toml contains asset code ${ASSET_CODE}`);
    assert(tomlBody.includes(testIssuer.publicKey()), 'stellar.toml contains issuer public key');
    assert(tomlBody.includes('NETWORK_PASSPHRASE'), 'stellar.toml contains NETWORK_PASSPHRASE');
    assert(tomlBody.includes('is_asset_anchored=true'), 'stellar.toml marks asset as anchored (RWA)');

    // ── SEP-1 standard fields verification ──
    assert(tomlBody.includes('anchor_asset_type='), 'stellar.toml has anchor_asset_type (SEP-1)');
    assert(tomlBody.includes('regulated=true'), 'stellar.toml marks asset as regulated (SEP-1)');

    // ── IPFS document links in TOML ──
    assert(
      tomlBody.includes(MOCK_IPFS_HASH_CONTRACT),
      `stellar.toml contains IPFS contract hash ${MOCK_IPFS_HASH_CONTRACT.slice(0, 20)}…`,
    );
    assert(
      tomlBody.includes(MOCK_IPFS_HASH_PROSPECTUS),
      `stellar.toml contains IPFS prospectus hash ${MOCK_IPFS_HASH_PROSPECTUS.slice(0, 20)}…`,
    );
    assert(
      tomlBody.includes('attestation_of_reserve='),
      'stellar.toml has attestation_of_reserve (SEP-1 standard link for IPFS docs)',
    );
    assert(
      tomlBody.includes('redemption_instructions='),
      'stellar.toml has redemption_instructions (SEP-1 standard — all IPFS doc links)',
    );

    // ── 5B: STELLAR EXPERT API ──
    console.log('\n--- 5B: Stellar Expert API validation ---');
    const expertUrl = `https://api.stellar.expert/explorer/testnet/asset/${ASSET_CODE}-${testIssuer.publicKey()}`;
    let expertChecked = false;

    // Retry with backoff (asset may take time to index)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const expertRes = await fetch(expertUrl, { signal: AbortSignal.timeout(10000) });
        if (expertRes.ok) {
          const expertData = await expertRes.json();
          assert(true, `Stellar Expert: asset ${ASSET_CODE} indexed (attempt ${attempt})`);
          expertChecked = true;
          break;
        } else if (attempt < 3) {
          console.log(`  ⏳ Stellar Expert not ready (${expertRes.status}), retrying in ${attempt * 10}s...`);
          await sleep(attempt * 10000);
        }
      } catch (err) {
        if (attempt < 3) {
          console.log(`  ⏳ Stellar Expert unreachable: ${err.message}, retrying...`);
          await sleep(attempt * 10000);
        }
      }
    }

    if (!expertChecked) {
      console.log('  ⚠️  Stellar Expert check skipped (non-blocking — service may be down)');
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 6: VALIDATION ERROR TESTS
    // ═══════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║  PHASE 6: VALIDATION ERROR TESTS                   ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // No auth token → 401
    const noAuth = await request
      .post(`/api/admin/contracts/${offerId}/pause`);
    assert(noAuth.status === 401 || noAuth.status === 403, `POST /pause without auth → ${noAuth.status}`);

    // Missing price body → 400
    const noBody = await request
      .post(`/api/admin/contracts/${offerId}/price`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    assert(noBody.status === 400, `POST /price with empty body → ${noBody.status}`);

    // Negative deposit amount → 400
    const negDeposit = await request
      .post(`/api/admin/contracts/${offerId}/deposit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: -10 });
    assert(negDeposit.status === 400, `POST /deposit {amount: -10} → ${negDeposit.status}`);

    // Short address for freeze → 400
    const shortAddr = await request
      .post(`/api/admin/contracts/${offerId}/freeze`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ buyerAddress: 'GSHORT', frozen: true });
    assert(shortAddr.status === 400, `POST /freeze {address: 'GSHORT'} → ${shortAddr.status}`);

    // Non-existent offer → 404
    const notFound = await request
      .post('/api/admin/contracts/999999/pause')
      .set('Authorization', `Bearer ${adminToken}`);
    assert(notFound.status === 404, `POST /pause on offerId=999999 → ${notFound.status}`);

    // Token freeze with missing assetCode → 400
    const missingAsset = await request
      .post('/api/tokens/freeze')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ investorPublicKey: testInvestor.publicKey() });
    assert(missingAsset.status === 400 || missingAsset.status === 422, `POST /tokens/freeze without assetCode → ${missingAsset.status}`);

    // Clawback with zero amount → 400
    const zeroClawback = await request
      .post('/api/tokens/clawback')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        investorPublicKey: testInvestor.publicKey(),
        assetCode: ASSET_CODE,
        amount: 0,
      });
    assert(zeroClawback.status === 400 || zeroClawback.status === 422, `POST /tokens/clawback {amount: 0} → ${zeroClawback.status}`);

  } catch (err) {
    console.error('\n💥 FATAL ERROR:', err.message);
    console.error(err.stack);
    failed++;
  } finally {
    // ═══════════════════════════════════════════════════════════
    // PHASE 7: CLEANUP
    // ═══════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║  PHASE 7: CLEANUP                                   ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    try {
      // Clean offer-related records
      if (testIds.offerId) {
        await prisma.interestPayment.deleteMany({ where: { offerId: testIds.offerId } }).catch(() => {});
        await prisma.companyPenalty.deleteMany({ where: { offerId: testIds.offerId } }).catch(() => {});
        await prisma.paymentReminder.deleteMany({ where: { offerId: testIds.offerId } }).catch(() => {});
        await prisma.feeLog.deleteMany({ where: { assetCode: ASSET_CODE } }).catch(() => {});
        await prisma.investment.deleteMany({ where: { offerId: testIds.offerId } }).catch(() => {});
        await prisma.tokenDistribution.deleteMany({ where: { assetCode: ASSET_CODE } }).catch(() => {});
        await prisma.multiSigTransaction.deleteMany({
          where: { metadata: { path: ['offerId'], equals: testIds.offerId } },
        }).catch(() => {});
        await prisma.notification.deleteMany({
          where: { actionLink: { contains: String(testIds.offerId) } },
        }).catch(() => {});
        await prisma.token.deleteMany({ where: { offerId: testIds.offerId } }).catch(() => {});
        await prisma.offer.delete({ where: { id: testIds.offerId } }).catch(() => {});
      }

      // Clean company (cascade: companyUser)
      if (testIds.companyId) {
        await prisma.companyUser.deleteMany({ where: { companyId: testIds.companyId } }).catch(() => {});
        await prisma.company.delete({ where: { id: testIds.companyId } }).catch(() => {});
      }

      // Clean admin
      if (testIds.adminId) {
        await prisma.platformAdmin.delete({ where: { id: testIds.adminId } }).catch(() => {});
      }

      console.log('  ✅ All test records cleaned up');
    } catch (cleanupErr) {
      console.error('  ⚠️  Cleanup error:', cleanupErr.message);
    }

    await prisma.$disconnect().catch(() => {});
  }

  // ─── SUMMARY ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('⚠️  Some tests failed. Review output above.');
    process.exit(1);
  } else {
    console.log('✅ Full contract management suite verified!');
    console.log('   SETUP → DEPLOY → PAUSE → RESUME → DEPOSIT → PRICE → FREEZE → TTL → WITHDRAW → DRAIN');
    console.log('   → FREEZE-ACCT → UNFREEZE-ACCT → HOLDERS → CLAWBACK → DISABLE-CLAWBACK → TOML → EXPERT');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
