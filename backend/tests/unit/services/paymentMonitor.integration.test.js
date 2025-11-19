import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('PaymentMonitor - Integration Style Tests', () => {
  test('PaymentMonitor can be instantiated', async () => {
    const { PaymentMonitor } = await import('../../../src/services/paymentMonitor.service.js');
    
    const monitor = new PaymentMonitor();
    assert.ok(monitor instanceof PaymentMonitor, 'Should create PaymentMonitor instance');
    assert.strictEqual(monitor.isActive(), false, 'Should start as inactive');
  });

  test('PaymentMonitor stop method works', async () => {
    const { PaymentMonitor } = await import('../../../src/services/paymentMonitor.service.js');
    
    const monitor = new PaymentMonitor();
    monitor.stop();
    
    assert.strictEqual(monitor.isActive(), false, 'Should be inactive after stop');
  });

  test('PaymentMonitor singleton pattern works', async () => {
    const { getPaymentMonitor } = await import('../../../src/services/paymentMonitor.service.js');
    
    const instance1 = getPaymentMonitor();
    const instance2 = getPaymentMonitor();
    
    assert.strictEqual(instance1, instance2, 'Should return same instance');
  });
});

