/**
 * Passkey Discover Login Integration Tests
 * Tests actual endpoint behavior for usernameless passkey authentication
 * 
 * These tests use the actual app but with mocked Stellar service
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import esmock from 'esmock';
import prisma from '../../../src/config/prisma.js';

// Import Mocks
import { MockStellarService } from '../../mocks/StellarService.mock.js';

let app;
let request;

describe('Passkey Discover Login API Integration Tests', () => {
    let testInvestor;
    let testCompanyUser;
    let testCompany;

    before(async () => {
        // Load app with mocked Stellar service
        const appModule = await esmock('../../../src/app.js', {
            '../../../src/services/stellar.service.js': {
                StellarService: MockStellarService
            }
        });
        app = appModule.default;
        request = supertest(app);

        // Create test data directly
        testCompany = await prisma.company.create({
            data: {
                name: 'Test Company',
                cnpj: `00000000${Date.now().toString().slice(-6)}`,
                email: `company-${Date.now()}@test.com`,
                status: 'approved',
                legalRepresentative: 'Test Rep',
            }
        });

        testInvestor = await prisma.investor.create({
            data: {
                name: 'Test Investor',
                email: `investor-${Date.now()}@test.com`,
                document: '12345678901',
                kycStatus: 'approved',
                passkeyCredentialId: 'test-investor-credential-id',
                stellarContractId: 'CTEST123CONTRACT',
            }
        });

        testCompanyUser = await prisma.companyUser.create({
            data: {
                name: 'Test Company User',
                email: `companyuser-${Date.now()}@test.com`,
                role: 'admin',
                companyId: testCompany.id,
                passkeyCredentialId: 'test-company-credential-id',
                stellarContractId: 'CCOMPANY123CONTRACT',
            }
        });
    });

    after(async () => {
        // Cleanup test data
        if (testCompanyUser?.id) {
            await prisma.companyUser.delete({ where: { id: testCompanyUser.id } }).catch(() => { });
        }
        if (testInvestor?.id) {
            await prisma.investor.delete({ where: { id: testInvestor.id } }).catch(() => { });
        }
        if (testCompany?.id) {
            await prisma.company.delete({ where: { id: testCompany.id } }).catch(() => { });
        }
        await prisma.$disconnect();
    });

    describe('GET /api/auth/passkey-login/discover', () => {
        test('returns challenge for discoverable credential auth', async () => {
            const res = await request
                .get('/api/auth/passkey-login/discover')
                .expect(200);

            assert.strictEqual(res.body.success, true);
            assert.ok(res.body.challenge, 'Response should include challenge');
            assert.ok(res.body.rpId, 'Response should include rpId');
            assert.strictEqual(res.body.timeout, 60000);
            assert.strictEqual(res.body.userVerification, 'required');
        });

        test('challenge is valid base64 string', async () => {
            const res = await request
                .get('/api/auth/passkey-login/discover')
                .expect(200);

            const base64Regex = /^[A-Za-z0-9+/=]+$/;
            assert.ok(base64Regex.test(res.body.challenge));
        });
    });

    describe('POST /api/auth/passkey-login/discover', () => {
        test('returns 400 when credentialId is missing', async () => {
            const res = await request
                .post('/api/auth/passkey-login/discover')
                .send({})
                .expect(400);

            assert.strictEqual(res.body.success, false);
        });

        test('returns 401 when credentialId not found', async () => {
            const res = await request
                .post('/api/auth/passkey-login/discover')
                .send({ credentialId: 'non_existent_credential_id' })
                .expect(401);

            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.error, 'User not found');
        });

        test('returns token and user data when investor credentialId found', async () => {
            const res = await request
                .post('/api/auth/passkey-login/discover')
                .send({ credentialId: testInvestor.passkeyCredentialId })
                .expect(200);

            assert.strictEqual(res.body.success, true);
            assert.ok(res.body.data.token, 'Response should include JWT token');
            assert.ok(res.body.data.user, 'Response should include user data');
            assert.strictEqual(res.body.data.userType, 'investor');
            assert.strictEqual(res.body.data.user.id, testInvestor.id);
        });

        test('returns token and user data when company user credentialId found', async () => {
            const res = await request
                .post('/api/auth/passkey-login/discover')
                .send({ credentialId: testCompanyUser.passkeyCredentialId })
                .expect(200);

            assert.strictEqual(res.body.success, true);
            assert.ok(res.body.data.token, 'Response should include JWT token');
            assert.strictEqual(res.body.data.userType, 'company');
            assert.strictEqual(res.body.data.user.id, testCompanyUser.id);
        });

        test('investor response includes kycStatus', async () => {
            const res = await request
                .post('/api/auth/passkey-login/discover')
                .send({ credentialId: testInvestor.passkeyCredentialId })
                .expect(200);

            assert.ok(res.body.data.user.kycStatus !== undefined);
            assert.strictEqual(res.body.data.user.kycStatus, 'approved');
        });

        test('company user response includes role and companyId', async () => {
            const res = await request
                .post('/api/auth/passkey-login/discover')
                .send({ credentialId: testCompanyUser.passkeyCredentialId })
                .expect(200);

            assert.strictEqual(res.body.data.user.role, 'admin');
            assert.strictEqual(res.body.data.user.companyId, testCompany.id);
        });

        test('returned token is valid JWT format', async () => {
            const res = await request
                .post('/api/auth/passkey-login/discover')
                .send({ credentialId: testInvestor.passkeyCredentialId })
                .expect(200);

            // JWT has 3 parts separated by dots
            const parts = res.body.data.token.split('.');
            assert.strictEqual(parts.length, 3);
        });
    });
});
