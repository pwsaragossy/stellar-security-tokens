/**
 * Mocked version of Tokens API Integration test
 * Uses esmock for CI stability
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import esmock from 'esmock';
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/testDatabase.js';
import { getInvestorToken } from '../../helpers/authHelper.js';

// Import Mocks
import { MockStellarService } from '../../mocks/StellarService.mock.js';

let app;
let request;

describe('Tokens API Integration Tests (Mocked)', () => {
    let investor;
    let authToken;
    let createdToken;

    before(async () => {
        try {
            const appModule = await esmock('../../../src/app.js', {
                '../../../src/services/stellar.service.js': {
                    StellarService: MockStellarService
                }
            });
            app = appModule.default;
            request = supertest(app);

            const data = await setupTestDatabase();
            investor = data.investor;
            createdToken = data.token;
            authToken = getInvestorToken(investor);
        } catch (error) {
            console.error('[Tokens API Test Mocked] Error initializing app or database:', error);
            throw error;
        }
    });

    after(async () => {
        await teardownTestDatabase();
    });

    test('GET /api/tokens - should list available tokens (mocked)', async () => {
        const res = await request
            .get('/api/tokens')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        assert.strictEqual(res.body.success, true);
        assert.ok(createdToken.assetCode);
        assert.ok(res.body.data.length >= 1);
        const found = res.body.data.find(t => t.assetCode === createdToken.assetCode);
        assert.ok(found, 'Seeded token should be in response');
    });

    test('GET /api/tokens/:assetCode - should return specific token details (mocked)', async () => {
        const res = await request
            .get(`/api/tokens/${createdToken.assetCode}`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.assetCode, createdToken.assetCode);
        assert.strictEqual(res.body.data.description, createdToken.description);
    });
});
