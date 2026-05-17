/**
 * Investor-facing REST controller for the EtherFuse ramp.
 *
 * All handlers assume:
 *   - `authenticateToken` middleware has populated `req.user = { userId, ... }`.
 *   - `requireInvestor` middleware has confirmed `userType === 'investor'`.
 *
 * Response convention matches the rest of the backend:
 *   - 2xx: { success: true, data }
 *   - 4xx/5xx: { success: false, error, ...details }
 *
 * The readiness gate (RampKycService.assertReady) is the single source of
 * truth for whether an investor can create quotes / orders. Frontend reads
 * the same gate via GET /api/ramp/readiness to render the right onboarding UI.
 */
import logger from '../utils/logger.js';
import RampKycService, { RampReadinessError } from '../services/rampKyc.service.js';
import RampBankAccountService from '../services/rampBankAccount.service.js';
import RampOrderService from '../services/rampOrder.service.js';
import RampOfframpService, { RampOfframpError } from '../services/rampOfframp.service.js';
import { getUsdcIssuer } from '../config/stellar.js';

/**
 * Resolve a code ('TESOURO' | 'USDC') or a full CODE:ISSUER identifier into
 * the identifier EtherFuse expects as `targetAsset` for an on-ramp.
 *
 * On-ramp accepts both stablebonds (TESOURO) and stablecoins (USDC). USDC
 * quotes return `requiresSwap: true` — EtherFuse routes BRL → TESOURO →
 * USDC internally. Confirmed in sandbox 2026-05-16.
 */
function resolveOnrampTargetAsset(input) {
  if (typeof input === 'string' && input.includes(':')) return input;
  const code = input ?? 'TESOURO';
  if (code === 'TESOURO') {
    const id = process.env.ETHERFUSE_TESOURO_ASSET_IDENTIFIER;
    if (!id || !id.includes(':')) {
      throw new Error('ETHERFUSE_TESOURO_ASSET_IDENTIFIER not configured');
    }
    return id;
  }
  if (code === 'USDC') {
    return `USDC:${getUsdcIssuer()}`;
  }
  throw new Error(`Unsupported on-ramp targetAsset "${code}" (allowed: TESOURO, USDC)`);
}
import EtherFuseClient, { EtherFuseApiError } from '../services/etherfuse.service.js';
import prisma from '../config/prisma.js';

const log = logger.scope('RampController');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function investorIdFromReq(req) {
  const id = Number(req.user?.userId);
  if (!Number.isInteger(id) || id <= 0) {
    const e = new Error('No authenticated investor');
    e.status = 401;
    throw e;
  }
  return id;
}

function send(res, status, body) {
  return res.status(status).json(body);
}

/**
 * Map service-layer errors to HTTP responses. Keeps each handler tiny.
 * EtherFuseApiError -> 502 (upstream failed) with their status/body for
 * frontend introspection. RampReadinessError -> 403 with structured reason.
 */
