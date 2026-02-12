import api from './client';
import type { ApiResponse, Investment } from '@/types';

export const investmentsApi = {
  // Investor-facing: Get my investments with status filter
  getMyInvestments: async (investorId: number, params?: {
    status?: string;  // e.g., "pending_payment,payment_received" or single status
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<{
    investments: Array<{
      id: number;
      offerId: number | null;
      offerName: string | null;
      assetCode: string;
      usdcAmount: number;
      tokenAmount: number;
      status: 'pending_payment' | 'payment_received' | 'pending_distribution' | 'distributed' | 'failed';
      memo: string | null;
      createdAt: string;
      updatedAt: string;
      paymentInstructions?: {
        treasuryAddress: string;
        memo: string;
        amount: number;
        asset: string;
      };
      usdcPaymentHash?: string;
      distributionTxHash?: string;
      errorMessage?: string;
    }>;
    pagination: { total: number; limit: number; offset: number; count: number };
    summary: { pending: number; processing: number; distributed: number; failed: number };
  }>> => {
    const response = await api.get(`/investors/${investorId}/investments`, { params });
    return response.data;
  },

  purchase: async (data: {
    offer_id: number;
    usdc_amount: string;
  }): Promise<ApiResponse<Investment>> => {
    const response = await api.post('/investments/purchase', data);
    return response.data;
  },

  getStatus: async (id: number): Promise<ApiResponse<Investment>> => {
    const response = await api.get(`/investments/${id}/status`);
    return response.data;
  },

  getAll: async (params?: {
    investor_id?: number;
    offer_id?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<Investment[]>> => {
    const response = await api.get('/investments', { params });
    return response.data;
  },

  getPending: async (params?: {
    asset_code?: string;
    offer_id?: number;
  }): Promise<ApiResponse<Investment[]>> => {
    const response = await api.get('/platform-admins/investments/pending', { params });
    return response.data;
  },

  verifyPayment: async (id: number, txHash?: string): Promise<ApiResponse> => {
    const response = await api.post(`/platform-admins/investments/${id}/verify`, { txHash });
    return response.data;
  },

  cancel: async (id: number, reason: string): Promise<ApiResponse> => {
    const response = await api.post(`/platform-admins/investments/${id}/cancel`, { reason });
    return response.data;
  },

  getMetrics: async (params?: {
    startDate?: string;
    endDate?: string;
    asset_code?: string;
    offer_id?: number;
  }): Promise<ApiResponse> => {
    const response = await api.get('/platform-admins/investments/metrics', { params });
    return response.data;
  },

  getStatistics: async (params: {
    startDate: string;
    endDate: string;
    interval: 'day' | 'week' | 'month' | 'year';
    asset_code?: string;
    offer_id?: number;
  }): Promise<ApiResponse> => {
    const response = await api.get('/platform-admins/investments/statistics', { params });
    return response.data;
  },
};

