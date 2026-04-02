/**
 * Mocked version of KYC Lifecycle Flow test
 * Uses mocked PasskeyWalletService for CI stability
 */
import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import esmock from 'esmock';
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/testDatabase.js';

// Mock PasskeyWalletService
const MockPasskeyWalletService = {
    getServer: () => ({
        createWallet: async (credId, pubKey) => ({
            contractId: 'C' + 'MOCK_CONTRACT_ID_KYC_MOCKED_' + Date.now().toString().padEnd(25, '0').substring(0, 25)
        })
    })
};

let app;
let request;

describe('KYC Lifecycle Flow (Mocked)', () => {
    before(async () => {
        // Load app with mocked services
        // 2nd arg: direct mocks (passkeyWallet)
        // 3rd arg: deep mocks — applied recursively through all imports
        //   - @stellar/stellar-sdk/rpc: prevents real RPC calls for on-chain contract verification
        const appModule = await esmock('../../../src/app.js', {
            '../../../src/services/passkeyWallet.service.js': {
                PasskeyWalletService: MockPasskeyWalletService
            }
        }, {
            '@stellar/stellar-sdk/rpc': {
                Server: class MockRpcServer {
                    constructor() {}
                    getContractData() { return Promise.resolve({ val: 'mock-contract-data' }); }
                }
            }
        });
        app = appModule.default;
        request = supertest(app);

        await setupTestDatabase();
    });

    after(async () => {
        await teardownTestDatabase();
    });

    test('Full Registration Flow (Mocked): Register -> Verify Email -> Check Status', async () => {
        const uniqueEmail = `kyc-mocked-test-${Date.now()}@example.com`;
        const uniqueDocument = `DOC-MOCKED-${Date.now()}`;
        const credentialId = Buffer.from(`cred-mocked-${Date.now()}`).toString('base64url');
        const publicKey = Buffer.from(`pub-mocked-${Date.now()}`).toString('base64url');
        const contractId = 'C' + 'MOCK_CONTRACT_ID_KYC_MOCKED_' + Date.now().toString().padEnd(25, '0').substring(0, 25);

        // 0. Manual verification token generation (bypassing Redis in test)
        const jwt = (await import('jsonwebtoken')).default;
        const registrationToken = jwt.sign(
            { email: uniqueEmail.toLowerCase(), purpose: 'registration', verified: true },
            process.env.JWT_SECRET || 'stellar-tokens-secret',
            { expiresIn: '30m' }
        );

        // 1. Register
        const registerRes = await request
            .post('/api/investors/register')
            .send({
                name: 'KYC Tester Mocked',
                email: uniqueEmail,
                document: uniqueDocument,
                registrationToken: registrationToken,
                credentialId: credentialId,
                publicKey: publicKey,
                contractId: contractId
            })
            .expect(201);

        assert.strictEqual(registerRes.body.success, true);
        assert.ok(registerRes.body.data.token);

        // Verify user exists in specific state
        const investorId = registerRes.body.data.investor.id;
        assert.ok(investorId);
        // On testnet, KYC is auto-approved; on mainnet, it starts as 'pending'
        assert.ok(
            ['pending', 'approved'].includes(registerRes.body.data.investor.kycStatus),
            `Expected kycStatus to be 'pending' or 'approved', got '${registerRes.body.data.investor.kycStatus}'`
        );
        assert.strictEqual(registerRes.body.data.investor.emailVerified, true);
    });
});
