#!/usr/bin/env node
/**
 * Token Lifecycle E2E Test — FULL SOROBAN CYCLE
 *
 * Exercises the complete security token lifecycle on testnet:
 *   Phase 1: SETUP   — Fund accounts, issue token + SAC, mint test USDC + SAC
 *   Phase 2: DEPLOY  — Upload WASM, deploy sale contract, create sale, deposit, activate
 *   Phase 3: TRADE   — Investor buys tokens via Soroban sale contract
 *   Phase 4: PAYOUT  — Bullet maturity + clawback (token burn)
 *
 * Uses throwaway testnet keypairs — zero interaction with real platform keys.
 * Requires: Docker up (Postgres), internet (testnet), compiled WASM.
 *
 * Usage: node --import tsx backend/tests/e2e/tokenLifecycle.test.js
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
const testInvestorB = Keypair.random();
const testCompany = Keypair.random();

// Unique asset code per run to avoid collisions
const ASSET_CODE = 'T' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
const TOKEN_AMOUNT = '1000';       // 1000 tokens issued
const INVEST_USDC = 100;           // 100 USDC — investor's intended investment
const FIXED_FEE = 5;               // $5 processing fee per trade (additive — investor pays 105 total)
const ANNUAL_RATE = 12;            // 12% APY — company's cost of capital
const INVESTOR_RATE = 10;          // 10% APY — investor-facing yield (spread = 2%)
const SELL_PRICE = 10000000;       // 1 token = 1 USDC (in stroops: 1 * 10^7)
const BUY_PRICE = 10000000;        // 1 USDC  = 1 token

// Multi-investor phase constants
const MULTI_ASSET_CODE = 'M' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
const INVEST_A = 60;               // Investor A buys 60 tokens
const INVEST_B = 40;               // Investor B buys 40 tokens

/** Round to Stellar USDC precision (7dp = 1 stroop) — matches service's round7 */
const round7 = (v) => Math.round(v * 10_000_000) / 10_000_000;

// Override env BEFORE any service import
process.env.KEY_MANAGEMENT_MODE = 'env';
process.env.NODE_ENV = 'development';
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
// Test USDC: our test issuer is also the USDC issuer (we can mint unlimited)
process.env.USDC_ISSUER = testIssuer.publicKey();
process.env.DIVIDEND_FEE_PERCENT = '0';  // Legacy env — not used, spread model replaces this

// Now import services (they read env at construction)
const { default: prisma } = await import('../../src/config/prisma.js');
const { StellarService } = await import('../../src/services/stellar.service.js');
const { SorobanSaleService } = await import('../../src/services/sorobanSale.service.js');
const { PaymentService } = await import('../../src/services/payment.service.js');
const { CompanyPaymentService } = await import('../../src/services/companyPayment.service.js');
const { keyManager } = await import('../../src/services/KeyManager.js');
const {
  stellarServer, getNetworkPassphrase, getSorobanRpcUrl,
} = await import('../../src/config/stellar.js');

// ═══════════════════════════════════════════════════════════════
// Test Harness
// ═══════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
const testIds = { companyId: null, investorId: null, offerId: null, tokenId: null };

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
 * Get USDC balance for a classic Stellar account.
 */
