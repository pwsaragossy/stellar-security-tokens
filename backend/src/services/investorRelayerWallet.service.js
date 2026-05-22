/**
 * InvestorRelayerWalletService — per-investor classic Stellar G-account used as
 * the off-ramp bridge hop (Option A from the off-ramp custody discussion).
 *
 * Flow:
 *   1. First time an investor off-ramps, `ensureProvisioned(investorId)` is called.
 *   2. If no row exists, generate a fresh Stellar keypair, encrypt the seed
 *      with AES-256-GCM using the master key from `OFFRAMP_KEYRING_SECRET`,
 *      and persist (`publicKey`, `encryptedSeed`, `encryptionVersion=1`,
 *      `trustlinesEstablished=false`).
 *   3. If trustlines aren't yet established on-chain, submit a sponsored
 *      multi-op TX (BeginSponsoring → CreateAccount → ChangeTrust × N → EndSponsoring)
 *      signed by both the ops keypair (sponsor + fee payer) and the new G
 *      keypair (its own ChangeTrust + EndSponsoring).
 *   4. Mark `trustlinesEstablished=true` and persist the provisioning tx hash.
 *
 * At off-ramp signing time, `getKeypair(investorId)` decrypts the seed and
 * returns a `Keypair` instance that signs TX 2 (relayer → anchor classic payment).
 *
 * ⚠ KEY MANAGEMENT — read OFFRAMP_RUNBOOK.md before touching this code.
 *
 *   The master key (`OFFRAMP_KEYRING_SECRET`) is a 32-byte base64 string. Loss
 *   of this key = permanent loss of access to ALL per-investor relayer Gs.
 *   For v1 this lives in env; the KMS-managed envelope-encryption migration
 *   is queued in ROADMAP.md.
 *
 * Encryption format (encryptedSeed column):
 *   base64( IV(12 bytes) || authTag(16 bytes) || ciphertext )
 *
 * Future re-keying:
 *   `encryptionVersion` distinguishes schemes. v1 = direct AES-256-GCM under
 *   the env master key. v2+ = KMS envelope. Add new versions here; the
 *   read path picks the decryptor based on the stored version.
 */
