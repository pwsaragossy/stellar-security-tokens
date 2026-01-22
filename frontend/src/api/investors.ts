import api from './client';
import type { ApiResponse, Investor } from '@/types';

export const investorsApi = {
  getAll: async (params?: { limit?: number; offset?: number }): Promise<ApiResponse<Investor[]>> => {
    const response = await api.get('/investors', { params });
    return response.data;
  },

  getById: async (id: number): Promise<ApiResponse<Investor>> => {
    const response = await api.get(`/investors/${id}`);
    return response.data;
  },

  register: async (data: {
    name: string;
    email: string;
    document: string;
    password: string;
  }): Promise<ApiResponse<Investor>> => {
    const response = await api.post('/investors/register', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Investor>): Promise<ApiResponse<Investor>> => {
    const response = await api.put(`/investors/${id}`, data);
    return response.data;
  },

  whitelist: async (investorId: number, assetCode?: string): Promise<ApiResponse> => {
    const response = await api.post(`/investors/whitelist/${investorId}`, { assetCode });
    return response.data;
  },

  getBalance: async (investorId: number, assetCode?: string): Promise<ApiResponse> => {
    const response = await api.get(`/investors/${investorId}/balance`, {
      params: { assetCode },
    });
    return response.data;
  },

  getPayments: async (
    investorId: number,
    params?: { assetCode?: string; limit?: number; offset?: number }
  ): Promise<ApiResponse> => {
    const response = await api.get(`/investors/${investorId}/payments`, { params });
    return response.data;
  },

  getPortfolio: async (investorId: number): Promise<ApiResponse> => {
    const response = await api.get(`/investors/${investorId}/portfolio`);
    return response.data;
  },

  getMetrics: async (investorId: number): Promise<ApiResponse> => {
    const response = await api.get(`/investors/${investorId}/metrics`);
    return response.data;
  },

  updateKycStatus: async (
    investorId: number,
    status: 'approved' | 'rejected',
    reason?: string
  ): Promise<ApiResponse> => {
    const response = await api.put(`/investors/${investorId}/kyc-status`, { status, reason });
    return response.data;
  },

  initSponsoredTrustline: async (investorId: number, assetCode: string): Promise<ApiResponse> => {
    const response = await api.post(`/investors/${investorId}/init-sponsored-trustline`, { assetCode });
    return response.data;
  },
};

