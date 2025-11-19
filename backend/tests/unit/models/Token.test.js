import { test, describe } from 'node:test';
import assert from 'node:assert';

// Nota: Estes testes requerem PostgreSQL rodando
// Para testes verdadeiramente unitários, seria necessário refatorar o código para usar dependency injection

describe('Token Model - Integration Style Tests', () => {
  // Estes testes verificam a estrutura e lógica básica
  // Para testes completos, é necessário PostgreSQL rodando ou refatoração para dependency injection
  
  test('Token model exports correctly', async () => {
    const { Token } = await import('../../../src/models/Token.js');
    assert.ok(Token);
    assert.ok(typeof Token.create === 'function');
    assert.ok(typeof Token.findByAssetCode === 'function');
    assert.ok(typeof Token.findAll === 'function');
  });

  test('Token model has all required static methods', async () => {
    const { Token } = await import('../../../src/models/Token.js');
    
    const requiredMethods = [
      'create',
      'findByAssetCode',
      'findAll',
      'createDistribution',
      'getDistributionsByInvestor',
      'getDistributionsByAsset',
    ];

    for (const method of requiredMethods) {
      assert.ok(
        typeof Token[method] === 'function',
        `Token.${method} should be a function`
      );
    }
  });
});
