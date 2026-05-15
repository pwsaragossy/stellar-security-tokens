#!/usr/bin/env node
/**
 * EtherFuse Sandbox Probe
 * ───────────────────────
 * Answers the open architectural question for Radox's EtherFuse integration:
 * does EtherFuse accept a Soroban C-address as `publicKey` for a registered
 * wallet on Stellar — and if so, does an on-ramp actually deliver TESOURO
 * to that contract address?
 *
 *   Path A (probe passes): register `investor.stellarContractId` directly,
 *           EtherFuse SAC-transfers TESOURO to the contract. Zero forwarder.
 *
 *   Path C (probe fails):  provision a per-investor classic G-keypair,
 *           encrypt key at rest, EtherFuse delivers to the G-address,
 *           Radox forwards to the C-address via SAC transfer.
 *
 * Reads ETHERFUSE_API_KEY from .env at the repo root via Node's built-in
 * --env-file flag (no `dotenv` package dependency).
 *
 * Usage:
 *   node --env-file=.env scripts/etherfuse-sandbox-probe.mjs auth
 *   node --env-file=.env scripts/etherfuse-sandbox-probe.mjs assets [g-or-c-address-for-fee-quote]
 *   node --env-file=.env scripts/etherfuse-sandbox-probe.mjs register-c-address <c-address>
 *   node --env-file=.env scripts/etherfuse-sandbox-probe.mjs all <c-address>
 *   node --env-file=.env scripts/etherfuse-sandbox-probe.mjs onramp-e2e <c-address> [amount-brl]
 *
 * Each mode is idempotent in terms of side-effects on Radox; it ONLY touches
 * EtherFuse sandbox state. It creates ephemeral child organizations on
 * EtherFuse — those linger but are harmless.
 */

import crypto from 'node:crypto';

const API_BASE = process.env.ETHERFUSE_API_BASE_URL || 'https://api.sand.etherfuse.com';
const API_KEY = process.env.ETHERFUSE_API_KEY;

if (!API_KEY) {
  console.error('❌ ETHERFUSE_API_KEY not set. Add it to .env at the worktree root.');
  process.exit(1);
}

const HEADERS = {
  // EtherFuse docs: "Use Authorization: <api_key> with no Bearer prefix"
  Authorization: API_KEY,
  'Content-Type': 'application/json',
};

const TRUNCATE = 2000;

/**
 * Make a JSON HTTP call against EtherFuse. Verbose by design — every probe
 * call prints request + response so failures are inspectable post-hoc.
 */
async function call(method, urlPath, body) {
  const url = `${API_BASE}${urlPath}`;
  const opts = { method, headers: HEADERS };
  if (body !== undefined) opts.body = JSON.stringify(body);

  console.log(`\n→ ${method} ${url}`);
  if (body) console.log(`  body: ${JSON.stringify(body)}`);

  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  console.log(`← ${res.status} ${res.statusText}`);
  const printable = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  console.log(printable.length > TRUNCATE
    ? `  ${printable.slice(0, TRUNCATE)}\n  …(truncated ${printable.length - TRUNCATE} more chars)`
    : printable.split('\n').map(l => `  ${l}`).join('\n'));

  return { status: res.status, ok: res.ok, data };
}

