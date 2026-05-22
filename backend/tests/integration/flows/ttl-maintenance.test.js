import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import prisma from '../../../src/config/prisma.js';
import { setupTestDatabase, cleanDatabase } from '../../helpers/testDatabase.js';
import { StellarService } from '../../../src/services/stellar.service.js';
import { MaintenanceService } from '../../../src/services/maintenance.service.js';

describe('TTL Maintenance Flow', () => {
    let originalGetContractTTL;
    let originalExtendContractTTL;
    let extendCalledCount = 0;
    let extendedIds = [];

    before(async () => {
        await setupTestDatabase();

        // 1. Setup Data
        await prisma.token.create({
            data: {
                assetCode: 'TTLTOKEN',
                issuerPublicKey: 'G_ISSUER',
                totalSupply: 1000,
                description: 'TTL Test Token',
                sacContractId: 'C_SAC_CONTRACT_123'
            }
        });

        await prisma.investor.create({
            data: {
                name: 'TTL Investor',
                email: 'ttlinvestor@test.com',
                document: '11122233344',
                stellarContractId: 'C_WALLET_CONTRACT_456',
                kycStatus: 'approved',
                emailVerified: true,
                passkeyCredentialId: 'cred123'
            }
        });

        // 2. Monkey-patch StellarService
        originalGetContractTTL = StellarService.getContractTTL;
        originalExtendContractTTL = StellarService.extendContractTTL;

        StellarService.getContractTTL = async (id) => {
            // Simulate low TTL for the token, high TTL for the wallet
            if (id === 'C_SAC_CONTRACT_123') {
                return { exists: true, ttlRemaining: 1000 }; // Below threshold (50000)
            }
            return { exists: true, ttlRemaining: 200000 }; // Above threshold
        };

        StellarService.extendContractTTL = async (id, _ledgers) => {
            extendCalledCount++;
            extendedIds.push(id);
            return { success: true, hash: 'mock-hash' };
        };
    });

    after(async () => {
        // Restore
        StellarService.getContractTTL = originalGetContractTTL;
        StellarService.extendContractTTL = originalExtendContractTTL;

        await cleanDatabase();
        await prisma.$disconnect();
    });

    test('MaintenanceService extends ONLY contracts below threshold', async () => {
        console.log("--- Starting TTL Maintenance Test ---");

        extendCalledCount = 0;
        extendedIds = [];

        await MaintenanceService.checkAndExtendAllTTLs();

        console.log("Checking Assertions...");
        assert.strictEqual(extendCalledCount, 1, 'Should have called extend exactly once');
        assert.strictEqual(extendedIds[0], 'C_SAC_CONTRACT_123', 'Should have extended the token SAC');

        const isWalletExtended = extendedIds.includes('C_WALLET_CONTRACT_456');
        assert.strictEqual(isWalletExtended, false, 'Should NOT have extended the wallet (TTL was high)');

        console.log("--- TTL Maintenance Test PASSED ---");
    });
});
