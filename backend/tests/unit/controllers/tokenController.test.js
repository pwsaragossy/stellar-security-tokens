import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('TokenController - Structure Tests', () => {
  test('TokenController exports all required functions', async () => {
    const controllers = await import('../../../src/controllers/tokenController.js');
    
    const requiredFunctions = [
      'issueToken',
      'getTokens',
      'getTokenByAssetCode',
      'distributeTokens',
      'getTokenBalance',
    ];

    for (const funcName of requiredFunctions) {
      assert.ok(
        typeof controllers[funcName] === 'function',
        `${funcName} should be exported`
      );
    }
  });
});
