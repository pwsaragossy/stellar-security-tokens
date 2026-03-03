import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@/types';
import { authStorage, detectUserType } from '@/utils/authStorage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send httpOnly cookies with every request
});

// Track in-flight refresh to avoid multiple simultaneous refresh calls
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeToRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await axios.post(
      `${API_URL}/auth/refresh`,
      { userType: detectUserType() },
      { withCredentials: true }
    );
    if (response.data?.success && response.data?.data?.token) {
      const newToken = response.data.data.token;
      authStorage.setToken(newToken);
      return newToken;
    }
    return null;
  } catch {
    return null;
  }
}

// Request interceptor - Add token to requests and handle FormData
api.interceptors.request.use(
  (config) => {
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

// Response interceptor - Handle 401 with silent refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If 401 and not already retrying, attempt a refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry refresh endpoint itself
      if (originalRequest.url?.includes('/auth/refresh')) {
        authStorage.clear();
        redirectToLogin();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Wait for the in-flight refresh to complete
        return new Promise(resolve => {
          subscribeToRefresh((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const newToken = await refreshAccessToken();
      isRefreshing = false;

      if (newToken) {
        onRefreshed(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } else {
        // Refresh failed — session is dead
        authStorage.clear();
        redirectToLogin();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

function redirectToLogin() {
  const path = window.location.pathname;
  if (path.startsWith('/admin')) {
    window.location.href = '/admin/login';
  } else {
    window.location.href = '/login';
  }
}

export default api;
