import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: async (email: string) => {
    const response = await api.post('/auth/login', { email });
    return response.data;
  },
};

export const investorApi = {
  getAll: async () => {
    const response = await api.get('/investors');
    return response.data;
  },
  getById: async (id: number) => {
    const response = await api.get(`/investors/${id}`);
    return response.data;
  },
  register: async (data: { name: string; email: string; document: string }) => {
    const response = await api.post('/investors/register', data);
    return response.data;
  },
  whitelist: async (investorId: number, assetCode?: string) => {
    const response = await api.post(`/investors/whitelist/${investorId}`, { assetCode });
    return response.data;
  },
  getBalance: async (investorId: number, assetCode?: string) => {
    const response = await api.get(`/investors/${investorId}/balance`, {
      params: { assetCode },
    });
    return response.data;
  },
  getPayments: async (investorId: number, assetCode?: string, limit?: number, offset?: number) => {
    const response = await api.get(`/investors/${investorId}/payments`, {
      params: { assetCode, limit, offset },
    });
    return response.data;
  },
};

export const tokenApi = {
  getAll: async () => {
    const response = await api.get('/tokens');
    return response.data;
  },
  getByAssetCode: async (assetCode: string) => {
    const response = await api.get(`/tokens/${assetCode}`);
    return response.data;
  },
  issue: async (data: { assetCode: string; totalSupply: number; description?: string }) => {
    const response = await api.post('/tokens/issue', data);
    return response.data;
  },
};

export const paymentApi = {
  processMonthly: async (assetCode?: string) => {
    const response = await api.post('/payments/process', { assetCode });
    return response.data;
  },
  getHistory: async (params?: { assetCode?: string; investorId?: number; limit?: number; offset?: number }) => {
    const response = await api.get('/payments/history', { params });
    return response.data;
  },
  getStatistics: async (params?: { assetCode?: string; startDate?: string; endDate?: string }) => {
    const response = await api.get('/payments/statistics', { params });
    return response.data;
  },
};

export default api;

