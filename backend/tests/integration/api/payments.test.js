import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
// import app from '../../../src/app.js';
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/testDatabase.js';
import { getInvestorToken } from '../../helpers/authHelper.js';

let app;
let request;

describe('Payments API Integration Tests', () => {
  let investor;
  let token;
  let authToken;

  before(async () => {
    const appModule = await import('../../../src/app.js');
    app = appModule.default;
    request = supertest(app);

    const data = await setupTestDatabase();
    investor = data.investor;
    token = data.token;
    authToken = getInvestorToken(investor);
  });

  after(async () => {
    await teardownTestDatabase();
  });

  test('GET /api/payments/history - should return empty list initially', async () => {
    const res = await request
      .get(`/api/investors/${investor.id}/payments`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.payments));
    assert.strictEqual(res.body.data.payments.length, 0);
  });

  test('GET /api/payments/history - should fail without auth', async () => {
    await request
      .get(`/api/investors/${investor.id}/payments`)
      .expect(401);
  });
});

