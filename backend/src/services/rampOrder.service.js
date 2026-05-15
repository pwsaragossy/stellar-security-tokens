/**
 * Ramp order state machine + business logic.
 *
 * Drives RampOrder rows through the EtherFuse-defined status flow:
 *
 *   On-ramp (BRL/PIX → TESOURO):
 *     created → funded → completed
 *     created → canceled | expired | failed
 *     funded  → refunded | failed
 *
 *   Off-ramp (TESOURO/USDC → BRL/PIX, Phase 2):
 *     created → funded → completed → finalized
 *     created → canceled | failed
 *
 * Inputs:
 *   - createQuote / createOrder are called from REST controllers when an
 *     investor initiates a deposit. Both persist locally AND call the
 *     EtherFuse API.
 *   - applyWebhookTransition is called from rampWebhookController.js AFTER
 *     idempotency check + HMAC verification have passed. It only updates
 *     local state — it does NOT call EtherFuse back (avoid the 3–10s
 *     indexing race).
 *
 * Notifications:
 *   - In-app notification on every terminal-ish transition (funded /
 *     completed / failed / refunded / expired).
 *   - Email integration is a follow-up — left as a hook in `notifyTransition`.
 *
 * Idempotency:
 *   - applyWebhookTransition is safe to call multiple times for the same
 *     (orderId, status) pair: the explicit ALLOWED_TRANSITIONS table rejects
 *     no-op and backward transitions and the webhook table already
 *     deduplicates upstream.
 */
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import { randomUUID } from 'node:crypto';
import EtherFuseClient, { EtherFuseApiError } from './etherfuse.service.js';
import { NotificationService } from './notification.service.js';

const log = logger.scope('RampOrderService');

/**
 * Allowed status transitions for a RampOrder.
 *
 *   key   : current status
 *   value : Set of statuses we'll accept moving to
 *
 * Any transition not listed here is rejected with a warn log — these are
 * either no-ops (already in target state) or backward (stale webhook).
 */
const ALLOWED_TRANSITIONS = new Map([
  ['created',   new Set(['funded', 'canceled', 'expired', 'failed'])],
  ['funded',    new Set(['completed', 'refunded', 'failed'])],
  ['completed', new Set(['finalized'])], // off-ramp only
  // Terminal:
  ['finalized', new Set()],
  ['failed',    new Set()],
  ['refunded',  new Set()],
  ['canceled',  new Set()],
  ['expired',   new Set()],
]);

const TERMINAL_STATUSES = new Set(['completed', 'finalized', 'failed', 'refunded', 'canceled', 'expired']);

