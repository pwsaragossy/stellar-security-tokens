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









  getPortfolio: async (investorId: number): Promise<ApiResponse> => {
    const response = await api.get(`/investors/${investorId}/portfolio`);
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

  initiateDeposit: async (id: number, data?: { expectedAmount?: number }): Promise<ApiResponse> => {
    const response = await api.post(`/investors/${id}/deposit/initiate`, data);
    return response.data;
  },

  getDeposits: async (id: number): Promise<ApiResponse> => {
    const response = await api.get(`/investors/${id}/deposits`);
    return response.data;
  },
};

