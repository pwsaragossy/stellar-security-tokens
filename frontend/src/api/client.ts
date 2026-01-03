import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { ApiResponse } from '@/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userType');
      localStorage.removeItem('admin');

      // Determine redirect path based on current location
      const path = window.location.pathname;
      if (path.startsWith('/investor')) {
        window.location.href = '/investor/login';
      } else if (path.startsWith('/company')) {
        window.location.href = '/company/login';
      } else if (path.startsWith('/admin')) {
        window.location.href = '/admin/login';
      } else {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