export class RampOrderService {
  /**
   * Create an EtherFuse quote and persist the local mirror. Quotes expire
   * 2 minutes after creation — the controller should call createOrder()
   * shortly after.
   *
   * @param {object} args
   * @param {number} args.investorId
   * @param {"onramp"|"offramp"} args.orderType
   * @param {string} args.blockchain     - default "stellar"
   * @param {string} args.sourceAsset    - "BRL" | "USDC:G..." etc.
   * @param {string} args.targetAsset    - asset identifier
   * @param {string} args.sourceAmount   - decimal string
   * @param {string} [args.walletAddress] - required for Stellar onramps with new wallets
   * @returns {Promise<{quote: object, etherfuseResponse: object}>}
   */
  static async createQuote({
    investorId,
    orderType,
    blockchain = 'stellar',
    sourceAsset,
    targetAsset,
    sourceAmount,
    walletAddress,
  }) {
    const customer = await prisma.rampCustomer.findUnique({ where: { investorId } });
    if (!customer) {
      throw new Error(`Investor ${investorId} has no EtherFuse customer record. Run KYC onboarding first.`);
    }

    const etherfuseQuoteId = randomUUID();
    const payload = {
      quoteId: etherfuseQuoteId,
      customerId: customer.etherfuseCustomerId,
      blockchain,
      quoteAssets: { type: orderType, sourceAsset, targetAsset },
      sourceAmount: String(sourceAmount),
    };
    if (walletAddress) payload.walletAddress = walletAddress;

    log.info('Creating EtherFuse quote', { investorId, etherfuseQuoteId, orderType, sourceAsset, targetAsset });
    const efResponse = await EtherFuseClient.Quotes.create(payload);

    // EtherFuse returns the quote envelope; the destinationAmount/feeBps/etc.
    // are nested. Be defensive — shape may evolve.
    const destinationAmount = efResponse.destinationAmount ?? efResponse.targetAmount ?? null;
    const feeBps = efResponse.feeBps ?? null;
    const feeAmount = efResponse.feeAmount ?? null;
    const exchangeRate = efResponse.exchangeRate ?? null;
    const expiresAt = efResponse.expiresAt
      ? new Date(efResponse.expiresAt)
      : new Date(Date.now() + 120_000); // 2-minute fallback

    const quote = await prisma.rampQuote.create({
      data: {
        investorId,
        etherfuseQuoteId,
        orderType,
        blockchain,
        sourceAsset,
        targetAsset,
        sourceAmount: String(sourceAmount),
        destinationAmount: destinationAmount != null ? String(destinationAmount) : null,
        feeBps: feeBps != null ? Number(feeBps) : null,
        feeAmount: feeAmount != null ? String(feeAmount) : null,
        exchangeRate: exchangeRate != null ? String(exchangeRate) : null,
        walletAddress: walletAddress || null,
        expiresAt,
        rawResponse: efResponse ?? null,
      },
    });

    return { quote, etherfuseResponse: efResponse };
  }

  /**
   * Execute a quote: create the EtherFuse order and persist the local mirror.
   *
   * The quote's investor must own the chosen wallet and bank account. Quote
   * must not be expired.
   */
  static async createOrder({
    investorId,
    quoteId, // local RampQuote.id
    walletId, // local RampWallet.id
    bankAccountId, // local RampBankAccount.id
    memo,
    useAnchor = false,
  }) {
    const quote = await prisma.rampQuote.findFirst({
      where: { id: quoteId, investorId },
    });
    if (!quote) throw new Error(`Quote ${quoteId} not found for investor ${investorId}`);
    if (quote.expiresAt.getTime() < Date.now()) {
      throw new Error(`Quote ${quoteId} expired at ${quote.expiresAt.toISOString()}`);
    }

    const wallet = await prisma.rampWallet.findFirst({
      where: { id: walletId, investorId },
    });
    if (!wallet) throw new Error(`Wallet ${walletId} not found for investor ${investorId}`);

    const bankAccount = await prisma.rampBankAccount.findFirst({
      where: { id: bankAccountId, investorId, deletedAt: null },
    });
    if (!bankAccount) throw new Error(`Bank account ${bankAccountId} not found for investor ${investorId}`);

    const etherfuseOrderId = randomUUID();
    const payload = {
      orderId: etherfuseOrderId,
      bankAccountId: bankAccount.etherfuseBankAccountId,
      cryptoWalletId: wallet.etherfuseWalletId,
      publicKey: wallet.publicKey,
      quoteId: quote.etherfuseQuoteId,
    };
    if (memo) payload.memo = memo;
    if (useAnchor) payload.useAnchor = true;

    log.info('Creating EtherFuse order', {
      investorId,
      etherfuseOrderId,
      orderType: quote.orderType,
      sourceAmount: quote.sourceAmount,
    });
    const efResponse = await EtherFuseClient.Orders.create(payload);

    // Response shape: { onramp: {...} } or { offramp: {...} } — unwrap.
    const innerKey = quote.orderType === 'onramp' ? 'onramp' : 'offramp';
    const inner = efResponse?.[innerKey] ?? efResponse ?? {};

    // PIX-specific fields (BR flow) — exact keys still being verified live;
    // store the entire inner object as pixInstructions for forward compat.
    const pixInstructions = quote.orderType === 'onramp' ? inner : null;
    const pixExpiresAt = inner.depositExpiresAt
      ? new Date(inner.depositExpiresAt)
      : new Date(Date.now() + 30 * 60_000); // 30-minute fallback

    const order = await prisma.rampOrder.create({
      data: {
        investorId,
        etherfuseOrderId,
        quoteId: quote.id,
        walletId: wallet.id,
        bankAccountId: bankAccount.id,
        orderType: quote.orderType,
        status: 'created',
        amountInFiat: quote.sourceAsset === 'BRL' || quote.sourceAsset === 'MXN' ? String(quote.sourceAmount) : null,
        amountInTokens: quote.destinationAmount,
        sourceAsset: quote.sourceAsset,
        targetAsset: quote.targetAsset,
        pixInstructions,
        pixExpiresAt: quote.orderType === 'onramp' ? pixExpiresAt : null,
        burnTransaction: inner.burnTransaction ?? null,
        withdrawAnchorAccount: inner.withdrawAnchorAccount ?? null,
        withdrawMemo: inner.withdrawMemo ?? null,
        withdrawMemoType: inner.withdrawMemoType ?? null,
        statusPage: inner.statusPage ?? efResponse?.statusPage ?? null,
      },
    });

    return { order, etherfuseResponse: efResponse };
  }

