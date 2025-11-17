import api from './client';
import type { ApiResponse, Investment } from '@/types';

export const investmentsApi = {
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