function header(title) {
  const bar = '═'.repeat(72);
  console.log(`\n${bar}\n  ${title}\n${bar}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stages
// ─────────────────────────────────────────────────────────────────────────────

/** Stage A — auth smoke test */
async function stageAuth() {
  header('STAGE A: auth smoke test (GET /ramp/me)');
  const me = await call('GET', '/ramp/me');
  if (!me.ok) {
    console.error('\n❌ Auth failed. Verify ETHERFUSE_API_KEY is a valid sandbox key for a business account.');
    process.exit(1);
  }
  const orgId = me.data?.organizationId ?? me.data?.id ?? '(not found in response)';
  console.log(`\n✅ Auth OK. Org: ${orgId}`);
  return me.data;
}

/** Stage B — list BRL-rampable Stellar assets, look for TESOURO */
async function stageAssets(walletForFeeQuote) {
  header('STAGE B: BRL-rampable Stellar assets (GET /ramp/assets)');
  // Per the OpenAPI: blockchain, currency, wallet are all required query params.
  // The `wallet` field is used for trustline/account-existence fee calculation.
  const qs = new URLSearchParams({
    blockchain: 'stellar',
    currency: 'brl',
    wallet: walletForFeeQuote,
  });
  const res = await call('GET', `/ramp/assets?${qs}`);
  if (!res.ok) {
    console.error('\n⚠ Asset listing failed. The /ramp/assets endpoint may have stricter validation than the OpenAPI spec suggests.');
    return null;
  }
  const assets = Array.isArray(res.data) ? res.data : (res.data?.assets ?? []);
  const tesouro = assets.find(a => (a.symbol ?? '').toUpperCase() === 'TESOURO');
  if (tesouro) {
    console.log(`\n✅ TESOURO found:`);
    console.log(`   symbol:     ${tesouro.symbol}`);
    console.log(`   identifier: ${tesouro.identifier}`);
    console.log(`   currency:   ${tesouro.currency}`);
    console.log(`   name:       ${tesouro.name}`);
    return tesouro;
  }
  console.warn('\n⚠ TESOURO not in returned list. Available symbols:');
  console.warn('  ' + assets.map(a => a.symbol).join(', '));
  return null;
}

/**
 * Stage C — the real test: try to register a C-address as wallet by creating
 * a fresh sandbox child organization with that wallet attached.
 *
 * Decision rule:
 *   - 2xx with wallet echoed back  → Path A is viable at the API level.
 *                                     Still needs end-to-end delivery test.
 *   - 4xx with format error        → Path C required.
 *   - Other 4xx (e.g. missing user info) → ambiguous; report and re-run after fix.
 */
async function stageRegisterCAddress(cAddress) {
  header(`STAGE C: register C-address as wallet (POST /ramp/organization with embedded wallet)`);

  if (!/^C[A-Z0-9]{55}$/.test(cAddress)) {
    console.warn(`\n⚠ "${cAddress}" doesn't look like a Stellar Soroban contract ID (56-char base32 starting with C). Continuing anyway — EtherFuse may have different validation.`);
  }

  const customerId = crypto.randomUUID();
  const payload = {
    id: customerId,
    displayName: `radox-probe-${Date.now().toString(36)}`,
    accountType: 'personal',
    wallets: [{ publicKey: cAddress, blockchain: 'stellar' }],
    userInfo: {
      email: `probe+${customerId.slice(0, 8)}@radox.test`,
      displayName: 'Radox Probe',
    },
  };

  const res = await call('POST', '/ramp/organization', payload);

  if (res.ok) {
    console.log('\n✅ EtherFuse ACCEPTED the C-address at the API layer.');
    console.log('   → Path A is viable so far. Next: run a full on-ramp to verify delivery actually lands on the contract.');
    console.log(`   → Probe customer ID (linger in sandbox, harmless): ${customerId}`);
    return { viable: true, customerId, walletEchoed: res.data?.wallets ?? res.data };
  }

  const errStr = (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)).toLowerCase();
  if (
    res.status === 400 &&
    (errStr.includes('publickey') || errStr.includes('wallet') || errStr.includes('invalid') || errStr.includes('format'))
  ) {
    console.error('\n❌ EtherFuse rejected the C-address with a wallet/format error.');
    console.error('   → Path A is NOT viable. Fall back to Path C (per-investor G-address ramp).');
    return { viable: false, reason: 'format-rejected', error: res.data };
  }

  console.error('\n⚠ Inconclusive. Non-format error; could be a different validation issue.');
  console.error('   → Inspect the error above. Common causes: missing required fields, sandbox quirk, RFC/CURP not applicable for BR customer.');
  return { viable: null, reason: 'inconclusive', error: res.data };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE D: end-to-end on-ramp delivery probe
// ─────────────────────────────────────────────────────────────────────────────
//
// Answers the load-bearing question: when EtherFuse completes a BRL→TESOURO
// on-ramp targeting a Soroban C-address, does it
//   (a) populate `stellarClaimTransaction` (i.e. classic-tx claim flow,
//       which a Soroban contract cannot sign → Path C forced), or
//   (b) deliver via a direct SAC transfer (no claim tx, contract receives
//       tokens straight away → Path A works end-to-end)?
//
// Walks the full programmatic flow: fresh customer org → KYC (auto-approves
// in sandbox) → PIX bank account → BRL→TESOURO quote → order → simulated
// fiat received → final order state inspection.

/**
 * Submit programmatic KYC for a probe customer. In sandbox this auto-approves
 * the customer and fires `kyc_updated`. Returns the raw response so the
 * caller can read the new status.
 */
