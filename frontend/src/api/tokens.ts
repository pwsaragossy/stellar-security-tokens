import api from './client';
import type { ApiResponse, Token } from '@/types';

export const tokensApi = {
  getAll: async (params?: {
    offer_id?: number;
  }): Promise<ApiResponse<Token[]>> => {
    const response = await api.get('/tokens', { params });
    return response.data;
  },

  getByAssetCode: async (assetCode: string): Promise<ApiResponse<Token>> => {
    const response = await api.get(`/tokens/${assetCode}`);
    return response.data;
  },





  freeze: async (data: {
    investorPublicKey: string;
    assetCode: string;
  }): Promise<ApiResponse> => {
    const response = await api.post('/tokens/freeze', data);
    return response.data;
  },

  unfreeze: async (data: {
    investorPublicKey: string;
    assetCode: string;
  }): Promise<ApiResponse> => {
    const response = await api.post('/tokens/unfreeze', data);
    return response.data;
  },

  clawback: async (data: {
    investorPublicKey: string;
    assetCode: string;
    amount: string;
  }): Promise<ApiResponse> => {
    const response = await api.post('/tokens/clawback', data);
    return response.data;
  },

  disableClawback: async (data: {
    investorPublicKey: string;
    assetCode: string;
  }): Promise<ApiResponse> => {
    const response = await api.post('/tokens/disable-clawback', data);
    return response.data;
  },

  sync: async (): Promise<ApiResponse> => {
    const response = await api.post('/tokens/sync');
    return response.data;
  },
};