  /**
   * Apply a webhook-driven status transition. Called from
   * rampWebhookController.js after the event has been deduped and HMAC-verified.
   *
   * Idempotent: no-op transitions are logged-and-skipped. Backward transitions
   * (e.g. a stale `created` arriving after we've already seen `funded`) are
   * logged at warn and ignored.
   *
   * @param {object} eventData   - the inner record (Order, Customer, etc.)
   * @param {string} eventType   - "order_updated" | "customer_updated" | etc.
   * @returns {Promise<{handled: boolean, reason?: string}>}
   */
  static async applyWebhookTransition(eventType, eventData) {
    switch (eventType) {
      case 'order_updated':
        return this.#handleOrderUpdated(eventData);
      case 'customer_updated':
        return this.#handleCustomerUpdated(eventData);
      case 'bank_account_updated':
        return this.#handleBankAccountUpdated(eventData);
      case 'kyc_updated':
        return this.#handleKycUpdated(eventData);
      case 'quote_updated':
      case 'swap_updated':
        // Not relevant to Phase 1 on-ramp.
        log.debug(`Ignoring ${eventType} event (out of Phase 1 scope)`);
        return { handled: true, reason: 'ignored:out-of-scope' };
      default:
        log.warn(`Unknown webhook event type: ${eventType}`);
        return { handled: false, reason: 'unknown-event-type' };
    }
  }

  static async #handleOrderUpdated(order) {
    const { orderId, status } = order;
    if (!orderId || !status) {
      log.warn('order_updated payload missing orderId or status', { order });
      return { handled: false, reason: 'malformed-payload' };
    }

    const existing = await prisma.rampOrder.findUnique({
      where: { etherfuseOrderId: orderId },
      include: { wallet: true },
    });
    if (!existing) {
      log.warn(`order_updated for unknown orderId ${orderId} — ignoring`);
      return { handled: false, reason: 'unknown-order' };
    }

