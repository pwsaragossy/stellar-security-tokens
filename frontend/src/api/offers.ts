import api from './client';
import type { ApiResponse, Offer } from '@/types';

export const offersApi = {
  getAll: async (params?: {
    company_id?: number;
    status?: string;
    offer_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<Offer[]>> => {
    const response = await api.get('/offers', { params });
    return response.data;
  },

  getActive: async (params?: {
    offer_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<Offer[]>> => {
    const response = await api.get('/offers/active', { params });
    return response.data;
  },

  getById: async (id: number): Promise<ApiResponse<Offer>> => {
    const response = await api.get(`/offers/${id}`);
    return response.data;
  },

  create: async (data: {
    asset_code: string;
    offer_name: string;
    description: string;
    total_supply: string;
    annual_interest_rate?: number;
    offer_type: 'collateral' | 'sale';
    offer_rules: Record<string, any>;
    legal_documents: Record<string, any>;
  }): Promise<ApiResponse<Offer>> => {
    const response = await api.post('/companies/offers', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Offer>): Promise<ApiResponse<Offer>> => {
    const response = await api.put(`/companies/offers/${id}`, data);
    return response.data;
  },

  review: async (
    id: number,
    data: {
      status: 'approved' | 'rejected' | 'under_review';
      rejection_reason?: string;
      due_diligence_notes?: string;
    }
  ): Promise<ApiResponse> => {
    const response = await api.put(`/admin/offers/${id}/review`, data);
    return response.data;
  },

  addDueDiligenceNotes: async (id: number, notes: string): Promise<ApiResponse> => {
    const response = await api.post(`/admin/offers/${id}/due-diligence`, { notes });
    return response.data;
  },

  issueToken: async (id: number): Promise<ApiResponse> => {
    const response = await api.post(`/admin/offers/${id}/issue`);
    return response.data;
  },

  activate: async (id: number): Promise<ApiResponse> => {
    const response = await api.post(`/admin/offers/${id}/activate`);
    return response.data;
  },
};

