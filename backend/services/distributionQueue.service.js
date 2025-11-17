import Bull from 'bull';
import { Investment } from '../models/Investment.js';
import { Investor } from '../models/Investor.js';
import { StellarService } from './stellar.service.js';
import { Token } from '../models/Token.js';
import { AlertService } from './alert.service.js';
import crypto from 'crypto';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || null;
const MAX_RETRIES = parseInt(process.env.MAX_DISTRIBUTION_RETRIES || '3', 10);

/**
 * Gera memo único para transação Stellar
 * @param {number} investmentId - ID do investimento
 * @param {number} investorId - ID do investidor
 * @param {string} assetCode - Código do asset
 * @returns {string} Memo único (máximo 28 caracteres)
 */
function generateInvestmentMemo(investmentId, investorId, assetCode) {
  const hash = crypto.createHash('sha256')
    .update(`${investmentId}-${investorId}-${assetCode}-${Date.now()}`)
    .digest('hex')
    .substring(0, 8);
  return `INV-${investmentId}-${hash}`.substring(0, 28);
}

/**
 * Configuração do Redis para Bull
 */
const redisConfig = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
  retryStrategy: (times) => {
    // Limitar tentativas de reconexão para evitar spam de erros
    if (times > 10) {
      console.warn('[DistributionQueue] Max Redis reconnection attempts reached. Queue disabled.');
      return null; // Para de tentar reconectar
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true, // Enfileirar comandos quando offline até conexão ser estabelecida
  lazyConnect: true, // Conectar sob demanda para permitir degradação graciosa
};

/**
 * Fila de distribuição de tokens com retry automático
 */
let distributionQueue = null;

/**
 * Inicializa a fila de distribuição
 * @returns {Queue|null} Instância da fila ou null se Redis não disponível
 */
export function initDistributionQueue() {
  try {
    distributionQueue = new Bull('token-distribution', {
      redis: redisConfig,
      defaultJobOptions: {
        attempts: MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: 1000, // 1s, 2s, 4s...
        },
        removeOnComplete: {
          age: 3600, // Manter jobs completos por 1 hora
          count: 1000, // Manter últimos 1000 jobs
        },
        removeOnFail: {
          age: 86400, // Manter jobs falhados por 24 horas
        },
      },
    });

    // Set up error handler FIRST to catch connection errors
    // Also handle client connection errors directly to prevent unhandled rejections
    const handleRedisError = (error) => {
      // Suppress the error to prevent unhandled rejection
      // The error event handler below will log it properly
      if (error?.code === 'ECONNREFUSED' || error?.errors?.some?.(e => e?.code === 'ECONNREFUSED')) {
        // Connection errors are expected and handled by the error event handler
        return;
      }
    };

    // Access the underlying Redis clients and add error handlers
    // This prevents unhandled promise rejections from connection attempts
    // Note: With lazyConnect: true, clients may not exist immediately
    // Set up handlers when clients become available
    const setupClientErrorHandlers = () => {
      if (distributionQueue?.client) {
        distributionQueue.client.on('error', handleRedisError);
        distributionQueue.client.on('close', () => {
          // Connection closed - this is handled by retry strategy
        });
      }
      // Bull uses separate clients for pub/sub
      if (distributionQueue?.clients && Array.isArray(distributionQueue.clients)) {
        distributionQueue.clients.forEach(client => {
          if (client) {
            client.on('error', handleRedisError);
          }
        });
      }
    };

    // Try to set up handlers immediately (may not work with lazyConnect)
    setupClientErrorHandlers();

    // Also set up handlers after a short delay to catch clients created later
    setTimeout(setupClientErrorHandlers, 100);
    // Rate limiting para evitar múltiplos alertas e logs do mesmo erro
    let lastErrorTime = 0;
    let lastErrorMessage = '';
    let errorCount = 0;
    const ERROR_ALERT_COOLDOWN = 60000; // 1 minuto entre alertas do mesmo tipo
    const ERROR_LOG_COOLDOWN = 5000; // 5 segundos entre logs do mesmo erro

    distributionQueue.on('error', async (error) => {
      // Catch all errors including AggregateErrors to prevent unhandled rejections
      try {
        // Extrair mensagem de erro útil
        let errorMessage = 'Unknown error';
        
        // Handle specific ioredis offline queue errors
        if (error?.message?.includes('enableOfflineQueue') || error?.message?.includes('Stream isn\'t writeable')) {
          // This error occurs when commands are sent before connection is ready
          // With enableOfflineQueue: true, this shouldn't happen, but catch it anyway
          errorMessage = 'Redis connection not ready - commands will be queued';
          // Don't log this as an error since it's expected during initialization
          return;
        }
        
        if (error?.message && error.message !== 'AggregateError') {
          errorMessage = error.message;
        } else if (error?.code) {
          // Construir mensagem a partir do código e detalhes
          const parts = [error.code];
          if (error.syscall) parts.push(error.syscall);
          if (error.address) parts.push(error.address);
          if (error.port) parts.push(`port ${error.port}`);
          errorMessage = parts.filter(p => p).join(' ') || `${error.code}: Connection failed`;
        } else if (error?.errors && Array.isArray(error.errors) && error.errors.length > 0) {
          // AggregateError - pegar primeiro erro útil
          const firstError = error.errors[0];
          // Priorizar mensagem do primeiro erro se for útil
          if (firstError?.message && 
              firstError.message !== 'AggregateError' && 
              firstError.message.length > 0 &&
              !firstError.message.match(/^Error:\s*$/)) {
            errorMessage = firstError.message;
          } else if (firstError?.code) {
            // Construir mensagem a partir do código e detalhes do primeiro erro
            const parts = [firstError.code];
            if (firstError.syscall) parts.push(firstError.syscall);
            if (firstError.address) parts.push(firstError.address);
            if (firstError.port) parts.push(`port ${firstError.port}`);
            const constructed = parts.filter(p => p && p.trim()).join(' ');
            errorMessage = constructed || `${firstError.code}: Redis connection failed (port ${firstError.port || 6379})`;
          } else {
            // Fallback: construir mensagem básica
            const port = firstError?.port || error.port || 6379;
            errorMessage = `${error.code || 'ECONNREFUSED'}: Redis connection failed (port ${port})`;
          }
        } else {
          errorMessage = error?.toString() || 'Unknown error';
        }
        
        // Limpar mensagem vazia ou apenas espaços e garantir que não está vazia
        errorMessage = (errorMessage.trim() || 'Unknown error').replace(/\s+/g, ' ');

        const now = Date.now();
        const isNewError = errorMessage !== lastErrorMessage;
        const shouldLog = isNewError || (now - lastErrorTime) > ERROR_LOG_COOLDOWN;
        const shouldAlert = isNewError || (now - lastErrorTime) > ERROR_ALERT_COOLDOWN;

        if (shouldLog) {
          if (isNewError) {
            errorCount = 1;
            console.error(`[DistributionQueue] Queue error: ${errorMessage}`);
          } else {
            errorCount++;
            console.warn(`[DistributionQueue] Queue error (${errorCount}x): ${errorMessage} - Redis connection failed, queue disabled`);
          }
          lastErrorMessage = errorMessage;
          lastErrorTime = now;
        } else {
          errorCount++;
        }

        // Rate limiting: só alertar se for erro diferente ou passou o cooldown
        if (shouldAlert) {
          await AlertService.distributionQueueFailed(errorMessage).catch(() => {
            // Ignore alert errors to prevent cascading failures
          });
        }
      } catch (handlerError) {
        // Catch any errors in the error handler itself to prevent unhandled rejections
        console.error('[DistributionQueue] Error in error handler:', handlerError.message);
      }
    });

    // Processador de jobs
    distributionQueue.process(async (job) => {
      const { investmentId, investorPublicKey, assetCode, amount, memo } = job.data;

      console.log(`[DistributionQueue] Processing job for investment ${investmentId}`);

      // Buscar investment
      const investment = await Investment.findById(investmentId);
      if (!investment) {
        throw new Error(`Investment ${investmentId} not found`);
      }

      // Verificar se já foi processado (idempotência)
      if (investment.status === 'distributed') {
        console.log(`[DistributionQueue] Investment ${investmentId} already distributed`);
        return {
          success: true,
          message: 'Already distributed',
          investmentId,
        };
      }

      // Verificar idempotência: se já existe distribuição
      if (investment.usdc_payment_hash) {
        const existingDistribution = await Token.findDistributionByUSDC(investment.usdc_payment_hash);
        if (existingDistribution) {
          await Investment.updateStatus(investmentId, {
            status: 'distributed',
            distribution_tx_hash: existingDistribution.transaction_hash,
          });
          return {
            success: true,
            message: 'Distribution already exists',
            investmentId,
            distributionId: existingDistribution.id,
          };
        }
      }

      // Buscar investidor
      const investor = await Investor.findById(investment.investor_id);
      if (!investor || !investor.stellar_public_key) {
        throw new Error(`Investor ${investment.investor_id} not found or missing Stellar key`);
      }

      // Verificar KYC
      if (investor.kyc_status !== 'approved') {
        throw new Error(`Investor ${investment.investor_id} KYC not approved`);
      }

      // Gerar memo se não fornecido
      const distributionMemo = memo || generateInvestmentMemo(
        investment.id,
        investment.investor_id,
        investment.asset_code
      );

      // Distribuir tokens
      const stellarResult = await StellarService.distributeTokens(
        assetCode,
        investor.stellar_public_key,
        amount,
        { memo: distributionMemo }
      );

      // Criar distribuição (com verificação de idempotência interna)
      const distribution = await Token.createDistribution({
        investorId: investment.investor_id,
        assetCode: investment.asset_code,
        amount: investment.token_amount,
        transactionHash: stellarResult.transactionHash,
        usdcPaymentHash: investment.usdc_payment_hash,
        offerId: investment.offer_id,
        memo: distributionMemo,
      });

      // Atualizar investment
      await Investment.updateStatus(investmentId, {
        status: 'distributed',
        distribution_tx_hash: stellarResult.transactionHash,
      });

      console.log(`[DistributionQueue] Successfully distributed tokens for investment ${investmentId}`);

      return {
        success: true,
        investmentId,
        distributionId: distribution.id,
        transactionHash: stellarResult.transactionHash,
        memo: distributionMemo,
      };
    });

    // Event handlers
    distributionQueue.on('completed', (job, result) => {
      console.log(`[DistributionQueue] Job ${job.id} completed:`, result);
    });

    distributionQueue.on('failed', async (job, err) => {
      console.error(`[DistributionQueue] Job ${job.id} failed after ${job.attemptsMade} attempts:`, err.message);

      // Marcar investment como failed após todas as tentativas
      if (job.attemptsMade >= MAX_RETRIES) {
        Investment.updateStatus(job.data.investmentId, {
          status: 'failed',
          error_message: `Failed after ${MAX_RETRIES} attempts: ${err.message}`,
        }).catch(updateError => {
          console.error('[DistributionQueue] Failed to update investment status:', updateError);
        });

        // Alertar equipe sobre falha crítica
        await AlertService.distributionFailed(job.data.investmentId, err.message, MAX_RETRIES);
      }
    });

    distributionQueue.on('stalled', (job) => {
      console.warn(`[DistributionQueue] Job ${job.id} stalled`);
    });

    console.log('[DistributionQueue] Initialized successfully');
    return distributionQueue;
  } catch (error) {
    // Não alertar em erro de inicialização - é esperado se Redis não estiver disponível
    console.error('[DistributionQueue] Failed to initialize:', error.message);
    console.warn('[DistributionQueue] Queue disabled. Distributions will be processed synchronously.');
    return null;
  }
}

