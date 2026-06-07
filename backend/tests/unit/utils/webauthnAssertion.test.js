/**
 * webauthnAssertion.js — verifies WebAuthn login assertions server-side.
 *
 * Self-contained: generates a real P-256 keypair, crafts a valid assertion, and
 * checks the happy path + every rejection branch. No fixtures required.
 *
 * Run: node --test tests/unit/utils/webauthnAssertion.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { generateKeyPairSync, createHash, sign as cryptoSign } from 'node:crypto';

import { verifyAssertion } from '../../../src/utils/webauthnAssertion.js';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Build a valid (or deliberately broken) assertion + the raw 65-byte pubkey.
 */
function makeFixture({
  challenge = 'p9X2_challenge_abc',
  origin = 'https://app.example.com',
  rpId = 'example.com',
  flags = 0x05, // UP (0x01) | UV (0x04)
  counter = 0,
  tamperSignature = false,
} = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const rawPub = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);

  const clientDataJSON = Buffer.from(
    JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }),
    'utf8'
  );

  const rpIdHash = createHash('sha256').update(rpId).digest();
  const counterBuf = Buffer.alloc(4);
  counterBuf.writeUInt32BE(counter);
  const authData = Buffer.concat([rpIdHash, Buffer.from([flags]), counterBuf]);

  const signedData = Buffer.concat([authData, createHash('sha256').update(clientDataJSON).digest()]);
  let signature = cryptoSign('sha256', signedData, { key: privateKey, dsaEncoding: 'der' });
  if (tamperSignature) {
    signature = Buffer.from(signature);
    signature[signature.length - 1] ^= 0xff;
  }

  const assertion = {
    id: 'cred-abc',
    rawId: 'cred-abc',
    type: 'public-key',
    response: {
      authenticatorData: b64url(authData),
      clientDataJSON: b64url(clientDataJSON),
      signature: b64url(signature),
    },
  };

  return { rawPub, assertion, challenge, origin, rpId };
}

const base = (f) => ({
  publicKey: f.rawPub,
  assertion: f.assertion,
  expectedChallenge: f.challenge,
  expectedOrigin: f.origin,
  expectedRpId: f.rpId,
});

describe('verifyAssertion', () => {
  test('accepts a valid assertion', () => {
    const f = makeFixture();
    const res = verifyAssertion(base(f));
    assert.strictEqual(res.verified, true, res.reason);
  });

  test('accepts when expectedOrigin is an allowlist containing the origin', () => {
    const f = makeFixture();
    const res = verifyAssertion({ ...base(f), expectedOrigin: ['https://other.example.com', f.origin] });
    assert.strictEqual(res.verified, true, res.reason);
  });

  test('rejects a challenge mismatch (replayed/forged challenge)', () => {
    const f = makeFixture();
    const res = verifyAssertion({ ...base(f), expectedChallenge: 'different-challenge' });
    assert.strictEqual(res.verified, false);
    assert.match(res.reason, /challenge/);
  });

  test('rejects an origin mismatch', () => {
    const f = makeFixture();
    const res = verifyAssertion({ ...base(f), expectedOrigin: 'https://evil.example.com' });
    assert.strictEqual(res.verified, false);
    assert.match(res.reason, /origin/);
  });

  test('rejects an rpId mismatch', () => {
    const f = makeFixture();
    const res = verifyAssertion({ ...base(f), expectedRpId: 'attacker.com' });
    assert.strictEqual(res.verified, false);
    assert.match(res.reason, /rpId/);
  });

  test('rejects a tampered signature', () => {
    const f = makeFixture({ tamperSignature: true });
    const res = verifyAssertion(base(f));
    assert.strictEqual(res.verified, false);
    assert.match(res.reason, /signature/);
  });

  test('rejects when user-verified flag is missing (no biometric)', () => {
    const f = makeFixture({ flags: 0x01 }); // UP only, UV not set
    const res = verifyAssertion(base(f));
    assert.strictEqual(res.verified, false);
    assert.match(res.reason, /not verified/);
  });

  test('rejects a signature made with a different key (the core bypass guard)', () => {
    // Attacker presents a valid-looking assertion signed with THEIR key against
    // a victim's stored public key. Must be rejected.
    const victim = makeFixture();
    const attacker = makeFixture({ challenge: victim.challenge, origin: victim.origin, rpId: victim.rpId });
    const res = verifyAssertion({ ...base(attacker), publicKey: victim.rawPub });
    assert.strictEqual(res.verified, false);
    assert.match(res.reason, /signature/);
  });

  test('rejects a malformed assertion', () => {
    const res = verifyAssertion({
      publicKey: makeFixture().rawPub,
      assertion: { id: 'x', response: {} },
      expectedChallenge: 'c',
      expectedOrigin: 'https://app.example.com',
      expectedRpId: 'example.com',
    });
    assert.strictEqual(res.verified, false);
    assert.match(res.reason, /malformed/);
  });
});
