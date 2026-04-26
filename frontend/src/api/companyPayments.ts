/**
 * Company Payments API Client
 * Frontend API calls for company-initiated investor payments
 */
import api from './client';

export interface PaymentBreakdown {
    investorId: number;
    investorName: string;
    investorWallet: string;
    investedAmount: number;
    interestOwed: number;
}

export interface PaymentDetails {
    offerId: number;
    assetCode: string;
    offerName: string;
    totalInvested: number;
    totalOwed: number;
    investorCount: number;
    paymentType: string;
    annualInterestRate: number;
    investorRate?: number;
    periodRate: number;
    nextPaymentDue: string | null;
    lastPaymentDate: string | null;
    paymentDueStatus: string;
    balanceSource?: 'database' | 'on_chain';
    breakdown: PaymentBreakdown[];
}

export interface BulletPaymentDetails {
    offerId: number;
    assetCode: string;
    offerName: string;
    maturityDate: string;
    daysUntilMaturity: number;
    totalPrincipal: number;
    totalInterest: number;
    companyTotalInterest?: number;
    totalPayout: number;
    investorCount: number;
    balanceSource?: 'database' | 'on_chain';
    breakdown: {
        investorId: number;
        investorName: string;
        investorWallet: string;
        principal: number;
        interest: number;
        totalPayout: number;
    }[];
}

export interface PreparedTransaction {
    transactionXDR: string;
    /** All batch XDRs for multi-batch signing (YieldDistributor) */
    batchXDRs?: string[];
    batchCount?: number;
    offerId: number;
    totalAmount: number;
    platformFee?: number;
    netToInvestors?: number;
    investorCount: number;
    breakdown: PaymentBreakdown[];
    expiresAt: string;
}

export interface SubmitResult {
    success: boolean;
    status: 'completed';
    transactionHash?: string;
    investorsPaid?: number;
    totalPaid?: number;
    // Multi-batch partial failure fields
    partial?: boolean;
    completedBatches?: number;
    failedBatches?: number;
}

export interface CompanyPenalty {
    id: number;
    companyId: number;
    offerId: number;
    penaltyType: string;
    description: string;
    amount: number | null;
    daysLate: number | null;
    status: string;
    createdAt: string;
}

export const companyPaymentsApi = {
    /**
     * Get all upcoming payments for the company
     */
    getUpcomingPayments: async (): Promise<{ success: boolean; data: (PaymentDetails | BulletPaymentDetails)[] }> => {
        const response = await api.get('/company/payments');
        return response.data;
    },

    /**
     * Get payment details for a specific offer
     */
    getPaymentDetails: async (offerId: number): Promise<{ success: boolean; data: PaymentDetails | BulletPaymentDetails }> => {
        const response = await api.get(`/company/payments/${offerId}`);
        return response.data;
    },

    /**
     * Prepare a payment transaction (returns unsigned XDR for signing)
     */
    preparePayment: async (offerId: number): Promise<{ success: boolean; data: PreparedTransaction; message: string }> => {
        const response = await api.post(`/company/payments/${offerId}/prepare`, {});
        return response.data;
    },

    /**
     * Submit a signed payment transaction
     */
    submitPayment: async (
        offerId: number,
        signedXDR: string
    ): Promise<{ success: boolean; data: SubmitResult; message: string }> => {
        const response = await api.post(`/company/payments/${offerId}/submit`, {
            signedXDR,
        });
        return response.data;
    },

    /**
     * Submit multiple signed batch XDRs (YieldDistributor multi-batch)
     */
    submitBatchPayment: async (
        offerId: number,
        signedXDRs: string[]
    ): Promise<{ success: boolean; data: SubmitResult; message: string }> => {
        const response = await api.post(`/company/payments/${offerId}/submit`, {
            signedXDRs,
        });
        return response.data;
    },

    /**
     * Get payment history for an offer
     */
    getPaymentHistory: async (offerId: number): Promise<{ success: boolean; data: any[] }> => {
        const response = await api.get(`/company/payments/${offerId}/history`);
        return response.data;
    },

    /**
     * Get all payment history for the company across all offers
     */
    getAllPaymentHistory: async (): Promise<{ success: boolean; data: any[] }> => {
        const response = await api.get('/company/payments/history/all');
        return response.data;
    },

    /**
     * Get all penalties for the company
     */
    getPenalties: async (): Promise<{ success: boolean; data: CompanyPenalty[] }> => {
        const response = await api.get('/company/payments/penalties/all');
        return response.data;
    },

    // ─── Settlement Deposit (Bullet Maturity) ───

    /**
     * Prepare a settlement deposit TX (server calculates amount + builds Soroban TX)
     * Returns XDR + full breakdown of what company is paying
     */
    prepareDeposit: async (offerId: number): Promise<{
        success: boolean;
        data: {
            xdr: string;
            networkPassphrase: string;
            contractId: string;
            depositAmount: number;
            breakdown: {
                investorPrincipal: number;
                investorInterest: number;
                platformFee: number;
                totalOwed: number;
            };
            investorCount: number;
            maturityDate: string;
        };
    }> => {
        const response = await api.post(`/company/payments/${offerId}/prepare-deposit`);
        return response.data;
    },

    /**
     * Submit company-signed Soroban deposit TX (goes directly to Soroban RPC, no admin)
     */
    submitDeposit: async (offerId: number, signedXDR: string): Promise<{
        success: boolean;
        data: { status: string; transactionHash: string };
        message: string;
    }> => {
        const response = await api.post(`/company/payments/${offerId}/submit-deposit`, { signedXDR });
        return response.data;
    },

    /**
     * Get settlement contract status (company-facing, no admin auth needed)
     */
    getSettlementStatus: async (offerId: number): Promise<{
        success: boolean;
        data: {
            offerId: number;
            offerType: string;
            offerStatus: string;
            settlementContractId: string | null;
            contractBalance: number | null;
            maturityDate: string | null;
            hasSettlementContract: boolean;
        };
    }> => {
        const response = await api.get(`/company/payments/${offerId}/settlement-status`);
        return response.data;
    },

    /**
     * Check if there's an active yield payment job for this offer.
     * Used to recover state on page refresh during signing/submission.
     */
    getYieldJobStatus: async (offerId: number): Promise<{
        success: boolean;
        data: {
            jobId: string;
            status: string;
            batchProgress: { completed: number; total: number };
            txHashes: string[];
        } | null;
    }> => {
        const response = await api.get(`/company/payments/${offerId}/yield-status`);
        return response.data;
    },
};

export default companyPaymentsApi;
