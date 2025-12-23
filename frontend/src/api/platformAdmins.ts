import api from './client';
import type { ApiResponse, PlatformAdmin } from '@/types';

export interface Investor {
  id: number;
  name: string;
  email: string;
  document: string;
  status: 'pending' | 'active' | 'rejected';
  emailVerified: boolean;
  walletAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SystemConfig {
  key: string;
  value: string;
  description?: string;
}

export interface FeeLog {
  id: string;
  relatedId: string;
  type: string;
  amount: number;
  assetCode: string;
  description: string;
  createdAt: string;
}

export const platformAdminsApi = {
  // Auth
  login: async (email: string, password: string): Promise<ApiResponse<{ token: string; admin: PlatformAdmin }>> => {
    const response = await api.post('/platform-admins/login', { email, password });
    return response.data;
  },

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

  // User Management
  getInvestors: async (status?: string): Promise<ApiResponse<Investor[]>> => {
    const response = await api.get('/platform-admins/investors', { params: { status } });
    return response.data;
  },

  approveInvestor: async (id: number): Promise<ApiResponse> => {
    const response = await api.put(`/platform-admins/investors/${id}/approve`);
    return response.data;
  },

  rejectInvestor: async (id: number, reason: string): Promise<ApiResponse> => {
    const response = await api.put(`/platform-admins/investors/${id}/reject`, { reason });
    return response.data;
  },

  // Fee Configuration
  getSystemConfig: async (): Promise<ApiResponse<SystemConfig[]>> => {
    const response = await api.get('/platform-admins/system-config');
    return response.data;
  },

  updateSystemConfig: async (settings: SystemConfig[]): Promise<ApiResponse> => {
    const response = await api.put('/platform-admins/system-config', { settings });
    return response.data;
  },

  // Revenue / Fee Logs
  getFeeLogs: async (limit = 50, offset = 0): Promise<ApiResponse<FeeLog[]> & { revenueSummary: { total: number } }> => {
    const response = await api.get('/platform-admins/fee-logs', { params: { limit, offset } });
    return response.data;
  },
};

