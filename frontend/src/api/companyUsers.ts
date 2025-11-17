import api from './client';
import type { ApiResponse, CompanyUser } from '@/types';

export const companyUsersApi = {
  getAll: async (params?: {
    company_id?: number;
    role?: string;
    is_active?: boolean;
  }): Promise<ApiResponse<CompanyUser[]>> => {
    const response = await api.get('/company-users', { params });
    return response.data;
  },

  getById: async (id: number): Promise<ApiResponse<CompanyUser>> => {
    const response = await api.get(`/company-users/${id}`);
    return response.data;
  },

  register: async (data: {
    company_id: number;
    email: string;
    name: string;
    password: string;
    role: 'user' | 'admin';
  }): Promise<ApiResponse<CompanyUser>> => {
    const response = await api.post('/company-users/register', data);
    return response.data;
  },

  update: async (id: number, data: Partial<CompanyUser>): Promise<ApiResponse<CompanyUser>> => {
    const response = await api.put(`/company-users/${id}`, data);
    return response.data;
  },

  updateStatus: async (id: number, is_active: boolean): Promise<ApiResponse> => {
    const response = await api.put(`/company-users/${id}/status`, { is_active });
    return response.data;
  },
};

