/**
 * RampOfframpService — investor-facing off-ramp orchestration (tokens → BRL).
 *
 * The on-ramp (BRL → TESOURO) is fully driven from RampOrderService, which is
 * polymorphic on orderType. The off-ramp leans on the same EtherFuse-facing
 * primitives and adds three things on top:
 *
 *   1. Asset whitelist (TESOURO + USDC only for v1)
 *   2. Balance pre-flight against the investor's Soroban smart wallet
 *   3. The two-TX RELAYER BRIDGE that moves tokens from the investor's
 *      Soroban C-address to the EtherFuse anchor.
 *
 * Why the relayer bridge (not a direct SAC transfer to the anchor):
 *   EtherFuse's anchor monitor watches classic `payment` operations on the
 *   anchor G-account. A SAC `transfer()` from a Soroban C-address credits
 *   the anchor's classic trustline balance dually, but surfaces as a
 *   contract event rather than a classic payment — the monitor doesn't see
 *   it. EtherFuse confirmed this directly (2026-05-15): "the protocol
 *   doesn't understand off-ramping from a C... wallet." The fix is a
 *   two-hop transfer where the second hop is a real classic payment that
 *   the monitor recognizes.
 *
 * Bridge flow (two on-chain TXs, submitted sync from submitSignedTx):
 *   TX 1: investor C-address → relayer G-account, via SAC `transfer()`
 *         (passkey-signed XDR; built by prepareSigningTx)
 *   TX 2: relayer G-account  → anchor G-account, via classic `payment`
 *         with Memo.hash    (ops-keypair-signed; built+submitted server-side)
 *
 * Persistence:
 *   - TX 1 hash → `RampOrder.pixInstructions.relayerHoldTxHash` (JSON column
 *     reuse; no migration; lives there as off-ramp trace data)
 *   - TX 2 hash → `RampOrder.burnTransaction` (the anchor-facing TX; this is
 *     the one EtherFuse's webhook will reference)
 *
 * Recovery: if TX 2 fails after TX 1 succeeds, tokens are stranded on the
 *   relayer. See docs/Operations/OFFRAMP_RUNBOOK.md for the manual recovery
 *   script. Monitor logs for `RELAYER_STRANDED` warnings.
 *
 *   Flow:
 *     createQuote  → EtherFuse `/ramp/quote` (type=offramp)
 *     createOrder  → EtherFuse `/ramp/order` (useAnchor=true) — returns
 *                    withdrawAnchorAccount + withdrawMemo (base64)
 *     prepareTx    → SAC transfer XDR targeting the relayer G-account
 *                    (no memo); ready for passkey signing
 *     submitTx     → submit TX 1, wait, then build+submit TX 2 (classic
 *                    payment with Memo.hash from relayer to anchor)
 *     cancel       → EtherFuse `/ramp/order/{id}/cancel` (only `status=created`)
 */
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import RampKycService from './rampKyc.service.js';
import RampOrderService from './rampOrder.service.js';
import { PasskeyWalletService, UserType } from './passkeyWallet.service.js';
import InvestorRelayerWalletService from './investorRelayerWallet.service.js';
import EtherFuseClient from './etherfuse.service.js';

const log = logger.scope('RampOfframpService');

/**
 * Off-ramp asset whitelist for v1.
 *
 * USDC is intentionally EXCLUDED here even though we initially scoped both.
 * EtherFuse's sandbox rejects USDC quotes with `Non-stable assets are not
 * supported: USDC:G…` — their off-ramp only accepts their own stablebonds
 * (TESOURO / CETES / etc.), not general stablecoins. Re-enable USDC here
 * only after EtherFuse confirms support. See ROADMAP "Off-Ramp Hardening".
 */
const SUPPORTED_OFFRAMP_ASSETS = new Set(['TESOURO']);

/** Stellar mainnet USDC issuer (Circle). Override via env for testnet. */
const DEFAULT_USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

