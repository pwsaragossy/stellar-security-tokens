/**
 * Mock da StellarService para testes de integração
 * Evita chamadas reais à rede Stellar durante CI/CD
 */
export class MockStellarService {
    static async createIssuerAccount() {
        return {
            success: true,
            publicKey: 'GBISSUERMOCK123456789012345678901234567890123456789012',
            secretKey: 'SBISSUERMOCKSECRET12345678901234567890123456789012345',
            transactionHash: 'mock_tx_hash_issuer_creation',
            ledger: 100,
            flags: {
                authRequired: true,
                authRevocable: true,
                authClawbackEnabled: true,
            },
        };
    }

    static async createDistributionAccount() {
        return {
            success: true,
            publicKey: 'GBDISTRIBMOCK123456789012345678901234567890123456789012',
            secretKey: 'SBDISTRIBMOCKSECRET12345678901234567890123456789012345',
        };
    }

    static async createInvestorAccount() {
        return {
            success: true,
            publicKey: 'GBINVESTORMOCK12345678901234567890123456789012345678901',
            secretKey: 'SBINVESTORMOCKSECRET1234567890123456789012345678901234',
        };
    }

    static async issueSecurityToken(code, amount, options = {}) {
        return {
            success: true,
            assetCode: code,
            issuerPublicKey: 'GBISSUERMOCK123456789012345678901234567890123456789012',
            distributorPublicKey: 'GBDISTRIBMOCK123456789012345678901234567890123456789012',
            amount: amount.toString(),
            transactionHash: 'mock_tx_hash_issuance',
            ledger: 101,
            homeDomain: options.homeDomain,
        };
    }

    static async distributeTokens(investorPublicKey, amount, assetCode, options = {}) {
        return {
            success: true,
            assetCode,
            investorPublicKey,
            amount: amount.toString(),
            transactionHash: 'mock_tx_hash_distribution',
            ledger: 102,
        };
    }

    static async freezeAccount(investorPublicKey, assetCode) {
        return {
            success: true,
            investorPublicKey,
            assetCode,
            transactionHash: 'mock_tx_hash_freeze',
            ledger: 103,
            message: 'Account frozen successfully (trustline authorization revoked)',
        };
    }

    static async clawbackTokens(investorPublicKey, amount, assetCode) {
        return {
            success: true,
            investorPublicKey,
            assetCode,
            amount: amount.toString(),
            transactionHash: 'mock_tx_hash_clawback',
            ledger: 104,
            message: 'Tokens clawed back successfully',
        };
    }

    static async getTokenBalance(assetCode, publicKey) {
        return {
            assetCode,
            publicKey,
            balance: '1000.00', // Mock balance
            assetType: 'credit_alphanum12',
            isAuthorized: true,
            isAuthorizedToMaintainLiabilities: true,
        };
    }

    static async getAccountInfo(publicKey) {
        return {
            publicKey,
            accountId: publicKey,
            balances: [
                { asset_type: 'native', balance: '100.00' }
            ],
            sequenceNumber: '123456789',
            flags: {
                authRequired: false,
                authRevocable: false,
                authImmutable: false,
                authClawbackEnabled: false,
            },
        };
    }

    static async verifyUSDCPayment(investorPublicKey, expectedAmount, treasuryPublicKey = null, windowMinutes = 2) {
        return {
            transactionHash: 'mock_usdc_payment_hash',
            amount: expectedAmount.toString(),
            createdAt: new Date().toISOString(),
            ledger: 105,
        };
    }
}
