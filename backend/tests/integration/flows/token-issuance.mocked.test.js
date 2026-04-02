import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';
import { TestData } from '../../helpers/testData.js';
import { TestDatabase } from '../../helpers/testDatabase.js';
import request from 'supertest';
import path from 'path';

// Import Mock
import { MockStellarService } from '../../mocks/StellarService.mock.js';

describe('Token Issuance Flow (Mocked)', () => {
    let companyUser;
    let companyToken;
    let adminToken;
    let app;
    let adminAccount;
    let testAssetCode;

    before(async () => {
        const srcPath = path.resolve(process.cwd(), 'src');
        const appPath = path.join(srcPath, 'app.js');
        const stellarServicePath = path.join(srcPath, 'services/stellar.service.js');

        // Initializes the app with mocked services using esmock
        // We use the 3rd argument (optMocks) for deep mocking to ensure 
        // StellarService is mocked everywhere in the app tree.
        const appModule = await esmock(appPath, {}, {
            [stellarServicePath]: {
                StellarService: MockStellarService
            }
        });
        app = appModule.default;

        await TestDatabase.setup();

        // Create company and user
        const companyData = await TestData.createCompany();
        companyUser = await TestData.createCompanyUser(companyData.id);
        companyToken = TestData.generateToken(companyUser.id, 'company_user', companyData.id);

        // Create admin
        adminAccount = await TestData.createPlatformAdmin();
        adminToken = TestData.generateToken(adminAccount.id, 'platform_admin');

        // Ensure env var for the test admin check
        process.env.STELLAR_ISSUER_PUBLIC_KEY = 'GBISSUERMOCK123456789012345678901234567890123456789012';
    });

    after(async () => {
        await TestDatabase.cleanup();
    });

    it('should auto-issue token when offer is approved', async () => {
        // Use unique asset code per run to avoid collision with leftover data
        testAssetCode = `ISS${Date.now().toString().slice(-5)}`;

        // 1. Create an offer
        const offerResponse = await request(app)
            .post('/api/companies/offers')
            .set('Authorization', `Bearer ${companyToken}`)
            .send({
                asset_code: testAssetCode,
                offer_name: 'Issue Test Offer',
                description: 'Testing token issuance',
                total_supply: '1000000',
                annual_interest_rate: 8.5,
                offer_type: 'collateral',
                payment_type: 'monthly'
            });

        assert.strictEqual(offerResponse.status, 201);
        const offerId = offerResponse.body.data.id;

        // 2. Approve the offer — this now auto-issues the token
        const approveResponse = await request(app)
            .put(`/api/admin/offers/${offerId}/review`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                status: 'approved'
            });

        assert.strictEqual(approveResponse.status, 200);
        assert.strictEqual(approveResponse.body.success, true);

        // Auto-issue fires on approval. It creates the Token DB record,
        // then attempts SAC deploy (which fails in mocked env — that's expected).
        // The token should exist regardless of SAC outcome.
        assert.ok(
            approveResponse.body.autoIssueResult,
            'Approval response should include autoIssueResult'
        );

        // Verify the token was created by fetching the offer details
        const offerDetails = await request(app)
            .get('/api/admin/offers')
            .set('Authorization', `Bearer ${adminToken}`);

        const updatedOffer = offerDetails.body.data.find(o => o.assetCode === testAssetCode);
        assert.ok(updatedOffer, 'Offer should exist in admin list');
        assert.strictEqual(updatedOffer.status, 'approved');
    });

    it('should return 409 when explicitly issuing an already auto-issued token', async () => {
        // The token was already auto-issued during approval in the previous test.
        // Calling the explicit /issue endpoint should return 409.
        const offers = await request(app)
            .get('/api/admin/offers')
            .set('Authorization', `Bearer ${adminToken}`);

        const offer = offers.body.data.find(o => o.assetCode === testAssetCode);
        assert.ok(offer, 'Offer should exist');

        const issueResponse = await request(app)
            .post(`/api/admin/offers/${offer.id}/issue`)
            .set('Authorization', `Bearer ${adminToken}`);

        assert.strictEqual(issueResponse.status, 409);
        assert.strictEqual(issueResponse.body.error, 'Token already issued for this offer');
    });
});