export class RampOfframpError extends Error {
  constructor(message, { status = 400, code, details } = {}) {
    super(message);
    this.name = 'RampOfframpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class RampOfframpService {
  /**
   * Resolve a Radox-flavor asset code ('TESOURO' | 'USDC') to the EtherFuse
   * CODE:ISSUER identifier used as `sourceAsset` in the quote request.
   *
   * TESOURO uses the EtherFuse-issued identifier from env. USDC uses the
   * canonical Circle issuer unless an override is configured.
   */
  static resolveSourceAssetIdentifier(assetCode) {
    if (assetCode === 'TESOURO') {
      const id = process.env.ETHERFUSE_TESOURO_ASSET_IDENTIFIER;
      if (!id || !id.includes(':')) {
        throw new RampOfframpError('TESOURO asset identifier not configured', {
          status: 500,
          code: 'tesouro_not_configured',
        });
      }
      return id;
    }
    if (assetCode === 'USDC') {
      const issuer = process.env.USDC_ISSUER || DEFAULT_USDC_ISSUER;
      return `USDC:${issuer}`;
    }
    throw new RampOfframpError(`Unsupported off-ramp asset: ${assetCode}`, {
      status: 400,
      code: 'unsupported_asset',
    });
  }

  /**
   * Create an EtherFuse off-ramp quote for an investor.
   *
   * @param {number} investorId
   * @param {object} args
   * @param {'TESOURO'|'USDC'} args.sourceAsset
   * @param {string|number} args.sourceAmount  - amount of tokens to off-ramp
   */
  static async createQuote(investorId, { sourceAsset, sourceAmount }) {
    if (!SUPPORTED_OFFRAMP_ASSETS.has(sourceAsset)) {
      throw new RampOfframpError(
        `Unsupported off-ramp source asset "${sourceAsset}" (allowed: ${[...SUPPORTED_OFFRAMP_ASSETS].join(', ')})`,
        { status: 400, code: 'unsupported_asset' }
      );
    }
    if (sourceAmount == null || Number(sourceAmount) <= 0) {
      throw new RampOfframpError('sourceAmount is required and must be > 0', {
        status: 400,
        code: 'invalid_amount',
      });
    }

    // Readiness (KYC approved + active bank account) — same gate as on-ramp.
    await RampKycService.assertReady(investorId);

    // Balance pre-flight against the investor's Soroban wallet. We compare the
    // 7-decimal SAC balance against the requested source amount.
    const investor = await prisma.investor.findUnique({ where: { id: investorId } });
    if (!investor?.stellarContractId) {
      throw new RampOfframpError('Investor has no Soroban wallet', {
        status: 400,
        code: 'no_wallet',
      });
    }
    const balances = await PasskeyWalletService.getSorobanWalletBalances(investor.stellarContractId);
    const assetKey = sourceAsset.toLowerCase(); // matches { xlm, usdc, tesouro } shape
    const available = Number(balances[assetKey] ?? 0);
    if (available < Number(sourceAmount)) {
      throw new RampOfframpError(
        `Insufficient ${sourceAsset}: have ${available}, need ${sourceAmount}`,
        {
          status: 400,
          code: 'insufficient_balance',
          details: { asset: sourceAsset, available, requested: sourceAmount },
        }
      );
    }

    const sourceAssetId = this.resolveSourceAssetIdentifier(sourceAsset);

    log.info(`Creating off-ramp quote: investor=${investorId} ${sourceAmount} ${sourceAsset} → BRL`);
    return RampOrderService.createQuote({
      investorId,
      orderType: 'offramp',
      blockchain: 'stellar',
      sourceAsset: sourceAssetId,
      targetAsset: 'BRL',
      sourceAmount,
    });
  }

  /**
   * Execute an off-ramp quote by creating the EtherFuse order in Anchor Mode.
   *
   * Returns the persisted RampOrder plus the EtherFuse response with the
   * anchor details (withdrawAnchorAccount, withdrawMemo, withdrawMemoType).
   */
  static async createOrder(investorId, { quoteId, bankAccountId }) {
    if (!quoteId || !bankAccountId) {
      throw new RampOfframpError('quoteId and bankAccountId are required', {
        status: 400,
        code: 'missing_fields',
      });
    }

    await RampKycService.assertReady(investorId);

    const wallet = await prisma.rampWallet.findFirst({ where: { investorId } });
    if (!wallet) {
      throw new RampOfframpError('Investor has no RampWallet registered', {
        status: 403,
        code: 'no_wallet_registered',
      });
    }

    // Off-ramp specifically requires the bank account to be fully `active` on
    // EtherFuse's side — `awaiting_deposit_verification` is accepted by our
    // on-ramp readiness gate (PIX deposits work as soon as the account exists)
    // but EtherFuse rejects off-ramp orders with 400 until CEP verification
    // completes. Catch it locally with a friendly message instead of an
    // upstream 502.
    const bankAccount = await prisma.rampBankAccount.findFirst({
      where: { id: Number(bankAccountId), investorId, deletedAt: null },
    });
    if (!bankAccount) {
      throw new RampOfframpError('Bank account not found', {
        status: 404,
        code: 'bank_account_not_found',
      });
    }
    if (bankAccount.status !== 'active') {
      throw new RampOfframpError(
        `Your PIX bank account is still being verified by the bank (status: ${bankAccount.status}). This usually takes a few minutes after registration — please try again shortly.`,
        {
          status: 409,
          code: 'bank_account_not_active',
          details: { status: bankAccount.status, bankAccountId: bankAccount.id },
        }
      );
    }

    const quote = await prisma.rampQuote.findFirst({
      where: { id: Number(quoteId), investorId, orderType: 'offramp' },
    });
    if (!quote) {
      throw new RampOfframpError(`Off-ramp quote ${quoteId} not found`, {
        status: 404,
        code: 'quote_not_found',
      });
    }
    if (quote.expiresAt.getTime() < Date.now()) {
      throw new RampOfframpError(`Quote ${quoteId} expired at ${quote.expiresAt.toISOString()}`, {
        status: 400,
        code: 'quote_expired',
      });
    }

    log.info(`Creating off-ramp order: investor=${investorId} quote=${quoteId}`);
    return RampOrderService.createOrder({
      investorId,
      quoteId: Number(quoteId),
      walletId: wallet.id,
      bankAccountId: Number(bankAccountId),
      useAnchor: true,
    });
  }

  /**
   * Prepare the FIRST half of the relayer bridge: a SAC `transfer()` from the
   * investor's Soroban C-address to the platform relayer G-account.
   *
   * Note: no memo on TX 1 — the EtherFuse anchor never sees it (only TX 2
   * lands at the anchor). The withdrawMemo is consumed later in submitSignedTx
   * when the backend builds and submits TX 2.
   *
   * Idempotent: safe to call multiple times for the same order while
   * status=created (each call returns a freshly-prepared XDR).
   */
  static async prepareSigningTx(investorId, orderId) {
    const order = await prisma.rampOrder.findFirst({
      where: { id: Number(orderId), investorId, orderType: 'offramp' },
    });
    if (!order) {
      throw new RampOfframpError(`Off-ramp order ${orderId} not found`, {
        status: 404,
        code: 'order_not_found',
      });
    }
    if (order.status !== 'created') {
      throw new RampOfframpError(
        `Off-ramp order ${orderId} is ${order.status}, cannot prepare signing TX`,
        { status: 409, code: 'invalid_status', details: { status: order.status } }
      );
    }
    if (!order.withdrawAnchorAccount || !order.withdrawMemo) {
      throw new RampOfframpError(
        `Off-ramp order ${orderId} missing anchor account or memo (was useAnchor=true sent?)`,
        { status: 500, code: 'missing_anchor_fields' }
      );
    }
    if (order.withdrawMemoType && order.withdrawMemoType !== 'hash') {
      throw new RampOfframpError(
        `Unsupported memo type "${order.withdrawMemoType}" — only "hash" is implemented`,
        { status: 500, code: 'unsupported_memo_type' }
      );
    }
    if (order.amountInTokens == null) {
      throw new RampOfframpError(
        `Off-ramp order ${orderId} missing amountInTokens`,
        { status: 500, code: 'missing_amount' }
      );
    }

    const assetCode = (order.sourceAsset || '').split(':')[0];
    if (!SUPPORTED_OFFRAMP_ASSETS.has(assetCode)) {
      throw new RampOfframpError(`Unsupported asset on order ${orderId}: ${assetCode}`, {
        status: 500,
        code: 'unsupported_asset_on_order',
      });
    }

    // TX 1 destination: this investor's per-investor relayer G-account, NOT
    // the EtherFuse anchor. The relayer holds the tokens briefly, then
    // forwards them via a classic payment in TX 2 (server-side, fee-bumped).
    // No memo on TX 1 — the anchor never sees it.
    //
    // ensureProvisioned() is idempotent: fast-path if the G already exists
    // with trustlines, otherwise generates + funds + adds trustlines via a
    // sponsored multi-op TX. First off-ramp ever costs ~3-5s extra here.
    const relayer = await InvestorRelayerWalletService.ensureProvisioned(investorId);
    log.info(`Preparing off-ramp TX 1 (investor → relayer): order=${orderId} asset=${assetCode} amount=${order.amountInTokens} relayer=${relayer.publicKey.slice(0, 8)}…`);

    return PasskeyWalletService.buildWithdrawalTx(
      investorId,
      relayer.publicKey,
      order.amountInTokens,
      assetCode,
      UserType.INVESTOR
      // No memoHashHex — memo goes on TX 2.
    );
  }

  /**
   * Submit the passkey-signed off-ramp transaction (TX 1), then build and
   * submit the relayer → anchor classic payment (TX 2).
   *
   * Synchronous bridge — the API response blocks until both TXs confirm.
   * Failure modes:
   *   - TX 1 fails (e.g. insufficient balance, no relayer trustline) →
   *     order stays at `status=created`, nothing on-chain, safe retry.
   *   - TX 2 fails after TX 1 succeeds → tokens stranded on relayer. We
   *     log RELAYER_STRANDED with both the order id and TX 1 hash so ops
   *     can recover via the runbook procedure. Order stays at `created`
   *     but `pixInstructions.relayerHoldTxHash` is populated.
   *
   * On success: persists TX 1 hash to `pixInstructions.relayerHoldTxHash`
   * and TX 2 hash to `burnTransaction`. EtherFuse's `order_updated` webhook
   * will advance status to `funded → completed → finalized`.
   */
  static async submitSignedTx(investorId, orderId, signedXdr) {
    if (!signedXdr || typeof signedXdr !== 'string') {
      throw new RampOfframpError('signedXdr is required', {
        status: 400,
        code: 'invalid_xdr',
      });
    }
    const order = await prisma.rampOrder.findFirst({
      where: { id: Number(orderId), investorId, orderType: 'offramp' },
    });
    if (!order) {
      throw new RampOfframpError(`Off-ramp order ${orderId} not found`, {
        status: 404,
        code: 'order_not_found',
      });
    }
    if (order.status !== 'created') {
      throw new RampOfframpError(
        `Off-ramp order ${orderId} is ${order.status}, cannot submit signed TX`,
        { status: 409, code: 'invalid_status', details: { status: order.status } }
      );
    }

    const assetCode = (order.sourceAsset || '').split(':')[0];
    if (!SUPPORTED_OFFRAMP_ASSETS.has(assetCode)) {
      throw new RampOfframpError(`Unsupported asset on order ${orderId}: ${assetCode}`, {
        status: 500,
        code: 'unsupported_asset_on_order',
      });
    }

    // ── TX 1: investor C-address → relayer G-account (passkey-signed SAC transfer)
    log.info(`Off-ramp TX 1 submit: order=${orderId}`);
    const tx1 = await PasskeyWalletService.submitWithdrawalTx(signedXdr);
    log.info(`Off-ramp TX 1 landed: order=${orderId} hash=${tx1.hash}`);

    // Persist TX 1 hash IMMEDIATELY so we don't lose it if TX 2 fails.
    // We append into pixInstructions (JSON) rather than adding a new column.
    const existingInstructions = (order.pixInstructions ?? {});
    await prisma.rampOrder.update({
      where: { id: order.id },
      data: {
        pixInstructions: { ...existingInstructions, relayerHoldTxHash: tx1.hash },
        updatedAt: new Date(),
      },
    });

    // ── TX 2: per-investor relayer G → EtherFuse anchor (classic payment with memo)
    // The per-investor G signs the inner TX; ops fee-bumps it so the G never
    // needs to hold XLM. The keypair is decrypted server-side from
    // `investor_relayer_wallets.encryptedSeed` under OFFRAMP_KEYRING_SECRET.
    const memoHashHex = Buffer.from(order.withdrawMemo, 'base64').toString('hex');
    let tx2;
    try {
      const signingKeypair = await InvestorRelayerWalletService.getKeypair(investorId);
      tx2 = await PasskeyWalletService.submitRelayerAnchorPayment({
        anchorAccountId: order.withdrawAnchorAccount,
        assetCode,
        amount: order.amountInTokens,
        memoHashHex,
        signingKeypair,
      });
    } catch (err) {
      // CRITICAL: TX 1 succeeded but TX 2 failed. Tokens are on the relayer.
      // Log loudly so operations can run the recovery procedure.
      log.error(`RELAYER_STRANDED: order=${orderId} tx1=${tx1.hash} reason=${err.message}`, {
        orderId,
        tx1Hash: tx1.hash,
        anchorAccount: order.withdrawAnchorAccount,
        asset: assetCode,
        amount: order.amountInTokens,
      });
      throw new RampOfframpError(
        `Off-ramp partially failed: investor tokens reached the relayer but the anchor payment failed (${err.message}). Operations has been notified — investor tokens are recoverable.`,
        {
          status: 502,
          code: 'relayer_stranded',
          details: { tx1Hash: tx1.hash, anchorAccount: order.withdrawAnchorAccount, asset: assetCode, amount: order.amountInTokens },
        }
      );
    }
    log.info(`Off-ramp TX 2 landed: order=${orderId} hash=${tx2.hash}`);

    // Persist TX 2 hash — this is the one EtherFuse's webhook will reference.
    await prisma.rampOrder.update({
      where: { id: order.id },
      data: { burnTransaction: tx2.hash, updatedAt: new Date() },
    });

    log.info(`Off-ramp bridge complete: order=${orderId} tx1=${tx1.hash} tx2=${tx2.hash}`);
    return {
      relayerHoldTxHash: tx1.hash,
      anchorPaymentTxHash: tx2.hash,
      hash: tx2.hash, // alias for back-compat with API contract
      status: tx2.status,
    };
  }

  /**
   * Cancel an off-ramp order. Only valid while status=created (before the
   * investor has submitted the on-chain transfer). EtherFuse returns 4xx
   * otherwise, which surfaces as an EtherFuseApiError.
   */
  static async cancelOrder(investorId, orderId) {
    const order = await prisma.rampOrder.findFirst({
      where: { id: Number(orderId), investorId, orderType: 'offramp' },
    });
    if (!order) {
      throw new RampOfframpError(`Off-ramp order ${orderId} not found`, {
        status: 404,
        code: 'order_not_found',
      });
    }
    if (order.status !== 'created') {
      throw new RampOfframpError(
        `Off-ramp order ${orderId} cannot be canceled (status: ${order.status})`,
        { status: 409, code: 'invalid_status', details: { status: order.status } }
      );
    }

    log.info(`Canceling off-ramp order ${orderId}`);
    await EtherFuseClient.Orders.cancel(order.etherfuseOrderId);

    // Defensive local update — EtherFuse will also fire order_updated with
    // status=canceled; applyWebhookTransition will no-op on re-arrival.
    await prisma.rampOrder.update({
      where: { id: order.id },
      data: { status: 'canceled', completedAt: new Date(), updatedAt: new Date() },
    });

    return { ok: true };
  }

  /** Test/admin escape hatch. */
  static get _SUPPORTED_OFFRAMP_ASSETS() {
    return SUPPORTED_OFFRAMP_ASSETS;
  }
}

export default RampOfframpService;
