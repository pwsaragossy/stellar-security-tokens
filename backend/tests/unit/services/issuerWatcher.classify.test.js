import { test, describe } from 'node:test';
import assert from 'node:assert';
import { nativeToScVal, Address } from '@stellar/stellar-sdk';
import { IssuerWatcher } from '../../../src/services/issuerWatcher.service.js';

// ─── Helpers: build realistic raw Soroban SAC events (base64 ScVals) ───────
// Mirrors what Soroban RPC getEvents returns and what SorobanEventIndexer parses:
//   topic[0] = Symbol, topic[1..] = Address(es), value = data ScVal.
const ISSUER = 'GBONFES3E2D4GKBTK7MDM32URX65PE6H7EZ67F75DZZ7QLGT6JIVG6GD';
const OPS = 'GBVHLIHUAUQOUTH4NZROYDTJ5KEHWOX3N6WPASUEUTYCWOD2KGVMJRD3';

const sym = (s) => nativeToScVal(s, { type: 'symbol' }).toXDR('base64');
const addr = (g) => new Address(g).toScVal().toXDR('base64');
const i128 = (n) => nativeToScVal(String(n), { type: 'i128' }).toXDR('base64');
const bool = (b) => nativeToScVal(b, { type: 'bool' }).toXDR('base64');

function sacEvent({ topicSym, topicExtra = [], value, id = 'e-1', ledger = 100, txHash = 'tx_abc' }) {
  return {
    id,
    topic: [sym(topicSym), ...topicExtra],
    value,
    ledger,
    txHash,
    contractId: 'CSAC_TEST',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('IssuerWatcher — SAC event parsing', () => {
  test('parses a mint event: topic, amount (i128), and to-address', () => {
    const ev = sacEvent({ topicSym: 'mint', topicExtra: [addr(OPS)], value: i128(1_000_000_000), ledger: 42, txHash: 'tx_mint' });
    const p = IssuerWatcher._parseSacEvent(ev);
    assert.strictEqual(p.topic, 'mint');
    assert.strictEqual(String(p.data), '1000000000');
    assert.strictEqual(p.extraTopics[0], OPS);
    assert.strictEqual(p.ledger, 42);
    assert.strictEqual(p.txHash, 'tx_mint');
  });

  test('parses a clawback event: admin + from addresses and amount', () => {
    const ev = sacEvent({ topicSym: 'clawback', topicExtra: [addr(OPS), addr(ISSUER)], value: i128(500) });
    const p = IssuerWatcher._parseSacEvent(ev);
    assert.strictEqual(p.topic, 'clawback');
    assert.strictEqual(String(p.data), '500');
    assert.strictEqual(p.extraTopics[0], OPS);   // admin
    assert.strictEqual(p.extraTopics[1], ISSUER); // from
  });

  test('parses a set_admin event: new admin address in data', () => {
    const ev = sacEvent({ topicSym: 'set_admin', topicExtra: [addr(ISSUER)], value: addr(OPS) });
    const p = IssuerWatcher._parseSacEvent(ev);
    assert.strictEqual(p.topic, 'set_admin');
    assert.strictEqual(p.data, OPS);
  });

  test('parses a set_authorized event: authorize bool in data', () => {
    const ev = sacEvent({ topicSym: 'set_authorized', topicExtra: [addr(OPS)], value: bool(true) });
    const p = IssuerWatcher._parseSacEvent(ev);
    assert.strictEqual(p.topic, 'set_authorized');
    assert.strictEqual(p.data, true);
  });

  test('returns null for a topicless / malformed event', () => {
    assert.strictEqual(IssuerWatcher._parseSacEvent({ topic: [], value: null }), null);
    assert.strictEqual(IssuerWatcher._parseSacEvent({ topic: ['not-base64-$$$'], value: null }), null);
  });
});

describe('IssuerWatcher — SAC event classification (which events alert)', () => {
  const cfg = IssuerWatcher._config.SAC_EVENT_CONFIG;

  test('mint is alertable at error severity', () => {
    assert.ok(cfg.mint);
    assert.strictEqual(cfg.mint.severity, 'error');
    assert.notStrictEqual(cfg.mint.alertOff, true);
  });

  test('clawback is alertable at error severity', () => {
    assert.strictEqual(cfg.clawback.severity, 'error');
    assert.notStrictEqual(cfg.clawback.alertOff, true);
  });

  test('set_admin is alertable at error severity', () => {
    assert.strictEqual(cfg.set_admin.severity, 'error');
    assert.notStrictEqual(cfg.set_admin.alertOff, true);
  });

  test('set_authorized is logged-only (NOT alerted) — it is the expected hot path', () => {
    assert.strictEqual(cfg.set_authorized.alertOff, true);
  });

  test('non-admin SAC topics (transfer/burn/approve) are not in the alert config', () => {
    assert.strictEqual(cfg.transfer, undefined);
    assert.strictEqual(cfg.burn, undefined);
    assert.strictEqual(cfg.approve, undefined);
  });
});

describe('IssuerWatcher — issuer classic-op classification', () => {
  const cfg = IssuerWatcher._config.ISSUER_OP_CONFIG;

  test('set_options (threshold/signer/flag change) is alertable', () => {
    assert.ok(cfg.set_options);
    assert.strictEqual(cfg.set_options.severity, 'error');
  });

  test('account_merge is alertable', () => {
    assert.strictEqual(cfg.account_merge.severity, 'error');
  });

  test('classic clawback + clawback_claimable_balance are alertable', () => {
    assert.strictEqual(cfg.clawback.severity, 'error');
    assert.strictEqual(cfg.clawback_claimable_balance.severity, 'error');
  });

  test('benign ops (change_trust, payment-inbound) are not in the classic-op config', () => {
    // payment is handled separately (source-must-be-issuer); it is intentionally
    // NOT a static key here so inbound payments to the issuer never alert.
    assert.strictEqual(cfg.payment, undefined);
    assert.strictEqual(cfg.change_trust, undefined);
  });
});

describe('IssuerWatcher — cursor key fits SystemConfig varchar(50)', () => {
  test('secwatch_ + last 40 chars stays within 50 chars', () => {
    const contractId = 'CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX'; // 56 chars
    const key = IssuerWatcher._cursorKey(contractId);
    assert.ok(key.startsWith('secwatch_'));
    assert.ok(key.length <= 50, `cursor key length ${key.length} must be <= 50`);
  });
});
