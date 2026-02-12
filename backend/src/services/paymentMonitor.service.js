import { stellarServer, getUsdcIssuer, createFreshServer } from '../config/stellar.js';
import { keyManager } from './KeyManager.js';
import { Investment } from '../models/Investment.js';
import { Investor } from '../models/Investor.js';
import { StellarService } from './stellar.service.js';
import { Token } from '../models/Token.js';
import { EmailService } from './email.service.js';
import { DepositRelayService } from './depositRelay.service.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

// Scoped logger for this service
const log = logger.scope('PaymentMonitor');

// Use centralized getUsdcIssuer() for automatic testnet/mainnet detection
const USDC_ISSUER = getUsdcIssuer();
log.info(`Using USDC issuer: ${USDC_ISSUER}`);
const USDC_ASSET_CODE = 'USDC';
const RECONNECT_DELAY = parseInt(process.env.PAYMENT_MONITOR_RECONNECT_DELAY || '5000', 10);

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
 * Serviço para monitorar pagamentos USDC em tempo real usando Horizon streaming
 */
export class PaymentMonitor {
  constructor() {
    this.treasuryPublicKey = null;
    this.stream = null;
    this.isRunning = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.lastCursor = 'now'; // Initialize cursor tracking
    this.connectionStabilityTimer = null;
    this.isReconnecting = false; // Guard against multiple simultaneous reconnects
  }

