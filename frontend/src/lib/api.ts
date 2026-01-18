import { authStorage } from '@/utils/authStorage';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  private getAuthHeader(): Record<string, string> {
    // Use path-aware authStorage for multi-session support
    const token = authStorage.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private handleUnauthorized(): void {
    // Clear auth for current user type only (preserve other sessions)
    authStorage.clear();
    const path = window.location.pathname;
    if (path.startsWith('/admin')) {
      window.location.href = '/admin/login';
    } else {
      window.location.href = '/login';
    }
  }

  async get(endpoint: string) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
      },
    });

    if (response.status === 401 || response.status === 403) {
      this.handleUnauthorized();
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

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: isFormData ? data : JSON.stringify(data),
    });

    if (response.status === 401 || response.status === 403) {
      this.handleUnauthorized();
      throw new Error('Unauthorized');
    }

    // Allow void returns for 204
    if (response.status === 204) return null;

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

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers,
      body: isFormData ? data : JSON.stringify(data),
    });

    if (response.status === 401 || response.status === 403) {
      this.handleUnauthorized();
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API Error: ${response.statusText}`);
    }

    return response.json();
  }
}

export const api = new ApiClient();