    // PATH A SENTINEL — sandbox 2026-05-15 confirmed that EtherFuse delivers
    // TESOURO to C-addresses via direct SAC transfer (no claim transaction).
    // If a claim-tx ever appears on a C-address order, EtherFuse has changed
    // behavior and our investors cannot complete the claim (Soroban contracts
    // can't sign classic txs). DO NOT mark the order completed — escalate.
    const isCAddress = existing.wallet?.publicKey?.startsWith('C');
    const hasClaimFlow = !!(order.stellarClaimTransaction || order.stellarClaimableBalanceId);
    if (isCAddress && hasClaimFlow) {
      log.error(`PATH A SENTINEL TRIPPED: claim-tx on C-address order ${orderId} — manual intervention required`, {
        orderId,
        publicKey: existing.wallet?.publicKey,
        stellarClaimableBalanceId: order.stellarClaimableBalanceId,
        stellarClaimTransactionLen: order.stellarClaimTransaction?.length,
      });
      // Record the anomaly on the order row so the admin dashboard can surface it.
      await prisma.rampOrder.update({
        where: { etherfuseOrderId: orderId },
        data: {
          stellarClaimableBalanceId: order.stellarClaimableBalanceId,
          stellarClaimTransaction: order.stellarClaimTransaction,
          failureReason: 'PATH_A_SENTINEL: claim-tx delivered to C-address; manual recovery required',
        },
      });
      return { handled: false, reason: 'path-a-sentinel' };
    }

    if (existing.status === status) {
      log.debug(`No-op transition for order ${orderId} (already ${status})`);
      return { handled: true, reason: 'no-op' };
    }

    const allowed = ALLOWED_TRANSITIONS.get(existing.status);
    if (!allowed || !allowed.has(status)) {
      log.warn(`Rejecting transition ${existing.status} → ${status} for order ${orderId}`, {
        orderId,
        from: existing.status,
        to: status,
      });
      return { handled: false, reason: 'invalid-transition' };
    }

    const now = new Date();
    const update = {
      status,
      updatedAt: now,
      amountInFiat: order.amountInFiat != null ? String(order.amountInFiat) : existing.amountInFiat,
      amountInTokens: order.amountInTokens != null ? String(order.amountInTokens) : existing.amountInTokens,
      confirmedTxSignature: order.confirmedTxSignature ?? existing.confirmedTxSignature,
      stellarClaimableBalanceId: order.stellarClaimableBalanceId ?? existing.stellarClaimableBalanceId,
      stellarClaimTransaction: order.stellarClaimTransaction ?? existing.stellarClaimTransaction,
      statusPage: order.statusPage ?? existing.statusPage,
    };
    if (status === 'funded' && !existing.fundedAt) update.fundedAt = now;
    if (TERMINAL_STATUSES.has(status) && !existing.completedAt) update.completedAt = now;

    await prisma.rampOrder.update({ where: { etherfuseOrderId: orderId }, data: update });

