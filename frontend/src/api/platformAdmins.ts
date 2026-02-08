import api from './client';
import type { ApiResponse, PlatformAdmin } from '@/types';

export interface Investor {
  id: number;
  name: string;
  email: string;
  document: string;
  status: 'pending' | 'approved' | 'rejected';
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
  // Freighter Challenge-Response Login (signTransaction-based)
  freighterChallenge: async (publicKey: string): Promise<ApiResponse<{ challengeXdr: string; networkPassphrase: string }>> => {
    const response = await api.post('/platform-admins/freighter/challenge', { publicKey });
    return response.data;
  },

  freighterVerify: async (publicKey: string, signedXdr: string): Promise<ApiResponse<{ token: string; admin: PlatformAdmin }>> => {
    const response = await api.post('/platform-admins/freighter/verify', { publicKey, signedXdr });
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

  sponsorInvestorWallet: async (id: number, amount: string = '10'): Promise<ApiResponse<{
    investorId: number;
    investorName: string;
    walletAddress: string;
    amountXLM: number;
    transactionHash: string;
    explorer: string;
  }> & { message?: string }> => {
    const response = await api.post(`/platform-admins/investors/${id}/sponsor`, { amount });
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

  // Analytics
  getMetrics: async (params?: { offer_id?: number; start_date?: string; end_date?: string }): Promise<ApiResponse<any>> => {
    const response = await api.get('/platform-admins/investments/metrics', { params });
    return response.data;
  },

  getStatistics: async (params: { start_date: string; end_date: string; offer_id?: number }): Promise<ApiResponse<any[]>> => {
    const response = await api.get('/platform-admins/investments/statistics', { params });
    return response.data;
  },

  getPendingInvestments: async (limit = 50): Promise<ApiResponse<any[]>> => {
    const response = await api.get('/platform-admins/investments/pending', { params: { limit } });
    return response.data;
  },

  getFundraisingProgress: async (): Promise<ApiResponse<any>> => {
    const response = await api.get('/platform-admins/investments/fundraising');
    return response.data;
  },

  getRevenueBreakdown: async (): Promise<ApiResponse<any>> => {
    const response = await api.get('/platform-admins/investments/revenue-breakdown');
    return response.data;
  },

  getInvestorCohorts: async (): Promise<ApiResponse<any>> => {
    const response = await api.get('/platform-admins/investments/cohorts');
    return response.data;
  },
};
