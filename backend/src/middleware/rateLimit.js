import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

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

    try {
        const url = REDIS_PASSWORD
            ? `redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`
            : `redis://${REDIS_HOST}:${REDIS_PORT}`;

        redisClient = createClient({ url });

        redisClient.on('error', (err) => {
            if (redisAvailable) {
                console.warn('[RateLimit] Redis connection lost, falling back to memory store:', err.message);
                redisAvailable = false;
            }
        });

        redisClient.on('connect', () => {
            console.log('[RateLimit] Redis connected for rate limiting');
            redisAvailable = true;
        });

        await redisClient.connect();
        redisAvailable = true;
        return redisClient;
    } catch (error) {
        console.warn('[RateLimit] Redis not available, using memory store:', error.message);
        redisAvailable = false;
        return null;
    }
}

/**
 * Create rate limiter with optional Redis store
 * Falls back to memory store if Redis unavailable
 */
function createLimiter(options) {
    const { windowMs, max, message, keyPrefix = 'rl' } = options;

    const limiterConfig = {
        windowMs,
        max,
        message: {
            success: false,
            error: message || 'Too many requests, please try again later.',
        },
        standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
        legacyHeaders: true, // Also return `X-RateLimit-*` headers for compatibility
        handler: (req, res, next, options) => {
            res.status(429).json(options.message);
        },
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
            console.log(`[RateLimit] Upgraded ${keyPrefix} limiter to Redis store`);
        }
    }).catch(() => {
        // Keep using memory store
    });

    return limiter;
}

/**
 * Global rate limiter - 100 requests per minute per IP
 * Applied to all routes as baseline protection
 */
export const globalLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: 'Too many requests from this IP, please try again after a minute.',
    keyPrefix: 'rl:global',
});

/**
 * Auth rate limiter - 5 requests per minute per IP
 * Applied to login/registration to prevent brute force attacks
 */
export const authLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: 'Too many authentication attempts, please try again after a minute.',
    keyPrefix: 'rl:auth',
});

/**
 * API rate limiter - 30 requests per minute per IP
 * Applied to sensitive API routes
 */
export const apiLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: 'API rate limit exceeded, please try again after a minute.',
    keyPrefix: 'rl:api',
});

/**
 * Strict rate limiter - 10 requests per minute per IP
 * Applied to expensive operations (token distribution, etc.)
 */
export const strictLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: 'Rate limit exceeded for this operation, please try again after a minute.',
    keyPrefix: 'rl:strict',
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
    conditionalRateLimit,
    skipRateLimitForTrusted,
};
