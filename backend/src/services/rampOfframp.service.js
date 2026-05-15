/**
 * RampOfframpService — investor-facing off-ramp orchestration (tokens → BRL).
 *
 * The on-ramp (BRL → TESOURO) is fully driven from RampOrderService, which is
 * polymorphic on orderType. The off-ramp leans on the same EtherFuse-facing
 * primitives and adds three things on top:
 *
 *   1. Asset whitelist (TESOURO + USDC only for v1)
 *   2. Balance pre-flight against the investor's Soroban smart wallet
 *   3. The on-chain signing flow: prepare a SAC `transfer()` XDR with the
 *      EtherFuse-issued memo, get it passkey-signed on the frontend, submit.
 *
 * Signing mode: Stellar **Anchor Mode** (useAnchor=true). EtherFuse's default
 * `burnTransaction` XDR is built for classic G-account keypairs, not Soroban
 * smart-wallet auth entries — it won't carry our passkey signatures. Anchor
 * Mode lets us build the TX with the existing passkey withdraw machinery and
 * just attach the EtherFuse-supplied destination + memo.
 *
 *   Flow:
 *     createQuote  → EtherFuse `/ramp/quote` (type=offramp)
 *     createOrder  → EtherFuse `/ramp/order` (useAnchor=true) — returns
 *                    withdrawAnchorAccount + withdrawMemo (base64)
 *     prepareTx    → SAC transfer XDR with Memo.hash, ready for passkey sig
 *     submitTx     → submit to Soroban RPC, persist tx hash to
 *                    RampOrder.burnTransaction (legacy field name; stores the
 *                    on-chain asset-release tx hash regardless of mode)
 *     cancel       → EtherFuse `/ramp/order/{id}/cancel` (only `status=created`)
 *
 * Open risk — see plans/we-have-just-made-fancy-token.md "Open Risk #1":
 *   EtherFuse's anchor monitor may not detect SAC-sourced credits to the
 *   anchor G-address. A Phase 0 sandbox probe is required before enabling
 *   ENABLE_OFFRAMP. If the probe fails, this service grows a relayer-bridge
 *   step (SAC.transfer → platform relayer → classic payment to anchor).
 */
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import RampKycService from './rampKyc.service.js';
import RampOrderService from './rampOrder.service.js';
import { PasskeyWalletService, UserType } from './passkeyWallet.service.js';
import EtherFuseClient from './etherfuse.service.js';

const log = logger.scope('RampOfframpService');

/** Off-ramp asset whitelist for v1. */
const SUPPORTED_OFFRAMP_ASSETS = new Set(['TESOURO', 'USDC']);

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
   * Prepare the on-chain signing transaction for an off-ramp order.
   *
   * Builds a SAC `transfer()` from the investor's C-address to the EtherFuse
   * anchor G-address, with `Memo.hash(decode(withdrawMemo))` so the anchor
   * monitor can correlate the credit to the order. Returns the unsigned XDR
   * for passkey signing.
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

    // EtherFuse delivers withdrawMemo as base64; Memo.hash wants a 32-byte hex.
    const memoHashHex = Buffer.from(order.withdrawMemo, 'base64').toString('hex');

    log.info(`Preparing off-ramp signing TX: order=${orderId} asset=${assetCode} amount=${order.amountInTokens}`);
    return PasskeyWalletService.buildWithdrawalTx(
      investorId,
      order.withdrawAnchorAccount,
      order.amountInTokens,
      assetCode,
      UserType.INVESTOR,
      { memoHashHex }
    );
  }

  /**
   * Submit a passkey-signed off-ramp transaction. Persists the on-chain TX
   * hash to RampOrder.burnTransaction (the field name is a schema legacy from
   * burn-mode — it stores the asset-release hash regardless of mode).
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

    const result = await PasskeyWalletService.submitWithdrawalTx(signedXdr);

    // Persist the on-chain hash. The webhook will advance the order to
    // `funded` once EtherFuse's anchor monitor detects the credit. We don't
    // mutate `status` here — that's the state machine's job.
    await prisma.rampOrder.update({
      where: { id: order.id },
      data: { burnTransaction: result.hash, updatedAt: new Date() },
    });

    log.info(`Off-ramp TX submitted: order=${orderId} hash=${result.hash}`);
    return { hash: result.hash, status: result.status };
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