async function probeSubmitKyc(customerId, cAddress, email) {
  header(`STAGE D2: submit KYC (POST /ramp/customer/${customerId}/kyc)`);
  const payload = {
    pubkey: cAddress,
    identity: {
      id: cAddress,
      email,
      phoneNumber: '+5511999990000',
      occupation: 'Software Engineer',
      name: { givenName: 'Radox', familyName: 'Probe' },
      dateOfBirth: '1990-01-01',
      address: {
        street: 'Av. Paulista 1000',
        city: 'São Paulo',
        region: 'SP',
        postalCode: '01310-100',
        country: 'BR',
      },
      // BR ID number: CPF. Format guess; sandbox is lax. If 400, dump and re-shape.
      idNumbers: [{ value: '12345678901', type: 'CPF' }],
    },
  };
  const res = await call('POST', `/ramp/customer/${customerId}/kyc`, payload);
  return res;
}

/**
 * Register a BR PIX bank account. The EtherFuse public docs describe a
 * MX/CLABE schema only; BR PIX schema is empirically discovered here. We
 * try a PIX-shaped account first; the error response (if any) tells us
 * the real expected fields.
 */
async function probeRegisterPixBankAccount(customerId) {
  header(`STAGE D3: register PIX bank account (POST /ramp/customer/${customerId}/bank-account)`);
  const payload = {
    account: {
      transactionId: crypto.randomUUID(),
      firstName: 'Radox',
      paternalLastName: 'Probe',
      birthDate: '19900101',
      birthCountryIsoCode: 'BR',
      // BR identifier — sending CPF in both common field names; sandbox
      // ignores what it doesn't recognize.
      cpf: '12345678901',
      pixKey: `probe+${customerId.slice(0, 8)}@radox.test`,
      pixKeyType: 'email',
      countryIsoCode: 'BR',
    },
  };
  const res = await call('POST', `/ramp/customer/${customerId}/bank-account`, payload);
  return res;
}

/**
 * Create a BRL → TESOURO quote. Passing walletAddress so EtherFuse can
 * include any one-time onboarding fee for a wallet that's not yet on-chain.
 */
async function probeCreateOnrampQuote(customerId, cAddress, tesouroIdentifier, amountBrl) {
  header(`STAGE D4: create BRL→TESOURO quote (POST /ramp/quote)`);
  const quoteId = crypto.randomUUID();
  const payload = {
    quoteId,
    customerId,
    blockchain: 'stellar',
    quoteAssets: {
      type: 'onramp',
      sourceAsset: 'BRL', // try uppercase; assets endpoint returned lowercase but quote enum may differ
      targetAsset: tesouroIdentifier,
    },
    sourceAmount: String(amountBrl),
    walletAddress: cAddress,
  };
  const res = await call('POST', '/ramp/quote', payload);
  return { quoteId, response: res };
}

/**
 * Execute the quote. Returns the order's PIX deposit instructions plus the
 * etherfuseOrderId we generated.
 */
async function probeCreateOrder(orderId, bankAccountId, quoteId, cAddress) {
  header(`STAGE D5: create on-ramp order (POST /ramp/order)`);
  const payload = {
    orderId,
    bankAccountId,
    publicKey: cAddress,
    quoteId,
  };
  const res = await call('POST', '/ramp/order', payload);
  return res;
}

/** Sandbox-only: simulate the PIX deposit. */
async function probeSimulateFiatReceived(orderId, amountBrl) {
  header(`STAGE D6: simulate PIX received (POST /ramp/order/fiat_received)`);
  return call('POST', '/ramp/order/fiat_received', { orderId, amount: amountBrl });
}

/**
 * Poll the order until completion (or timeout). Returns the final state so
 * the caller can inspect `stellarClaimTransaction` / `stellarClaimableBalanceId`.
 */