    log.info(`Order ${orderId}: ${existing.status} → ${status}`);
    await this.#notifyTransition(existing.investorId, orderId, existing.status, status, existing.orderType);
    return { handled: true };
  }

  static async #handleCustomerUpdated(customer) {
    const { customerId, status } = customer;
    if (!customerId) {
      log.warn('customer_updated payload missing customerId', { customer });
      return { handled: false, reason: 'malformed-payload' };
    }
    const existing = await prisma.rampCustomer.findUnique({
      where: { etherfuseCustomerId: customerId },
    });
    if (!existing) {
      log.warn(`customer_updated for unknown customerId ${customerId} — ignoring`);
      return { handled: false, reason: 'unknown-customer' };
    }
    // EtherFuse customer status values per docs: customer_pending|customer_verified|customer_failed
    // Map to our RampWalletKycStatus enum where reasonable.
    const kycStatus =
      status === 'customer_verified' ? 'approved'
      : status === 'customer_failed' ? 'rejected'
      : status === 'customer_pending' ? 'proposed'
      : existing.kycStatus;

    await prisma.rampCustomer.update({
      where: { etherfuseCustomerId: customerId },
      data: { kycStatus, lastSyncedAt: new Date() },
    });
    return { handled: true };
  }

  static async #handleBankAccountUpdated(bankAccount) {
    const { bankAccountId, status } = bankAccount;
    if (!bankAccountId) return { handled: false, reason: 'malformed-payload' };
    const existing = await prisma.rampBankAccount.findUnique({
      where: { etherfuseBankAccountId: bankAccountId },
    });
    if (!existing) {
      log.warn(`bank_account_updated for unknown bankAccountId ${bankAccountId}`);
      return { handled: false, reason: 'unknown-bank-account' };
    }
    // EtherFuse statuses: bank_account_pending|awaiting_deposit_verification|active|inactive
    const mapped =
      status === 'bank_account_pending' ? 'pending'
      : status === 'bank_account_awaiting_deposit_verification' ? 'awaiting_deposit_verification'
      : status === 'bank_account_active' ? 'active'
      : status === 'bank_account_inactive' ? 'inactive'
      : existing.status;

    await prisma.rampBankAccount.update({
      where: { etherfuseBankAccountId: bankAccountId },
      data: { status: mapped },
    });
    return { handled: true };
  }

  static async #handleKycUpdated(kyc) {
    const { customerId, status, updateReason } = kyc;
    if (!customerId) return { handled: false, reason: 'malformed-payload' };
    const existing = await prisma.rampCustomer.findUnique({
      where: { etherfuseCustomerId: customerId },
    });
    if (!existing) {
      log.warn(`kyc_updated for unknown customerId ${customerId}`);
      return { handled: false, reason: 'unknown-customer' };
    }
    // EtherFuse statuses: kyc_proposed|kyc_approved|kyc_rejected
    const mapped =
      status === 'kyc_approved' ? 'approved'
      : status === 'kyc_rejected' ? 'rejected'
      : status === 'kyc_proposed' ? 'proposed'
      : existing.kycStatus;

    await prisma.rampCustomer.update({
      where: { etherfuseCustomerId: customerId },
      data: {
        kycStatus: mapped,
        kycRejectionReason: status === 'kyc_rejected' ? (updateReason ?? null) : null,
        lastSyncedAt: new Date(),
      },
    });
    return { handled: true };
  }

  /**
   * Side-effect: in-app notification on state changes. Best-effort —
   * failures here MUST NOT prevent the state transition from being recorded.
   */
  static async #notifyTransition(investorId, etherfuseOrderId, fromStatus, toStatus, orderType) {
    const messages = {
      funded:   ['Pagamento recebido', `Recebemos seu PIX para a ordem ${etherfuseOrderId.slice(0, 8)}. A liquidação em ${orderType === 'onramp' ? 'TESOURO' : 'BRL'} está a caminho.`],
      completed:['Depósito concluído', `Sua ordem ${etherfuseOrderId.slice(0, 8)} foi liquidada.`],
      failed:   ['Ordem com falha',   `A ordem ${etherfuseOrderId.slice(0, 8)} falhou. Suporte foi notificado.`],
      refunded: ['Ordem estornada',   `O valor enviado não correspondia à ordem ${etherfuseOrderId.slice(0, 8)}. O PIX foi devolvido.`],
      expired:  ['Ordem expirada',    `O PIX da ordem ${etherfuseOrderId.slice(0, 8)} expirou antes do recebimento.`],
      canceled: ['Ordem cancelada',   `A ordem ${etherfuseOrderId.slice(0, 8)} foi cancelada.`],
    };
    const entry = messages[toStatus];
    if (!entry) return;
    const [title, body] = entry;
    try {
      await NotificationService.createNotification(
        investorId,
        'investor',
        `ramp_${toStatus}`,
        title,
        body,
        `/transactions?ramp=${etherfuseOrderId}`
      );
    } catch (err) {
      log.warn(`Notification failed for order ${etherfuseOrderId}`, { error: err.message });
    }
    // TODO Phase 1.5: wire an EmailService.sendRampOrderStatus(...) call here.
  }

  // Exposed for testing
  static get _ALLOWED_TRANSITIONS() {
    return ALLOWED_TRANSITIONS;
  }
}

export default RampOrderService;
