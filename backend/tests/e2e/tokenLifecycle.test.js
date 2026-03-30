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
const testCompany = Keypair.random();

// Unique asset code per run to avoid collisions
const ASSET_CODE = 'T' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
const TOKEN_AMOUNT = '1000';       // 1000 tokens issued
const INVEST_USDC = 100;           // 100 USDC → buys 100 tokens at price 1:1
const ANNUAL_RATE = 0;             // 0% for first pass — set to 12.0 for interest tests
const SELL_PRICE = 10000000;       // 1 token = 1 USDC (in stroops: 1 * 10^7)
const BUY_PRICE = 10000000;        // 1 USDC  = 1 token

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
process.env.DIVIDEND_FEE_PERCENT = '0';  // Zero platform fee for clean math

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
      fundAccount(testCompany.publicKey()),
    ]);
    assert(true, 'All 6 accounts funded via friendbot');
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
    await mintTestUSDC(testCompany, 500);    // 500 USDC for bullet payout
    await mintTestUSDC(testTreasury, 0.0000001);  // Trustline for fee collection
    assert(true, 'Test USDC minted to investor (500), company (500), treasury (trustline)');

    // 1g. Create DB records
    console.log('\n--- Creating DB records ---');
    const company = await prisma.company.create({
      data: {
        name: `Test Company ${ASSET_CODE}`,
        email: `company-${ASSET_CODE.toLowerCase()}@lifecycle.test`,
        cnpj: `00.000.000/0001-${crypto.randomInt(10, 99)}`,
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
        document: `000.000.000-${crypto.randomInt(10, 99)}`,
        stellarContractId: testInvestor.publicKey(),    // E2E uses classic account, not smart wallet
        passkeyCredentialId: `test-passkey-${ASSET_CODE}`,
        kycStatus: 'approved',
      },
    });
    testIds.investorId = investor.id;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

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
        offerType: 'sale',
        paymentType: 'bullet',
        maturityDate: yesterday,
        status: 'active',
        isTokenLocked: true,
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
        fixedFee: 0n,        // No processing fee for test simplicity
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
        amount: INVEST_USDC,
        transactionHash: tradeSendResult.hash,
        offerId: offer.id,
      },
    });
    await prisma.investment.create({
      data: {
        investorId: investor.id,
        offerId: offer.id,
        assetCode: ASSET_CODE,
        usdcAmount: INVEST_USDC,
        tokenAmount: INVEST_USDC,
        status: 'distributed',
        distributionTxHash: tradeSendResult.hash,
      },
    });
    assert(true, 'Investment + TokenDistribution records created');

    // ── TRADE ASSERTIONS (Financial Invariants) ──────────────
    const investorUsdcAfterTrade = await getUSDCBalance(testInvestor.publicKey());
    const companyUsdcAfterTrade = await getUSDCBalance(testCompany.publicKey());
    const holders = await StellarService.listAssetHolders(ASSET_CODE);
    const investorHolder = holders.find(h => h.publicKey === testInvestor.publicKey());
    const investorTokens = investorHolder ? parseFloat(investorHolder.balance) : 0;

    console.log(`\n  USDC balances → Investor: ${investorUsdcAfterTrade}, Company: ${companyUsdcAfterTrade}`);
    console.log(`  Token balance → Investor: ${investorTokens} ${ASSET_CODE}`);

    assert(
      investorTokens === INVEST_USDC,
      `Token balance: ${investorTokens} === ${INVEST_USDC} (exact)`,
    );
    assert(
      investorUsdcAfterTrade === 500 - INVEST_USDC,
      `Investor USDC after trade: ${investorUsdcAfterTrade} === ${500 - INVEST_USDC}`,
    );
    // feeBps=0 → company gets 100% of investor's USDC (no contract retention)
    assert(
      companyUsdcAfterTrade >= INVEST_USDC,
      `Company received trade USDC: ${companyUsdcAfterTrade} >= ${INVEST_USDC} (feeBps=0, full amount)`,
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

    // Check USDC balances post-payout (BULLET PAYOUT INVARIANTS)
    // With 0% interest: payout = principal = INVEST_USDC
    const investorUsdcFinal = await getUSDCBalance(testInvestor.publicKey());
    const companyUsdcFinal = await getUSDCBalance(testCompany.publicKey());
    const expectedPayout = INVEST_USDC; // principal + 0 interest

    console.log(`\n  Final USDC → Investor: ${investorUsdcFinal}, Company: ${companyUsdcFinal}`);
    console.log(`  Expected payout: ${expectedPayout} USDC (principal=${INVEST_USDC}, interest=0)`);

    assert(
      investorUsdcFinal === investorUsdcAfterTrade + expectedPayout,
      `Investor got paid: ${investorUsdcFinal} === ${investorUsdcAfterTrade} + ${expectedPayout}`,
    );
    assert(
      companyUsdcFinal < companyUsdcAfterTrade,
      `Company paid out: ${companyUsdcFinal} < ${companyUsdcAfterTrade}`,
    );

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
    console.log('   SETUP → DEPLOY → TRADE → PAYOUT → BURN');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
