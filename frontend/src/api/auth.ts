import api from './client';
import type { ApiResponse, LoginResponse } from '@/types';

export const authApi = {
  // Investor login
  investorLogin: async (email: string, password: string): Promise<ApiResponse<LoginResponse>> => {
    const response = await api.post('/investors/login', { email, password });
    return response.data;
  },

  // Company user login
  companyLogin: async (email: string, password: string): Promise<ApiResponse<LoginResponse>> => {
    const response = await api.post('/company-users/login', { email, password });
    return response.data;
  },

  // Platform admin login
  adminLogin: async (email: string, password: string): Promise<ApiResponse<LoginResponse>> => {
    const response = await api.post('/platform-admins/login', { email, password });
    return response.data;
  },
};