  /**
   * Inicia o monitoramento de pagamentos USDC
   * @param {string} [treasuryPublicKey] - Chave pública da conta treasury (opcional, usa env se não fornecido)
   */
  async start(treasuryPublicKey = null) {
    try {
      if (this.isRunning) {
        log.debug('Already running');
        return;
      }

      // Use getPublicKey — works in both env and multisig modes
      this.treasuryPublicKey = treasuryPublicKey || keyManager.getPublicKey('TREASURY');

      log.info(`Starting monitoring for treasury: ${this.treasuryPublicKey}`);

      this.isRunning = true;
      this.reconnectAttempts = 0;

      await this.startStream();
    } catch (error) {
      log.error('Failed to start:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Inicia o stream de pagamentos
   * @private
   */
  async startStream() {
    try {
      // Ensure any existing stream is closed before starting a new one
      if (this.stream) {
        try {
          this.stream();
        } catch (e) {
          // ignore error on close
        }
        this.stream = null;
      }

      log.debug(`Starting stream with cursor: ${this.lastCursor}`);

      this.isReconnecting = false; // Clear guard now that we're starting fresh

      this.stream = stellarServer
        .payments()
        .forAccount(this.treasuryPublicKey)
        .cursor(this.lastCursor)
        .stream({
          onmessage: async (payment) => {
            try {
              // Update cursor tracking
              if (payment.paging_token) {
                this.lastCursor = payment.paging_token;
              }
              // Received a message => connection works.
              this.reconnectAttempts = 0;
              await this.handlePayment(payment);
            } catch (error) {
              log.error('Error handling payment:', error);
            }
          },
          onerror: (error) => {
            log.error('Stream error:', error);
            this.handleStreamError(error);
          },
        });

      log.info('Stream started successfully');

      // Do NOT reset reconnectAttempts immediately.
      // Reset it only if the connection stays alive for a while (e.g., 60s)
      if (this.connectionStabilityTimer) clearTimeout(this.connectionStabilityTimer);
      this.connectionStabilityTimer = setTimeout(() => {
        if (this.isRunning) {
          log.debug('Connection stable for 60s. Resetting reconnection attempts.');
          this.reconnectAttempts = 0;
        }
      }, 60000);

    } catch (error) {
      log.error('Failed to start stream:', error);
      this.handleStreamError(error);
    }
  }

  /**
   * Trata erros do stream e reconecta
   * Aplica backoff mais longo para erros de rate limit (429)
   * @private
   */
  async handleStreamError(error) {
    // Always close the current stream on error to stop EventSource auto-retries
    if (this.connectionStabilityTimer) {
      clearTimeout(this.connectionStabilityTimer);
      this.connectionStabilityTimer = null;
    }

    if (this.stream) {
      try {
        this.stream();
      } catch (e) {
        log.error('Error closing stream during error handling:', e);
      }
      this.stream = null;
    }

    if (!this.isRunning) {
      return; // Do not reconnect if manually stopped
    }

    // Guard against multiple simultaneous reconnect attempts from EventSource firing onerror multiple times
    if (this.isReconnecting) {
      log.debug('Reconnection already in progress, ignoring duplicate error.');
      return;
    }
    this.isReconnecting = true;

    this.reconnectAttempts++;

    // Detectar erro 429 (rate limit) do Horizon
    const isRateLimitError = this.isRateLimitError(error);

    // Detectar erro 404 (account not found) - comum em testnet quando treasury não existe
    const isAccountNotFound = this.isAccountNotFoundError(error);

    if (isAccountNotFound) {
      log.warn(`Treasury account not found on Stellar network (404). The account may not be funded yet.`);
      log.warn(`Payment monitoring disabled until treasury account exists. Will retry in 5 minutes.`);
      this.isRunning = false;
      // Schedule a retry in 5 minutes to check if account was created
      setTimeout(() => {
        log.info('Retrying to start after account not found...');
        this.isRunning = true;
        this.reconnectAttempts = 0;
        this.startStream();
      }, 5 * 60 * 1000);
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping.`);
      this.isRunning = false;
      const { AlertService } = await import('./alert.service.js');
      await AlertService.paymentMonitorFailed(`Max reconnection attempts reached: ${error.message}`);
      return;
    }

    // Use longer backoff for rate limit errors (30s base vs 5s default)
    const baseDelay = isRateLimitError ? 30000 : RECONNECT_DELAY;
    const delay = baseDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 4)); // Max 4 doublings

    if (isRateLimitError) {
      log.warn(`Rate limited by Horizon (429). Backing off for ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    } else {
      log.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    }

    setTimeout(() => {
      if (this.isRunning) {
        this.startStream();
      }
    }, delay);
  }

  /**
   * Check if error is a rate limit (429) error from Horizon
   * @param {Error} error - Error object
   * @returns {boolean} True if rate limit error
   * @private
   */
  isRateLimitError(error) {
    if (!error) return false;

    // Check status code directly
    if (error.status === 429 || error.response?.status === 429) {
      return true;
    }

    // Check error message
    const message = error.message || error.toString() || '';
    if (message.includes('429') || message.toLowerCase().includes('too many requests')) {
      return true;
    }

    // Check for Horizon-specific error format
    if (error.type === 'error' && error.status === 429) {
      return true;
    }

    return false;
  }

  /**
   * Check if error is an account not found (404) error from Horizon
   * This typically happens when the treasury account hasn't been funded on testnet
   * @param {Error} error - Error object
   * @returns {boolean} True if account not found error
   * @private
   */
  isAccountNotFoundError(error) {
    if (!error) return false;

    // Check status code directly
    if (error.status === 404 || error.response?.status === 404) {
      return true;
    }

    // Check error message
    const message = error.message || error.toString() || '';
    if (message.includes('404') || message.toLowerCase().includes('not found')) {
      return true;
    }

    // Check for Horizon-specific error format
    if (error.type === 'error' && error.status === 404) {
      return true;
    }

    return false;
  }

  /**
   * Processa um pagamento recebido
   * @param {Object} payment - Objeto de pagamento do Horizon
   * @private
   */
  async handlePayment(payment) {
    // Only process payment operations
    if (payment.type !== 'payment') {
      return;
    }

    // Verify payment is to treasury
    if (payment.to !== this.treasuryPublicKey) {
      return;
    }

    // Determine asset info for logging
    const isNative = payment.asset_type === 'native';
    const assetCode = isNative ? 'XLM' : payment.asset_code;
    const isUSDC = !isNative && payment.asset_code === USDC_ASSET_CODE && payment.asset_issuer === USDC_ISSUER;

    // IMPORTANT: Payment operations don't have memo directly - it's on the transaction
    // We need to fetch the transaction to get the memo
    let memo = null;
    try {
      // CRITICAL: Use fresh server to avoid URL corruption from previous operations
      const freshServer = createFreshServer();
      const tx = await freshServer.transactions().transaction(payment.transaction_hash).call();
      if (tx.memo_type === 'text' && tx.memo) {
        memo = tx.memo;
      }
    } catch (err) {
      log.warn(`Could not fetch transaction ${payment.transaction_hash} for memo: ${err.message}`);
    }

    // Check if it's a deposit relay payment (memo starts with DEP-)
    // Deposit relay accepts ANY asset (XLM or USDC)
    if (memo && memo.startsWith(DepositRelayService.MEMO_PREFIX)) {
      log.info(`Deposit relay payment detected: ${payment.amount} ${assetCode} from ${payment.from}, memo: ${memo}`);
      await DepositRelayService.handleIncomingPayment(
        memo,
        payment.amount,
        payment.transaction_hash,
        assetCode // Pass asset code so relay knows what was sent
      );
      return;
    }

    // For investment payments, only accept USDC
    if (!isUSDC) {
      return;
    }

    log.info(`USDC investment payment detected: ${payment.amount} from ${payment.from}, memo: ${memo}`);

    // Buscar investimento pendente correspondente
    const pendingInvestments = await Investment.findPendingByInvestor(
      payment.from,
      payment.amount,
      2 // 2 minutos de janela
    );

    if (pendingInvestments.length === 0) {
      log.warn(`No pending investment found for payment ${payment.transaction_hash} from ${payment.from}`);
      return;
    }

    // Processar primeiro investimento encontrado (mais recente)
    const investment = pendingInvestments[0];

    // Verificar se já foi processado (idempotência)
    if (investment.usdcPaymentHash === payment.transaction_hash) {
      log.debug(`Investment ${investment.id} already processed for payment ${payment.transaction_hash}`);
      return;
    }

    await this.processInvestmentPayment(investment, payment);
  }

  /**
   * Processa pagamento e distribui tokens
   * @param {Object} investment - Investimento pendente
   * @param {Object} payment - Pagamento USDC detectado
   * @private
   */
  async processInvestmentPayment(investment, payment) {
    try {
      log.info(`Processing investment ${investment.id} for payment ${payment.transaction_hash}`);

      // Verificar idempotência: se já existe distribuição para este pagamento
      const existingDistribution = await Token.findDistributionByUSDC(payment.transaction_hash);

      if (existingDistribution) {
        log.debug(`Distribution already exists for payment ${payment.transaction_hash}`);
        await Investment.updateStatus(investment.id, {
          status: 'distributed',
          usdc_payment_hash: payment.transaction_hash,
          distribution_tx_hash: existingDistribution.transaction_hash,
        });
        return;
      }

      // Buscar investidor
      const investor = await Investor.findById(investment.investorId);
      if (!investor || !investor.stellarContractId) {
        throw new Error(`Investor ${investment.investorId} not found or missing smart wallet address`);
      }

      log.info(`Distributing ${investment.tokenAmount} tokens to ${investor.stellarContractId || investor.stellarPublicKey}`);
      // Verificar KYC
      if (investor.kycStatus !== 'approved') {
        throw new Error(`Investor ${investment.investorId} KYC not approved`);
      }

      // JIT AUTHORIZATION (match controller & queue behavior)
      const targetWallet = investor.stellarContractId || investor.stellarPublicKey;
      if (targetWallet) {
        log.info(`JIT Authorizing ${targetWallet} for ${investment.assetCode}...`);
        try {
          await StellarService.authorizeInvestor(targetWallet, investment.assetCode);
        } catch (authError) {
          log.warn(`JIT Authorization failed for ${targetWallet}: ${authError.message}. Proceeding anyway...`);
        }
      }

      // Gerar memo único
      const memo = generateInvestmentMemo(investment.id, investment.investorId, investment.assetCode);

      // Atualizar investment com hash do pagamento
      await Investment.updateStatus(investment.id, {
        status: 'payment_received',
        usdc_payment_hash: payment.transaction_hash,
      });

      // Distribuir tokens to smart wallet
      const stellarResult = await StellarService.distributeTokens(
        targetWallet,
        investment.tokenAmount.toString(),
        investment.assetCode,
        {
          memo,
          investorId: investment.investorId,
          investorName: investor.name,
          investorEmail: investor.email,
          investmentId: investment.id,
          offerId: investment.offerId,
          offerName: investment.offer?.offerName || investment.assetCode,
          usdcAmount: investment.usdcAmount?.toString(),
          usdcPaymentHash: payment.transaction_hash,
        }
      );

      // Handle pending multisig (distribution queued for admin signing)
      if (stellarResult.status === 'pending_multisig') {
        log.info(`Distribution for investment ${investment.id} queued for multisig (TX #${stellarResult.multiSigTransactionId}, step: ${stellarResult.step})`);
        await Investment.updateStatus(investment.id, {
          status: 'pending_distribution',
          // Store the multisig TX ID for linking when the TX is signed
          error_message: JSON.stringify({
            multiSigTransactionId: stellarResult.multiSigTransactionId,
            step: stellarResult.step,
            message: stellarResult.message,
          }),
        });
        return; // Email and distribution record created in post-sign hook
      }

      // Criar distribuição (com verificação de idempotência interna)
      const distribution = await Token.createDistribution({
        investorId: investment.investorId,
        assetCode: investment.assetCode,
        amount: investment.tokenAmount,
        transactionHash: stellarResult.transactionHash,
        usdcPaymentHash: payment.transaction_hash,
        offerId: investment.offerId,
        memo,
      });

      // Atualizar investment com hash da distribuição
      await Investment.updateStatus(investment.id, {
        status: 'distributed',
        distribution_tx_hash: stellarResult.transactionHash,
      });

      log.info(`Successfully processed investment ${investment.id}: distributed ${investment.tokenAmount} tokens`);

      // Enviar email de confirmação para investidor
      await EmailService.sendInvestmentConfirmation(investor.email, investment, distribution);

    } catch (error) {
      log.error(`Error processing investment ${investment.id}:`, error);

      // Try distribution queue as fallback (has 3x retry with backoff)
      try {
        const { addDistributionJob, isQueueAvailable } = await import('./distributionQueue.service.js');
        if (isQueueAvailable()) {
          const investor = await Investor.findById(investment.investorId);
          const targetWallet = investor?.stellarContractId || investor?.stellarPublicKey;
          if (targetWallet) {
            log.info(`Queueing investment ${investment.id} for retry via distribution queue...`);
            await addDistributionJob({
              investmentId: investment.id,
              investorPublicKey: targetWallet,
              assetCode: investment.assetCode,
              amount: investment.tokenAmount.toString(),
            });
            // Don't mark as failed — queue will handle it
            return;
          }
        }
      } catch (queueError) {
        log.warn(`Distribution queue fallback failed for investment ${investment.id}: ${queueError.message}`);
      }

      // If queue is not available, mark as failed
      await Investment.updateStatus(investment.id, {
        status: 'failed',
        error_message: error.message,
      });

      // Alertar equipe sobre falha
      const { AlertService } = await import('./alert.service.js');
      await AlertService.distributionFailed(investment.id, error.message, 1);
    }
  }

  /**
   * Para o monitoramento de pagamentos
   */
  stop() {
    log.info('Stopping...');
    this.isRunning = false;

    if (this.connectionStabilityTimer) {
      clearTimeout(this.connectionStabilityTimer);
      this.connectionStabilityTimer = null;
    }

    if (this.stream) {
      try {
        this.stream();
      } catch (error) {
        log.error('Error stopping stream:', error);
      }
      this.stream = null;
    }

    log.info('Stopped');
  }

  /**
   * Verifica se o monitoramento está ativo
   * @returns {boolean} True se está rodando
   */
  isActive() {
    return this.isRunning;
  }
}

// Singleton instance
let paymentMonitorInstance = null;

/**
 * Obtém instância singleton do PaymentMonitor
 * @returns {PaymentMonitor} Instância do monitor
 */
export function getPaymentMonitor() {
  if (!paymentMonitorInstance) {
    paymentMonitorInstance = new PaymentMonitor();
  }
  return paymentMonitorInstance;
}

