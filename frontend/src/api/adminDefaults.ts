/**
 * Admin Defaults API Client
 * Frontend API calls for admin default management
 */
import api from './client';

export interface DefaultDistribution {
    investorId: number;
    investorName: string;
    investorEmail: string;
    investorWallet: string;
    investedAmount: number;
    proportion: number;
    collateralShare: number;
    tokenAmount: number;
}

export interface DefaultedOffer {
    offerId: number;
    assetCode: string;
    offerName: string;
    companyId: number;
    companyName: string;
    defaultedAt: string;
    totalInvested: number;
    investorCount: number;
    collateralType: string;
    collateralDescription: string;
    collateralValue: number;
    distributions: DefaultDistribution[];
}

export interface DefaultStats {
    pendingDefaults: number;
    resolvedDefaults: number;
    totalPendingPenalties: number;
}

export interface PreparedDistribution {
    transactionXDR: string;
    offerId: number;
    assetCode: string;
    offerName: string;
    investorCount: number;
    totalTokens: number;
    distributions: DefaultDistribution[];
    expiresAt: string;
}

export const adminDefaultsApi = {
    /**
     * Get all defaulted offers awaiting admin action
     */
    getDefaultedOffers: async (): Promise<{ success: boolean; data: { defaults: DefaultedOffer[]; stats: DefaultStats } }> => {
        const response = await api.get('/platform-admins/defaults');
        return response.data;
    },

    /**
     * Get details of a specific defaulted offer
     */
    getDefaultDetails: async (offerId: number): Promise<{ success: boolean; data: DefaultedOffer }> => {
        const response = await api.get(`/platform-admins/defaults/${offerId}`);
        return response.data;
    },

    /**
     * Prepare collateral distribution transaction
     */
    prepareDistribution: async (offerId: number): Promise<{ success: boolean; data: PreparedDistribution; message: string }> => {
        const response = await api.post(`/platform-admins/defaults/${offerId}/prepare`);
        return response.data;
    },

    /**
     * Submit signed distribution transaction
     */
    distributeCollateral: async (offerId: number, signedXDR: string): Promise<{ success: boolean; data: { transactionHash: string; investorCount: number }; message: string }> => {
        const response = await api.post(`/platform-admins/defaults/${offerId}/distribute`, { signedXDR });
        return response.data;
    },
};

export default adminDefaultsApi;
