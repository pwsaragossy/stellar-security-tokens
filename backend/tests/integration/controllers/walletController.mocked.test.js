/**
 * Mocked version of Wallet Controller Integration test
 * Uses esmock to replace Stellar server AND StellarService calls for CI stability
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import esmock from 'esmock';
import prisma from '../../../src/config/prisma.js';
import { Keypair } from '@stellar/stellar-sdk';
import { generateToken } from '../../../src/middleware/auth.js';

// Mock account object that satisfies TransactionBuilder requirements
const createMockAccount = (publicKey) => ({
    id: publicKey,
    accountId: () => publicKey,
    sequenceNumber: () => '123456',
    incrementSequenceNumber: () => {},
    sequence: '123456',
    balances: [{ asset_type: 'native', balance: '100.00' }],
});

// Mock Stellar Server
const mockStellarServer = {
    loadAccount: async (publicKey) => createMockAccount(publicKey),
    submitTransaction: async () => ({
        hash: 'mock_transaction_hash_mocked',
        ledger: 1000,
    })
};

describe('Wallet Controller Integration (Mocked)', () => {
    let app;
    let adminToken;
    let adminId;
    const destinationDetail = Keypair.random();

    before(async () => {
        // Load app with mocked stellar server AND StellarService.getAccountRPC
        const appModule = await esmock('../../../src/app.js', {}, {
            '../../../src/config/stellar.js': {
                stellarServer: mockStellarServer,
                createFreshServer: () => mockStellarServer,
                getNetworkPassphrase: () => 'Test SDF Network ; September 2015',
                getUsdcIssuer: () => 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            },
            '../../../src/services/stellar.service.js': {
                StellarService: {
                    getAccountRPC: async (publicKey) => createMockAccount(publicKey),
                }
            },
        });
        app = appModule.default;

        // Setup Admin
        const admin = await prisma.platformAdmin.create({
            data: {
                name: 'Test Admin Mocked',
                email: `admin_mocked_${Date.now()}@test.com`,
                passwordHash: 'hash',
                role: 'super_admin'
            }
        });

        adminId = admin.id;
        adminToken = generateToken({
            id: admin.id,
            userId: admin.id,
            email: admin.email,
            role: 'platform_admin',
            adminRole: admin.role
        });
    });

    after(async () => {
        await prisma.multiSigTransaction.deleteMany({});
        if (adminId) {
            try {
                await prisma.platformAdmin.delete({ where: { id: adminId } });
            } catch {
                // Record may have been cleaned by another test
            }
        }
    });

    describe('GET /api/wallets', () => {
        it('should return wallet statuses (mocked)', async () => {
            const res = await request(app)
                .get('/api/wallets')
                .set('Authorization', `Bearer ${adminToken}`);

            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body));
            assert.strictEqual(res.body.length, 4); // Treasury, Issuer, Distributor, Operations
            assert.ok(res.body[0].name);
            assert.ok(res.body[0].publicKey);
        });
    });

    describe('POST /api/wallets/transactions', () => {
        it('should create a transaction proposal (mocked)', async () => {
            const res = await request(app)
                .post('/api/wallets/transactions')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    sourceWallet: 'treasury',
                    destination: destinationDetail.publicKey(),
                    amount: '10',
                    assetCode: 'XLM',
                    description: 'Test Transfer Mocked'
                });

            if (res.status !== 201) {
                console.error('Create Proposal Failed (Mocked):', res.body);
            }
            assert.strictEqual(res.status, 201);
            assert.ok(res.body.id);
            assert.strictEqual(res.body.description, 'Test Transfer Mocked');
            assert.strictEqual(res.body.status, 'pending');
            assert.ok(res.body.xdr);
        });
    });

    describe('GET /api/wallets/transactions', () => {
        it('should list pending transactions (mocked)', async () => {
            const res = await request(app)
                .get('/api/wallets/transactions?status=pending')
                .set('Authorization', `Bearer ${adminToken}`);

            assert.strictEqual(res.status, 200);
            assert.ok(res.body.rows);
            assert.ok(Array.isArray(res.body.rows));
            if (res.body.rows.length === 0) {
                console.log('List Transactions Response (Mocked):', JSON.stringify(res.body, null, 2));
            }
            assert.ok(res.body.rows.length > 0);
        });
    });
});
