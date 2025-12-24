
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../../src/app.js';
import prisma from '../../../src/config/prisma.js';
import { stellarServer } from '../../../src/config/stellar.js'; // Import the singleton
import { Keypair } from '@stellar/stellar-sdk';
import { generateToken } from '../../../src/middleware/auth.js';

describe('Wallet Controller Integration', () => {
    let adminToken;
    let adminId;
    const destinationDetail = Keypair.random();

    before(async () => {
        // Mock Stellar Server
        stellarServer.loadAccount = async (publicKey) => {
            return {
                id: publicKey,
                sequence: '123456',
                sequenceNumber: () => '123456',
                incrementSequenceNumber: () => { },
                accountId: () => publicKey,
                balances: [{ asset_type: 'native', balance: '100.00' }]
            };
        };

        stellarServer.submitTransaction = async () => {
            return {
                hash: 'mock_transaction_hash',
                ledger: 1000,
            };
        };

        // Setup Admin
        const admin = await prisma.platformAdmin.create({
            data: {
                name: 'Test Admin',
                email: `admin_${Date.now()}@test.com`,
                passwordHash: 'hash', // Mock hash
                role: 'super_admin'
            }
        });

        adminId = admin.id;
        // Middleware expects role='platform_admin' for generic admin access
        // The specific role (super_admin) is usually stored in adminRole if needed, but the base role claim must be platform_admin
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
            await prisma.platformAdmin.delete({ where: { id: adminId } });
        }
    });

    describe('GET /api/wallets', () => {
        it('should return wallet statuses', async () => {
            const res = await request(app)
                .get('/api/wallets')
                .set('Authorization', `Bearer ${adminToken}`);

            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body));
            assert.strictEqual(res.body.length, 3); // Treasury, Issuer, Distributor
            assert.ok(res.body[0].name);
            assert.ok(res.body[0].publicKey);
        });
    });

    describe('POST /api/wallets/transactions', () => {
        it('should create a transaction proposal', async () => {
            const res = await request(app)
                .post('/api/wallets/transactions')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    sourceWallet: 'treasury',
                    destination: destinationDetail.publicKey(), // Example address
                    amount: '10',
                    assetCode: 'XLM',
                    description: 'Test Transfer'
                });

            if (res.status !== 201) {
                console.error('Create Proposal Failed:', res.body);
            }
            assert.strictEqual(res.status, 201);
            assert.ok(res.body.id);
            assert.strictEqual(res.body.description, 'Test Transfer');
            assert.strictEqual(res.body.status, 'pending');
            assert.ok(res.body.xdr);
        });
    });

    describe('GET /api/wallets/transactions', () => {
        it('should list pending transactions', async () => {
            const res = await request(app)
                .get('/api/wallets/transactions?status=pending')
                .set('Authorization', `Bearer ${adminToken}`);

            assert.strictEqual(res.status, 200);
            assert.ok(res.body.rows);
            assert.ok(Array.isArray(res.body.rows));
            if (res.body.rows.length === 0) {
                console.log('List Transactions Response:', JSON.stringify(res.body, null, 2));
            }
            assert.ok(res.body.rows.length > 0);
        });
    });
});
