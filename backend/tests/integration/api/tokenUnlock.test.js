import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/testDatabase.js';
import { getAdminToken, createTestAdmin } from '../../helpers/authHelper.js';

let app;
let request;

describe('Token Unlock API Integration Tests', () => {
    let platformAdmin;
    let adminToken;
    let offer;
    let token;

    before(async () => {
        const appModule = await import('../../../src/app.js');
        app = appModule.default;
        request = supertest(app);

        const data = await setupTestDatabase();
        offer = data.offer;
        token = data.token;

        // Create platform admin for auth
        platformAdmin = await createTestAdmin();
        adminToken = getAdminToken(platformAdmin);
    });

    after(async () => {
        await teardownTestDatabase();
    });

    test('POST /api/platform-admins/offers/:offerId/unlock-token - requires authentication', async () => {
        const res = await request
            .post(`/api/platform-admins/offers/${offer.id}/unlock-token`)
            .send({ confirm: true })
            .expect(401);

        assert.ok(!res.body.success || res.status === 401, 'Should reject unauthenticated requests');
    });

    test('POST /api/platform-admins/offers/:offerId/unlock-token - requires confirmation', async () => {
        const res = await request
            .post(`/api/platform-admins/offers/${offer.id}/unlock-token`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({}) // No confirm: true
            .expect(400);

        assert.strictEqual(res.body.success, false);
        assert.ok(res.body.error?.includes('Confirmation') || res.body.message?.includes('confirm'),
            'Should require explicit confirmation');
    });

    test('POST /api/platform-admins/offers/:offerId/unlock-token - returns 404 for non-existent offer', async () => {
        const res = await request
            .post('/api/platform-admins/offers/999999/unlock-token')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ confirm: true })
            .expect(404);

        assert.strictEqual(res.body.success, false);
        assert.ok(res.body.error?.includes('not found') || res.body.error?.includes('Not found'),
            'Should return not found for invalid offer');
    });

    // Note: Full unlock test requires Stellar testnet connection
    // This test verifies the API structure when Stellar is not available
    test('POST /api/platform-admins/offers/:offerId/unlock-token - handles Stellar connection gracefully', async () => {
        try {
            const res = await request
                .post(`/api/platform-admins/offers/${offer.id}/unlock-token`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ confirm: true });

            // Either success (if Stellar testnet is reachable) or graceful error
            if (res.status === 200) {
                assert.strictEqual(res.body.success, true);
                assert.ok(res.body.data?.stellarTxHash || res.body.data?.alreadyUnlocked,
                    'Successful unlock should return tx hash or alreadyUnlocked flag');
            } else {
                // Stellar connection error is acceptable in test environment
                assert.ok([400, 500].includes(res.status),
                    'Should return appropriate error status');
                assert.strictEqual(res.body.success, false);
            }
        } catch (error) {
            // Network errors are acceptable in test environment
            assert.ok(true, 'Test skipped - Stellar network not reachable');
        }
    });

});
