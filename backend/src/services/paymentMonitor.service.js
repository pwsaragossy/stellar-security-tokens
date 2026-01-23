import { stellarServer } from '../config/stellar.js';
import { getTreasuryKeypair } from '../config/stellar.js';
import { Investment } from '../models/Investment.js';
import { Investor } from '../models/Investor.js';
import { StellarService } from './stellar.service.js';
import { Token } from '../models/Token.js';
import { EmailService } from './email.service.js';
import { DepositRelayService } from './depositRelay.service.js';
import crypto from 'crypto';

// Issue 10 Fix: Require USDC_ISSUER from environment (no hardcoded fallback)
const USDC_ISSUER = process.env.USDC_ISSUER;
if (!USDC_ISSUER) {
  console.warn('[PaymentMonitor] USDC_ISSUER not configured. Payment monitoring may not work correctly.');
}
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
        console.log('[PaymentMonitor] Already running');
        return;
      }

      const treasuryKeypair = getTreasuryKeypair();
      this.treasuryPublicKey = treasuryPublicKey || treasuryKeypair.publicKey();

      console.log(`[PaymentMonitor] Starting monitoring for treasury: ${this.treasuryPublicKey}`);

      this.isRunning = true;
      this.reconnectAttempts = 0;

      await this.startStream();
    } catch (error) {
      console.error('[PaymentMonitor] Failed to start:', error);
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

      console.log(`[PaymentMonitor] Starting stream with cursor: ${this.lastCursor}`);

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
              console.error('[PaymentMonitor] Error handling payment:', error);
            }
          },
          onerror: (error) => {
            console.error('[PaymentMonitor] Stream error:', error);
            this.handleStreamError(error);
          },
        });

      console.log('[PaymentMonitor] Stream started successfully');

      // Do NOT reset reconnectAttempts immediately.
      // Reset it only if the connection stays alive for a while (e.g., 60s)
      if (this.connectionStabilityTimer) clearTimeout(this.connectionStabilityTimer);
      this.connectionStabilityTimer = setTimeout(() => {
        if (this.isRunning) {
          console.log('[PaymentMonitor] Connection stable for 60s. Resetting reconnection attempts.');
          this.reconnectAttempts = 0;
        }
      }, 60000);

    } catch (error) {
      console.error('[PaymentMonitor] Failed to start stream:', error);
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
        console.error('[PaymentMonitor] Error closing stream during error handling:', e);
      }
      this.stream = null;
    }

    if (!this.isRunning) {
      return; // Do not reconnect if manually stopped
    }

    // Guard against multiple simultaneous reconnect attempts from EventSource firing onerror multiple times
    if (this.isReconnecting) {
      console.log('[PaymentMonitor] Reconnection already in progress, ignoring duplicate error.');
      return;
    }
    this.isReconnecting = true;

    this.reconnectAttempts++;

    // Detectar erro 429 (rate limit) do Horizon
    const isRateLimitError = this.isRateLimitError(error);

    // Detectar erro 404 (account not found) - comum em testnet quando treasury não existe
    const isAccountNotFound = this.isAccountNotFoundError(error);

    if (isAccountNotFound) {
      console.warn(`[PaymentMonitor] Treasury account not found on Stellar network (404). The account may not be funded yet.`);
      console.warn(`[PaymentMonitor] Payment monitoring disabled until treasury account exists. Will retry in 5 minutes.`);
      this.isRunning = false;
      // Schedule a retry in 5 minutes to check if account was created
      setTimeout(() => {
        console.log('[PaymentMonitor] Retrying to start after account not found...');
        this.isRunning = true;
        this.reconnectAttempts = 0;
        this.startStream();
      }, 5 * 60 * 1000);
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[PaymentMonitor] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping.`);
      this.isRunning = false;
      const { AlertService } = await import('./alert.service.js');
      await AlertService.paymentMonitorFailed(`Max reconnection attempts reached: ${error.message}`);
      return;
    }

    // Use longer backoff for rate limit errors (30s base vs 5s default)
    const baseDelay = isRateLimitError ? 30000 : RECONNECT_DELAY;
    const delay = baseDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 4)); // Max 4 doublings

    if (isRateLimitError) {
      console.warn(`[PaymentMonitor] Rate limited by Horizon (429). Backing off for ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    } else {
      console.log(`[PaymentMonitor] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
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
    // Filtrar apenas pagamentos USDC
    if (payment.type !== 'payment') {
      return;
    }

    if (payment.asset_code !== USDC_ASSET_CODE || payment.asset_issuer !== USDC_ISSUER) {
      return;
    }

    // Verificar se é pagamento para treasury
    if (payment.to !== this.treasuryPublicKey) {
      return;
    }

    console.log(`[PaymentMonitor] USDC payment detected: ${payment.amount} from ${payment.from}, memo: ${payment.memo}`);

    // Check if it's a deposit relay payment (memo starts with DEP-)
    if (payment.memo && payment.memo.startsWith(DepositRelayService.MEMO_PREFIX)) {
      await DepositRelayService.handleIncomingPayment(
        payment.memo,
        payment.amount,
        payment.transaction_hash
      );
      return;
    }

    // Buscar investimento pendente correspondente
    const pendingInvestments = await Investment.findPendingByInvestor(
      payment.from,
      payment.amount,
      2 // 2 minutos de janela
    );

    if (pendingInvestments.length === 0) {
      console.warn(`[PaymentMonitor] No pending investment found for payment ${payment.transaction_hash} from ${payment.from}`);
      return;
    }

    // Processar primeiro investimento encontrado (mais recente)
    const investment = pendingInvestments[0];

    // Verificar se já foi processado (idempotência)
    if (investment.usdcPaymentHash === payment.transaction_hash) {
      console.log(`[PaymentMonitor] Investment ${investment.id} already processed for payment ${payment.transaction_hash}`);
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
      console.log(`[PaymentMonitor] Processing investment ${investment.id} for payment ${payment.transaction_hash}`);

      // Verificar idempotência: se já existe distribuição para este pagamento
      const existingDistribution = await Token.findDistributionByUSDC(payment.transaction_hash);

      if (existingDistribution) {
        console.log(`[PaymentMonitor] Distribution already exists for payment ${payment.transaction_hash}`);
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

      console.log(`[PaymentMonitor] Distributing ${investment.tokenAmount} tokens to ${investor.stellarContractId}`);
      // Verificar KYC
      if (investor.kycStatus !== 'approved') {
        throw new Error(`Investor ${investment.investorId} KYC not approved`);
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
        investor.stellarContractId,  // Smart wallet address
        investment.tokenAmount.toString(),
        investment.assetCode,
        { memo }
      );

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

      console.log(`[PaymentMonitor] Successfully processed investment ${investment.id}: distributed ${investment.tokenAmount} tokens`);


      // Enviar email de confirmação para investidor
      await EmailService.sendInvestmentConfirmation(investor.email, investment, distribution);

    } catch (error) {
      console.error(`[PaymentMonitor] Error processing investment ${investment.id}:`, error);

      // Marcar investment como failed
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
    console.log('[PaymentMonitor] Stopping...');
    this.isRunning = false;

    if (this.connectionStabilityTimer) {
      clearTimeout(this.connectionStabilityTimer);
      this.connectionStabilityTimer = null;
    }

    if (this.stream) {
      try {
        this.stream();
      } catch (error) {
        console.error('[PaymentMonitor] Error stopping stream:', error);
      }
      this.stream = null;
    }

    console.log('[PaymentMonitor] Stopped');
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

