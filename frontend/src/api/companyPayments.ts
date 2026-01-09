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
    periodRate: number;
    nextPaymentDue: string | null;
    lastPaymentDate: string | null;
    paymentDueStatus: string;
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
    totalPayout: number;
    investorCount: number;
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
    offerId: number;
    totalAmount: number;
    investorCount: number;
    breakdown: PaymentBreakdown[];
    expiresAt: string;
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
        const response = await api.post(`/company/payments/${offerId}/prepare`);
        return response.data;
    },

    /**
     * Submit a signed payment transaction
     */
    submitPayment: async (offerId: number, signedXDR: string): Promise<{ success: boolean; data: { transactionHash: string; investorsPaid: number; totalPaid: number }; message: string }> => {
        const response = await api.post(`/company/payments/${offerId}/submit`, { signedXDR });
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
     * Get all penalties for the company
     */
    getPenalties: async (): Promise<{ success: boolean; data: CompanyPenalty[] }> => {
        const response = await api.get('/company/payments/penalties/all');
        return response.data;
    },
};

export default companyPaymentsApi;
