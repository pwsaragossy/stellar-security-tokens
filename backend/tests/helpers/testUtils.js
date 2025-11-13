/**
 * Utilitários para testes
 */

/**
 * Cria um mock de requisição Express
 */
export const createMockRequest = (overrides = {}) => {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ...overrides,
  };
};

/**
 * Cria um mock de resposta Express
 */
export const createMockResponse = () => {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.body = data;
      return this;
    },
    send: function(data) {
      this.body = data;
      return this;
    },
  };
  return res;
};

/**
 * Cria um mock de função next do Express
 */
export const createMockNext = () => {
  const next = (error) => {
    if (error) {
      next.error = error;
    }
    next.called = true;
  };
  next.called = false;
  next.error = null;
  return next;
};

/**
 * Aguarda um tempo especificado (útil para testes assíncronos)
 */
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Cria um token JWT mock para testes
 */
export const createMockJWT = (payload = {}) => {
  const defaultPayload = {
    id: 1,
    email: 'test@example.com',
    role: 'investor',
    iat: Math.floor(Date.now() / 1000),
  };
  
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...defaultPayload, ...payload })).toString('base64url');
  const signature = 'mock_signature';
  
  return `${header}.${body}.${signature}`;
};

