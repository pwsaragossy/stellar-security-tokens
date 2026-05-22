/**
 * Mock da StellarService para testes de integração
 * Evita chamadas reais à rede Stellar durante CI/CD
 *
 * Params com prefix `_` são mantidos por compatibilidade de assinatura
 * com o serviço real, mas não são usados no corpo do mock.
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

    static async distributeTokens(investorPublicKey, amount, assetCode, _options = {}) {
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

    static async verifyUSDCPayment(investorPublicKey, expectedAmount, _treasuryPublicKey = null, _windowMinutes = 2) {
        return {
            transactionHash: 'mock_usdc_payment_hash',
            amount: expectedAmount.toString(),
            createdAt: new Date().toISOString(),
            ledger: 105,
        };
    }

    static async unfreezeAccount(investorPublicKey, assetCode) {
        return {
            success: true,
            investorPublicKey,
            assetCode,
            transactionHash: 'mock_tx_hash_unfreeze',
            ledger: 106,
            message: 'Account unfrozen successfully (trustline authorization restored)',
        };
    }

    static async extendContractTTL(contractId) {
        return {
            success: true,
            contractId,
            newTtl: 535680,
            transactionHash: 'mock_tx_hash_ttl_extend',
            ledger: 107,
        };
    }

    static async disableClawbackForTrustline(investorPublicKey, assetCode) {
        return {
            success: true,
            investorPublicKey,
            assetCode,
            transactionHash: 'mock_tx_hash_disable_clawback',
            ledger: 108,
        };
    }

    static buildDisableClawbackOp(_investorPublicKey, _assetCode) {
        return {}; // Returns an Operation object placeholder
    }

    static async listAssetHolders(_assetCode) {
        return [
            {
                publicKey: 'GHOLDER1234567890123456789012345678901234567890123456789012',
                balance: '500.0000000',
                isAuthorized: true,
                isClawbackEnabled: true,
            },
        ];
    }

    static async listAccountAssets(_publicKey) {
        return [
            { assetCode: 'TEST01', assetIssuer: 'GBISSUERMOCK123456789012345678901234567890123456789012', balance: '1000.0000000' },
        ];
    }

    static async simulateSorobanTransaction(_transaction) {
        return { success: true, results: [] };
    }

    static async prepareSorobanTransaction(transaction) {
        return transaction;
    }
}