function handleError(res, err, context) {
  if (err instanceof RampReadinessError) {
    return send(res, 403, {
      success: false,
      error: `gated:${err.reason}`,
      reason: err.reason,
      details: err.details,
    });
  }
  if (err instanceof RampOfframpError) {
    // Off-ramp-specific errors carry a structured `code` + optional `details`
    // for the frontend (e.g. `insufficient_balance` → show "Max" + balance).
    log.warn(`${context}: ${err.code ?? 'offramp'} — ${err.message}`, { details: err.details });
    return send(res, err.status ?? 400, {
      success: false,
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }
  if (err instanceof EtherFuseApiError) {
    // Propagate the upstream human-readable message into `error` so the
    // frontend doesn't need to dig into etherfuseBody to display it.
    // Sandbox-specific limits (e.g. `SandboxAmountExceeded`) surface here.
    const upstream =
      (err.body && typeof err.body === 'object' && (err.body.message || err.body.error))
      || (typeof err.body === 'string' ? err.body : null)
      || `EtherFuse upstream error (status ${err.status})`;
    log.warn(`${context}: EtherFuse ${err.status} — ${upstream}`, { path: err.path, body: err.body });
    // Forward upstream 4xx as-is (client-correctable conditions like 409
    // "pending order exists"); only 5xx / network failures are true 502s.
    const upstreamIsClientError = err.status >= 400 && err.status < 500;
    return send(res, upstreamIsClientError ? err.status : 502, {
      success: false,
      error: String(upstream),
      etherfuseStatus: err.status,
      etherfuseBody: err.body,
    });
  }
  if (err.code === 'P2002') {
    return send(res, 409, { success: false, error: 'conflict', target: err.meta?.target });
  }
  if (err.status && err.status >= 400 && err.status < 500) {
    return send(res, err.status, { success: false, error: err.message });
  }
  log.errorFromException(`${context}: unexpected error`, err);
  return send(res, 500, { success: false, error: 'internal_error' });
}

// ─────────────────────────────────────────────────────────────────────────────
// READINESS GATE
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/ramp/readiness — frontend polls this to gate the deposit UI. */
export async function getReadiness(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const readiness = await RampKycService.getReadiness(investorId);
    return send(res, 200, { success: true, data: readiness });
  } catch (err) {
    return handleError(res, err, 'getReadiness');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KYC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/ramp/kyc — submit full KYC in one shot.
 *
 * Body shape:
 *   {
 *     givenName, familyName, dateOfBirth (YYYY-MM-DD), phone,
 *     occupation, addressLine1, addressLine2?, city, region,
 *     postalCode, country?  (defaults to "BR")
 *   }
 *
 * `email` and `document` (CPF/CNPJ) already live on Investor — we don't
 * re-collect them here. If the investor's `document` is missing, the
 * readiness gate will surface it.
 */
export async function submitKyc(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const fields = req.body ?? {};
    const result = await RampKycService.runFullKyc(investorId, fields);
    return send(res, 200, { success: true, data: result });
  } catch (err) {
    return handleError(res, err, 'submitKyc');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BANK ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/ramp/bank-accounts — register a PIX bank account. */
export async function createBankAccount(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const { pixKey, pixKeyType, label, makeDefault } = req.body ?? {};
    const row = await RampBankAccountService.register({
      investorId,
      pixKey,
      pixKeyType,
      label,
      makeDefault,
    });
    return send(res, 201, { success: true, data: row });
  } catch (err) {
    return handleError(res, err, 'createBankAccount');
  }
}

/** GET /api/ramp/bank-accounts — list active bank accounts. */
export async function listBankAccounts(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const accounts = await RampBankAccountService.list(investorId);
    return send(res, 200, { success: true, data: accounts });
  } catch (err) {
    return handleError(res, err, 'listBankAccounts');
  }
}

/** DELETE /api/ramp/bank-accounts/:id — soft-delete locally (EtherFuse keeps the record). */
export async function deleteBankAccount(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const bankAccountId = Number(req.params.id);
    if (!Number.isInteger(bankAccountId) || bankAccountId <= 0) {
      return send(res, 400, { success: false, error: 'invalid bank account id' });
    }
    await RampBankAccountService.softDelete({ investorId, bankAccountId });
    return send(res, 204).end();
  } catch (err) {
    return handleError(res, err, 'deleteBankAccount');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/ramp/quotes — BRL → TESOURO|USDC quote.
 *
 * Body: { sourceAmount: number|string, sourceAsset?: "BRL", targetAsset?: "TESOURO"|"USDC"|"CODE:ISSUER" }
 * Defaults: sourceAsset="BRL", targetAsset="TESOURO".
 *
 * USDC quotes route through EtherFuse's internal swap (BRL → TESOURO → USDC)
 * exposed as a single on-ramp call with `requiresSwap: true`.
 */
export async function createQuote(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    await RampKycService.assertReady(investorId);

    const { sourceAmount } = req.body ?? {};
    if (sourceAmount == null) {
      return send(res, 400, { success: false, error: 'sourceAmount is required' });
    }
    const sourceAsset = req.body?.sourceAsset ?? 'BRL';
    if (sourceAsset !== 'BRL') {
      return send(res, 400, { success: false, error: `unsupported sourceAsset "${sourceAsset}" (only BRL accepted)` });
    }
    let targetAsset;
    try {
      targetAsset = resolveOnrampTargetAsset(req.body?.targetAsset);
    } catch (err) {
      const status = err.message.includes('not configured') ? 500 : 400;
      return send(res, status, { success: false, error: err.message });
    }

    const investor = await prisma.investor.findUnique({ where: { id: investorId } });

    const { quote, etherfuseResponse } = await RampOrderService.createQuote({
      investorId,
      orderType: 'onramp',
      blockchain: 'stellar',
      sourceAsset,
      targetAsset,
      sourceAmount,
      walletAddress: investor.stellarContractId,
    });
    return send(res, 201, { success: true, data: { quote, etherfuseResponse } });
  } catch (err) {
    return handleError(res, err, 'createQuote');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/ramp/orders — execute a quote.
 * Body: { quoteId: number, bankAccountId: number, memo?: string }
 * walletId is auto-resolved to the investor's single RampWallet (1:1 with C-address).
 */
export async function createOrder(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    await RampKycService.assertReady(investorId);

    const { quoteId, bankAccountId, memo } = req.body ?? {};
    if (!quoteId || !bankAccountId) {
      return send(res, 400, { success: false, error: 'quoteId and bankAccountId are required' });
    }
    const wallet = await prisma.rampWallet.findFirst({ where: { investorId } });
    if (!wallet) {
      return send(res, 403, { success: false, error: 'gated:no_wallet_registered' });
    }

    const { order, etherfuseResponse } = await RampOrderService.createOrder({
      investorId,
      quoteId: Number(quoteId),
      walletId: wallet.id,
      bankAccountId: Number(bankAccountId),
      memo,
    });
    return send(res, 201, { success: true, data: { order, etherfuseResponse } });
  } catch (err) {
    return handleError(res, err, 'createOrder');
  }
}

/** GET /api/ramp/orders — list this investor's orders (most recent first). */
export async function listOrders(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    let orders = await prisma.rampOrder.findMany({
      where: { investorId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Lazy reconcile non-terminal orders that are old enough to have been
    // indexed by EtherFuse. The floating RampOrderTracker polls this endpoint
    // every 8s, so an order that the webhook never delivered to us will catch
    // up here. Bounded by LIST_RECONCILE_MAX so a large in-flight backlog
    // can't slow the request down.
    const stale = orders.filter(reconcileEligible);
    if (stale.length > 0) {
      const updated = await Promise.all(
        stale.slice(0, LIST_RECONCILE_MAX).map((o) => reconcileOrderFromUpstream(o).catch(() => o))
      );
      const updatedById = new Map(updated.map((o) => [o.id, o]));
      orders = orders.map((o) => updatedById.get(o.id) ?? o);
    }

    return send(res, 200, { success: true, data: orders });
  } catch (err) {
    return handleError(res, err, 'listOrders');
  }
}

const TERMINAL_RAMP_STATUSES = new Set(['completed', 'finalized', 'failed', 'refunded', 'canceled', 'expired']);
const RECONCILE_STALENESS_MS = 8_000; // EtherFuse needs ~3-10s to index after createOrder
const LIST_RECONCILE_MAX = 10; // bound per-request upstream calls to keep latency predictable

function reconcileEligible(order) {
  if (TERMINAL_RAMP_STATUSES.has(order.status)) return false;
  return Date.now() - new Date(order.updatedAt).getTime() >= RECONCILE_STALENESS_MS;
}

/**
 * Lazy reconcile: when the frontend polls an order whose local copy is
 * non-terminal and old enough to have been indexed by EtherFuse, fetch fresh
 * state and apply the same transition the `order_updated` webhook would have.
 * This is a defensive fallback — primary path is still the webhook, which
 * fires synchronously when EtherFuse advances an order. But if a delivery is
 * dropped (sandbox flakiness, infra change, etc.), the poll will recover state
 * within one tick.
 *
 * Idempotent against late webhooks via the state machine's no-op + invalid-
 * transition guards.
 */
async function reconcileOrderFromUpstream(localOrder) {
  if (TERMINAL_RAMP_STATUSES.has(localOrder.status)) return localOrder;
  const ageMs = Date.now() - new Date(localOrder.updatedAt).getTime();
  if (ageMs < RECONCILE_STALENESS_MS) return localOrder;
  try {
    const efOrder = await EtherFuseClient.Orders.get(localOrder.etherfuseOrderId);
    if (!efOrder?.status || efOrder.status === localOrder.status) return localOrder;
    log.info(`Reconciling order ${localOrder.id}: local=${localOrder.status} upstream=${efOrder.status}`);
    await RampOrderService.applyWebhookTransition('order_updated', efOrder);
    // Re-read; transition may have advanced multiple steps via subsequent webhook race.
    return await prisma.rampOrder.findUnique({ where: { id: localOrder.id } });
  } catch (err) {
    log.debug(`Reconcile skipped (upstream fetch failed): ${err.message}`);
    return localOrder;
  }
}

/** GET /api/ramp/orders/:id — single order detail (with lazy upstream reconcile). */
export async function getOrder(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return send(res, 400, { success: false, error: 'invalid order id' });
    }
    let order = await prisma.rampOrder.findFirst({ where: { id, investorId } });
    if (!order) return send(res, 404, { success: false, error: 'order not found' });
    order = await reconcileOrderFromUpstream(order);
    return send(res, 200, { success: true, data: order });
  } catch (err) {
    return handleError(res, err, 'getOrder');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY SANDBOX SIMULATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/ramp/dev/fiat-received/:orderId — sandbox-only PIX simulator.
 * Hard-guarded: returns 404 in production so the route looks like it doesn't exist.
 */
export async function simulateFiatReceived(req, res) {
  // Match the sandbox detection used by RampKycService.getReadiness so the
  // simulator is available wherever the UI advertises the "skip bank app"
  // affordance. NODE_ENV alone is wrong: prod-mode Node running against
  // EtherFuse's sandbox URL is still a sandbox environment.
  const efBase = process.env.ETHERFUSE_API_BASE_URL || '';
  const isSandbox = efBase.includes('.sand.') || process.env.NODE_ENV !== 'production';
  if (!isSandbox) {
    return send(res, 404, { success: false, error: 'not found' });
  }
  try {
    const investorId = investorIdFromReq(req);
    const localId = Number(req.params.orderId);
    if (!Number.isInteger(localId) || localId <= 0) {
      return send(res, 400, { success: false, error: 'invalid order id' });
    }
    const order = await prisma.rampOrder.findFirst({ where: { id: localId, investorId } });
    if (!order) return send(res, 404, { success: false, error: 'order not found' });

    const result = await EtherFuseClient.Orders.simulateFiatReceived({
      orderId: order.etherfuseOrderId,
      amount: order.amountInFiat?.toString() ?? '0',
    });
    // EtherFuse will fire `order_updated` webhooks (created → funded → completed)
    // shortly after this call returns. If webhook delivery is broken we'd miss
    // them — kick off a reconcile a few seconds later so the next poll already
    // sees the advanced state.
    setTimeout(async () => {
      try {
        const fresh = await prisma.rampOrder.findFirst({ where: { id: localId, investorId } });
        if (fresh) await reconcileOrderFromUpstream(fresh);
      } catch { /* swallow — next poll's reconcile will retry */ }
    }, 6_000);
    return send(res, 200, { success: true, data: result });
  } catch (err) {
    return handleError(res, err, 'simulateFiatReceived');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OFF-RAMP (Tokens → BRL via PIX, EtherFuse Anchor Mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/ramp/offramp/quotes — TESOURO|USDC → BRL quote.
 *
 * Body: { sourceAsset: "TESOURO"|"USDC", sourceAmount: number|string }
 *
 * Gates on readiness AND balance pre-flight. The whitelist of source assets
 * is enforced in RampOfframpService — only the two stablecoin/stablebond
 * positions an investor can realistically hold in their Soroban wallet.
 */
export async function createOfframpQuote(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const { sourceAsset, sourceAmount } = req.body ?? {};
    const result = await RampOfframpService.createQuote(investorId, { sourceAsset, sourceAmount });
    return send(res, 201, { success: true, data: result });
  } catch (err) {
    return handleError(res, err, 'createOfframpQuote');
  }
}

/**
 * POST /api/ramp/offramp/orders — execute an off-ramp quote with useAnchor=true.
 *
 * Body: { quoteId: number, bankAccountId: number }
 *
 * Response includes the anchor account + memo that the frontend will use to
 * call /prepare-tx for the on-chain signing step.
 */
export async function createOfframpOrder(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const { quoteId, bankAccountId } = req.body ?? {};
    const result = await RampOfframpService.createOrder(investorId, { quoteId, bankAccountId });
    return send(res, 201, { success: true, data: result });
  } catch (err) {
    return handleError(res, err, 'createOfframpOrder');
  }
}

/**
 * POST /api/ramp/offramp/orders/:id/prepare-tx — build the unsigned SAC
 * transfer XDR with Memo.hash. Frontend takes this XDR, runs passkey signing,
 * and calls /submit-tx with the signed envelope.
 */
export async function prepareOfframpTx(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return send(res, 400, { success: false, error: 'invalid order id' });
    }
    const result = await RampOfframpService.prepareSigningTx(investorId, id);
    return send(res, 200, { success: true, data: result });
  } catch (err) {
    return handleError(res, err, 'prepareOfframpTx');
  }
}

/**
 * POST /api/ramp/offramp/orders/:id/submit-tx — submit the passkey-signed XDR.
 *
 * Body: { signedXdr: string }
 *
 * After submit, the order stays in `created` until EtherFuse's anchor monitor
 * detects the credit and fires `order_updated` with status=funded. Frontend
 * polls GET /api/ramp/orders/:id (lazy reconcile applies) for progression.
 */
export async function submitOfframpTx(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return send(res, 400, { success: false, error: 'invalid order id' });
    }
    const { signedXdr } = req.body ?? {};
    const result = await RampOfframpService.submitSignedTx(investorId, id, signedXdr);
    return send(res, 200, { success: true, data: result });
  } catch (err) {
    return handleError(res, err, 'submitOfframpTx');
  }
}

/**
 * POST /api/ramp/offramp/orders/:id/cancel — cancel a `created` order before
 * the investor has submitted the on-chain transfer. EtherFuse rejects cancel
 * attempts on funded/completed orders with 4xx, which surfaces as 502.
 */
export async function cancelOfframpOrder(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return send(res, 400, { success: false, error: 'invalid order id' });
    }
    const result = await RampOfframpService.cancelOrder(investorId, id);
    return send(res, 200, { success: true, data: result });
  } catch (err) {
    return handleError(res, err, 'cancelOfframpOrder');
  }
}

/**
 * POST /api/ramp/orders/:id/cancel — cancel a `created` on-ramp order before
 * the investor pays the PIX. After `funded`, requires refund flow (not
 * implemented). Twin of cancelOfframpOrder.
 */
export async function cancelOnrampOrder(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return send(res, 400, { success: false, error: 'invalid order id' });
    }
    const result = await RampOrderService.cancelOnrampOrder(investorId, id);
    return send(res, 200, { success: true, data: result });
  } catch (err) {
    return handleError(res, err, 'cancelOnrampOrder');
  }
}

export default {
  getReadiness,
  submitKyc,
  createBankAccount,
  listBankAccounts,
  deleteBankAccount,
  createQuote,
  createOrder,
  listOrders,
  getOrder,
  simulateFiatReceived,
  cancelOnrampOrder,
  createOfframpQuote,
  createOfframpOrder,
  prepareOfframpTx,
  submitOfframpTx,
  cancelOfframpOrder,
};
