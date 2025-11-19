import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('AlertService - Structure Tests', () => {
  test('AlertService exports correctly', async () => {
    const { AlertService } = await import('../../../src/services/alert.service.js');
    assert.ok(AlertService, 'AlertService should be exported');
    assert.ok(typeof AlertService === 'function', 'AlertService should be a class');
  });

  test('AlertService has all required static methods', async () => {
    const { AlertService } = await import('../../../src/services/alert.service.js');
    
    const requiredMethods = [
      'notify',
      'info',
      'warning',
      'error',
      'critical',
      'distributionFailed',
      'paymentMonitorFailed',
      'distributionQueueFailed',
      'investmentStuck',
    ];

    for (const methodName of requiredMethods) {
      assert.ok(
        typeof AlertService[methodName] === 'function',
        `${methodName} should be exported as a static method`
      );
    }
  });

  test('AlertService.notify handles different alert levels', async () => {
    const { AlertService } = await import('../../../src/services/alert.service.js');
    
    // Test that notify can be called without errors
    const result = await AlertService.notify('INFO', 'Test message', { test: true });
    assert.ok(result, 'notify should return a result');
    assert.ok(result.level === 'INFO', 'result should have correct level');
    assert.ok(result.message === 'Test message', 'result should have correct message');
  });

  test('AlertService helper methods work correctly', async () => {
    const { AlertService } = await import('../../../src/services/alert.service.js');
    
    const infoResult = await AlertService.info('Info message');
    assert.ok(infoResult.level === 'INFO', 'info should set level to INFO');
    
    const warningResult = await AlertService.warning('Warning message');
    assert.ok(warningResult.level === 'WARNING', 'warning should set level to WARNING');
    
    const errorResult = await AlertService.error('Error message');
    assert.ok(errorResult.level === 'ERROR', 'error should set level to ERROR');
    
    const criticalResult = await AlertService.critical('Critical message');
    assert.ok(criticalResult.level === 'CRITICAL', 'critical should set level to CRITICAL');
  });
});

