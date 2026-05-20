/**
 * Sequential-identical-tx debounce (F-008).
 *
 * Caroline Cardoso's Stellar 37º class explicitly flagged the pattern of
 * "três sanções do mesmo valor sequencial, quase no mesmo minuto" as a
 * bot/replay signal. Stellar sequence numbers prevent byte-identical
 * replay, but they don't prevent a user (or a credential-replay bot) from
 * submitting three logically-identical intents (different sequence
 * numbers, same actor, same amount, same target).
 *
 * This middleware fingerprints the (user, route, payload) triple and
 * holds a Redis lock with a 10-second TTL. A second identical intent
 * inside the window returns 409 Conflict with a structured code so the
 * frontend can surface a warning-style "click again in 10s to confirm".
 *
 * Privacy: we hash the body (sha256) — never store raw payloads.
 * Fail-open: if Redis is unreachable, the middleware skips (logs a
 * warning) rather than blocking legitimate intents.
 */
import crypto from 'crypto';
import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';

const log = logger.scope('IntentDebounce');

const DEFAULT_TTL_SECONDS = 10;
const KEY_PREFIX = 'intent:';

function fingerprintRequest(req) {
    const actorId = req.user?.userId ?? 'anon';
    const actorType = req.user?.userType ?? 'anon';
    const route = `${req.method} ${req.baseUrl ?? ''}${req.route?.path ?? req.path ?? ''}`;

    const bodyJson = req.body && typeof req.body === 'object'
        ? JSON.stringify(req.body)
        : (typeof req.body === 'string' ? req.body : '');
    const bodyHash = bodyJson
        ? crypto.createHash('sha256').update(bodyJson).digest('hex').slice(0, 32)
        : 'empty';

    return `${KEY_PREFIX}${actorType}:${actorId}:${route}:${bodyHash}`;
}

/**
 * Express middleware factory. Returns a middleware that 409-rejects a
 * duplicate intent (same actor, same route, same body hash) within `ttlSeconds`.
 *
 * @param {object} options
 * @param {number} [options.ttlSeconds=10]
 * @returns {import('express').RequestHandler}
 */
export function intentDebounce({ ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
    return async (req, res, next) => {
        try {
            const client = await getRedisClient();
            if (!client) {
                // Fail-open: Redis down should not block legitimate intents.
                log.warn('Redis unavailable — debounce skipped');
                return next();
            }

            const key = fingerprintRequest(req);

            // SET NX EX — atomic "lock if not exists" with TTL
            const acquired = await client.set(key, '1', { NX: true, EX: ttlSeconds });

            if (acquired !== 'OK' && acquired !== true && acquired !== 1) {
                // Existing key — duplicate intent inside the window
                log.warn(`Duplicate intent rejected: ${key}`);
                return res.status(409).json({
                    error: `Duplicate intent suspected — wait ${ttlSeconds}s before retrying.`,
                    code: 'DUPLICATE_INTENT',
                    retryAfterSeconds: ttlSeconds,
                });
            }

            return next();
        } catch (err) {
            log.error('Debounce error (fail-open):', err?.message ?? String(err));
            return next();
        }
    };
}

export default intentDebounce;
