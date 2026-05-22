/**
 * Mocked version of Payments API Integration test
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

describe('Payments API Integration Tests (Mocked)', () => {
    let investor;
    let _token;
    let authToken;

    before(async () => {
        const appModule = await esmock('../../../src/app.js', {
            '../../../src/services/stellar.service.js': {
                StellarService: MockStellarService
            }
        });
        app = appModule.default;
        request = supertest(app);

        const data = await setupTestDatabase();
        investor = data.investor;
        _token = data.token;
        authToken = getInvestorToken(investor);
    });

    after(async () => {
        await teardownTestDatabase();
    });

    test('GET /api/payments/history - should return empty list initially (mocked)', async () => {
        const res = await request
            .get(`/api/investors/${investor.id}/payments`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        assert.strictEqual(res.body.success, true);
        assert.ok(Array.isArray(res.body.data.transactions));
        assert.strictEqual(res.body.data.transactions.length, 0);
    });

    test('GET /api/payments/history - should fail without auth (mocked)', async () => {
        await request
            .get(`/api/investors/${investor.id}/payments`)
            .expect(401);
    });
});
