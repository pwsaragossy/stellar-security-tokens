import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import esmock from 'esmock';
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/testDatabase.js';

let app;
let request;

describe('KYC Lifecycle Flow', () => {
    before(async () => {
        // Use esmock to mock PasskeyWalletService.deploySmartWallet
        // (the old test referenced PasskeyWalletService.getServer which no longer exists)
        const appModule = await esmock('../../../src/app.js', {
            '../../../src/services/passkeyWallet.service.js': {
                PasskeyWalletService: {
                    deploySmartWallet: async (_credId, _pubKey) => ({
                        success: true,
                        contractId: 'C' + 'MOCK_CONTRACT_ID_KYC_' + Date.now().toString().padEnd(30, '0').substring(0, 30),
                        transactionHash: 'mock_tx_hash_kyc',
                    }),
                    getClientConfig: () => ({
                        rpcUrl: 'https://soroban-testnet.stellar.org',
                        networkPassphrase: 'Test SDF Network ; September 2015',
                        accountWasmHash: 'mock_wasm_hash',
                        webauthnVerifierAddress: 'mock_verifier',
                    }),
                    getRpcServer: () => ({
                        getContractData: async () => ({ val: 'mock' }),
                    }),
                }
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

    test('Full Registration Flow: Register -> Verify Email -> Check Status', async () => {

        const uniqueEmail = `kyc-test-${Date.now()}@example.com`;
        const uniqueDocument = `DOC-${Date.now()}`;
        const credentialId = Buffer.from(`cred-${Date.now()}`).toString('base64url');
        const publicKey = Buffer.from(`pub-${Date.now()}`).toString('base64url');
        const contractId = 'C' + 'MOCK_CONTRACT_ID_KYC_' + Date.now().toString().padEnd(30, '0').substring(0, 30);

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
                name: 'KYC Tester',
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
