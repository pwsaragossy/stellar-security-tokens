/**
 * Configuração global de testes
 * Este arquivo é executado antes de todos os testes
 */

import { before, after } from 'node:test';

// Configurar variáveis de ambiente de teste
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only';
process.env.STELLAR_NETWORK = 'testnet';
process.env.DB_NAME = process.env.DB_NAME || 'test_stellar_tokens';

// Suprimir logs durante testes (opcional)
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

before(() => {
  // Opcional: suprimir logs durante testes
  if (process.env.SUPPRESS_TEST_LOGS === 'true') {
    console.log = () => {};
    console.error = () => {};
  }
});

after(() => {
  // Restaurar logs após testes
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

