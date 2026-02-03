import api from './client';

export interface WalletStatus {
    name: string;
    publicKey: string;
    balances: Array<{
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        balance: string;
    }>;
    exists: boolean;
    error?: string;
}

export interface MultiSigTransaction {
    id: number;
    xdr: string;
    description: string;
    status: 'pending' | 'executed' | 'rejected' | 'failed';
    initiator_id: number;
    signatures: any[];
    network: string;
    threshold_met: boolean;
    hash?: string;
    error_message?: string;
    createdAt: string;
}

export const walletsApi = {
    getWalletStatuses: async () => {
        const response = await api.get<WalletStatus[]>('/wallets');
        return response;
    },

    getTransactionProposals: async (status?: string) => {
        const response = await api.get<MultiSigTransaction[]>('/wallets/transactions', {
            params: { status }
        });
        return response;
    },

    createTransactionProposal: async (data: {
        sourceWallet: string;
        destination: string;
        amount: string;
        assetCode?: string;
        memo?: string;
        description: string;
    }) => {
        const response = await api.post('/wallets/transactions', data);
        return response;
    },

    submitTransaction: async (id: number, signedXDR: string) => {
        const response = await api.post(`/wallets/transactions/${id}/submit`, { signedXDR });
        return response;
    }
};
