/**
 * Cliente HTTP para testes de API
 */

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

let authToken = null;

export const setAuthToken = (token) => {
  authToken = token;
};

export const clearAuthToken = () => {
  authToken = null;
};

const makeRequest = async (method, path, options = {}) => {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const config = {
    method,
    headers,
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
};

export const apiClient = {
  get: (path, options = {}) => makeRequest('GET', path, options),
  post: (path, options = {}) => makeRequest('POST', path, options),
  put: (path, options = {}) => makeRequest('PUT', path, options),
  delete: (path, options = {}) => makeRequest('DELETE', path, options),
};