async function probePollUntilComplete(orderId, { maxAttempts = 20, intervalMs = 3000 } = {}) {
  header(`STAGE D7: poll order until terminal (GET /ramp/order/${orderId})`);
  for (let i = 1; i <= maxAttempts; i++) {
    // Per docs, freshly created orders have a 3–10s indexing delay before
    // the GET endpoint sees them — first attempts may 404.
    const res = await call('GET', `/ramp/order/${orderId}`);
    const status = res.data?.status;
    if (status && ['completed', 'finalized', 'failed', 'refunded', 'canceled'].includes(status)) {
      console.log(`\n✅ Terminal state reached: ${status} (after ${i} polls)`);
      return res.data;
    }
    if (i < maxAttempts) {
      console.log(`  …status=${status ?? '(404)'} — sleeping ${intervalMs}ms`);
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  console.warn(`\n⚠ Timed out waiting for terminal state on order ${orderId}`);
  return null;
}

/**
 * Full end-to-end on-ramp probe. Returns a decision verdict and the relevant
 * fields from the completed order for the user/Claude to inspect.
 */
async function stageOnrampEndToEnd(cAddress, amountBrl) {
  // D1: create fresh probe customer with embedded wallet
  header('STAGE D1: create fresh probe customer with C-address wallet');
  const customerId = crypto.randomUUID();
  const email = `probe+${customerId.slice(0, 8)}@radox.test`;
  const orgPayload = {
    id: customerId,
    displayName: `radox-probe-d-${Date.now().toString(36)}`,
    accountType: 'personal',
    wallets: [{ publicKey: cAddress, blockchain: 'stellar' }],
    userInfo: { email, displayName: 'Radox Probe D' },
  };
  const orgRes = await call('POST', '/ramp/organization', orgPayload);
  if (!orgRes.ok) {
    console.error('❌ D1 failed — cannot proceed.');
    return { verdict: 'failed', stage: 'D1', error: orgRes.data };
  }

  // D2: submit KYC (sandbox auto-approves on success)
  const kycRes = await probeSubmitKyc(customerId, cAddress, email);
  if (!kycRes.ok) {
    console.error('❌ D2 failed — KYC schema rejected. Inspect error and re-shape identity payload.');
    return { verdict: 'failed', stage: 'D2', error: kycRes.data };
  }

  // D3: register PIX bank account — schema empirically probed
  const bankRes = await probeRegisterPixBankAccount(customerId);
  if (!bankRes.ok) {
    console.error('❌ D3 failed — PIX bank-account schema rejected.');
    console.error('   → Inspect error above; the docs are MX/CLABE-centric.');
    console.error('   → Try different field names (clabe vs pixKey, pixKeyType variants).');
    return { verdict: 'failed', stage: 'D3', error: bankRes.data };
  }
  const bankAccountId = bankRes.data?.bankAccountId ?? bankRes.data?.id;

  // D4: BRL → TESOURO quote
  const tesouroIdentifier = process.env.ETHERFUSE_TESOURO_ASSET_IDENTIFIER
    || 'TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
  const quoteRes = await probeCreateOnrampQuote(customerId, cAddress, tesouroIdentifier, amountBrl);
  if (!quoteRes.response?.ok) {
    console.error('❌ D4 failed — quote rejected.');
    return { verdict: 'failed', stage: 'D4', error: quoteRes.response?.data };
  }

  // D5: create order
  const orderId = crypto.randomUUID();
  const orderRes = await probeCreateOrder(orderId, bankAccountId, quoteRes.quoteId, cAddress);
  if (!orderRes.ok) {
    console.error('❌ D5 failed — order creation rejected.');
    return { verdict: 'failed', stage: 'D5', error: orderRes.data };
  }

  // D6: simulate PIX received
  // Allow a few seconds for the order to be indexed before the simulator fires.
  await new Promise(r => setTimeout(r, 4000));
  const fiatRes = await probeSimulateFiatReceived(orderId, amountBrl);
  if (!fiatRes.ok) {
    console.error('❌ D6 failed — fiat_received simulator rejected. Order may not be indexed yet.');
    return { verdict: 'failed', stage: 'D6', error: fiatRes.data };
  }

  // D7: poll for terminal
  const finalOrder = await probePollUntilComplete(orderId);
  if (!finalOrder) {
    return { verdict: 'timeout', stage: 'D7', orderId };
  }

  // D8: read out the load-bearing fields
  header('STAGE D8: delivery-path inspection');
  const claimBalance = finalOrder.stellarClaimableBalanceId ?? null;
  const claimTx = finalOrder.stellarClaimTransaction ?? null;
  const txSig = finalOrder.confirmedTxSignature ?? null;
  console.log(`\n  status:                     ${finalOrder.status}`);
  console.log(`  confirmedTxSignature:       ${txSig ?? '(null)'}`);
  console.log(`  stellarClaimableBalanceId:  ${claimBalance ?? '(null)'}`);
  console.log(`  stellarClaimTransaction:    ${claimTx ? '(present, ' + claimTx.length + ' chars)' : '(null)'}`);

  let verdict;
  if (claimTx || claimBalance) {
    verdict = 'path-c-forced';
    console.log('\n❌ Delivery uses Stellar Classic claimable balance + claim transaction.');
    console.log('   → A Soroban C-address cannot sign this classic tx the same way a G-address would.');
    console.log('   → Path A is NOT viable end-to-end. Commit to Path C (custodial G-address).');
  } else if (finalOrder.status === 'completed' && txSig) {
    verdict = 'path-a-viable';
    console.log('\n✅ Delivery uses a direct on-chain transfer (no claim transaction).');
    console.log('   → Path A is end-to-end viable. The C-address receives TESOURO directly.');
    console.log('   → Confirm via Horizon: https://horizon-testnet.stellar.org/transactions/' + txSig);
  } else {
    verdict = 'inconclusive';
    console.log('\n⚠ Order reached terminal but neither claim-tx nor confirmedTxSignature is populated.');
    console.log('   → Inspect the full order body above and re-run before committing to a path.');
  }
  return { verdict, stage: 'complete', orderId, finalOrder };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const mode = process.argv[2];
const arg = process.argv[3];

(async () => {
  console.log(`EtherFuse sandbox probe → ${API_BASE}\n`);

  switch (mode) {
    case 'auth': {
      await stageAuth();
      break;
    }
    case 'assets': {
      const wallet = arg || 'GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR';
      console.log(`Using ${wallet} as the fee-quote wallet (BR investor wallet you actually own works best).\n`);
      await stageAuth();
      await stageAssets(wallet);
      break;
    }
    case 'register-c-address': {
      if (!arg) {
        console.error('Pass the C-address as the second arg.\n  e.g. node scripts/etherfuse-sandbox-probe.mjs register-c-address C...');
        process.exit(1);
      }
      await stageAuth();
      await stageRegisterCAddress(arg);
      break;
    }
    case 'all': {
      if (!arg) {
        console.error('Pass the C-address as the second arg.\n  e.g. node scripts/etherfuse-sandbox-probe.mjs all C...');
        process.exit(1);
      }
      await stageAuth();
      await stageAssets(arg);
      const result = await stageRegisterCAddress(arg);
      header('SUMMARY');
      if (result.viable === true) {
        console.log('Path A is API-viable. Next test: full on-ramp end-to-end (separate script).');
      } else if (result.viable === false) {
        console.log('Path A is not viable. Implement Path C (per-investor G-address custodial ramp).');
      } else {
        console.log('Inconclusive. Investigate the error above and re-run.');
      }
      break;
    }
    case 'onramp-e2e': {
      if (!arg) {
        console.error('Pass the C-address as the second arg.\n  e.g. node scripts/etherfuse-sandbox-probe.mjs onramp-e2e C... [amount-brl]');
        process.exit(1);
      }
      const amountBrl = process.argv[4] ? Number(process.argv[4]) : 100;
      await stageAuth();
      const verdict = await stageOnrampEndToEnd(arg, amountBrl);
      header('SUMMARY');
      console.log(`Verdict: ${verdict.verdict}  (stage reached: ${verdict.stage})`);
      if (verdict.verdict === 'path-a-viable') {
        console.log('\n→ Proceed with Path A: register C-addresses directly, no custodial keys.');
      } else if (verdict.verdict === 'path-c-forced') {
        console.log('\n→ Switch to Path C: per-investor G-address ramp + SAC forwarder + AES-256-GCM key custody.');
      } else if (verdict.verdict === 'failed') {
        console.log('\n→ Re-run after fixing the schema mismatch printed above.');
      } else {
        console.log('\n→ Inspect the order body and decide manually.');
      }
      break;
    }
    default:
      console.log('Usage:');
      console.log('  node scripts/etherfuse-sandbox-probe.mjs auth');
      console.log('  node scripts/etherfuse-sandbox-probe.mjs assets [wallet-for-fee-quote]');
      console.log('  node scripts/etherfuse-sandbox-probe.mjs register-c-address <c-address>');
      console.log('  node scripts/etherfuse-sandbox-probe.mjs all <c-address>');
      console.log('  node scripts/etherfuse-sandbox-probe.mjs onramp-e2e <c-address> [amount-brl]');
      process.exit(1);
  }
})().catch(err => {
  console.error('\n💥 Probe crashed:', err);
  process.exit(1);
});
