/**
 * EtherFuse webhook receiver.
 *
 * Flow per request:
 *   1. Verify HMAC-SHA256 over JCS-canonicalized JSON body (RFC 8785).
 *      Secret is base64-decoded from ETHERFUSE_WEBHOOK_SECRET.
 *      Header: X-Signature: sha256={hex}
 *   2. Parse the tagged-format payload: { "order_updated": {...}, ... }.
 *   3. Extract (eventType, resourceId, resourceStatus) for idempotency.
 *   4. Try to insert into ramp_webhook_events with unique key
 *      (eventType, resourceId, resourceStatus). On P2002, this delivery is a
 *      retry → respond 200 immediately.
 *   5. Respond 200 within ~50ms, defer state-machine work to setImmediate.
 *
 * EtherFuse retries up to 3 times with 5-second delays on non-2xx. The unique
 * constraint guarantees we apply each (resource, status) transition exactly
 * once even under retry storms.
 */
import crypto from 'node:crypto';
import canonicalize from 'canonicalize';

import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import RampOrderService from '../services/rampOrder.service.js';

const log = logger.scope('RampWebhookController');

const KNOWN_EVENT_TYPES = new Set([
  'order_updated',
  'customer_updated',
  'bank_account_updated',
  'kyc_updated',
  'quote_updated',
  'swap_updated',
]);

/**
 * Optional defense-in-depth IP allowlist for EtherFuse callbacks.
 * HMAC signature verification is the primary gate; this just adds a perimeter
 * check that drops obviously-wrong-source traffic before crypto work.
 *
 * Set ETHERFUSE_ALLOWED_IPS as comma-separated IP literals or CIDRs.
 * Empty / unset → no IP check (preserves the dev-easy default).
 *
 * from the Stellar 37º audit.
 */
function isIpAllowed(req) {
  const raw = process.env.ETHERFUSE_ALLOWED_IPS;
  if (!raw || !raw.trim()) return true; // not configured, skip check

  const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0) return true;

  // x-forwarded-for is set by reverse proxies (Caddy) — pick the client-most.
  const xff = req.get('x-forwarded-for');
  const candidate = (xff ? String(xff).split(',')[0].trim() : null) || req.ip || req.connection?.remoteAddress;
  if (!candidate) return false;

  // Strip IPv6-mapped-IPv4 prefix.
  const ip = candidate.replace(/^::ffff:/, '');

  for (const entry of entries) {
    if (entry === ip) return true;
    if (entry.includes('/')) {
      try {
        if (ipInCidr(ip, entry)) return true;
      } catch {
        // ignore parse failure on individual entry
      }
    }
  }
  return false;
}

// Minimal IPv4 CIDR match (no extra deps; avoids pulling `ip` or `netmask`).
// IPv6 not supported — EtherFuse publishes IPv4 ranges.
function ipInCidr(ip, cidr) {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  const toInt = (s) => s.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  const ipInt = toInt(ip);
  const rangeInt = toInt(range);
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/**
 * Express handler. The route registers `express.raw({ type: 'application/json' })`
 * before this handler so `req.body` is a Buffer — needed for JCS canonicalization.
 */
export async function handleWebhook(req, res) {
  // Optional IP allowlist. HMAC is the real gate.
  if (!isIpAllowed(req)) {
    log.warn('Webhook from disallowed IP', {
      ip: req.ip,
      xff: req.get('x-forwarded-for')?.slice(0, 64),
    });
    return res.status(401).json({ error: 'origin not allowed' });
  }

  const secretB64 = process.env.ETHERFUSE_WEBHOOK_SECRET;
  if (!secretB64) {
    log.error('ETHERFUSE_WEBHOOK_SECRET is not set; rejecting webhook delivery');
    return res.status(503).json({ error: 'webhook secret not configured' });
  }

  const signatureHeader = req.get('X-Signature') || req.get('x-signature');
  if (!signatureHeader) {
    log.warn('Missing X-Signature header');
    return res.status(401).json({ error: 'missing signature' });
  }

  // Parse JSON from raw buffer.
  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
    payload = JSON.parse(raw);
  } catch (err) {
    log.warnFromException('Webhook body is not valid JSON', err);
    return res.status(400).json({ error: 'invalid json' });
  }

  // HMAC-SHA256 over canonicalized payload.
  const canonical = canonicalize(payload);
  if (canonical == null) {
    log.warn('Webhook body could not be canonicalized');
    return res.status(400).json({ error: 'uncanonicalizable body' });
  }

  let signatureValid = false;
  try {
    const key = Buffer.from(secretB64, 'base64');
    const hmac = crypto.createHmac('sha256', key).update(canonical).digest('hex');
    const expected = `sha256=${hmac}`;
    if (expected.length === signatureHeader.length) {
      signatureValid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
    }
  } catch (err) {
    log.errorFromException('HMAC verification crashed', err);
  }

  if (!signatureValid) {
    log.warn('Invalid webhook signature', { signatureHeader: signatureHeader?.slice(0, 16) + '…' });
    return res.status(401).json({ error: 'invalid signature' });
  }

  // Extract tagged event. The payload is { "<event_type>": { ...data } }.
  const eventEntries = Object.entries(payload).filter(([k]) => KNOWN_EVENT_TYPES.has(k));
  if (eventEntries.length !== 1) {
    log.warn('Webhook payload has no recognized event key', { keys: Object.keys(payload) });
    return res.status(400).json({ error: 'unrecognized event payload' });
  }
  const [eventType, eventData] = eventEntries[0];
  const resourceId = String(
    eventData.orderId
    ?? eventData.customerId
    ?? eventData.bankAccountId
    ?? eventData.walletId
    ?? eventData.id
    ?? ''
  );
  const resourceStatus = String(eventData.status ?? '(none)');

  if (!resourceId) {
    log.warn('Webhook event missing resource ID', { eventType, eventData });
    return res.status(400).json({ error: 'event missing resource id' });
  }

  // Idempotency anchor: (eventType, resourceId, resourceStatus). The unique
  // constraint on the table means a retried delivery of the same transition
  // throws P2002 — we treat that as success and short-circuit.
  const payloadHash = crypto.createHash('sha256').update(canonical).digest('hex');
  try {
    await prisma.rampWebhookEvent.create({
      data: {
        eventType,
        resourceId,
        resourceStatus,
        payloadHash,
        payload,
        signatureValid: true,
      },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      log.debug(`Duplicate webhook (${eventType}/${resourceId}/${resourceStatus}) — acked`);
      return res.status(200).json({ status: 'duplicate' });
    }
    log.errorFromException('Failed to persist webhook event', err);
    return res.status(500).json({ error: 'persist failed' });
  }

  // Ack fast so EtherFuse doesn't retry; process asynchronously.
  res.status(200).json({ status: 'accepted' });

  setImmediate(async () => {
    try {
      const result = await RampOrderService.applyWebhookTransition(eventType, eventData);
      await prisma.rampWebhookEvent.updateMany({
        where: { eventType, resourceId, resourceStatus },
        data: {
          processedAt: new Date(),
          processingError: result.handled ? null : (result.reason ?? 'unknown'),
        },
      });
    } catch (err) {
      log.errorFromException(`State transition failed for ${eventType}/${resourceId}`, err);
      try {
        await prisma.rampWebhookEvent.updateMany({
          where: { eventType, resourceId, resourceStatus },
          data: { processingError: err.message.slice(0, 1000) },
        });
      } catch (innerErr) {
        log.error('Failed to record processing error', { error: innerErr.message });
      }
    }
  });
}

export default { handleWebhook };
