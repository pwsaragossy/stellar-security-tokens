import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import logger from '../utils/logger.js';
const log = logger.scope('RateLimit');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || null;

// Redis client for rate limiting (separate from Bull queue)
let redisClient = null;
let redisAvailable = false;

/**
 * Initialize Redis client for rate limiting
 * Returns null if Redis is not available (graceful degradation)
 */
async function getRedisClient() {
    if (redisClient) {
        return redisAvailable ? redisClient : null;
    }

    // Skip Redis connection in test environment to prevent hanging processes
    if (process.env.NODE_ENV === 'test') {
        return null;
    }

    try {
        const url = REDIS_PASSWORD
            ? `redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`
            : `redis://${REDIS_HOST}:${REDIS_PORT}`;

        redisClient = createClient({ url });

        redisClient.on('error', (err) => {
            if (redisAvailable) {
                log.warn('[RateLimit] Redis connection lost, falling back to memory store:', err.message);
                redisAvailable = false;
            }
        });

        redisClient.on('connect', () => {
            log.info('[RateLimit] Redis connected for rate limiting');
            redisAvailable = true;
        });

        await redisClient.connect();
        redisAvailable = true;
        return redisClient;
    } catch (error) {
        log.warn('[RateLimit] Redis not available, using memory store:', error.message);
        redisAvailable = false;
        return null;
    }
}

/**
 * Create rate limiter with optional Redis store
 * Falls back to memory store if Redis unavailable
 */
function createLimiter(options) {
    const { windowMs, max, message, keyPrefix = 'rl', keyGenerator } = options;

    const limiterConfig = {
        windowMs,
        max,
        message: {
            success: false,
            error: message || 'Too many requests, please try again later.',
        },
        standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
        legacyHeaders: true, // Also return `X-RateLimit-*` headers for compatibility
        // Skip rate limiting in test environment
        skip: (_req, _res) => process.env.NODE_ENV === 'test',
        handler: (req, res, next, options) => {
            res.status(429).json(options.message);
        },
        // Custom keyGenerator (e.g. perUserLimiter keys on req.user.userId).
        // Must be passed at construction time — express-rate-limit captures
        // options in a closure and ignores post-hoc property mutation.
        ...(typeof keyGenerator === 'function' ? { keyGenerator } : {}),
    };

    // Create limiter with memory store initially
    const limiter = rateLimit(limiterConfig);

    // Try to upgrade to Redis store asynchronously
    getRedisClient().then(client => {
        if (client && redisAvailable) {
            limiter.store = new RedisStore({
                sendCommand: (...args) => client.sendCommand(args),
                prefix: `${keyPrefix}:`,
            });
            log.info(`[RateLimit] Upgraded ${keyPrefix} limiter to Redis store`);
        }
    }).catch(() => {
        // Keep using memory store
    });

    return limiter;
}

/**
 * Global rate limiter - 300 requests per minute per IP
 * Applied to all routes as baseline protection
 */
export const globalLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 300,
    message: 'Too many requests from this IP, please try again after a minute.',
    keyPrefix: 'rl:global',
});

/**
 * Auth rate limiter - 30 requests per minute per IP
 * Applied to login/registration to prevent brute force attacks
 */
export const authLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // Strict limit for auth endpoints to prevent brute-force
    message: 'Too many authentication attempts, please try again after a minute.',
    keyPrefix: 'rl:auth',
});

/**
 * API rate limiter - 300 requests per minute per IP
 * Applied to sensitive API routes
 */
export const apiLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 300, // Increased from 30 to support dashboard polling and concurrent requests
    message: 'API rate limit exceeded, please try again after a minute.',
    keyPrefix: 'rl:api',
});

/**
 * Strict rate limiter - 60 requests per minute per IP
 * Applied to expensive operations (token distribution, etc.)
 */
export const strictLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // Increased from 10 to support frequent payment checks
    message: 'Rate limit exceeded for this operation, please try again after a minute.',
    keyPrefix: 'rl:strict',
});

/**
 * Per-user rate limiter — O-002 audit follow-up.
 *
 * IP-based limiting alone is insufficient against an attacker rotating
 * IPs. This limiter keys on `req.user.userId` (set by authenticateToken)
 * with an IP fallback for anonymous requests. Mount AFTER authenticateToken
 * on routes where per-user volume matters more than per-IP volume.
 *
 * Limit: 60 req/min/user — generous enough for typical active sessions
 * (page navigations, dashboard polling, an investment flow), tight
 * enough to catch credential-replay bots driving thousands of requests.
 *
 * IMPORTANT: keyGenerator is passed at construction time. Setting it
 * post-hoc on the returned middleware is a silent no-op because
 * express-rate-limit captures options in a closure.
 */
export const perUserLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Per-user rate limit exceeded. Slow down or contact support.',
    keyPrefix: 'rl:user',
    // For authenticated requests: key on userId.
    // For anonymous requests: use express-rate-limit's `ipKeyGenerator` helper —
    // it normalizes IPv6 addresses so single users can't bypass the limit by
    // varying the trailing bits of their /64 prefix. Required by
    // express-rate-limit v7+ to avoid ERR_ERL_KEY_GEN_IPV6.
    keyGenerator: (req, res) =>
        req.user?.userId
            ? `u:${req.user.userType ?? 'unk'}:${req.user.userId}`
            : ipKeyGenerator(req, res),
});

/**
 * Skip rate limiting for certain conditions
 * @param {Request} req - Express request
 * @returns {boolean} True to skip rate limiting
 */
export function skipRateLimitForTrusted(req) {
    // Skip for health check endpoint
    if (req.path === '/health') {
        return true;
    }

    // Skip for trusted API keys (if configured)
    const apiKey = req.headers['x-api-key'];
    if (apiKey && apiKey === process.env.TRUSTED_API_KEY) {
        return true;
    }

    return false;
}

/**
 * Middleware that conditionally applies rate limiting
 * Skips for trusted sources
 */
export function conditionalRateLimit(limiter) {
    return (req, res, next) => {
        if (skipRateLimitForTrusted(req)) {
            return next();
        }
        return limiter(req, res, next);
    };
}

export default {
    globalLimiter,
    authLimiter,
    apiLimiter,
    strictLimiter,
    perUserLimiter,
    conditionalRateLimit,
    skipRateLimitForTrusted,
};
