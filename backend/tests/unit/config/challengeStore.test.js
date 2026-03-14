/**
 * Tests for Challenge Store (Redis + fallback)
 * 
 * Tests the storeChallenge/getChallenge/deleteChallenge functions
 * in config/redis.js. In test env, Redis returns null so these
 * exercise the in-memory fallback path.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

// In test env (NODE_ENV=test), getRedisClient returns null,
// so challenge store falls back to in-memory Map
import { storeChallenge, getChallenge, deleteChallenge } from '../../../src/config/redis.js';

describe('Challenge Store', () => {
    const testKey = 'webauthn:investor:test-challenge-123';
    const testData = {
        challenge: 'test-challenge-123',
        userId: 1,
        userType: 'investor',
    };

    beforeEach(async () => {
        // Clean up any leftover test data
        await deleteChallenge(testKey);
    });

    describe('storeChallenge + getChallenge roundtrip', () => {
        test('stores and retrieves challenge data', async () => {
            const stored = await storeChallenge(testKey, testData);
            assert.strictEqual(stored, true);

            const retrieved = await getChallenge(testKey);
            assert.ok(retrieved, 'Should retrieve stored challenge');
            assert.strictEqual(retrieved.challenge, testData.challenge);
            assert.strictEqual(retrieved.userId, testData.userId);
            assert.strictEqual(retrieved.userType, testData.userType);
        });

        test('returns null for non-existent key', async () => {
            const result = await getChallenge('nonexistent:key:456');
            assert.strictEqual(result, null);
        });
    });

    describe('deleteChallenge', () => {
        test('removes stored challenge', async () => {
            await storeChallenge(testKey, testData);

            // Verify it exists
            const before = await getChallenge(testKey);
            assert.ok(before, 'Challenge should exist before delete');

            // Delete
            await deleteChallenge(testKey);

            // Verify it's gone
            const after = await getChallenge(testKey);
            assert.strictEqual(after, null, 'Challenge should be null after delete');
        });

        test('does not throw for non-existent key', async () => {
            // Should not throw
            await deleteChallenge('nonexistent:key:789');
        });
    });

    describe('Freighter challenge with hex txHash', () => {
        test('stores and retrieves hex-encoded txHash', async () => {
            const freighterKey = 'freighter:GABCD1234';
            const freighterData = {
                nonce: 'abc123',
                txHash: 'deadbeef01020304',
                adminId: 1,
                networkPassphrase: 'Test SDF Network ; September 2015',
            };

            await storeChallenge(freighterKey, freighterData);
            const retrieved = await getChallenge(freighterKey);

            assert.ok(retrieved);
            assert.strictEqual(retrieved.txHash, 'deadbeef01020304');

            // Verify Buffer roundtrip works
            const buffer = Buffer.from(retrieved.txHash, 'hex');
            assert.strictEqual(buffer.toString('hex'), 'deadbeef01020304');

            await deleteChallenge(freighterKey);
        });
    });

    describe('Multiple challenges', () => {
        test('stores multiple challenges independently', async () => {
            const key1 = 'webauthn:investor:challenge-aaa';
            const key2 = 'webauthn:company_user:challenge-bbb';

            await storeChallenge(key1, { userId: 1, userType: 'investor' });
            await storeChallenge(key2, { userId: 2, userType: 'company_user' });

            const r1 = await getChallenge(key1);
            const r2 = await getChallenge(key2);

            assert.strictEqual(r1.userId, 1);
            assert.strictEqual(r2.userId, 2);

            // Deleting one doesn't affect the other
            await deleteChallenge(key1);
            assert.strictEqual(await getChallenge(key1), null);
            assert.ok(await getChallenge(key2));

            await deleteChallenge(key2);
        });
    });
});
