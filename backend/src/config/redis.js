/**
 * Shared Redis client for the application
 * Used by rate limiting, email verification codes, etc.
 */

import { createClient } from 'redis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || null;

let redisClient = null;
let redisAvailable = false;

/**
 * Get or create Redis client
 * @returns {Promise<import('redis').RedisClientType|null>} Redis client or null if unavailable
 */
export async function getRedisClient() {
    if (redisClient) {
        return redisAvailable ? redisClient : null;
    }

    // Skip Redis connection in test environment
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
                console.warn('[Redis] Connection lost:', err.message);
                redisAvailable = false;
            }
        });

        redisClient.on('connect', () => {
            console.log('[Redis] Connected');
            redisAvailable = true;
        });

        await redisClient.connect();
        redisAvailable = true;
        return redisClient;
    } catch (error) {
        console.warn('[Redis] Not available:', error.message);
        redisAvailable = false;
        return null;
    }
}

/**
 * Check if Redis is currently available
 */
export function isRedisAvailable() {
    return redisAvailable;
}

// ====================
// Email Verification Code Storage
// ====================

const EMAIL_CODE_PREFIX = 'email_verify:';
const CODE_TTL_SECONDS = 600; // 10 minutes
const MAX_ATTEMPTS = 5;

/**
 * Store email verification code in Redis
 * @param {string} email - Email address
 * @param {string} code - 6-digit verification code
 * @returns {Promise<boolean>} Success
 */
export async function storeEmailCode(email, code) {
    const client = await getRedisClient();
    if (!client) {
        console.warn('[Redis] Not available, using memory fallback for email code');
        return false;
    }

    const key = `${EMAIL_CODE_PREFIX}${email.toLowerCase()}`;
    const data = JSON.stringify({ code, attempts: 0 });

    await client.setEx(key, CODE_TTL_SECONDS, data);
    return true;
}

/**
 * Verify email code from Redis
 * @param {string} email - Email address
 * @param {string} code - Code to verify
 * @returns {Promise<{valid: boolean, error?: string}>} Verification result
 */
export async function verifyEmailCode(email, code) {
    const client = await getRedisClient();
    if (!client) {
        return { valid: false, error: 'Verification service unavailable' };
    }

    const key = `${EMAIL_CODE_PREFIX}${email.toLowerCase()}`;
    const data = await client.get(key);

    if (!data) {
        return { valid: false, error: 'Code expired or not found' };
    }

    const { code: storedCode, attempts } = JSON.parse(data);

    // Check max attempts
    if (attempts >= MAX_ATTEMPTS) {
        await client.del(key);
        return { valid: false, error: 'Too many failed attempts. Please request a new code.' };
    }

    // Check code match
    if (storedCode !== code) {
        // Increment attempts
        await client.setEx(key, CODE_TTL_SECONDS, JSON.stringify({
            code: storedCode,
            attempts: attempts + 1
        }));
        return { valid: false, error: 'Invalid code' };
    }

    // Success - delete the code
    await client.del(key);
    return { valid: true };
}

/**
 * Delete email verification code
 * @param {string} email - Email address
 */
export async function deleteEmailCode(email) {
    const client = await getRedisClient();
    if (!client) return;

    const key = `${EMAIL_CODE_PREFIX}${email.toLowerCase()}`;
    await client.del(key);
}

/**
 * Generate a 6-digit numeric code
 * @returns {string} 6-digit code
 */
export function generate6DigitCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ====================
// Token Blocklist (for proper logout)
// ====================

const TOKEN_BLOCKLIST_PREFIX = 'token_blocklist:';
const TOKEN_BLOCKLIST_TTL = 86400; // 24 hours (matches JWT expiry)

/**
 * Add a token to the blocklist (invalidate it)
 * @param {string} token - JWT token to blocklist
 * @param {number} [ttlSeconds] - Optional TTL, defaults to 24h
 * @returns {Promise<boolean>} Success
 */
export async function blocklistToken(token, ttlSeconds = TOKEN_BLOCKLIST_TTL) {
    const client = await getRedisClient();
    if (!client) {
        console.warn('[Redis] Not available, token blocklist disabled');
        return false;
    }

    // Use token hash as key (more efficient than storing full token)
    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const key = `${TOKEN_BLOCKLIST_PREFIX}${tokenHash}`;

    await client.setEx(key, ttlSeconds, '1');
    return true;
}

/**
 * Check if a token is blocklisted
 * @param {string} token - JWT token to check
 * @returns {Promise<boolean>} True if token is blocklisted (invalid)
 */
export async function isTokenBlocklisted(token) {
    const client = await getRedisClient();
    if (!client) {
        // If Redis unavailable, allow token (fail open for availability)
        return false;
    }

    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const key = `${TOKEN_BLOCKLIST_PREFIX}${tokenHash}`;

    const exists = await client.exists(key);
    return exists === 1;
}

export default {
    getRedisClient,
    isRedisAvailable,
    storeEmailCode,
    verifyEmailCode,
    deleteEmailCode,
    generate6DigitCode,
    blocklistToken,
    isTokenBlocklisted,
};
