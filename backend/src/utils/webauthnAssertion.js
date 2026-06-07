/**
 * Server-side WebAuthn *assertion* verification — the security core of passkey
 * login. The smart-account-kit creates the passkey in the browser and hands us
 * the raw 65-byte uncompressed secp256r1 (P-256) public key, which we persist at
 * registration. On every login we verify the assertion signature here, in Node,
 * with `node:crypto` (OpenSSL). A credential id is a PUBLIC identifier and is
 * never trusted as a bearer token — possession of the private key, proven by a
 * fresh biometric signature over our one-time challenge, is the authentication.
 *
 * Reference: W3C WebAuthn §7.2 (Verifying an Authentication Assertion).
 */
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';

function b64urlToBuffer(b64url) {
  return Buffer.from(b64url, 'base64url');
}

/** Raw 65-byte uncompressed P-256 point (0x04 || X || Y) -> KeyObject. */
function rawP256ToKeyObject(raw) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (buf.length !== 65 || buf[0] !== 0x04) {
    throw new Error('Expected a 65-byte uncompressed P-256 public key (0x04 || X || Y)');
  }
  return createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: buf.subarray(1, 33).toString('base64url'),
      y: buf.subarray(33, 65).toString('base64url'),
    },
    format: 'jwk',
  });
}

/**
 * @param {object} args
 * @param {Buffer|Uint8Array} args.publicKey   Stored raw 65-byte P-256 key.
 * @param {object} args.assertion              AuthenticationResponseJSON: { id, rawId,
 *   response:{ authenticatorData, clientDataJSON, signature, userHandle? }, type }.
 * @param {string} args.expectedChallenge      The base64url challenge we issued.
 * @param {string|string[]} args.expectedOrigin  Allowed origin(s), e.g. 'https://app.radox.net'.
 * @param {string} args.expectedRpId           e.g. 'radox.net' / 'dev.radox.net' / 'localhost'.
 * @param {number} [args.storedCounter=0]      Last seen signature counter.
 * @returns {{ verified: boolean, newCounter: number, reason?: string }}
 */
export function verifyAssertion({
  publicKey,
  assertion,
  expectedChallenge,
  expectedOrigin,
  expectedRpId,
  storedCounter = 0,
}) {
  try {
    const resp = assertion?.response;
    if (!resp?.authenticatorData || !resp?.clientDataJSON || !resp?.signature) {
      return { verified: false, newCounter: storedCounter, reason: 'malformed assertion' };
    }

    // --- 1. clientDataJSON: type, challenge, origin ---------------------------
    const clientDataBuf = b64urlToBuffer(resp.clientDataJSON);
    let clientData;
    try {
      clientData = JSON.parse(clientDataBuf.toString('utf8'));
    } catch {
      return { verified: false, newCounter: storedCounter, reason: 'bad clientDataJSON' };
    }
    if (clientData.type !== 'webauthn.get') {
      return { verified: false, newCounter: storedCounter, reason: 'wrong clientData type' };
    }
    if (clientData.challenge !== expectedChallenge) {
      return { verified: false, newCounter: storedCounter, reason: 'challenge mismatch' };
    }
    const allowedOrigins = Array.isArray(expectedOrigin) ? expectedOrigin : [expectedOrigin];
    if (!allowedOrigins.includes(clientData.origin)) {
      return { verified: false, newCounter: storedCounter, reason: `origin mismatch (${clientData.origin})` };
    }

    // --- 2. authenticatorData: rpIdHash, flags, counter -----------------------
    const authData = b64urlToBuffer(resp.authenticatorData);
    if (authData.length < 37) {
      return { verified: false, newCounter: storedCounter, reason: 'authData too short' };
    }
    const rpIdHash = authData.subarray(0, 32);
    const expectedRpIdHash = createHash('sha256').update(expectedRpId).digest();
    if (!rpIdHash.equals(expectedRpIdHash)) {
      return { verified: false, newCounter: storedCounter, reason: 'rpId mismatch' };
    }

    const flags = authData[32];
    const userPresent = (flags & 0x01) === 0x01;
    const userVerified = (flags & 0x04) === 0x04;
    if (!userPresent) {
      return { verified: false, newCounter: storedCounter, reason: 'user not present' };
    }
    if (!userVerified) {
      // We always request userVerification:'required'.
      return { verified: false, newCounter: storedCounter, reason: 'user not verified (biometric/PIN missing)' };
    }

    const newCounter = authData.readUInt32BE(33);
    // Clone detection: a non-zero counter must strictly increase. Platform
    // authenticators (Apple) keep it at 0 — that's allowed.
    if (newCounter !== 0 && newCounter <= storedCounter) {
      return { verified: false, newCounter, reason: 'counter did not increase (possible cloned authenticator)' };
    }

    // --- 3. ECDSA P-256 signature over authData || SHA-256(clientDataJSON) -----
    const clientDataHash = createHash('sha256').update(clientDataBuf).digest();
    const signedData = Buffer.concat([authData, clientDataHash]);
    const signature = b64urlToBuffer(resp.signature); // DER-encoded ECDSA

    const ok = cryptoVerify(
      'sha256',
      signedData,
      { key: rawP256ToKeyObject(publicKey), dsaEncoding: 'der' },
      signature
    );
    if (!ok) {
      return { verified: false, newCounter, reason: 'signature verification failed' };
    }

    return { verified: true, newCounter };
  } catch (err) {
    return { verified: false, newCounter: storedCounter, reason: err.message };
  }
}
