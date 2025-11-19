import { test, describe } from 'node:test';
import assert from 'node:assert';

// Nota: Estes testes requerem PostgreSQL rodando
// Para testes verdadeiramente unitários, seria necessário refatorar o código para usar dependency injection

describe('Investor Model - Integration Style Tests', () => {
  // Estes testes verificam a estrutura e lógica básica
  // Para testes completos, é necessário PostgreSQL rodando ou refatoração para dependency injection
  
  test('Investor model exports correctly', async () => {
    const { Investor } = await import('../../../src/models/Investor.js');
    assert.ok(Investor);
    assert.ok(typeof Investor.create === 'function');
    assert.ok(typeof Investor.findById === 'function');
    assert.ok(typeof Investor.findByEmail === 'function');
    assert.ok(typeof Investor.findAll === 'function');
    assert.ok(typeof Investor.update === 'function');
    assert.ok(typeof Investor.delete === 'function');
  });

  test('Investor model has all required static methods', async () => {
    const { Investor } = await import('../../../src/models/Investor.js');
    
    const requiredMethods = [
      'create',
      'findById',
      'findByEmail',
      'findByDocument',
      'findByStellarPublicKey',
      'findAll',
      'update',
      'delete',
    ];

    for (const method of requiredMethods) {
      assert.ok(
        typeof Investor[method] === 'function',
        `Investor.${method} should be a function`
      );
    }
  });
});
