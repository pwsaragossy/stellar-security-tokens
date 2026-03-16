/**
 * Shared Redis client for the application
 * Used by rate limiting, email verification codes, etc.
 */

import { createClient } from 'redis';
import crypto from 'crypto';

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
 * Generate a 6-digit numeric code (cryptographically secure)
 * @returns {string} 6-digit code
 */
export function generate6DigitCode() {
    return crypto.randomInt(100000, 999999).toString();
}

// ====================
// Token Blocklist (for proper logout)
// ====================
//
//   SECURITY: Fail-closed design with bounded in-memory LRU fallback.
//
//   blocklistToken(token)
//           │
//           ▼
//   ┌─ Redis available? ─┐
//   │ YES                 │ NO
//   ▼                     ▼
//   redis.setEx        Also stores in memory LRU
//   + memory LRU       (bounded to 10K entries)
//
//   isTokenBlocklisted(token)
//           │
//           ▼
//   ┌─ Redis available? ─┐
//   │ YES                 │ NO
//   ▼                     ▼
//   Check redis key    Check memory LRU
//   Return result      If not found → BLOCK (fail closed)
//

const TOKEN_BLOCKLIST_PREFIX = 'token_blocklist:';
const TOKEN_BLOCKLIST_TTL = 86400; // 24 hours (matches JWT expiry)
const BLOCKLIST_FALLBACK_MAX = 10000;

// In-memory fallback for blocklisted tokens when Redis is unavailable
const blocklistFallbackMap = new Map();

/**
 * Compute SHA-256 hash of a token for storage keys
 * @param {string} token
 * @returns {string} hex hash
 */
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Add a token to the blocklist (invalidate it)
 * @param {string} token - JWT token to blocklist
 * @param {number} [ttlSeconds] - Optional TTL, defaults to 24h
 * @returns {Promise<boolean>} Success
 */
export async function blocklistToken(token, ttlSeconds = TOKEN_BLOCKLIST_TTL) {
    const tokenHash = hashToken(token);
    const key = `${TOKEN_BLOCKLIST_PREFIX}${tokenHash}`;

    // Always store in memory fallback (defense in depth)
    if (blocklistFallbackMap.size >= BLOCKLIST_FALLBACK_MAX) {
        // Evict oldest entry
        const firstKey = blocklistFallbackMap.keys().next().value;
        blocklistFallbackMap.delete(firstKey);
    }
    blocklistFallbackMap.set(tokenHash, Date.now() + ttlSeconds * 1000);

    const client = await getRedisClient();
    if (!client) {
        console.warn('[Redis] Not available, token blocklisted in memory only');
        return true; // Still blocklisted in memory
    }

    await client.setEx(key, ttlSeconds, '1');
    return true;
}

/**
 * Check if a token is blocklisted
 * Fails CLOSED: if Redis is unavailable and token is not in memory fallback,
 * returns true (blocklisted) to prevent revoked tokens from being accepted.
 * @param {string} token - JWT token to check
 * @returns {Promise<boolean>} True if token is blocklisted (invalid)
 */
export async function isTokenBlocklisted(token) {
    const tokenHash = hashToken(token);
    const key = `${TOKEN_BLOCKLIST_PREFIX}${tokenHash}`;

    const client = await getRedisClient();
    if (client) {
        try {
            const exists = await client.exists(key);
            return exists === 1;
        } catch (err) {
            console.warn('[Redis] Blocklist check failed, falling back to memory:', err.message);
        }
    }

    // Redis unavailable — check in-memory fallback
    const expiresAt = blocklistFallbackMap.get(tokenHash);
    if (expiresAt) {
        if (Date.now() > expiresAt) {
            blocklistFallbackMap.delete(tokenHash);
            // Expired from fallback, but Redis is down — fail closed
            return true;
        }
        return true; // Found in fallback, definitely blocklisted
    }

    // Not in fallback AND Redis is down → fail CLOSED
    // This blocks all tokens during Redis outage, which is safer than
    // allowing potentially-revoked tokens through.
    console.warn('[Redis] Unavailable and token not in memory fallback — fail closed (blocking token)');
    return true;
}

// ====================
// WebAuthn / Auth Challenge Storage
// ====================
// Stores short-lived auth challenges (WebAuthn, Freighter SEP-10).
// Redis-first with in-memory fallback when Redis is unavailable.
//
//   storeChallenge(key, data)
//           │
//           ▼
//   ┌─ Redis available? ─┐
//   │ YES                 │ NO
//   ▼                     ▼
//   redis.setEx        Map.set (with expiry)
//   (key, 300, JSON)   Log warning
//

const CHALLENGE_PREFIX = 'auth_challenge:';
const CHALLENGE_TTL_SECONDS = 300; // 5 minutes
const CHALLENGE_FALLBACK_MAX = 1000;

// In-memory fallback when Redis is unavailable
const challengeFallbackMap = new Map();

/**
 * Store an auth challenge (WebAuthn or Freighter)
 * @param {string} key - Unique challenge key (e.g. 'webauthn:{challenge}' or 'freighter:{publicKey}')
 * @param {object} data - Challenge data to store
 * @returns {Promise<boolean>} Success
 */
export async function storeChallenge(key, data) {
    const redisKey = `${CHALLENGE_PREFIX}${key}`;
    const client = await getRedisClient();

    if (client) {
        try {
            await client.setEx(redisKey, CHALLENGE_TTL_SECONDS, JSON.stringify(data));
            return true;
        } catch (err) {
            console.warn('[Redis] Challenge store failed, using fallback:', err.message);
        }
    }

    // Fallback: in-memory with expiry
    if (challengeFallbackMap.size >= CHALLENGE_FALLBACK_MAX) {
        // Evict oldest entry
        const firstKey = challengeFallbackMap.keys().next().value;
        challengeFallbackMap.delete(firstKey);
    }

    challengeFallbackMap.set(key, {
        ...data,
        _expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000,
    });
    console.warn('[Redis] Not available, using memory fallback for challenge storage');
    return true;
}

/**
 * Retrieve an auth challenge
 * @param {string} key - Challenge key
 * @returns {Promise<object|null>} Challenge data or null if not found/expired
 */
export async function getChallenge(key) {
    const redisKey = `${CHALLENGE_PREFIX}${key}`;
    const client = await getRedisClient();

    if (client) {
        try {
            const raw = await client.get(redisKey);
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch {
                console.error('[Redis] Corrupted challenge data for key:', key);
                await client.del(redisKey);
                return null;
            }
        } catch (err) {
            console.warn('[Redis] Challenge get failed, trying fallback:', err.message);
        }
    }

    // Fallback: in-memory
    const entry = challengeFallbackMap.get(key);
    if (!entry) return null;

    if (Date.now() > entry._expiresAt) {
        challengeFallbackMap.delete(key);
        return null;
    }

    // Return data without internal _expiresAt field
    const { _expiresAt, ...data } = entry;
    return data;
}

/**
 * Delete an auth challenge
 * @param {string} key - Challenge key
 * @returns {Promise<void>}
 */
export async function deleteChallenge(key) {
    const redisKey = `${CHALLENGE_PREFIX}${key}`;
    const client = await getRedisClient();

    if (client) {
        try {
            await client.del(redisKey);
        } catch (err) {
            console.warn('[Redis] Challenge delete failed:', err.message);
        }
    }

    // Always clean fallback too (might have entries from a Redis blip)
    challengeFallbackMap.delete(key);
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
    storeChallenge,
    getChallenge,
    deleteChallenge,
};
