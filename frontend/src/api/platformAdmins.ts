import api from './client';
import type { ApiResponse, PlatformAdmin } from '@/types';

export const platformAdminsApi = {
  getAll: async (params?: {
    role?: string;
    is_active?: boolean;
  }): Promise<ApiResponse<PlatformAdmin[]>> => {
    const response = await api.get('/platform-admins', { params });
    return response.data;
  },

  getById: async (id: number): Promise<ApiResponse<PlatformAdmin>> => {
    const response = await api.get(`/platform-admins/${id}`);
    return response.data;
  },

  create: async (data: {
    email: string;
    name: string;
    password: string;
    role: 'admin' | 'manager' | 'super_admin';
  }): Promise<ApiResponse<PlatformAdmin>> => {
    const response = await api.post('/platform-admins', data);
    return response.data;
  },

  update: async (id: number, data: Partial<PlatformAdmin>): Promise<ApiResponse<PlatformAdmin>> => {
    const response = await api.put(`/platform-admins/${id}`, data);
    return response.data;
  },

  updateStatus: async (id: number, is_active: boolean): Promise<ApiResponse> => {
    const response = await api.put(`/platform-admins/${id}/status`, { is_active });
    return response.data;
  },
};

