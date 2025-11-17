import api from './client';
import type { ApiResponse, InterestPayment } from '@/types';

export const paymentsApi = {
  process: async (assetCode?: string): Promise<ApiResponse> => {
    const response = await api.post('/payments/process', { assetCode });
    return response.data;
  },

  getHistory: async (params?: {
    asset_code?: string;
    investor_id?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<{ payments: InterestPayment[]; total: number }>> => {
    const response = await api.get('/payments/history', { params });
    return response.data;
  },

  getStatistics: async (params?: {
    asset_code?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse> => {
    const response = await api.get('/payments/statistics', { params });
    return response.data;
  },
};