import crypto from 'node:crypto';
import {
  Keypair,
  TransactionBuilder,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk';

import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import {
  getNetworkPassphrase,
  getOperationsKeypair,
  stellarServer,
} from '../config/stellar.js';
import { PasskeyWalletService } from './passkeyWallet.service.js';

const log = logger.scope('InvestorRelayerWallet');

// Encryption constants — change these and you've forked the schema.
const ENCRYPTION_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// Assets that the relayer must hold a classic trustline for to support
// off-ramp. Mirrors the off-ramp asset whitelist in rampOfframp.service.js.
const REQUIRED_TRUSTLINE_ASSETS = ['TESOURO', 'USDC'];

/** Lazy memoized master key — avoids re-parsing env on every call. */
let _masterKey = null;
function getMasterKey() {
  if (_masterKey) return _masterKey;
  const raw = process.env.OFFRAMP_KEYRING_SECRET;
  if (!raw) {
    throw new Error(
      'OFFRAMP_KEYRING_SECRET not configured — required for per-investor relayer wallet encryption. ' +
      'Generate with `openssl rand -base64 32` and store in env.'
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `OFFRAMP_KEYRING_SECRET must decode to 32 bytes (AES-256). Got ${buf.length} bytes — regenerate with \`openssl rand -base64 32\`.`
    );
  }
  _masterKey = buf;
  return buf;
}

/** Encrypt a Stellar seed (S...) under the master key. v1 = AES-256-GCM. */
function encryptSeed(seed) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(seed, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Decrypt a stored seed by version (currently only v1). */
function decryptSeed(encrypted, version) {
  if (version !== 1) {
    throw new Error(`Unsupported encryption version ${version} — known: 1`);
  }
  const buf = Buffer.from(encrypted, 'base64');
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('encryptedSeed too short to be a valid AES-256-GCM payload');
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

export class InvestorRelayerWalletService {
  /**
   * Return the per-investor relayer G-account in a state ready to receive
   * off-ramp tokens (account exists on-chain + trustlines established).
   *
   * Idempotent:
   *   - DB row exists + trustlinesEstablished=true → fast-path, no on-chain work
   *   - DB row exists + trustlinesEstablished=false → re-attempt provisioning
   *   - No DB row → generate keypair, persist, provision, mark established
   *
   * On-chain failures during provisioning leave the row in
   * `trustlinesEstablished=false`. Caller can retry safely; the multi-op TX
   * builder below handles the "account already exists" partial-failure case
   * by skipping CreateAccount and only adding missing trustlines.
   *
   * @param {number} investorId
   * @returns {Promise<{publicKey: string, trustlinesEstablished: boolean, provisioningTxHash: string|null}>}
   */
  static async ensureProvisioned(investorId) {
    let row = await prisma.investorRelayerWallet.findUnique({ where: { investorId } });
    if (row?.trustlinesEstablished) {
      // Verify on-chain trustlines still cover REQUIRED_TRUSTLINE_ASSETS.
      // When the required-assets list grows (e.g. USDC added after the relayer
      // was provisioned for TESOURO-only), the DB flag stays sticky-true but
      // the on-chain state is stale. Self-heal: detect missing trustlines and
      // re-run provisioning, which is idempotent on existing ChangeTrust ops.
      const missing = await this.#findMissingTrustlines(row.publicKey);
      if (missing.length === 0) {
        return {
          publicKey: row.publicKey,
          trustlinesEstablished: true,
          provisioningTxHash: row.provisioningTxHash,
        };
      }
      log.info(`Relayer ${row.publicKey} missing trustlines [${missing.join(',')}] — re-provisioning`);
      // Fall through to the provisioning path below.
    }

    if (!row) {
      const fresh = Keypair.random();
      log.info(`Generating new relayer wallet for investor ${investorId}: ${fresh.publicKey()}`);
      row = await prisma.investorRelayerWallet.create({
        data: {
          investorId,
          publicKey: fresh.publicKey(),
          encryptedSeed: encryptSeed(fresh.secret()),
          encryptionVersion: ENCRYPTION_VERSION,
          trustlinesEstablished: false,
        },
      });
    }

    const keypair = this.#keypairFromRow(row);
    const txHash = await this.#provisionOnChain(keypair);

    const updated = await prisma.investorRelayerWallet.update({
      where: { id: row.id },
      data: {
        trustlinesEstablished: true,
        provisioningTxHash: txHash,
      },
    });

    log.info(`Relayer wallet provisioned for investor ${investorId}: ${updated.publicKey} (tx ${txHash})`);
    return {
      publicKey: updated.publicKey,
      trustlinesEstablished: true,
      provisioningTxHash: txHash,
    };
  }

  /** Decrypt the stored seed and return a Keypair for signing. */
  static async getKeypair(investorId) {
    const row = await prisma.investorRelayerWallet.findUnique({ where: { investorId } });
    if (!row) {
      throw new Error(`No relayer wallet for investor ${investorId}. Call ensureProvisioned() first.`);
    }
    return this.#keypairFromRow(row);
  }

  /** Look up the relayer G-address without decrypting the seed. */
  static async getPublicKey(investorId) {
    const row = await prisma.investorRelayerWallet.findUnique({
      where: { investorId },
      select: { publicKey: true, trustlinesEstablished: true },
    });
    if (!row) return null;
    return { publicKey: row.publicKey, trustlinesEstablished: row.trustlinesEstablished };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  static #keypairFromRow(row) {
    const seed = decryptSeed(row.encryptedSeed, row.encryptionVersion);
    return Keypair.fromSecret(seed);
  }

  /**
   * Return the subset of REQUIRED_TRUSTLINE_ASSETS whose trustline (for the
   * canonical issuer per `resolveClassicAsset`) is absent on the account.
   *
   * IMPORTANT: matches on `(code, issuer)` pair, not just `code`. A USDC
   * trustline for the wrong issuer (e.g. mainnet Circle on a testnet stack)
   * does NOT satisfy a SAC `transfer()` whose SAC contract is derived from
   * the testnet issuer — the runtime fails with `trustline entry is missing`
   * even though the code is "present". Real bug observed 2026-05-16.
   */
  static async #findMissingTrustlines(publicKey) {
    try {
      const account = await stellarServer.loadAccount(publicKey);
      const present = new Set(
        (account.balances || [])
          .filter((b) => b.asset_type !== 'native')
          .map((b) => `${b.asset_code}:${b.asset_issuer}`)
      );
      return REQUIRED_TRUSTLINE_ASSETS.filter((code) => {
        const asset = PasskeyWalletService.resolveClassicAsset(code);
        return !present.has(`${asset.code}:${asset.issuer}`);
      });
    } catch (err) {
      log.warn(`loadAccount(${publicKey.slice(0, 8)}…) failed — assuming all trustlines missing: ${err.message}`);
      return [...REQUIRED_TRUSTLINE_ASSETS];
    }
  }

  /**
   * Submit the sponsored multi-op TX that:
   *   1. Begins sponsoring future reserves for the new G (paid by ops)
   *   2. Creates the new G account with 0 starting balance (ops sponsors reserve)
   *   3. Adds a ChangeTrust for each required asset (ops sponsors trustline reserves)
   *   4. Ends sponsoring
   *
   * Idempotent on the "account already exists" path: if Horizon reports the
   * account exists, we re-build a smaller TX with only the missing
   * trustlines and ChangeTrust ops, no CreateAccount.
   *
   * @returns {Promise<string>} the on-chain tx hash
   */
  static async #provisionOnChain(newKeypair) {
    const server = PasskeyWalletService.getRpcServer();
    const networkPassphrase = getNetworkPassphrase();
    const opsKeypair = getOperationsKeypair();

    // Detect existing on-chain state so we don't double-create or
    // double-trust. `getAccount` throws if the account doesn't exist.
    let accountExists = false;
    try {
      await server.getAccount(newKeypair.publicKey());
      accountExists = true;
    } catch {
      accountExists = false;
    }

    const assets = REQUIRED_TRUSTLINE_ASSETS.map((code) => ({
      code,
      asset: PasskeyWalletService.resolveClassicAsset(code),
    }));

    const opsAccount = await server.getAccount(opsKeypair.publicKey());
    const builder = new TransactionBuilder(opsAccount, {
      fee: String(BASE_FEE * (assets.length + 3)), // rough budget for 5 ops
      networkPassphrase,
    });

    // Sponsoring sandwich: ops pays reserves so the new G doesn't need XLM.
    builder.addOperation(Operation.beginSponsoringFutureReserves({
      sponsoredId: newKeypair.publicKey(),
    }));

    if (!accountExists) {
      builder.addOperation(Operation.createAccount({
        destination: newKeypair.publicKey(),
        startingBalance: '0',
      }));
    }

    for (const { asset } of assets) {
      builder.addOperation(Operation.changeTrust({
        asset,
        source: newKeypair.publicKey(),
      }));
    }

    builder.addOperation(Operation.endSponsoringFutureReserves({
      source: newKeypair.publicKey(),
    }));

    const tx = builder.setTimeout(180).build();
    tx.sign(opsKeypair, newKeypair);

    log.info(`Provisioning relayer ${newKeypair.publicKey()} on-chain (accountExisted=${accountExists}, assets=${assets.map((a) => a.code).join(',')})`);
    const result = await PasskeyWalletService.sendTransaction(tx);
    if (!result?.hash) {
      throw new Error('Relayer provisioning TX submission returned no hash');
    }
    return result.hash;
  }

  // Exposed for tests.
  static get _ENCRYPTION_VERSION() { return ENCRYPTION_VERSION; }
  static get _REQUIRED_TRUSTLINE_ASSETS() { return REQUIRED_TRUSTLINE_ASSETS; }
}

export default InvestorRelayerWalletService;