/**
 * Adiciona job de distribuição à fila
 * @param {Object} jobData - Dados do job
 * @param {number} jobData.investmentId - ID do investimento
 * @param {string} jobData.investorPublicKey - Chave pública do investidor
 * @param {string} jobData.assetCode - Código do asset
 * @param {string} jobData.amount - Quantidade de tokens
 * @param {string} [jobData.memo] - Memo opcional
 * @returns {Promise<Object>} Job adicionado à fila
 */
export async function addDistributionJob(jobData) {
  if (!distributionQueue) {
    // Se fila não disponível, processar sincronamente
    console.warn('[DistributionQueue] Queue not available, processing synchronously');
    throw new Error('Distribution queue not available. Please ensure Redis is running.');
  }

  const job = await distributionQueue.add('distribute-tokens', jobData, {
    priority: 1, // Prioridade normal
    delay: 0, // Processar imediatamente
  });

  console.log(`[DistributionQueue] Added job ${job.id} for investment ${jobData.investmentId}`);
  return job;
}

/**
 * Obtém instância da fila
 * @returns {Queue|null} Instância da fila ou null
 */
export function getDistributionQueue() {
  return distributionQueue;
}

/**
 * Verifica se a fila está disponível
 * @returns {boolean} True se disponível
 */
export function isQueueAvailable() {
  return distributionQueue !== null;
}

