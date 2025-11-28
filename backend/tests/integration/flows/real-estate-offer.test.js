import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { TestData } from '../../helpers/testData.js';
import { TestDatabase } from '../../helpers/testDatabase.js';
import request from 'supertest';
import app from '../../../src/app.js';
import fs from 'fs';
import path from 'path';

describe('Real Estate Offer Flow', () => {
    let companyUser;
    let companyToken;
    let adminToken;

    before(async () => {
        await TestDatabase.setup();

        // Create company and user
        const companyData = await TestData.createCompany();
        companyUser = await TestData.createCompanyUser(companyData.id);
        companyToken = TestData.generateToken(companyUser.id, 'company_user', companyData.id);

        // Create admin
        const admin = await TestData.createPlatformAdmin();
        adminToken = TestData.generateToken(admin.id, 'platform_admin');
    });

    after(async () => {
        await TestDatabase.cleanup();
    });

    it('should create a real estate offer with collateral and documents', async () => {
        // Create a dummy file for upload
        const filePath = path.join(process.cwd(), 'test-document.pdf');
        fs.writeFileSync(filePath, 'Dummy PDF content');

        try {
            const response = await request(app)
                .post('/api/companies/offers')
                .set('Authorization', `Bearer ${companyToken}`)
                .field('asset_code', 'RES01')
                .field('offer_name', 'Residencial Alphaville')
                .field('description', 'Tokenização de imóvel residencial')
                .field('total_supply', '500000')
                .field('annual_interest_rate', '10.5')
                .field('offer_type', 'collateral')
                .field('collateral_value', '800000')
                .field('collateral_description', 'Casa de alto padrão')
                .attach('matricula', filePath);

            if (response.status !== 201) {
                console.error('Create offer failed:', response.body);
            }

            assert.strictEqual(response.status, 201);
            assert.strictEqual(response.body.success, true);
            assert.strictEqual(response.body.data.assetCode, 'RES01');
            assert.strictEqual(response.body.data.collateral_type, 'real_estate');

            // Check LTV calculation: (500,000 / 800,000) * 100 = 62.5
            assert.strictEqual(parseFloat(response.body.data.collateral_ltv), 62.5);

            // Check documents
            assert.ok(response.body.data.legal_documents.matricula);
            assert.ok(response.body.data.legal_documents.matricula.hash);
            assert.ok(response.body.data.legal_documents.matricula.url);

        } finally {
            // Cleanup file
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    });

    it('should retrieve offer details with collateral info', async () => {
        const response = await request(app)
            .get('/api/companies/offers')
            .set('Authorization', `Bearer ${companyToken}`);

        assert.strictEqual(response.status, 200);
        const offer = response.body.data.find(o => o.assetCode === 'RES01');

        assert.ok(offer);
        assert.strictEqual(offer.collateralDescription, 'Casa de alto padrão');
        assert.strictEqual(offer.legalDocuments.matricula.fileName, 'test-document.pdf');
    });
});