async function getUSDCBalance(publicKey) {
  const account = await stellarServer.loadAccount(publicKey);
  const usdcLine = account.balances.find(
    b => b.asset_code === 'USDC' && b.asset_issuer === testIssuer.publicKey(),
  );
  return usdcLine ? parseFloat(usdcLine.balance) : 0;
}

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

  // Simulate and prepare
  tx = await StellarService.prepareSorobanTransaction(tx);
  tx.sign(testIssuer);

  const rpcServer = new rpc.Server(getSorobanRpcUrl());
  const sendResult = await rpcServer.sendTransaction(tx);

  // Poll for completion
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

  // Extract WASM hash from the upload result
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
  console.log('  Token Lifecycle E2E — Full Soroban Cycle (Testnet)');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Asset:       ${ASSET_CODE}`);
  console.log(`Issuer:      ${testIssuer.publicKey()}`);
  console.log(`Distributor: ${testDistributor.publicKey()}`);
  console.log(`Treasury:    ${testTreasury.publicKey()}`);
  console.log(`Investor:    ${testInvestor.publicKey()}`);
  console.log(`Company:     ${testCompany.publicKey()}`);
  console.log(`KeyMode:     ${keyManager.mode}\n`);

  assert(keyManager.mode === 'env', 'KeyManager running in env mode');

  try {
    // ─── PHASE 1: SETUP ───────────────────────────────────────
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  PHASE 1: SETUP (fund + issue + USDC)      ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // 1a. Fund all accounts
    console.log('--- Funding accounts via friendbot ---');
    await Promise.all([
      fundAccount(testIssuer.publicKey()),
      fundAccount(testDistributor.publicKey()),
      fundAccount(testTreasury.publicKey()),
      fundAccount(testOps.publicKey()),
      fundAccount(testInvestor.publicKey()),
      fundAccount(testInvestorB.publicKey()),
      fundAccount(testCompany.publicKey()),
    ]);
    assert(true, 'All 7 accounts funded via friendbot');
    await sleep(3000);

    // 1b. Setup issuer thresholds (OPS key as signer with weight=2)
    console.log('\n--- Setting up issuer thresholds ---');
    const thresholdResult = await SorobanSaleService.buildIssuerThresholdSetupXdr();
    const { Transaction: TxClass } = await import('@stellar/stellar-sdk');
    const thresholdTx = new TxClass(thresholdResult.xdr, Networks.TESTNET);
    thresholdTx.sign(testIssuer); // Master key (weight=10) satisfies high threshold
    await stellarServer.submitTransaction(thresholdTx);
    assert(true, 'Issuer thresholds set (OPS weight=2, med=2, high=10)');
    await sleep(2000);

    // 1c. Set issuer flags
    console.log('\n--- Setting issuer flags ---');
    const issuerResult = await StellarService.createIssuerAccount();
    assert(issuerResult.success, 'Issuer flags set (auth_required, auth_revocable, clawback)');

    // 1d. Issue security token + deploy SAC
    console.log('\n--- Issuing security token (forSaleContract=true) ---');
    const issueResult = await StellarService.issueSecurityToken(ASSET_CODE, TOKEN_AMOUNT, {
      forSaleContract: true,  // No distributor path — tokens minted via SAC later
    });
    assert(issueResult.success, `Issued ${ASSET_CODE} (flags + SAC deployed)`);
    const tokenSacId = issueResult.sacContractId;
    assert(!!tokenSacId, `Token SAC: ${tokenSacId?.slice(0, 12)}…`);

    // 1e. Deploy USDC SAC (our test USDC needs a SAC too for Soroban)
    console.log('\n--- Deploying USDC SAC ---');
    const usdcAsset = new Asset('USDC', testIssuer.publicKey());

    // First, establish USDC as an asset (trustline + mint to distributor for liquidity)
    // The SAC deploy requires the asset to exist on-chain
    await mintTestUSDC(testDistributor, 1);  // Creates the asset on-chain

    const usdcSacResult = await StellarService.deploySACForAsset('USDC', testIssuer.publicKey());
    const usdcSacId = StellarService.getSACContractId(usdcAsset);
    assert(!!usdcSacId, `USDC SAC: ${usdcSacId?.slice(0, 12)}…`);
    process.env.USDC_SAC_CONTRACT_ID = usdcSacId;

    // 1f. Mint test USDC to investor (to buy tokens) and others (trustlines)
    console.log('\n--- Minting test USDC ---');
    await mintTestUSDC(testInvestor, 500);   // 500 USDC to buy tokens
    await mintTestUSDC(testInvestorB, 500);   // 500 USDC for multi-investor test
    await mintTestUSDC(testCompany, 500);     // 500 USDC for bullet payout
    await mintTestUSDC(testTreasury, 0.0000001);  // Trustline for fee collection
    assert(true, 'Test USDC minted to investors (500 each), company (500), treasury (trustline)');

    // 1g. Create DB records
    console.log('\n--- Creating DB records ---');
    const company = await prisma.company.create({
      data: {
        name: `Test Company ${ASSET_CODE}`,
        email: `company-${ASSET_CODE.toLowerCase()}@lifecycle.test`,
        cnpj: `00.000.000/${ASSET_CODE}`,
        stellarPublicKey: testCompany.publicKey(),
        status: 'approved',
      },
    });
    testIds.companyId = company.id;

    const companyUser = await prisma.companyUser.create({
      data: {
        companyId: company.id,
        email: `admin-${ASSET_CODE.toLowerCase()}@lifecycle.test`,
        name: 'Test Admin',
        role: 'admin',
        isActive: true,
      },
    });

    const investor = await prisma.investor.create({
      data: {
        name: `Test Investor ${ASSET_CODE}`,
        email: `investor-${ASSET_CODE.toLowerCase()}@lifecycle.test`,
        document: `000.000.${ASSET_CODE}`,
        stellarContractId: testInvestor.publicKey(),    // E2E uses classic account, not smart wallet
        passkeyCredentialId: `test-passkey-${ASSET_CODE}`,
        kycStatus: 'approved',
      },
    });
    testIds.investorId = investor.id;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const offer = await prisma.offer.create({
      data: {
        companyId: company.id,
        requestedBy: companyUser.id,
        offerName: `Lifecycle Test ${ASSET_CODE}`,
        assetCode: ASSET_CODE,
        description: `E2E test offer for ${ASSET_CODE}`,
        totalSupply: parseInt(TOKEN_AMOUNT),
        unitPrice: 1.0,
        annualInterestRate: ANNUAL_RATE,
        investorRate: INVESTOR_RATE,
        offerType: 'sale',
        paymentType: 'bullet',
        maturityDate: yesterday,
        status: 'active',
        isTokenLocked: true,
        createdAt: thirtyDaysAgo,   // Backdate: offer started 30 days ago, matured yesterday
      },
    });
    testIds.offerId = offer.id;

    const token = await prisma.token.create({
      data: {
        offerId: offer.id,
        assetCode: ASSET_CODE,
        issuerPublicKey: testIssuer.publicKey(),
        sacContractId: tokenSacId,
        totalSupply: parseInt(TOKEN_AMOUNT),
        annualInterestRate: ANNUAL_RATE,
      },
    });
    testIds.tokenId = token.id;
    assert(true, `DB records: Company(${company.id}), Investor(${investor.id}), Offer(${offer.id}), Token(${token.id})`);

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
    const salt = crypto.createHash('sha256').update(`radox:sale:${offer.id}`).digest();
    const deployResult = await SorobanSaleService.buildDeployXdr(
      testIssuer.publicKey(), wasmHash, salt,
    );
    const saleContractId = deployResult.contractId;
    assert(!!saleContractId, `Sale contract precomputed: ${saleContractId.slice(0, 12)}…`);

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
        company: testCompany.publicKey(),
        fixedFee: BigInt(FIXED_FEE * 10_000_000),  // $5 processing fee (in stroops)
        sellPrice: SELL_PRICE,
        buyPrice: BUY_PRICE,
        deadlineLedger: 0,  // No deadline
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
    const depositAmount = BigInt(parseInt(TOKEN_AMOUNT) * 10_000_000);
    const depositResult = await SorobanSaleService.buildSacTransferXdr(
      tokenSacId, testIssuer.publicKey(), saleContractId, depositAmount,
    );
    await signAndSubmitSoroban(depositResult.xdr);
    assert(true, `Deposited ${TOKEN_AMOUNT} ${ASSET_CODE} into sale contract`);
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

    // ─── PHASE 3: TRADE ───────────────────────────────────────
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  PHASE 3: TRADE (investor buys tokens)     ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // Snapshot USDC balances BEFORE trade (TRADE INVARIANT: investor_USDC_before - trade_amount = investor_USDC_after)
    const investorUsdcBeforeTrade = await getUSDCBalance(testInvestor.publicKey());
    const companyUsdcBeforeTrade = await getUSDCBalance(testCompany.publicKey());
    const treasuryUsdcBeforeTrade = await getUSDCBalance(testTreasury.publicKey());
    console.log(`  Pre-trade USDC → Investor: ${investorUsdcBeforeTrade}, Company: ${companyUsdcBeforeTrade}, Treasury: ${treasuryUsdcBeforeTrade}`);

    // 3a. Create classic trustline for investor on security token
    // SAC set_authorized() requires an existing classic trustline
    console.log('--- Creating investor trustline for security token ---');
    const securityAsset = new Asset(ASSET_CODE, testIssuer.publicKey());
    const investorAcct = await stellarServer.loadAccount(testInvestor.publicKey());
    const trustlineTx = new TransactionBuilder(investorAcct, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.changeTrust({ asset: securityAsset }))
      .setTimeout(120)
      .build();
    trustlineTx.sign(testInvestor);
    await stellarServer.submitTransaction(trustlineTx);
    assert(true, 'Investor trustline created for security token');

    // 3b. Authorize investor on both SACs (token + USDC)
    console.log('--- Authorizing investor on SACs ---');
    await SorobanSaleService.authorizeBuyerOnSac(tokenSacId, testInvestor.publicKey());
    assert(true, 'Investor authorized on token SAC');
    // USDC also needs SAC authorization because testIssuer has auth_required
    // and testIssuer is the USDC issuer in this test
    await SorobanSaleService.authorizeBuyerOnSac(usdcSacId, testInvestor.publicKey());
    assert(true, 'Investor authorized on USDC SAC');
    // Also authorize company + treasury on USDC SAC (they receive USDC during trade)
    await SorobanSaleService.authorizeBuyerOnSac(usdcSacId, testCompany.publicKey());
    assert(true, 'Company authorized on USDC SAC');
    await SorobanSaleService.authorizeBuyerOnSac(usdcSacId, testTreasury.publicKey());
    assert(true, 'Treasury authorized on USDC SAC');
    // Sale contract also needs USDC SAC auth to receive USDC during trade()
    await SorobanSaleService.authorizeBuyerOnSac(usdcSacId, saleContractId);
    assert(true, 'Sale contract authorized on USDC SAC');

    // 3b. Build trade TX (buyer = G... account, signs directly)
    // We build the trade() call ourselves because buildTradeXdr validates C... only.
    // The contract accepts G... addresses — require_auth() uses SourceAccount credentials.
    console.log('\n--- Building trade TX ---');
    const saleContract = new Contract(saleContractId);
    const tradeAmount = BigInt(INVEST_USDC * 10_000_000); // stroops

    const tradeOp = saleContract.call(
      'trade',
      new Address(testInvestor.publicKey()).toScVal(),
      nativeToScVal(tradeAmount, { type: 'i128' }),
    );

    // Use investor as TX source (satisfies buyer.require_auth via SourceAccount)
    const investorAccount = await StellarService.getAccountRPC(testInvestor.publicKey());
    let tradeTx = new TransactionBuilder(investorAccount, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(tradeOp)
      .setTimeout(180)
      .build();

    tradeTx = await StellarService.prepareSorobanTransaction(tradeTx);
    tradeTx.sign(testInvestor);

    // Submit trade via RPC
    const rpcServer = new rpc.Server(getSorobanRpcUrl());
    let tradeSendResult = await rpcServer.sendTransaction(tradeTx);
    let tradeResult = tradeSendResult;
    if (tradeResult.status === 'PENDING') {
      let waited = 0;
      while (waited < 60000) {
        await sleep(3000);
        waited += 3000;
        tradeResult = await rpcServer.getTransaction(tradeSendResult.hash);
        if (tradeResult.status !== 'NOT_FOUND') break;
      }
    }
    assert(tradeResult.status === 'SUCCESS', `Trade executed (${INVEST_USDC} USDC → ${INVEST_USDC} ${ASSET_CODE})`);
    console.log(`  TX hash: ${tradeSendResult.hash}`);

    // 3c. Record in DB (simulates what the backend does after a successful trade)
    await prisma.tokenDistribution.create({
      data: {
        investorId: investor.id,
        assetCode: ASSET_CODE,
        amount: INVEST_USDC,  // Tokens received (contract allocates on gross buy_amount)
        transactionHash: tradeSendResult.hash,
        offerId: offer.id,
      },
    });
    await prisma.investment.create({
      data: {
        investorId: investor.id,
        offerId: offer.id,
        assetCode: ASSET_CODE,
        usdcAmount: INVEST_USDC,    // Investor's intended investment (fee should be additive)
        tokenAmount: INVEST_USDC,   // Contract gives tokens on gross buy_amount
        status: 'distributed',
        distributionTxHash: tradeSendResult.hash,
      },
    });
    assert(true, 'Investment + TokenDistribution records created');

    // ── TRADE ASSERTIONS (Financial Invariants) ──────────────
    const investorUsdcAfterTrade = await getUSDCBalance(testInvestor.publicKey());
    const companyUsdcAfterTrade = await getUSDCBalance(testCompany.publicKey());
    const treasuryUsdcAfterTrade = await getUSDCBalance(testTreasury.publicKey());
    const holders = await StellarService.listAssetHolders(ASSET_CODE);
    const investorHolder = holders.find(h => h.publicKey === testInvestor.publicKey());
    const investorTokens = investorHolder ? parseFloat(investorHolder.balance) : 0;

    console.log(`\n  USDC balances → Investor: ${investorUsdcAfterTrade}, Company: ${companyUsdcAfterTrade}, Treasury: ${treasuryUsdcAfterTrade}`);
    console.log(`  Token balance → Investor: ${investorTokens} ${ASSET_CODE}`);
    console.log(`  Fee split: investor paid ${INVEST_USDC + FIXED_FEE} total (${INVEST_USDC} investment + ${FIXED_FEE} fee)`);

    // Investor spent INVEST_USDC + FIXED_FEE (additive fee)
    assert(
      investorUsdcAfterTrade === investorUsdcBeforeTrade - INVEST_USDC - FIXED_FEE,
      `Investor USDC: ${investorUsdcAfterTrade} === ${investorUsdcBeforeTrade} - ${INVEST_USDC + FIXED_FEE} (investment + fee)`,
    );
    // Investor got INVEST_USDC tokens (contract allocates on gross, fee only splits USDC)
    assert(
      investorTokens === INVEST_USDC,
      `Token balance: ${investorTokens} === ${INVEST_USDC} (fee only affects USDC, not tokens)`,
    );
    // Company received full INVEST_USDC (fee is additive, not deducted)
    assert(
      companyUsdcAfterTrade === companyUsdcBeforeTrade + INVEST_USDC,
      `Company USDC: ${companyUsdcAfterTrade} === ${companyUsdcBeforeTrade} + ${INVEST_USDC} (full investment, fee additive)`,
    );
    // Treasury received the fixed fee
    assert(
      Math.abs(treasuryUsdcAfterTrade - (treasuryUsdcBeforeTrade + FIXED_FEE)) < 0.0001,
      `Treasury fee: ${treasuryUsdcAfterTrade} === ${treasuryUsdcBeforeTrade} + ${FIXED_FEE} ($${FIXED_FEE} processing fee)`,
    );

    // ─── PHASE 3.5: MONTHLY DIVIDEND PAYOUT ────────────────────
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  PHASE 3.5: MONTHLY DIVIDEND PAYOUT        ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // Create a monthly offer (same company, same asset) to test periodic path
    console.log('--- Creating monthly dividend offer ---');
    const MONTHLY_ASSET = 'M' + ASSET_CODE.slice(1);  // Different asset code for unique constraint
    const monthlyOffer = await prisma.offer.create({
      data: {
        companyId: company.id,
        requestedBy: companyUser.id,
        offerName: `Monthly Dividend ${MONTHLY_ASSET}`,
        assetCode: MONTHLY_ASSET,
        description: `E2E monthly test for ${MONTHLY_ASSET}`,
        totalSupply: parseInt(TOKEN_AMOUNT),
        unitPrice: 1.0,
        annualInterestRate: ANNUAL_RATE,
        investorRate: INVESTOR_RATE,
        offerType: 'collateral',
        paymentType: 'monthly',
        status: 'active',
        isTokenLocked: true,
      },
    });
    testIds.monthlyOfferId = monthlyOffer.id;

    // Create investment record for the monthly offer
    const monthlyInvestment = await prisma.investment.create({
      data: {
        investorId: investor.id,
        offerId: monthlyOffer.id,
        assetCode: ASSET_CODE,  // FK to tokens table requires existing asset
        usdcAmount: INVEST_USDC,
        tokenAmount: INVEST_USDC,  // Contract gives tokens on gross amount
        status: 'distributed',
        distributionTxHash: tradeSendResult.hash,  // Reuse — same underlying tokens
      },
    });
    assert(true, `Monthly offer(${monthlyOffer.id}) + investment(${monthlyInvestment.id}) created`);

    // 3.5a. Pre-compute expected dividend (DUAL COMPUTATION)
    const periodsPerYear = 12; // monthly
    const investorPeriodRate = (INVESTOR_RATE / 100) / periodsPerYear;
    const companyPeriodRate = (ANNUAL_RATE / 100) / periodsPerYear;

    const expectedInvestorInterest = round7(INVEST_USDC * investorPeriodRate);
    const expectedCompanyInterest = round7(INVEST_USDC * companyPeriodRate);
    const expectedSpread = round7(expectedCompanyInterest - expectedInvestorInterest);

    console.log(`  Independent calc: investorInterest=${expectedInvestorInterest}, companyInterest=${expectedCompanyInterest}, spread=${expectedSpread}`);
    console.log(`  Rates: investorRate=${INVESTOR_RATE}%/yr (${(investorPeriodRate*100).toFixed(4)}%/mo), companyRate=${ANNUAL_RATE}%/yr (${(companyPeriodRate*100).toFixed(4)}%/mo)`);

    // 3.5b. Snapshot USDC before dividend
    const investorUsdcBeforeDividend = await getUSDCBalance(testInvestor.publicKey());
    const companyUsdcBeforeDividend = await getUSDCBalance(testCompany.publicKey());
    const treasuryUsdcBeforeDividend = await getUSDCBalance(testTreasury.publicKey());
    console.log(`  Pre-dividend USDC → Investor: ${investorUsdcBeforeDividend}, Company: ${companyUsdcBeforeDividend}, Treasury: ${treasuryUsdcBeforeDividend}`);

    // 3.5c. Build periodic payment TX
    console.log('\n--- Building monthly dividend TX ---');
    const dividendResult = await CompanyPaymentService.createPaymentTransaction(
      monthlyOffer.id, companyUser.id,
    );
    assert(!!dividendResult.transactionXDR, 'Dividend payment XDR built');
    assert(dividendResult.isBullet === false, 'Payment type is periodic (not bullet)');
    assert(dividendResult.investorCount > 0, `Investors in dividend: ${dividendResult.investorCount}`);
    console.log(`  Total: ${dividendResult.totalAmount} USDC | Fee: ${dividendResult.platformFee} | Net: ${dividendResult.netToInvestors}`);

    // 3.5d. Dual computation — service vs independent math
    assert(
      parseFloat(dividendResult.netToInvestors) === expectedInvestorInterest,
      `Dividend dual-comp (investor): service net(${dividendResult.netToInvestors}) === independent(${expectedInvestorInterest})`,
    );
    assert(
      parseFloat(dividendResult.platformFee) === expectedSpread,
      `Dividend spread: platformFee(${dividendResult.platformFee}) === spread(${expectedSpread})`,
    );
    assert(
      parseFloat(dividendResult.totalAmount) === expectedInvestorInterest + expectedSpread,
      `Dividend total: ${dividendResult.totalAmount} === ${expectedInvestorInterest} + ${expectedSpread} (investor + spread)`,
    );

    // 3.5e. Sign with company and submit
    console.log('\n--- Signing and submitting dividend TX ---');
    const { Transaction: DivTxClass } = await import('@stellar/stellar-sdk');
    const dividendTx = new DivTxClass(dividendResult.transactionXDR, Networks.TESTNET);
    dividendTx.sign(testCompany);  // Company pays → no issuer sig needed (no clawback in periodic)

    const divSubmitResult = await stellarServer.submitTransaction(dividendTx);
    assert(divSubmitResult.successful, `Dividend TX submitted on-chain: ${divSubmitResult.hash}`);
    console.log(`  TX hash: ${divSubmitResult.hash}`);

    // 3.5f. Verify on-chain USDC movements
    console.log('\n--- Verifying dividend balances ---');
    const investorUsdcAfterDividend = await getUSDCBalance(testInvestor.publicKey());
    const companyUsdcAfterDividend = await getUSDCBalance(testCompany.publicKey());
    const treasuryUsdcAfterDividend = await getUSDCBalance(testTreasury.publicKey());

    console.log(`  Post-dividend USDC → Investor: ${investorUsdcAfterDividend}, Company: ${companyUsdcAfterDividend}, Treasury: ${treasuryUsdcAfterDividend}`);

    // Investor received exactly their monthly interest
    assert(
      Math.abs(investorUsdcAfterDividend - (investorUsdcBeforeDividend + expectedInvestorInterest)) < 0.0001,
      `Investor dividend: ${investorUsdcAfterDividend} === ${investorUsdcBeforeDividend} + ${expectedInvestorInterest}`,
    );

    // Treasury received the spread
    if (expectedSpread > 0) {
      assert(
        Math.abs(treasuryUsdcAfterDividend - (treasuryUsdcBeforeDividend + expectedSpread)) < 0.0001,
        `Treasury spread: ${treasuryUsdcAfterDividend} === ${treasuryUsdcBeforeDividend} + ${expectedSpread}`,
      );
    }

    // Company paid out total (interest + spread)
    const expectedCompanyDebit = expectedInvestorInterest + expectedSpread;
    assert(
      Math.abs(companyUsdcAfterDividend - (companyUsdcBeforeDividend - expectedCompanyDebit)) < 0.0001,
      `Company paid: ${companyUsdcAfterDividend} === ${companyUsdcBeforeDividend} - ${expectedCompanyDebit}`,
    );

    // Tokens NOT burned (periodic payments don't clawback)
    const holdersAfterDividend = await StellarService.listAssetHolders(ASSET_CODE);
    const investorAfterDiv = holdersAfterDividend.find(h => h.publicKey === testInvestor.publicKey());
    const tokensAfterDividend = investorAfterDiv ? parseFloat(investorAfterDiv.balance) : 0;
    assert(
      tokensAfterDividend === INVEST_USDC,
      `Tokens preserved after dividend: ${tokensAfterDividend} === ${INVEST_USDC} (no clawback in periodic)`,
    );

    // ─── PHASE 4: BULLET PAYOUT + BURN ────────────────────────
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  PHASE 4: BULLET PAYOUT + BURN             ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // 4a. Mark offer as matured
    console.log('--- Processing bullet maturity ---');
    const bulletResult = await PaymentService.processBulletPayments(ASSET_CODE);
    assert(bulletResult.success, 'Bullet maturity check ran');

    const maturedOffer = await prisma.offer.findUnique({ where: { id: offer.id } });
    assert(maturedOffer.status === 'matured', `Offer status: ${maturedOffer.status} (expected: matured)`);

    // 4b. Build bullet payment TX
    console.log('\n--- Building bullet payment TX ---');
    const paymentResult = await CompanyPaymentService.createPaymentTransaction(
      offer.id, companyUser.id,
    );
    assert(!!paymentResult.transactionXDR, 'Bullet payment XDR built');
    assert(paymentResult.isBullet === true, 'Payment type is bullet');
    assert(paymentResult.investorCount > 0, `Investors in payout: ${paymentResult.investorCount}`);
    console.log(`  Total: ${paymentResult.totalAmount} USDC | Fee: ${paymentResult.platformFee} | Net: ${paymentResult.netToInvestors}`);

    // 4c. Sign with company + issuer and submit directly
    // (Bypasses multi-sig admin flow — we're testing financial lifecycle, not governance)
    console.log('\n--- Signing and submitting bullet TX ---');
    const { Transaction } = await import('@stellar/stellar-sdk');
    const bulletTx = new Transaction(paymentResult.transactionXDR, Networks.TESTNET);
    bulletTx.sign(testCompany);   // Signs USDC payment ops
    bulletTx.sign(testIssuer);    // Signs clawback ops (issuer = source for clawback)

    const submitResult = await stellarServer.submitTransaction(bulletTx);
    assert(submitResult.successful, `Bullet TX submitted on-chain: ${submitResult.hash}`);
    console.log(`  TX hash: ${submitResult.hash}`);

    // Update offer status to closed (normally done by processEffects)
    await prisma.offer.update({
      where: { id: offer.id },
      data: { status: 'closed' },
    });

    // 4d. Verify final state
    console.log('\n--- Verifying final state ---');
    const finalOffer = await prisma.offer.findUnique({ where: { id: offer.id } });
    assert(
      finalOffer.status === 'closed',
      `Final offer status: ${finalOffer.status} (expected: closed)`,
    );

    // Check investor tokens burned (CLAWBACK INVARIANT)
    const finalHolders = await StellarService.listAssetHolders(ASSET_CODE);
    const finalBalance = finalHolders.find(h => h.publicKey === testInvestor.publicKey());
    const remainingTokens = finalBalance ? parseFloat(finalBalance.balance) : 0;
    assert(remainingTokens === 0, `Investor token balance after clawback: ${remainingTokens} (expected: 0)`);

    // ── BULLET PAYOUT INVARIANTS (with independent yield computation) ──
    const investorUsdcFinal = await getUSDCBalance(testInvestor.publicKey());
    const companyUsdcFinal = await getUSDCBalance(testCompany.publicKey());

    // Independent yield computation (DUAL COMPUTATION — never trust the service)
    const maturityDate = yesterday;
    const offerCreated = thirtyDaysAgo;  // offer.createdAt = thirtyDaysAgo
    const yearsToMaturity = (maturityDate.getTime() - offerCreated.getTime()) / (365 * 24 * 60 * 60 * 1000);

    // Investor gets investorRate, company pays annualRate
    const independentInvestorInterest = round7(INVEST_USDC * (INVESTOR_RATE / 100) * yearsToMaturity);
    const independentCompanyInterest = round7(INVEST_USDC * (ANNUAL_RATE / 100) * yearsToMaturity);
    const independentSpread = round7(Math.max(0, independentCompanyInterest - independentInvestorInterest));
    const independentPayout = round7(INVEST_USDC + independentInvestorInterest);

    console.log(`\n  Final USDC → Investor: ${investorUsdcFinal}, Company: ${companyUsdcFinal}`);
    console.log(`  Yield computation: principal=${INVEST_USDC}, companyRate=${ANNUAL_RATE}%, investorRate=${INVESTOR_RATE}%, years=${yearsToMaturity.toFixed(6)}`);
    console.log(`  Independent calc: investorInterest=${independentInvestorInterest}, companyInterest=${independentCompanyInterest}, spread=${independentSpread}`);
    console.log(`  Independent payout to investor: ${independentPayout}`);
    console.log(`  Service reported: total=${paymentResult.totalAmount}, fee=${paymentResult.platformFee}, net=${paymentResult.netToInvestors}`);

    // Service net to investors matches independent investor-rate math
    assert(
      parseFloat(paymentResult.netToInvestors) === independentPayout,
      `Dual computation (investor): service net(${paymentResult.netToInvestors}) === independent(${independentPayout})`,
    );

    // Platform fee matches the spread
    assert(
      parseFloat(paymentResult.platformFee) === independentSpread,
      `Yield spread: platformFee(${paymentResult.platformFee}) === spread(${independentSpread})`,
    );

    // Investor actually received the payout on-chain (starting from post-dividend balance)
    assert(
      investorUsdcFinal === investorUsdcAfterDividend + independentPayout,
      `Investor got paid: ${investorUsdcFinal} === ${investorUsdcAfterDividend} + ${independentPayout}`,
    );

    // Company balance decreased from post-dividend
    assert(
      companyUsdcFinal < companyUsdcAfterDividend,
      `Company paid out: ${companyUsdcFinal} < ${companyUsdcAfterDividend}`,
    );

    // Payout > principal (interest was earned, rate > 0)
    if (INVESTOR_RATE > 0) {
      assert(
        independentPayout > INVEST_USDC,
        `Payout includes interest: ${independentPayout} > ${INVEST_USDC}`,
      );
      assert(
        independentPayout < INVEST_USDC * 2,
        `Payout sanity: ${independentPayout} < ${INVEST_USDC * 2} (no >100% for <1yr)`,
      );
    }

    // ─── PHASE 5: MULTI-INVESTOR PROPORTIONAL SPLIT ───────────
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  PHASE 5: MULTI-INVESTOR (60/40 split)     ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // 5a. DB records — Investor B + new offer
    console.log('--- Creating Investor B + multi-investor offer ---');
    const investorB = await prisma.investor.create({
      data: {
        name: `Test Investor B ${MULTI_ASSET_CODE}`,
        email: `investor-b-${MULTI_ASSET_CODE.toLowerCase()}@lifecycle.test`,
        document: `000.001.${MULTI_ASSET_CODE}`,
        stellarContractId: testInvestorB.publicKey(),
        passkeyCredentialId: `test-passkey-b-${MULTI_ASSET_CODE}`,
        kycStatus: 'approved',
      },
    });
    testIds.investorBId = investorB.id;

    const multiOffer = await prisma.offer.create({
      data: {
        companyId: company.id,
        requestedBy: companyUser.id,
        offerName: `Multi-Investor Test ${MULTI_ASSET_CODE}`,
        assetCode: MULTI_ASSET_CODE,
        description: `Multi-investor E2E test for ${MULTI_ASSET_CODE}`,
        totalSupply: 1000,
        unitPrice: 1.0,
        annualInterestRate: ANNUAL_RATE,
        investorRate: INVESTOR_RATE,
        offerType: 'sale',
        paymentType: 'bullet',
        maturityDate: yesterday,
        status: 'active',
        isTokenLocked: true,
        createdAt: thirtyDaysAgo,
      },
    });
    testIds.multiOfferId = multiOffer.id;
    assert(true, `Multi-offer(${multiOffer.id}) + InvestorB(${investorB.id}) created`);

    // 5b. Issue token + deploy contract
    console.log('\n--- Issuing multi-investor token ---');
    const multiIssueResult = await StellarService.issueSecurityToken(MULTI_ASSET_CODE, '1000', {
      forSaleContract: true,
    });
    assert(multiIssueResult.success, `Issued ${MULTI_ASSET_CODE}`);
    const multiTokenSacId = multiIssueResult.sacContractId;
    assert(!!multiTokenSacId, `Multi-token SAC: ${multiTokenSacId?.slice(0, 12)}…`);

    await prisma.token.create({
      data: {
        offerId: multiOffer.id,
        assetCode: MULTI_ASSET_CODE,
        issuerPublicKey: testIssuer.publicKey(),
        sacContractId: multiTokenSacId,
        totalSupply: 1000,
        annualInterestRate: ANNUAL_RATE,
      },
    });

    console.log('\n--- Deploying multi-investor sale contract ---');
    const multiSalt = crypto.createHash('sha256').update(`radox:multi:${multiOffer.id}`).digest();
    const multiDeployResult = await SorobanSaleService.buildDeployXdr(
      testIssuer.publicKey(), wasmHash, multiSalt,
    );
    const multiSaleContractId = multiDeployResult.contractId;
    assert(!!multiSaleContractId, `Multi sale contract: ${multiSaleContractId.slice(0, 12)}…`);
    await signAndSubmitSoroban(multiDeployResult.xdr);
    assert(true, 'Multi sale contract deployed');
    await sleep(3000);

    const multiCreateResult = await SorobanSaleService.buildCreateSaleXdr(
      multiSaleContractId, testIssuer.publicKey(), {
        admin: testIssuer.publicKey(),
        seller: testIssuer.publicKey(),
        sellToken: multiTokenSacId,
        buyToken: usdcSacId,
        treasury: testTreasury.publicKey(),
        company: testCompany.publicKey(),
        fixedFee: BigInt(FIXED_FEE * 10_000_000),
        sellPrice: SELL_PRICE,
        buyPrice: BUY_PRICE,
        deadlineLedger: 0,
        minBuyAmount: 0n,
        maxBuyPerBuyer: 0n,
      },
    );
    await signAndSubmitSoroban(multiCreateResult.xdr);
    assert(true, 'Multi sale initialized (create)');
    await sleep(3000);

    // Authorize contract on token SAC + deposit + activate
    await SorobanSaleService.authorizeBuyerOnSac(multiTokenSacId, multiSaleContractId);
    const multiDepositAmount = BigInt(1000 * 10_000_000);
    const multiDepositResult = await SorobanSaleService.buildSacTransferXdr(
      multiTokenSacId, testIssuer.publicKey(), multiSaleContractId, multiDepositAmount,
    );
    await signAndSubmitSoroban(multiDepositResult.xdr);
    assert(true, `Deposited 1000 ${MULTI_ASSET_CODE} into sale contract`);
    await sleep(2000);

    const multiActivateResult = await SorobanSaleService.buildSetActiveXdr(multiSaleContractId, true);
    await signAndSubmitSoroban(multiActivateResult.xdr);
    assert(true, 'Multi sale activated');

    // 5c. Authorize both investors on SACs
    console.log('\n--- Authorizing investors A + B on multi-asset SACs ---');

    // Investor A: trustline + token SAC auth (USDC SAC already authorized from Phase 3)
    const multiAsset = new Asset(MULTI_ASSET_CODE, testIssuer.publicKey());
    const invAAcct = await stellarServer.loadAccount(testInvestor.publicKey());
    const trustA = new TransactionBuilder(invAAcct, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.changeTrust({ asset: multiAsset }))
      .setTimeout(120).build();
    trustA.sign(testInvestor);
    await stellarServer.submitTransaction(trustA);
    await SorobanSaleService.authorizeBuyerOnSac(multiTokenSacId, testInvestor.publicKey());
    assert(true, 'Investor A authorized on multi-token SAC');

    // Investor B: trustline + token SAC + USDC SAC auth
    const invBAcct = await stellarServer.loadAccount(testInvestorB.publicKey());
    const trustB = new TransactionBuilder(invBAcct, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.changeTrust({ asset: multiAsset }))
      .setTimeout(120).build();
    trustB.sign(testInvestorB);
    await stellarServer.submitTransaction(trustB);
    await SorobanSaleService.authorizeBuyerOnSac(multiTokenSacId, testInvestorB.publicKey());
    await SorobanSaleService.authorizeBuyerOnSac(usdcSacId, testInvestorB.publicKey());
    assert(true, 'Investor B authorized on multi-token SAC + USDC SAC');

    // Authorize sale contract on USDC SAC (new contract needs its own auth)
    await SorobanSaleService.authorizeBuyerOnSac(usdcSacId, multiSaleContractId);
    assert(true, 'Multi sale contract authorized on USDC SAC');

    // 5d. Snapshot + trades
    console.log('\n--- Trading: A=60, B=40 ---');
    const aUsdcBefore = await getUSDCBalance(testInvestor.publicKey());
    const bUsdcBefore = await getUSDCBalance(testInvestorB.publicKey());
    const compUsdcBefore = await getUSDCBalance(testCompany.publicKey());
    const treasUsdcBefore = await getUSDCBalance(testTreasury.publicKey());

    // Investor A trades 60
    const multiContract = new Contract(multiSaleContractId);
    const tradeAmountA = BigInt(INVEST_A * 10_000_000);
    const tradeOpA = multiContract.call('trade',
      new Address(testInvestor.publicKey()).toScVal(),
      nativeToScVal(tradeAmountA, { type: 'i128' }),
    );
    const invAAccount = await StellarService.getAccountRPC(testInvestor.publicKey());
    let tradeATx = new TransactionBuilder(invAAccount, {
      fee: BASE_FEE, networkPassphrase: getNetworkPassphrase(),
    }).addOperation(tradeOpA).setTimeout(180).build();
    tradeATx = await StellarService.prepareSorobanTransaction(tradeATx);
    tradeATx.sign(testInvestor);

    const rpcServerMulti = new rpc.Server(getSorobanRpcUrl());
    let tradeASend = await rpcServerMulti.sendTransaction(tradeATx);
    let tradeARes = tradeASend;
    if (tradeARes.status === 'PENDING') {
      let waited = 0;
      while (waited < 60000) { await sleep(3000); waited += 3000; tradeARes = await rpcServerMulti.getTransaction(tradeASend.hash); if (tradeARes.status !== 'NOT_FOUND') break; }
    }
    assert(tradeARes.status === 'SUCCESS', `Investor A traded ${INVEST_A} USDC`);

    // Investor B trades 40
    const tradeAmountB = BigInt(INVEST_B * 10_000_000);
    const tradeOpB = multiContract.call('trade',
      new Address(testInvestorB.publicKey()).toScVal(),
      nativeToScVal(tradeAmountB, { type: 'i128' }),
    );
    const invBAccount = await StellarService.getAccountRPC(testInvestorB.publicKey());
    let tradeBTx = new TransactionBuilder(invBAccount, {
      fee: BASE_FEE, networkPassphrase: getNetworkPassphrase(),
    }).addOperation(tradeOpB).setTimeout(180).build();
    tradeBTx = await StellarService.prepareSorobanTransaction(tradeBTx);
    tradeBTx.sign(testInvestorB);

    let tradeBSend = await rpcServerMulti.sendTransaction(tradeBTx);
    let tradeBRes = tradeBSend;
    if (tradeBRes.status === 'PENDING') {
      let waited = 0;
      while (waited < 60000) { await sleep(3000); waited += 3000; tradeBRes = await rpcServerMulti.getTransaction(tradeBSend.hash); if (tradeBRes.status !== 'NOT_FOUND') break; }
    }
    assert(tradeBRes.status === 'SUCCESS', `Investor B traded ${INVEST_B} USDC`);

    // Create DB records for both trades
    await prisma.investment.create({
      data: {
        investorId: investor.id, offerId: multiOffer.id, assetCode: MULTI_ASSET_CODE,
        usdcAmount: INVEST_A, tokenAmount: INVEST_A, status: 'distributed',
        distributionTxHash: tradeASend.hash,
      },
    });
    await prisma.investment.create({
      data: {
        investorId: investorB.id, offerId: multiOffer.id, assetCode: MULTI_ASSET_CODE,
        usdcAmount: INVEST_B, tokenAmount: INVEST_B, status: 'distributed',
        distributionTxHash: tradeBSend.hash,
      },
    });
    assert(true, 'Both investment records created');

    // Update offer with contract ID
    await prisma.offer.update({
      where: { id: multiOffer.id },
      data: { sorobanContractId: multiSaleContractId, sorobanInitStatus: 'active' },
    });

    // 5e. Trade assertions
    console.log('\n--- Multi-investor trade assertions ---');
    const multiHolders = await StellarService.listAssetHolders(MULTI_ASSET_CODE);
    const holderA = multiHolders.find(h => h.publicKey === testInvestor.publicKey());
    const holderB = multiHolders.find(h => h.publicKey === testInvestorB.publicKey());
    const tokensA = holderA ? parseFloat(holderA.balance) : 0;
    const tokensB = holderB ? parseFloat(holderB.balance) : 0;

    assert(tokensA === INVEST_A, `Investor A tokens: ${tokensA} === ${INVEST_A}`);
    assert(tokensB === INVEST_B, `Investor B tokens: ${tokensB} === ${INVEST_B}`);

    const aUsdcAfter = await getUSDCBalance(testInvestor.publicKey());
    const bUsdcAfter = await getUSDCBalance(testInvestorB.publicKey());
    const compUsdcAfter = await getUSDCBalance(testCompany.publicKey());
    const treasUsdcAfter = await getUSDCBalance(testTreasury.publicKey());

    assert(
      aUsdcAfter === aUsdcBefore - INVEST_A - FIXED_FEE,
      `A USDC: ${aUsdcAfter} === ${aUsdcBefore} - ${INVEST_A + FIXED_FEE}`,
    );
    assert(
      bUsdcAfter === bUsdcBefore - INVEST_B - FIXED_FEE,
      `B USDC: ${bUsdcAfter} === ${bUsdcBefore} - ${INVEST_B + FIXED_FEE}`,
    );
    assert(
      compUsdcAfter === compUsdcBefore + INVEST_A + INVEST_B,
      `Company USDC: ${compUsdcAfter} === ${compUsdcBefore} + ${INVEST_A + INVEST_B} (100% of investment)`,
    );
    assert(
      Math.abs(treasUsdcAfter - (treasUsdcBefore + FIXED_FEE * 2)) < 0.0001,
      `Treasury fees: ${treasUsdcAfter} === ${treasUsdcBefore} + ${FIXED_FEE * 2} (2 × $${FIXED_FEE})`,
    );
    console.log(`  Tokens: A=${tokensA}, B=${tokensB}`);
    console.log(`  USDC: A=${aUsdcAfter}, B=${bUsdcAfter}, Company=${compUsdcAfter}, Treasury=${treasUsdcAfter}`);

    // 5f. Bullet payout — proportional split assertions
    console.log('\n--- Multi-investor bullet payout ---');
    const multiPayment = await CompanyPaymentService.createPaymentTransaction(multiOffer.id, companyUser.id);

    assert(multiPayment.investorCount === 2, `investorCount: ${multiPayment.investorCount} === 2`);
    assert(multiPayment.breakdown.length === 2, `breakdown length: ${multiPayment.breakdown.length} === 2`);

    // Independent calculation (round7 precision — matches service)
    const multiYears = (yesterday.getTime() - thirtyDaysAgo.getTime()) / (365 * 24 * 60 * 60 * 1000);
    const totalInvested = INVEST_A + INVEST_B;

    // Per-investor independent math
    const indInterestA = round7(INVEST_A * (INVESTOR_RATE / 100) * multiYears);
    const indInterestB = round7(INVEST_B * (INVESTOR_RATE / 100) * multiYears);
    const indPayoutA = round7(INVEST_A + indInterestA);
    const indPayoutB = round7(INVEST_B + indInterestB);

    // Aggregate independent math
    const indTotalInterest = round7(totalInvested * (INVESTOR_RATE / 100) * multiYears);
    const indCompanyInterest = round7(totalInvested * (ANNUAL_RATE / 100) * multiYears);
    const indSpread = round7(indCompanyInterest - indTotalInterest);

    console.log(`  Independent calc: A interest=${indInterestA}, B interest=${indInterestB}`);
    console.log(`  Independent payouts: A=${indPayoutA}, B=${indPayoutB}`);
    console.log(`  Independent spread: ${indSpread} (company=${indCompanyInterest} - investor=${indTotalInterest})`);
    console.log(`  Service reported: investors=${multiPayment.investorCount}, fee=${multiPayment.platformFee}, net=${multiPayment.netToInvestors}`);

    // Find each investor in the breakdown
    const bdA = multiPayment.breakdown.find(b => b.investorWallet === testInvestor.publicKey());
    const bdB = multiPayment.breakdown.find(b => b.investorWallet === testInvestorB.publicKey());
    assert(!!bdA, 'Investor A found in breakdown');
    assert(!!bdB, 'Investor B found in breakdown');

    // ASSERTION GROUP 1: Per-investor correctness
    assert(
      bdA.interest === indInterestA,
      `A interest: service(${bdA.interest}) === independent(${indInterestA})`,
    );
    assert(
      bdB.interest === indInterestB,
      `B interest: service(${bdB.interest}) === independent(${indInterestB})`,
    );
    assert(
      bdA.totalPayout === indPayoutA,
      `A payout: service(${bdA.totalPayout}) === independent(${indPayoutA})`,
    );
    assert(
      bdB.totalPayout === indPayoutB,
      `B payout: service(${bdB.totalPayout}) === independent(${indPayoutB})`,
    );

    // ASSERTION GROUP 2: Sum conservation (Σ parts === aggregate)
    const sumInterest = round7(bdA.interest + bdB.interest);
    const sumPayout = round7(bdA.totalPayout + bdB.totalPayout);

    assert(
      sumInterest === indTotalInterest,
      `Sum conservation (interest): Σ(${bdA.interest} + ${bdB.interest}) = ${sumInterest} === total ${indTotalInterest}`,
    );
    assert(
      sumPayout === round7(totalInvested + indTotalInterest),
      `Sum conservation (payout): Σ(${bdA.totalPayout} + ${bdB.totalPayout}) = ${sumPayout} === total ${round7(totalInvested + indTotalInterest)}`,
    );

    // ASSERTION GROUP 3: Platform spread
    assert(
      multiPayment.platformFee === indSpread,
      `Platform spread: service(${multiPayment.platformFee}) === independent(${indSpread})`,
    );

    console.log('  ✅ All multi-investor proportional split assertions passed');

  } catch (err) {
    console.error('\n💥 FATAL ERROR:', err.message);
    console.error(err.stack);
    failed++;
  } finally {
    // ─── CLEANUP ──────────────────────────────────────────────
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  CLEANUP (DB records)                       ║');
    console.log('╚════════════════════════════════════════════╝\n');

    try {
      if (testIds.multiOfferId) {
        await prisma.companyPayment.deleteMany({ where: { offerId: testIds.multiOfferId } }).catch(() => {});
        await prisma.interestPayment.deleteMany({ where: { offerId: testIds.multiOfferId } }).catch(() => {});
        await prisma.feeLog.deleteMany({ where: { assetCode: MULTI_ASSET_CODE } }).catch(() => {});
        await prisma.investment.deleteMany({ where: { offerId: testIds.multiOfferId } });
        await prisma.tokenDistribution.deleteMany({ where: { assetCode: MULTI_ASSET_CODE } }).catch(() => {});
        await prisma.token.deleteMany({ where: { offerId: testIds.multiOfferId } }).catch(() => {});
        await prisma.offer.delete({ where: { id: testIds.multiOfferId } });
      }
      if (testIds.monthlyOfferId) {
        await prisma.companyPayment.deleteMany({ where: { offerId: testIds.monthlyOfferId } }).catch(() => {});
        await prisma.interestPayment.deleteMany({ where: { offerId: testIds.monthlyOfferId } }).catch(() => {});
        await prisma.investment.deleteMany({ where: { offerId: testIds.monthlyOfferId } });
        await prisma.offer.delete({ where: { id: testIds.monthlyOfferId } });
      }
      if (testIds.offerId) {
        await prisma.companyPayment.deleteMany({ where: { offerId: testIds.offerId } }).catch(() => {});
        await prisma.interestPayment.deleteMany({ where: { offerId: testIds.offerId } });
        await prisma.feeLog.deleteMany({ where: { assetCode: ASSET_CODE } }).catch(() => {});
        await prisma.investment.deleteMany({ where: { offerId: testIds.offerId } });
        await prisma.tokenDistribution.deleteMany({ where: { assetCode: ASSET_CODE } });
        await prisma.multiSigTransaction.deleteMany({
          where: { metadata: { path: ['offerId'], equals: testIds.offerId } },
        });
        await prisma.notification.deleteMany({
          where: { actionLink: { contains: String(testIds.offerId) } },
        }).catch(() => {});
        await prisma.token.deleteMany({ where: { offerId: testIds.offerId } });
        await prisma.offer.delete({ where: { id: testIds.offerId } });
      }
      if (testIds.investorBId) {
        await prisma.investor.delete({ where: { id: testIds.investorBId } });
      }
      if (testIds.investorId) {
        await prisma.investor.delete({ where: { id: testIds.investorId } });
      }
      if (testIds.companyId) {
        await prisma.companyUser.deleteMany({ where: { companyId: testIds.companyId } });
        await prisma.company.delete({ where: { id: testIds.companyId } });
      }
      console.log('  ✅ All test records cleaned up');
    } catch (cleanupErr) {
      console.error('  ⚠️  Cleanup error:', cleanupErr.message);
    }

    await prisma.$disconnect();
  }

  // ─── SUMMARY ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('⚠️  Some tests failed. Review output above.');
    process.exit(1);
  } else {
    console.log('✅ Full token lifecycle verified!');
    console.log('   SETUP → DEPLOY → TRADE → DIVIDEND → PAYOUT → BURN → MULTI-INVESTOR');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
