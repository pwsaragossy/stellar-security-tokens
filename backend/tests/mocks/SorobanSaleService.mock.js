/**
 * Mock SorobanSaleService for CI-safe integration tests.
 * Returns realistic response shapes without touching Soroban RPC.
 *
 * Params are prefixed with `_` to indicate they're kept for signature
 * compatibility with the real service but unused in the mock body.
 */
export class MockSorobanSaleService {

    // ─── Read-Only Queries ──────────────────────────────

    static async getOffer(_contractId) {
        return {
            admin: 'GADMIN1234567890123456789012345678901234567890123456789012',
            seller: 'GSELLER123456789012345678901234567890123456789012345678901',
            sell_token: 'CDUMMYSELLTOKEN1234567890123456789012345678901234567890123',
            buy_token: 'CDUMMYBUYTOKEN12345678901234567890123456789012345678901234',
            sell_price: 100n,
            buy_price: 100n,
            is_active: true,
            min_buy_amount: 10000000n,
            max_buy_per_buyer: 100000000000n,
            deadline_ledger: 999999999,
        };
    }

    static async getBalance(_contractId) {
        return 50000000000n; // 5000 tokens in stroops
    }

    static async getBuyerSpent(_contractId, _buyerAddress) {
        return 10000000n; // 1 USDC in stroops
    }

    static async isFrozen(_contractId, _buyerAddress) {
        return false;
    }

    static async getVersion(_contractId) {
        return 3;
    }

    static async contractExistsOnChain(_contractId) {
        return true;
    }

    // ─── XDR Builders (admin ops) ───────────────────────

    static async buildSetActiveXdr(_contractId, _active) {
        return { xdr: 'AAAAAgAAAABbYXNlNjRfbW9ja19zZXRfYWN0aXZlX3hkcg==' };
    }

    static async buildFreezeBuyerXdr(_contractId, _buyerAddress, _frozen) {
        return { xdr: 'AAAAAgAAAABiYXNlNjRfbW9ja19mcmVlemVfYnV5ZXJfeGRy' };
    }

    static async buildWithdrawXdr(_contractId, _tokenAddress, _amount) {
        return { xdr: 'AAAAAgAAAABiYXNlNjRfbW9ja193aXRoZHJhd194ZHI=====' };
    }

    static async buildEmergencyDrainXdr(_contractId) {
        return { xdr: 'AAAAAgAAAABiYXNlNjRfbW9ja19kcmFpbl94ZHI========' };
    }

    static async buildUpdatePriceXdr(_contractId, _sellPrice, _buyPrice) {
        return { xdr: 'AAAAAgAAAABiYXNlNjRfbW9ja191cGRhdGVfcHJpY2U====' };
    }

    static async buildProposeAdminXdr(_contractId, _newAdmin) {
        return { xdr: 'AAAAAgAAAABiYXNlNjRfbW9ja19wcm9wb3NlX2FkbWlu==' };
    }

    static async buildAcceptAdminXdr(_contractId) {
        return { xdr: 'AAAAAgAAAABiYXNlNjRfbW9ja19hY2NlcHRfYWRtaW4===' };
    }

    static async buildUpgradeXdr(_contractId, _newWasmHash) {
        return { xdr: 'AAAAAgAAAABiYXNlNjRfbW9ja191cGdyYWRlX3hkcg====' };
    }

    static async buildSacAuthorizeXdr(_sacContractId, _targetAddress, _authorize) {
        return { xdr: 'AAAAAgAAAABiYXNlNjRfbW9ja19zYWNfYXV0aG9yaXpl==' };
    }

    static async buildSacTransferXdr(_sacContractId, _from, _to, _amount) {
        return { xdr: 'AAAAAgAAAABiYXNlNjRfbW9ja19zYWNfdHJhbnNmZXI===' };
    }

    // ─── Deploy / Create (used during offer activation) ─

    static async buildDeployXdr(_issuerPublicKey, _wasmHash, _salt) {
        return { xdr: 'mock_deploy_xdr', contractId: 'CMOCKCONTRACT1234567890123456789012345678901234567890123' };
    }

    static async buildCreateSaleXdr(_contractId, _issuerPublicKey, params) {
        // Validate required params to catch missing fields in tests
        if (params.company === undefined) {
            throw new Error('[MockSorobanSaleService] Missing required param: company');
        }
        if (params.feeBps === undefined) {
            throw new Error('[MockSorobanSaleService] Missing required param: feeBps');
        }
        return { xdr: 'mock_create_sale_xdr' };
    }

    static async buildTradeXdr(_contractId, _buyerAddress, _usdcAmount) {
        return { xdr: 'mock_trade_xdr' };
    }
}
