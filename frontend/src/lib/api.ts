import { authStorage, detectUserType } from '@/utils/authStorage';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Shared refresh state for the fetch-based client
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userType: detectUserType() }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data?.success && data?.data?.token) {
      const newToken = data.data.token;
      authStorage.setToken(newToken);
      return newToken;
    }
    return null;
  } catch {
    return null;
  }
}

async function getRefreshedToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = refreshAccessToken().finally(() => {
    isRefreshing = false;
    refreshPromise = null;
  });
  return refreshPromise;
}

function redirectToLogin(): void {
  authStorage.clear();
  const path = window.location.pathname;
  if (path.startsWith('/admin')) {
    window.location.href = '/admin/login';
  } else {
    window.location.href = '/login';
  }
}

export class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  private getAuthHeader(): Record<string, string> {
    const token = authStorage.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async fetchWithRefresh(url: string, options: RequestInit): Promise<Response> {
    const response = await fetch(url, { ...options, credentials: 'include' });

    if (response.status === 401) {
      // Don't retry refresh endpoint itself
      if (url.includes('/auth/refresh')) {
        redirectToLogin();
        throw new Error('Session expired');
      }

      const newToken = await getRefreshedToken();
      if (newToken) {
        // Retry with new token
        const retryHeaders = { ...options.headers as Record<string, string>, Authorization: `Bearer ${newToken}` };
        return fetch(url, { ...options, headers: retryHeaders, credentials: 'include' });
      } else {
        redirectToLogin();
        throw new Error('Session expired');
      }
    }

    return response;
  }

  async get(endpoint: string) {
    const response = await this.fetchWithRefresh(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
      },
    });

    if (response.status === 403) {
      redirectToLogin();
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  async post(endpoint: string, data: any) {
    const isFormData = data instanceof FormData;
    const headers: Record<string, string> = {
      ...this.getAuthHeader(),
    };

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await this.fetchWithRefresh(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: isFormData ? data : JSON.stringify(data),
    });

    if (response.status === 403) {
      redirectToLogin();
      throw new Error('Unauthorized');
    }

    // Allow void returns for 204
    if (response.status === 204) return null;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API Error: ${response.statusText}`);
    }

    return response.json();
  }

  async put(endpoint: string, data: any) {
    const isFormData = data instanceof FormData;
    const headers: Record<string, string> = {
      ...this.getAuthHeader(),
    };

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await this.fetchWithRefresh(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers,
      body: isFormData ? data : JSON.stringify(data),
    });

    if (response.status === 403) {
      redirectToLogin();
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API Error: ${response.statusText}`);
    }

    return response.json();
  }

  async delete(endpoint: string) {
    const response = await this.fetchWithRefresh(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
      },
    });

    if (response.status === 403) {
      redirectToLogin();
      throw new Error('Unauthorized');
    }

    if (response.status === 204) return null;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API Error: ${response.statusText}`);
    }

    return response.json();
  }
}

export const api = new ApiClient();
