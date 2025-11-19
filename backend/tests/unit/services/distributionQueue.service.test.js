import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('DistributionQueue - Structure Tests', () => {
  test('DistributionQueue exports correctly', async () => {
    const module = await import('../../../src/services/distributionQueue.service.js');
    
    assert.ok(module.initDistributionQueue, 'initDistributionQueue should be exported');
    assert.ok(module.addDistributionJob, 'addDistributionJob should be exported');
    assert.ok(module.getDistributionQueue, 'getDistributionQueue should be exported');
    assert.ok(module.isQueueAvailable, 'isQueueAvailable should be exported');
  });

  test('DistributionQueue functions have correct types', async () => {
    const {
      initDistributionQueue,
      addDistributionJob,
      getDistributionQueue,
      isQueueAvailable,
    } = await import('../../../src/services/distributionQueue.service.js');
    
    assert.ok(typeof initDistributionQueue === 'function', 'initDistributionQueue should be a function');
    assert.ok(typeof addDistributionJob === 'function', 'addDistributionJob should be a function');
    assert.ok(typeof getDistributionQueue === 'function', 'getDistributionQueue should be a function');
    assert.ok(typeof isQueueAvailable === 'function', 'isQueueAvailable should be a function');
  });

  test('isQueueAvailable returns boolean', async () => {
    const { isQueueAvailable } = await import('../../../src/services/distributionQueue.service.js');
    
    const result = isQueueAvailable();
    assert.ok(typeof result === 'boolean', 'isQueueAvailable should return a boolean');
  });

  test('getDistributionQueue returns queue or null', async () => {
    const { getDistributionQueue } = await import('../../../src/services/distributionQueue.service.js');
    
    const queue = getDistributionQueue();
    // Queue pode ser null se Redis não estiver disponível
    assert.ok(queue === null || typeof queue === 'object', 'getDistributionQueue should return queue or null');
  });
});

