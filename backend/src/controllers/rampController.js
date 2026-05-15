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
  if (err instanceof EtherFuseApiError) {
    // Propagate the upstream human-readable message into `error` so the
    // frontend doesn't need to dig into etherfuseBody to display it.
    // Sandbox-specific limits (e.g. `SandboxAmountExceeded`) surface here.
    const upstream =
      (err.body && typeof err.body === 'object' && (err.body.message || err.body.error))
      || (typeof err.body === 'string' ? err.body : null)
      || `EtherFuse upstream error (status ${err.status})`;
    log.warn(`${context}: EtherFuse ${err.status} — ${upstream}`, { path: err.path, body: err.body });
    return send(res, 502, {
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
  log.error(`${context}: unexpected error`, { error: err.message, stack: err.stack });
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
 * POST /api/ramp/quotes — BRL → TESOURO quote.
 *
 * Body: { sourceAmount: number|string, sourceAsset?: "BRL", targetAsset?: <CODE:ISSUER> }
 * Defaults: sourceAsset="BRL", targetAsset=ETHERFUSE_TESOURO_ASSET_IDENTIFIER env var.
 *
 * Gates on readiness. Locks the source asset to BRL only — explicit
 * allowlist prevents accidental MXN/USD routes through this endpoint.
 */
export async function createQuote(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    await RampKycService.assertReady(investorId);

    const { sourceAmount } = req.body ?? {};
    if (sourceAmount == null) {
      return send(res, 400, { success: false, error: 'sourceAmount is required' });
    }
    // Whitelist — we only on-ramp BRL → TESOURO. Off-ramp + other assets are Phase 2+.
    const sourceAsset = req.body?.sourceAsset ?? 'BRL';
    if (sourceAsset !== 'BRL') {
      return send(res, 400, { success: false, error: `unsupported sourceAsset "${sourceAsset}" (only BRL accepted in Phase 1)` });
    }
    const targetAsset = req.body?.targetAsset ?? process.env.ETHERFUSE_TESOURO_ASSET_IDENTIFIER;
    if (!targetAsset) {
      return send(res, 500, { success: false, error: 'ETHERFUSE_TESOURO_ASSET_IDENTIFIER not configured' });
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
    const orders = await prisma.rampOrder.findMany({
      where: { investorId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return send(res, 200, { success: true, data: orders });
  } catch (err) {
    return handleError(res, err, 'listOrders');
  }
}

/** GET /api/ramp/orders/:id — single order detail. */
export async function getOrder(req, res) {
  try {
    const investorId = investorIdFromReq(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return send(res, 400, { success: false, error: 'invalid order id' });
    }
    const order = await prisma.rampOrder.findFirst({
      where: { id, investorId },
    });
    if (!order) return send(res, 404, { success: false, error: 'order not found' });
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
  if (process.env.NODE_ENV === 'production') {
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
    return send(res, 200, { success: true, data: result });
  } catch (err) {
    return handleError(res, err, 'simulateFiatReceived');
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
};
