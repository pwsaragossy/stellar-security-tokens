import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('PaymentMonitor - Structure Tests', () => {
  test('PaymentMonitor exports correctly', async () => {
    const { PaymentMonitor, getPaymentMonitor } = await import('../../../src/services/paymentMonitor.service.js');
    assert.ok(PaymentMonitor, 'PaymentMonitor should be exported');
    assert.ok(typeof PaymentMonitor === 'function', 'PaymentMonitor should be a class');
    assert.ok(typeof getPaymentMonitor === 'function', 'getPaymentMonitor should be exported');
  });

  test('PaymentMonitor has required methods', async () => {
    const { PaymentMonitor } = await import('../../../src/services/paymentMonitor.service.js');
    
    const monitor = new PaymentMonitor();
    
    const requiredMethods = [
      'start',
      'stop',
      'isActive',
    ];

    for (const methodName of requiredMethods) {
      assert.ok(
        typeof monitor[methodName] === 'function',
        `${methodName} should be a method`
      );
    }
  });

  test('getPaymentMonitor returns singleton instance', async () => {
    const { getPaymentMonitor } = await import('../../../src/services/paymentMonitor.service.js');
    
    const instance1 = getPaymentMonitor();
    const instance2 = getPaymentMonitor();
    
    assert.ok(instance1 === instance2, 'getPaymentMonitor should return the same instance');
  });

  test('PaymentMonitor initial state is inactive', async () => {
    const { PaymentMonitor } = await import('../../../src/services/paymentMonitor.service.js');
    
    const monitor = new PaymentMonitor();
    assert.ok(monitor.isActive() === false, 'Monitor should start as inactive');
  });
});

