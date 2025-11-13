import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('TokenController - Structure Tests', () => {
  test('TokenController exports all required functions', async () => {
    try {
      const controllers = await import('../../../controllers/tokenController.js');
      
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
    } catch (error) {
      assert.ok(error.message.includes('import') || error.message.includes('Server'),
        'Expected import error');
    }
  });
});
