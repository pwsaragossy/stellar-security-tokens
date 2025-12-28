import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import prisma from '../../../src/config/prisma.js';
import { setupTestDatabase, cleanDatabase } from '../../helpers/testDatabase.js';
import { createStellarMock } from '../../helpers/stellarMock.js';
import { stellarServer } from '../../../src/config/stellar.js';
import { getPaymentMonitor } from '../../../src/services/PaymentMonitor.service.js';
import { createTestAdmin } from '../../helpers/authHelper.js';
import { StellarService } from '../../../src/services/stellar.service.js';

describe('Investment Lifecycle Flow', () => {
    let investor;
    let token;
    let offer;
    let paymentMonitor;
    let originalPayments;
    let originalSubmitTransaction;
    let originalLoadAccount;
    let originalDistributeTokens;
    let mockStreamCallback;

    before(async () => {
        await setupTestDatabase();

        // Setup initial data
        const admin = await createTestAdmin();

        // Create Investor (must be approved) with passkey fields
        investor = await prisma.investor.create({
            data: {
                name: 'Investment Tester',
                email: `investor.${Date.now()}@example.com`,
                document: '99988877766',
                stellarContractId: 'CTEST' + 'CONTRACT1234567890123456789012345678901234567890123'.substring(0, 51),
                passkeyCredentialId: `mock-credential-${Date.now()}`,
                passkeyPublicKey: Buffer.from('mock-passkey-public-key-for-testing'),
                kycStatus: 'approved',
                emailVerified: true,
            }
        });

        // Create Company
        const company = await prisma.company.create({
            data: {
                name: 'Test Issuer Corp',
                cnpj: '12.345.678/0001-99',
                email: `company.${Date.now()}@example.com`,
                legalRepresentative: 'John CEO',
                status: 'approved',
                stellarPublicKey: 'G_COMPANY_KEY'
            }
        });

        // Create Company User
        const companyUser = await prisma.companyUser.create({
            data: {
                companyId: company.id,
                name: 'Company Admin',
                email: `admin.${Date.now()}@company.com`,
                passwordHash: 'hash',
                role: 'admin'
            }
        });

        const uniqueAssetCode = `TEST${Date.now().toString().slice(-8)}`;

        // Create Token
        token = await prisma.token.create({
            data: {
                assetCode: uniqueAssetCode,
                issuerPublicKey: 'G_ISSUER_KEY',
                totalSupply: 1000000,
                description: 'Test Security Token',
                annualInterestRate: 10.5
            }
        });

        // Create Offer
        offer = await prisma.offer.create({
            data: {
                companyId: company.id,
                requestedBy: companyUser.id,
                assetCode: uniqueAssetCode,
                offerName: 'Test Offer',
                description: 'Test Description',
                totalSupply: 1000000,
                offerType: 'sale',
                offerRules: {
                    price: 1.0,
                    availableQuantity: 1000,
                    minInvestment: 100,
                    maxInvestment: 1000,
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 86400000),
                },
                status: 'active',
                paymentType: 'monthly',
                paymentFrequency: 1
            }
        });

        // Setup Stellar Mock
        const stellarMock = createStellarMock();

        // Save original methods
        originalPayments = stellarServer.payments;
        originalSubmitTransaction = stellarServer.submitTransaction;
        originalLoadAccount = stellarServer.loadAccount;
        originalDistributeTokens = StellarService.distributeTokens;

        // Monkey-patch stellarServer
        // We need to capture the callback to trigger it manually
        global.mockStreamCallback = null;

        stellarServer.payments = stellarMock.mockPayments;
        stellarServer.submitTransaction = stellarMock.mockSubmitTransaction;
        stellarServer.loadAccount = stellarMock.mockLoadAccount;

        // Mock StellarService.distributeTokens for smart wallet support
        StellarService.distributeTokens = async (destination, amount, assetCode, options) => {
            // Mock successful distribution to smart wallet
            return {
                transactionHash: 'mock_distribution_tx_' + Date.now(),
                ledger: 12345,
                successful: true,
            };
        };

        // Start PaymentMonitor
        paymentMonitor = getPaymentMonitor();
        // We pass a dummy treasury key so it doesn't try to read from env if missing
        await paymentMonitor.start('G_TREASURY_KEY');
    });

    after(async () => {
        if (paymentMonitor) {
            paymentMonitor.stop();
        }

        // Restore original methods
        stellarServer.payments = originalPayments;
        stellarServer.submitTransaction = originalSubmitTransaction;
        stellarServer.loadAccount = originalLoadAccount;
        StellarService.distributeTokens = originalDistributeTokens;

        await cleanDatabase();
        await prisma.$disconnect();
    });

    it('should detect USDC payment and distribute tokens', async () => {
        // 1. Create a pending Investment
        const investmentAmount = 500;
        const price = 1; // 1 USDC per token
        const tokenAmount = investmentAmount / price;

        const investment = await prisma.investment.create({
            data: {
                investorId: investor.id,
                offerId: offer.id,
                assetCode: token.assetCode,
                usdcAmount: investmentAmount,
                tokenAmount: tokenAmount,
                status: 'pending_payment',
                memo: `INV-${Date.now()}`
            }
        });

        // 2. Simulate USDC payment stream event
        const paymentHash = 'tx_hash_123456789';
        const mockPayment = {
            type: 'payment',
            asset_code: 'USDC',
            asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', // Default USDC issuer
            from: investor.stellarContractId,  // Smart wallet address
            to: 'G_TREASURY_KEY', // Must match the treasury key we started monitoring with
            amount: investment.usdcAmount.toString(),
            transaction_hash: paymentHash,
        };

        // Trigger the callback
        await global.mockStreamCallback(mockPayment);

        // 3. Wait for processing (PaymentMonitor is async)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 4. Verify Investment status updated
        const updatedInvestment = await prisma.investment.findUnique({
            where: { id: investment.id }
        });

        assert.strictEqual(updatedInvestment.status, 'distributed',
            `Investment status should be 'distributed' but is '${updatedInvestment.status}'. Error: ${updatedInvestment.error_message}`);
        assert.strictEqual(updatedInvestment.usdcPaymentHash, paymentHash);
        assert.ok(updatedInvestment.distributionTxHash, 'Should have a distribution tx hash');

        // 5. Verify TokenDistribution created
        const distribution = await prisma.tokenDistribution.findFirst({
            where: {
                investorId: investor.id,
                offerId: offer.id
            }
        });

        assert.ok(distribution, 'TokenDistribution record should be created');
        assert.strictEqual(parseFloat(distribution.amount), investmentAmount);
        assert.strictEqual(distribution.usdcPaymentHash, paymentHash);
    });
});
