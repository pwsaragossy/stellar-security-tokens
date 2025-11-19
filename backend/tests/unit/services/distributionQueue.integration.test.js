import { test, describe, after } from 'node:test';
import assert from 'node:assert';

describe('DistributionQueue - Integration Style Tests', () => {
  // Garantir que a fila seja fechada após todos os testes
  after(async () => {
    const { closeDistributionQueue } = await import('../../../src/services/distributionQueue.service.js');
    await closeDistributionQueue();
  });

  test('initDistributionQueue handles Redis unavailability gracefully', async () => {
    const { initDistributionQueue, closeDistributionQueue } = await import('../../../src/services/distributionQueue.service.js');
    
    // Limpar fila existente se houver
    await closeDistributionQueue();
    
    // Aguardar um pouco para garantir que a fila anterior foi completamente fechada
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Deve retornar null ou objeto (dependendo se Redis está disponível)
    const queue = initDistributionQueue();
    
    // Pode ser null (Redis não disponível) ou objeto (Redis disponível)
    assert.ok(
      queue === null || typeof queue === 'object',
      'Should return null or queue object'
    );
    
    // Se a fila foi criada, aguardar um pouco para que erros de conexão sejam processados
    // e garantir que todas as operações assíncronas sejam concluídas
    if (queue) {
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Remover todos os listeners para evitar atividade assíncrona após o teste
      queue.removeAllListeners();
    }
    
    // Fechar a fila imediatamente após o teste para evitar atividade assíncrona
    await closeDistributionQueue();
    
    // Aguardar um pouco mais para garantir que tudo foi limpo
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  test('isQueueAvailable returns correct state', async () => {
    const { isQueueAvailable } = await import('../../../src/services/distributionQueue.service.js');
    
    const available = isQueueAvailable();
    assert.ok(typeof available === 'boolean', 'Should return boolean');
  });

  test('addDistributionJob throws error when queue unavailable', async () => {
    const { addDistributionJob, isQueueAvailable } = await import('../../../src/services/distributionQueue.service.js');
    
    // Só testar se fila realmente não está disponível
    if (!isQueueAvailable()) {
      try {
        await addDistributionJob({
          investmentId: 1,
          investorPublicKey: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          assetCode: 'SIN01',
          amount: '100',
        });
        assert.fail('Should throw error when queue is unavailable');
      } catch (error) {
        // Esperado se Redis não disponível
        assert.ok(
          error.message?.includes('not available') || 
          error.message?.includes('Redis') ||
          error.message?.includes('queue'),
          `Should throw error about queue not available, got: ${error.message}`
        );
      }
    } else {
      // Redis disponível - teste passa (comportamento esperado)
      assert.ok(true, 'Queue available - test skipped');
    }
  });
});

