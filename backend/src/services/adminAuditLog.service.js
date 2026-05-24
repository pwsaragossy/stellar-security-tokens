/**
 * Admin-action audit log — writes one immutable row per platform-admin
 * operation. Wired from `middleware/authorize.js` via `res.on('finish')`
 * so every successful or failed admin op is recorded with the actor,
 * route, payload hash, IP, user-agent, and HTTP status.
 *
 * Non-blocking: a DB write failure here must never break the request
 * path. Errors are logged via Sentry-routing logger but swallowed.
 *
 * Privacy: we hash request bodies (sha256), never store raw payloads —
 * they may contain PII (KYC documents), tokens, or large blobs.
 */
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

const log = logger.scope('AdminAudit');

function hashPayload(body) {
  if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
    return null;
  }
  try {
    const json = typeof body === 'string' ? body : JSON.stringify(body);
    return crypto.createHash('sha256').update(json).digest('hex');
  } catch {
    return null;
  }
}

function inferTargetType(req) {
  const url = req.originalUrl || req.url || '';
  if (url.includes('/contracts/')) return 'contract';
  if (url.includes('/offers/') || url.includes('/offers?')) return 'offer';
  if (url.includes('/companies/')) return 'company';
  if (url.includes('/investors/')) return 'investor';
  if (url.includes('/tokens/') || url.endsWith('/tokens')) return 'token';
  if (url.includes('/transactions/')) return 'transaction';
  if (url.includes('/users/')) return 'admin_user';
  return null;
}

function inferTargetId(req) {
  return (
    req.params?.id ??
    req.params?.offerId ??
    req.params?.companyId ??
    req.params?.investorId ??
    req.params?.userId ??
    req.params?.tokenId ??
    null
  );
}

function getClientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim().slice(0, 64);
  return (req.ip || req.connection?.remoteAddress || null)?.slice(0, 64) ?? null;
}

/**
 * Persist one AdminAction row. Never throws — logs and swallows.
 */
export async function logAdminAction(payload) {
  try {
    await prisma.adminAction.create({ data: payload });
  } catch (err) {
    log.error('Failed to write AdminAction:', err?.message ?? String(err));
  }
}

/**
 * Build the AdminAction payload from the Express req/res pair.
 * Result is one of: "success" (2xx/3xx), "failure" (4xx/5xx), "denied" (403 without route-handler reached).
 */
export function buildAdminActionPayload(req, res, result) {
  const targetIdRaw = inferTargetId(req);
  return {
    actorId: typeof req.user?.userId === 'number' ? req.user.userId : null,
    actorType: req.user?.userType ?? null,
    actorRole: req.user?.role ?? null,
    action: `${req.method} ${req.originalUrl || req.url || ''}`.slice(0, 255),
    targetType: inferTargetType(req),
    targetId: targetIdRaw != null ? String(targetIdRaw).slice(0, 255) : null,
    payloadHash: hashPayload(req.body),
    ip: getClientIp(req),
    userAgent: (req.headers?.['user-agent'] ?? null)?.slice(0, 500) ?? null,
    result,
    statusCode: res?.statusCode ?? null,
  };
}

/**
 * Attach a one-shot res.on('finish') hook that logs the admin action.
 * Safe to call multiple times — `res.once` ensures idempotency.
 */
export function attachAdminAuditHook(req, res) {
  res.once('finish', () => {
    const result = res.statusCode < 400 ? 'success' : 'failure';
    logAdminAction(buildAdminActionPayload(req, res, result));
  });
}

/**
 * List recent AdminAction rows for the SecurityEvents admin page.
 *
 * Reads the immutable admin_actions table with optional filters. Indexes
 * already exist on (actorId, createdAt), (action, createdAt),
 * (targetType, targetId, createdAt), (createdAt) — all the common filter
 * patterns are O(log n) lookups.
 */
export async function listRecentActions(filters = {}) {
  const {
    limit = 50,
    offset = 0,
    actorId = null,
    targetType = null,
    targetId = null,
    result = null,
    actionPrefix = null,
    from = null,
    to = null,
  } = filters;

  const where = {};
  if (Number.isInteger(actorId)) where.actorId = actorId;
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;
  if (result) where.result = result;
  if (actionPrefix) where.action = { startsWith: actionPrefix };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const [items, total] = await Promise.all([
    prisma.adminAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      skip: safeOffset,
    }),
    prisma.adminAction.count({ where }),
  ]);

  return { items, total };
}
