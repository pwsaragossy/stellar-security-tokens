import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../../src/app.js';
import prisma from '../../../src/config/prisma.js';
import { setupTestDatabase, seedTestData, cleanDatabase } from '../../helpers/testDatabase.js';
import { getAdminToken } from '../../helpers/authHelper.js';
import { StellarService } from '../../../src/services/stellar.service.js';

describe('Compliance Alignment Integration Tests', () => {
    let platformAdminToken;
    let investor;

    before(async () => {
        await setupTestDatabase();
    });

    after(async () => {
        await cleanDatabase();
    });

    beforeEach(async () => {
        const data = await seedTestData();
        investor = data.investor;
        platformAdminToken = getAdminToken(data.admin);

        // Ensure investor has a stellarContractId and status is pending
        investor = await prisma.investor.update({
            where: { id: investor.id },
            data: { kycStatus: 'pending' }
        });
    });

    test('PUT /api/platform-admins/investors/:id/approve - should trigger automated whitelisting', async () => {
        // Mock StellarService.authorizeAllUserTrustlines
        const originalAuthorize = StellarService.authorizeAllUserTrustlines;
        let authorizedCalled = false;
        StellarService.authorizeAllUserTrustlines = async (contractId) => {
            authorizedCalled = true;
            assert.strictEqual(contractId, investor.stellarContractId);
            return { success: true, authorizedCount: 1 };
        };

        try {
            const res = await request(app)
                .put(`/api/platform-admins/investors/${investor.id}/approve`)
                .set('Authorization', `Bearer ${platformAdminToken}`);

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(authorizedCalled, true, 'StellarService.authorizeAllUserTrustlines should have been called');
        } finally {
            StellarService.authorizeAllUserTrustlines = originalAuthorize;
        }
    });

    test('GET /.well-known/stellar.toml - should return valid SEP-1 TOML', async () => {
        const res = await request(app)
            .get('/.well-known/stellar.toml');

        assert.strictEqual(res.status, 200);
        assert.ok(res.text.includes('VERSION="2.0.0"'));
        assert.ok(res.text.includes('ACCOUNTS=['));
        // Note: CURRENCIES might be empty if no tokens exist in test DB, 
        // but seedTestData creates 'TEST01'
        assert.ok(res.text.includes('[[CURRENCIES]]'));
        assert.ok(res.text.includes('code="TEST01"'));
    });
});
