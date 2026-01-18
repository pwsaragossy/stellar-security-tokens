import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { ApiResponse } from '@/types';
import { authStorage } from '@/utils/authStorage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add token to requests and handle FormData
api.interceptors.request.use(
  (config) => {
    // Use path-aware authStorage for multi-session support
    const token = authStorage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // If sending FormData, let the browser set Content-Type with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors and redirects
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse>) => {
    if (error.response?.status === 401) {
      // Clear auth for current user type only (preserve other sessions)
      authStorage.clear();

      // Determine redirect path based on current location
      const path = window.location.pathname;
      if (path.startsWith('/admin')) {
        window.location.href = '/admin/login';
      } else if (path.startsWith('/company')) {
        window.location.href = '/login';
      } else {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

