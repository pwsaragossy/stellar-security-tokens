import { stellarServer } from '../config/stellar.js';
import { getTreasuryKeypair } from '../config/stellar.js';
import { Investment } from '../models/Investment.js';
import { Investor } from '../models/Investor.js';
import { StellarService } from './stellar.service.js';
import { Token } from '../models/Token.js';
import crypto from 'crypto';

const USDC_ISSUER = process.env.USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
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
      this.stream = stellarServer
        .payments()
        .forAccount(this.treasuryPublicKey)
        .cursor('now')
        .stream({
          onmessage: async (payment) => {
            try {
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
      this.reconnectAttempts = 0; // Reset contador após sucesso
    } catch (error) {
      console.error('[PaymentMonitor] Failed to start stream:', error);
      this.handleStreamError(error);
    }
  }

  /**
   * Trata erros do stream e reconecta
   * @private
   */
  async handleStreamError(error) {
    if (!this.isRunning) {
      return; // Não reconectar se foi parado manualmente
    }

    this.reconnectAttempts++;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[PaymentMonitor] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping.`);
      this.isRunning = false;
      const { AlertService } = await import('./alert.service.js');
      await AlertService.paymentMonitorFailed(`Max reconnection attempts reached: ${error.message}`);
      return;
    }

    const delay = RECONNECT_DELAY * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5)); // Exponential backoff, max 5s * 2^5
    console.log(`[PaymentMonitor] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      if (this.isRunning) {
        this.startStream();
      }
    }, delay);
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

    console.log(`[PaymentMonitor] USDC payment detected: ${payment.amount} from ${payment.from}`);

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

      // TODO: Enviar email de confirmação para investidor
      // await EmailService.sendInvestmentConfirmation(investor.email, investment, distribution);

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

