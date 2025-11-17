import api from './client';
import type { ApiResponse, Company } from '@/types';

export const companiesApi = {
  getAll: async (params?: {
    status?: string;
    kyc_status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<Company[]>> => {
    const response = await api.get('/companies', { params });
    return response.data;
  },

  getById: async (id: number): Promise<ApiResponse<Company>> => {
    const response = await api.get(`/companies/${id}`);
    return response.data;
  },

  register: async (data: {
    name: string;
    cnpj: string;
    email: string;
    legal_representative: string;
    address?: string;
    phone?: string;
  }): Promise<ApiResponse<Company>> => {
    const response = await api.post('/companies/register', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Company>): Promise<ApiResponse<Company>> => {
    const response = await api.put(`/companies/${id}`, data);
    return response.data;
  },

  updateStatus: async (
    id: number,
    status: 'pending' | 'approved' | 'suspended' | 'rejected',
    reason?: string
  ): Promise<ApiResponse> => {
    const response = await api.put(`/companies/${id}/status`, { status, reason });
    return response.data;
  },

  updateKycStatus: async (
    id: number,
    status: 'approved' | 'rejected',
    reason?: string
  ): Promise<ApiResponse> => {
    const response = await api.put(`/companies/${id}/kyc-status`, { status, reason });
    return response.data;
  },

  getOffers: async (companyId: number): Promise<ApiResponse> => {
    const response = await api.get(`/companies/${companyId}/offers`);
    return response.data;
  },

  getProfile: async (): Promise<ApiResponse<Company>> => {
    const response = await api.get('/companies/profile');
    return response.data;
  },
};