/**
 * Fecha e reseta a fila (útil para testes)
 * @returns {Promise<void>}
 */
export async function closeDistributionQueue() {
  if (distributionQueue) {
    const queue = distributionQueue;
    distributionQueue = null; // Resetar imediatamente para evitar novas operações
    
    try {
      // Remover todos os listeners para evitar atividade assíncrona
      queue.removeAllListeners('completed');
      queue.removeAllListeners('failed');
      queue.removeAllListeners('stalled');
      queue.removeAllListeners('error');
      queue.removeAllListeners();
      
      // Fechar conexões Redis de forma mais robusta
      if (queue.client) {
        try {
          // Remover listeners do cliente também
          queue.client.removeAllListeners();
          await queue.client.quit();
        } catch (e) {
          // Ignorar erros ao fechar cliente
        }
      }
      
      // Fechar subscribers também se existirem
      if (queue.clients && Array.isArray(queue.clients)) {
        for (const client of queue.clients) {
          try {
            if (client && client.removeAllListeners) {
              client.removeAllListeners();
            }
            if (client && client.quit) {
              await client.quit();
            }
          } catch (e) {
            // Ignorar erros
          }
        }
      }
      
      // Fechar a fila com timeout
      await Promise.race([
        queue.close(),
        new Promise((resolve) => setTimeout(resolve, 1000)) // Timeout de 1s
      ]);
      
      // Aguardar um pouco para garantir que todas as operações assíncronas sejam concluídas
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      // Ignorar erros ao fechar (pode já estar fechada)
      // Não logar em testes para evitar poluição
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[DistributionQueue] Error closing queue:', error.message);
      }
    }
  }
}

