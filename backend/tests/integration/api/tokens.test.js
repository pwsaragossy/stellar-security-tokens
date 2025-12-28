import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
// import app from '../../../src/app.js'; // Converted to dynamic import for debugging
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/testDatabase.js';
import { getInvestorToken } from '../../helpers/authHelper.js';

let app;
let request;

describe('Tokens API Integration Tests', () => {
  let investor;
  let authToken;
  let createdToken;

  before(async () => {
    try {
      const appModule = await import('../../../src/app.js');
      app = appModule.default;
      request = supertest(app);

      const data = await setupTestDatabase();
      investor = data.investor;
      createdToken = data.token;
      authToken = getInvestorToken(investor);
    } catch (error) {
      console.error('[Tokens API Test] Error initializing app or database:', error);
      throw error;
    }
  });

  after(async () => {
    await teardownTestDatabase();
  });

  test('GET /api/tokens - should list available tokens', async () => {
    const res = await request
      .get('/api/tokens')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.ok(createdToken.assetCode);
    // We expect at least the seeded token
    assert.ok(res.body.data.length >= 1);
    const found = res.body.data.find(t => t.assetCode === createdToken.assetCode);
    assert.ok(found, 'Seeded token should be in response');
  });

  test('GET /api/tokens/:assetCode - should return specific token details', async () => {
    const res = await request
      .get(`/api/tokens/${createdToken.assetCode}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.assetCode, createdToken.assetCode);
    assert.strictEqual(res.body.data.description, createdToken.description);
  });
});

