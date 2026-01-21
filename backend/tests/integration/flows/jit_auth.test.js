
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { distributeTokens } from '../../../src/controllers/tokenController.js';
import { StellarService } from '../../../src/services/stellar.service.js';
import { Token } from '../../../src/models/Token.js';
import { Investor } from '../../../src/models/Investor.js';
import prisma from '../../../src/config/prisma.js';

describe('JIT Authorization Flow', () => {
    let originalAuthorize;
    let originalDistribute;
    let authCalled = false;
    let authArgs = {};

    before(async () => {
        // 1. Monkey-patch StellarService
        originalAuthorize = StellarService.authorizeInvestor;
        originalDistribute = StellarService.distributeTokens;

        StellarService.authorizeInvestor = async (wallet, asset) => {
            console.log(`[MOCK] authorizeInvestor called for ${wallet}, ${asset}`);
            authCalled = true;
            authArgs = { wallet, asset };
            return { success: true };
        };

        StellarService.distributeTokens = async (wallet, amount, asset) => {
            console.log(`[MOCK] distributeTokens called`);
            return { transactionHash: 'mock-tx-hash', ledger: 12345 };
        };

        // 2. Setup Data
        // Ensure we have a token and investor
        await prisma.token.upsert({
            where: { assetCode: 'JITTEST' },
            create: {
                assetCode: 'JITTEST',
                issuerPublicKey: 'MX_ISSUER',
                totalSupply: 1000,
                description: 'JIT Test'
            },
            update: {}
        });

        const uniqueDoc = `DOC_${Date.now()}`;
        try {
            await prisma.$executeRaw`
                INSERT INTO investors (
                    name, email, document, kyc_status, stellar_contract_id, created_at, updated_at
                ) VALUES (
                    'JIT Tester', 'jittester@test.com', ${uniqueDoc}, 'approved'::"KYCStatus", 'C_SMART_WALLET_123', NOW(), NOW()
                )
                ON CONFLICT (email) DO UPDATE SET
                    kyc_status = 'approved'::"KYCStatus",
                    stellar_contract_id = 'C_SMART_WALLET_123';
            `;
        } catch (e) {
            console.error("Setup Error (Investor):", e);
            throw e;
        }
    });

    after(async () => {
        // Restore
        StellarService.authorizeInvestor = originalAuthorize;
        StellarService.distributeTokens = originalDistribute;

        // Clean up
        const token = await prisma.token.findUnique({ where: { assetCode: 'JITTEST' } });
        if (token) await prisma.token.delete({ where: { id: token.id } });

        const investor = await prisma.investor.findUnique({ where: { email: 'jittester@test.com' } });
        if (investor) await prisma.investor.delete({ where: { id: investor.id } });

        await prisma.$disconnect();
    });

    test('distributeTokens triggers authorizeInvestor for Smart Wallet', async () => {
        console.log("--- Starting JIT Test ---");
        const token = await prisma.token.findUnique({ where: { assetCode: 'JITTEST' } });
        const investor = await prisma.investor.findUnique({ where: { email: 'jittester@test.com' } });

        console.log("Using Investor ID:", investor.id);

        const req = {
            body: {
                investorId: investor.id,
                assetCode: 'JITTEST',
                amount: '10'
            },
            user: { userId: 1 }
        };

        const res = {
            status: (code) => {
                return {
                    json: (data) => {
                        if (code !== 201) {
                            console.error("Response Error:", data, code);
                        }
                        assert.strictEqual(code, 201);
                        assert.strictEqual(data.success, true);
                    }
                }
            }
        };
        const next = (err) => {
            console.error("Controller Error:", err);
            throw err;
        };

        authCalled = false;
        await distributeTokens(req, res, next);

        console.log("Checking Assertions...");
        assert.strictEqual(authCalled, true, 'StellarService.authorizeInvestor should have been called');
        assert.strictEqual(authArgs.wallet, 'C_SMART_WALLET_123', 'Should authorize the contract ID');
        assert.strictEqual(authArgs.asset, 'JITTEST');
        console.log("--- JIT Test PASSED ---");
    });
});
