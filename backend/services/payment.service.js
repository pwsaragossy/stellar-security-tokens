import prisma from '../config/prisma.js';
import { Investor } from '../models/Investor.js';
import { Token } from '../models/Token.js';
import { Offer } from '../models/Offer.js';
import { StellarService } from './stellar.service.js';
import { EmailService } from './email.service.js';
import {
  stellarServer,
  getDistributorKeypair,
  buildTransaction,
  signAndSubmitTransaction,
} from '../config/stellar.js';
import { Operation, Asset } from '@stellar/stellar-sdk';
import cron from 'node-cron';

const USDC_ISSUER = process.env.USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const USDC_ASSET_CODE = 'USDC';
const DEFAULT_ANNUAL_INTEREST_RATE = 10.0; // Fallback se não encontrar no banco
const MAX_OPERATIONS_PER_TX = 95; // Buffer de segurança (Stellar limit is 100)

const logger = {
  info: (message, data = {}) => {
    console.log(`[PAYMENT SERVICE] [INFO] ${new Date().toISOString()} - ${message}`, data);
  },
  error: (message, error = {}) => {
    console.error(`[PAYMENT SERVICE] [ERROR] ${new Date().toISOString()} - ${message}`, error);
  },
  warn: (message, data = {}) => {
    console.warn(`[PAYMENT SERVICE] [WARN] ${new Date().toISOString()} - ${message}`, data);
  },
};

/**
 * Aguarda um período de tempo especificado
 * @param {number} ms - Milissegundos a aguardar
 * @returns {Promise<void>} Promise que resolve após o tempo especificado
 * @private
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executa uma operação com retry e backoff exponencial
 * @param {Function} operation - Função assíncrona a ser executada
 * @param {number} [maxRetries=3] - Número máximo de tentativas
 * @param {number} [delayMs=1000] - Delay inicial em milissegundos
 * @returns {Promise<any>} Resultado da operação
 * @throws {Error} Último erro se todas as tentativas falharem
 * @private
 */
const retryOperation = async (operation, maxRetries = 3, delayMs = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Attempt ${attempt}/${maxRetries}`, { operation: operation.name });
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn(`Attempt ${attempt} failed`, { error: error.message });
      
      if (attempt < maxRetries) {
        const backoffDelay = delayMs * Math.pow(2, attempt - 1);
        logger.info(`Retrying in ${backoffDelay}ms...`);
        await sleep(backoffDelay);
      }
    }
  }
  
  throw lastError;
};

/**
 * Serviço para processamento automático de pagamentos de juros mensais
 * Calcula juros proporcionais, cria transações batch no Stellar e envia confirmações por email
 */
export class PaymentService {
  /**
   * Busca lista de investidores aprovados com saldos de tokens do banco de dados
   * @param {string} [assetCode='SIN01'] - Código do asset a consultar
   * @returns {Promise<Object>} Objeto com investidores e taxa de juros
   * @returns {Array} returns.investors - Array de investidores com saldos
   * @returns {number} returns.annualInterestRate - Taxa de juros anual do token
   * @returns {number} returns.investors[].id - ID do investidor
   * @returns {string} returns.investors[].name - Nome do investidor
   * @returns {string} returns.investors[].email - Email do investidor
   * @returns {string} returns.investors[].stellar_public_key - Chave pública Stellar
   * @returns {string} returns.investors[].kyc_status - Status KYC (deve ser 'approved')
   * @returns {string} returns.investors[].token_balance - Saldo de tokens (soma de distribuições)
   * @throws {Error} Se houver erro ao consultar o banco de dados
   */
  static async getInvestorsWithBalances(assetCode = 'SIN01', offerId = null) {
    try {
      logger.info('Fetching investors with balances', { assetCode, offerId });

      // Buscar taxa de juros do token
      const where = { assetCode };
      if (offerId) {
        where.offerId = offerId;
      }
      
      const token = await prisma.token.findFirst({ where });
      
      const annualInterestRate = token?.annualInterestRate 
        ? parseFloat(token.annualInterestRate) 
        : DEFAULT_ANNUAL_INTEREST_RATE;

      logger.info(`Token interest rate: ${annualInterestRate}%`, { assetCode });

      // Buscar investidores com saldos usando Prisma
      const distributionWhere = { assetCode };
      if (offerId) {
        distributionWhere.offerId = offerId;
      }

      const distributions = await prisma.tokenDistribution.groupBy({
        by: ['investorId'],
        where: distributionWhere,
        _sum: {
          amount: true,
        },
      });

      const investorIds = distributions
        .filter(d => Number(d._sum.amount) > 0)
        .map(d => d.investorId);

      const investors = await prisma.investor.findMany({
        where: {
          id: { in: investorIds },
          kycStatus: 'approved',
          stellarPublicKey: { not: null },
        },
        select: {
          id: true,
          name: true,
          email: true,
          stellarPublicKey: true,
          kycStatus: true,
        },
        orderBy: { id: 'asc' },
      });

      // Adicionar saldos aos investidores
      const investorsWithBalances = investors.map(investor => {
        const distribution = distributions.find(d => d.investorId === investor.id);
        return {
          ...investor,
          stellar_public_key: investor.stellarPublicKey,
          kyc_status: investor.kycStatus,
          token_balance: distribution ? distribution._sum.amount.toString() : '0',
        };
      });

      logger.info(`Found ${investorsWithBalances.length} investors with balances`);
      return {
        investors: investorsWithBalances,
        annualInterestRate
      };
    } catch (error) {
      logger.error('Error fetching investors with balances', error);
      throw new Error(`Failed to fetch investors: ${error.message}`);
    }
  }

  /**
   * Calcula juros mensais proporcionais baseado na taxa anual configurada
   * Taxa mensal = (taxa_anual% / 12) / 100
   * @param {number|string} tokenBalance - Saldo de tokens do investidor
   * @param {number} [annualInterestRate=DEFAULT_ANNUAL_INTEREST_RATE] - Taxa de juros anual (padrão: 10%)
   * @returns {number} Valor do juro mensal calculado (7 casas decimais) ou 0 se saldo <= 0
   */
  static calculateMonthlyInterest(tokenBalance, annualInterestRate = DEFAULT_ANNUAL_INTEREST_RATE) {
    const balance = parseFloat(tokenBalance);
    if (balance <= 0) {
      return 0;
    }
    
    const monthlyInterestRate = annualInterestRate / 12 / 100;
    const monthlyInterest = balance * monthlyInterestRate;
    return parseFloat(monthlyInterest.toFixed(7));
  }

  /**
   * Cria uma única transação Stellar com múltiplas operações de pagamento USDC
   * Todas as operações são incluídas em uma única transação para eficiência
   * @param {Array} investors - Array de investidores com stellar_public_key
   * @param {Array} payments - Array de objetos de pagamento
   * @param {number} payments[].investorId - ID do investidor
   * @param {number|string} payments[].usdcAmount - Valor em USDC a pagar
   * @returns {Promise<Object>} Resultado da transação batch
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {string} returns.transactionHash - Hash da transação Stellar
   * @returns {number} returns.ledger - Número do ledger
   * @returns {number} returns.operationCount - Número de operações incluídas
   * @throws {Error} Se não houver operações válidas ou se a transação falhar
   */
  static async createBatchUSDCPayment(investors, payments) {
    try {
      logger.info('Creating batch USDC payment transaction', { 
        investorCount: investors.length,
        paymentCount: payments.length 
      });

      const distributorKeypair = getDistributorKeypair();
      const distributorAccount = await stellarServer.loadAccount(distributorKeypair.publicKey());
      
      // Verificar liquidez USDC antes de criar operações
      const usdcBalance = distributorAccount.balances.find(
        b => b.asset_code === USDC_ASSET_CODE && b.asset_issuer === USDC_ISSUER
      );
      
      const totalNeeded = payments.reduce((sum, p) => sum + parseFloat(p.usdcAmount), 0);
      
      if (!usdcBalance || parseFloat(usdcBalance.balance) < totalNeeded) {
        const available = usdcBalance ? parseFloat(usdcBalance.balance) : 0;
        logger.error('Insufficient USDC liquidity', {
          required: totalNeeded,
          available: available,
          shortfall: totalNeeded - available
        });
        throw new Error(
          `Insufficient USDC liquidity. Required: ${totalNeeded}, Available: ${available}`
        );
      }
      
      logger.info('USDC liquidity verified', {
        available: parseFloat(usdcBalance.balance),
        required: totalNeeded,
        remaining: parseFloat(usdcBalance.balance) - totalNeeded
      });
      
      const usdcAsset = new Asset(USDC_ASSET_CODE, USDC_ISSUER);
      
      // Preparar operações válidas
      const validPayments = [];
      for (const payment of payments) {
        const investor = investors.find(inv => inv.id === payment.investorId);
        if (!investor || !investor.stellar_public_key) {
          logger.warn('Skipping payment - investor not found or missing public key', { 
            investorId: payment.investorId 
          });
          continue;
        }
        validPayments.push({ payment, investor });
      }

      if (validPayments.length === 0) {
        throw new Error('No valid operations to execute');
      }

      // Dividir em batches se necessário
      const batches = [];
      for (let i = 0; i < validPayments.length; i += MAX_OPERATIONS_PER_TX) {
        batches.push(validPayments.slice(i, i + MAX_OPERATIONS_PER_TX));
      }

      logger.info(`Processing ${validPayments.length} payments in ${batches.length} batch(es)`, {
        totalPayments: validPayments.length,
        batchCount: batches.length,
        maxOperationsPerBatch: MAX_OPERATIONS_PER_TX
      });

      const results = [];
      
      // Processar batches sequencialmente
      for (const [index, batch] of batches.entries()) {
        logger.info(`Processing batch ${index + 1}/${batches.length} with ${batch.length} operations`);
        
        const operations = batch.map(({ payment, investor }) =>
          Operation.payment({
            destination: investor.stellar_public_key,
            asset: usdcAsset,
            amount: payment.usdcAmount.toString(),
            source: distributorKeypair.publicKey(),
          })
        );

        const transaction = await buildTransaction(distributorKeypair, operations);
        const result = await signAndSubmitTransaction(transaction, distributorKeypair);

        if (!result.success) {
          throw new Error(`Batch ${index + 1} payment failed: ${result.error}`);
        }

        logger.info(`Batch ${index + 1} payment transaction submitted successfully`, {
          batchIndex: index,
          transactionHash: result.hash,
          ledger: result.ledger,
          operationCount: operations.length,
        });

        results.push({
          batchIndex: index,
          transactionHash: result.hash,
          ledger: result.ledger,
          operationsCount: operations.length,
        });

        // Pequeno delay entre batches para evitar problemas de sequence number
        if (index < batches.length - 1) {
          await sleep(500);
        }
      }

      return {
        success: true,
        transactionHash: results[0].transactionHash, // Primeira transação para compatibilidade
        ledger: results[0].ledger,
        operationCount: validPayments.length,
        batches: results,
      };
    } catch (error) {
      logger.error('Error creating batch USDC payment', error);
      throw new Error(`Batch payment creation failed: ${error.message}`);
    }
  }

  /**
   * Registra pagamentos de juros no banco de dados dentro de uma transação
   * Usa transação SQL para garantir atomicidade
   * @param {Array} payments - Array de objetos de pagamento com todos os dados
   * @param {string} transactionHash - Hash da transação Stellar
   * @param {string} paymentDate - Data do pagamento (formato YYYY-MM-DD)
   * @returns {Promise<Object>} Resultado do registro
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {number} returns.recorded - Número de pagamentos registrados
   * @throws {Error} Se houver erro ao registrar (faz rollback automático)
   */
  static async recordInterestPayments(payments, transactionHash, paymentDate) {
    try {
      logger.info('Recording interest payments in database', { 
        paymentCount: payments.length,
        transactionHash 
      });

      // Use Prisma transaction for atomicity
      await prisma.$transaction(async (tx) => {
        for (const payment of payments) {
          await tx.interestPayment.create({
            data: {
              investorId: payment.investorId,
              assetCode: payment.assetCode,
              tokenBalance: payment.tokenBalance,
              interestRate: payment.interestRate || DEFAULT_ANNUAL_INTEREST_RATE,
              interestAmount: payment.interestAmount,
              usdcAmount: payment.usdcAmount,
              transactionHash,
              paymentDate: new Date(paymentDate),
              status: 'completed',
              offerId: payment.offerId || null,
            },
          });
        }
      });

      logger.info('Interest payments recorded successfully');
      return { success: true, recorded: payments.length };
    } catch (error) {
      logger.error('Error recording interest payments', error);
      throw new Error(`Failed to record payments: ${error.message}`);
    }
  }

  /**
   * Envia emails de confirmação de pagamento para todos os investidores
   * Usa retry logic e atualiza status no banco após envio
   * @param {Array} investors - Array de investidores com email
   * @param {Array} payments - Array de objetos de pagamento
   * @param {string} transactionHash - Hash da transação Stellar
   * @param {string} paymentDate - Data do pagamento
   * @returns {Promise<Array>} Array de resultados de envio de email
   * @returns {number} returns[].investorId - ID do investidor
   * @returns {string} returns[].email - Email do investidor
   * @returns {boolean} returns[].success - Indica sucesso no envio
   * @returns {string} [returns[].error] - Mensagem de erro (se falhou)
   */
  static async sendConfirmationEmails(investors, payments, transactionHash, paymentDate) {
    logger.info('Sending confirmation emails', { investorCount: investors.length });

    const emailResults = [];

    for (const payment of payments) {
      const investor = investors.find(inv => inv.id === payment.investorId);
      if (!investor || !investor.email) {
        logger.warn('Skipping email - investor not found or missing email', {
          investorId: payment.investorId,
        });
        continue;
      }

      try {
        const emailResult = await retryOperation(
          () => EmailService.sendInterestPaymentConfirmation(
            investor.email,
            investor.name,
            payment.usdcAmount,
            transactionHash,
            paymentDate
          ),
          3,
          2000
        );

        await prisma.interestPayment.updateMany({
          where: {
            investorId: payment.investorId,
            transactionHash,
          },
          data: {
            emailSent: true,
            emailSentAt: new Date(),
          },
        });

        emailResults.push({
          investorId: payment.investorId,
          email: investor.email,
          success: true,
        });

        logger.info('Email sent successfully', { investorId: investor.id, email: investor.email });
        
        await sleep(500);
      } catch (error) {
        logger.error('Failed to send email', {
          investorId: investor.id,
          email: investor.email,
          error: error.message,
        });

        await prisma.interestPayment.updateMany({
          where: {
            investorId: payment.investorId,
            transactionHash,
          },
          data: {
            errorMessage: error.message,
            retryCount: { increment: 1 },
          },
        });

        emailResults.push({
          investorId: payment.investorId,
          email: investor.email,
          success: false,
          error: error.message,
        });
      }
    }

    return emailResults;
  }

  /**
   * Processa pagamento automático de juros mensais para todos os investidores
   * Fluxo completo: busca investidores → calcula juros → cria transação batch → registra no DB → envia emails
   * @param {string} [assetCode='SIN01'] - Código do asset a processar
   * @returns {Promise<Object>} Resultado completo do processamento
   * @returns {boolean} returns.success - Indica sucesso geral
   * @returns {string} returns.paymentDate - Data do pagamento (YYYY-MM-DD)
   * @returns {string} returns.transactionHash - Hash da transação Stellar
   * @returns {number} returns.ledger - Número do ledger
   * @returns {number} returns.paymentsProcessed - Número de pagamentos processados
   * @returns {number} returns.totalInterestAmount - Total de juros pagos
   * @returns {number} returns.emailsSent - Número de emails enviados com sucesso
   * @returns {number} returns.emailsFailed - Número de emails que falharam
   * @returns {string} returns.duration - Duração do processamento em milissegundos
   * @throws {Error} Se houver erro em qualquer etapa do processo
   */
  static async processMonthlyInterestPayments(assetCode = 'SIN01') {
    const startTime = Date.now();
    const paymentDate = new Date().toISOString().split('T')[0];
    
    logger.info('Starting monthly interest payment process', { assetCode, paymentDate });

    try {
      const result = await retryOperation(
        () => this.getInvestorsWithBalances(assetCode),
        3
      );

      const { investors, annualInterestRate } = result;

      if (investors.length === 0) {
        logger.warn('No investors found with balances');
        return {
          success: true,
          message: 'No investors to process',
          processed: 0,
        };
      }

      logger.info(`Processing payments for ${investors.length} investors with ${annualInterestRate}% annual rate`);

      // Buscar offer_id do token se existir
      const token = await Token.findByAssetCode(assetCode);
      const offerId = token?.offer_id || null;

      const payments = [];
      for (const investor of investors) {
        const tokenBalance = parseFloat(investor.token_balance);
        const interestAmount = this.calculateMonthlyInterest(tokenBalance, annualInterestRate);
        
        if (interestAmount <= 0) {
          logger.warn('Skipping investor - zero interest', { investorId: investor.id });
          continue;
        }

        payments.push({
          investorId: investor.id,
          assetCode,
          tokenBalance: tokenBalance.toString(),
          interestRate: annualInterestRate.toString(),
          interestAmount: interestAmount.toString(),
          usdcAmount: interestAmount.toString(),
          offerId,
        });
      }

      if (payments.length === 0) {
        logger.warn('No payments to process');
        return {
          success: true,
          message: 'No payments to process',
          processed: 0,
        };
      }

      logger.info(`Calculated ${payments.length} interest payments`);

      const batchResult = await retryOperation(
        () => this.createBatchUSDCPayment(investors, payments),
        3,
        2000
      );

      // Registrar pagamentos - se houver múltiplas transações (batches), registrar todas
      if (batchResult.batches && batchResult.batches.length > 1) {
        // Dividir payments por batch para registrar com hash correto
        let paymentIndex = 0;
        for (const batch of batchResult.batches) {
          const batchPayments = payments.slice(
            paymentIndex,
            paymentIndex + batch.operationsCount
          );
          await retryOperation(
            () => this.recordInterestPayments(batchPayments, batch.transactionHash, paymentDate),
            3
          );
          paymentIndex += batch.operationsCount;
        }
      } else {
        // Caso único batch (compatibilidade)
        await retryOperation(
          () => this.recordInterestPayments(payments, batchResult.transactionHash, paymentDate),
          3
        );
      }

      const emailResults = await this.sendConfirmationEmails(
        investors,
        payments,
        batchResult.transactionHash, // Usar primeira transação para emails
        paymentDate
      );

      const successfulEmails = emailResults.filter(r => r.success).length;
      const failedEmails = emailResults.filter(r => !r.success).length;

      const duration = Date.now() - startTime;

      logger.info('Monthly interest payment process completed', {
        duration: `${duration}ms`,
        paymentsProcessed: payments.length,
        transactionHash: batchResult.transactionHash,
        emailsSent: successfulEmails,
        emailsFailed: failedEmails,
      });

      return {
        success: true,
        paymentDate,
        transactionHash: batchResult.transactionHash,
        ledger: batchResult.ledger,
        paymentsProcessed: payments.length,
        totalInterestAmount: payments.reduce((sum, p) => sum + parseFloat(p.interestAmount), 0),
        emailsSent: successfulEmails,
        emailsFailed: failedEmails,
        duration: `${duration}ms`,
      };
    } catch (error) {
      logger.error('Monthly interest payment process failed', error);
      
      // Log error payment record (investor_id can be null for system errors)
      await prisma.interestPayment.create({
        data: {
          investorId: 0, // Placeholder for system errors
          assetCode,
          tokenBalance: 0,
          interestRate: 0,
          interestAmount: 0,
          usdcAmount: 0,
          transactionHash: `error-${Date.now()}`,
          paymentDate: new Date(paymentDate),
          status: 'failed',
          errorMessage: error.message,
        },
      });

      throw new Error(`Monthly interest payment process failed: ${error.message}`);
    }
  }

  /**
   * Agenda execução automática mensal usando node-cron
   * Executa no dia 1 de cada mês às 00:00 UTC
   * @param {string} [assetCode='SIN01'] - Código do asset a processar
   * @returns {Object} Job do cron para controle (start/stop)
   */
  static scheduleMonthlyPayments(assetCode = 'SIN01') {
    logger.info('Scheduling monthly interest payments', {
      schedule: '0 0 1 * *',
      assetCode,
    });

    const job = cron.schedule('0 0 1 * *', async () => {
      logger.info('Scheduled monthly payment job triggered');
      try {
        await this.processMonthlyInterestPayments(assetCode);
      } catch (error) {
        logger.error('Scheduled monthly payment job failed', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC',
    });

    logger.info('Monthly payment schedule activated');
    return job;
  }

  /**
   * Distribui tokens para um investidor específico
   * Verifica KYC e chave pública antes de distribuir
   * @param {number} investorId - ID do investidor
   * @param {string} assetCode - Código do asset a distribuir
   * @param {number|string} amount - Quantidade de tokens
   * @returns {Promise<Object>} Resultado da distribuição
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {Object} returns.distribution - Registro da distribuição no DB
   * @returns {string} returns.transactionHash - Hash da transação Stellar
   * @returns {number} returns.ledger - Número do ledger
   * @throws {Error} Se investidor não encontrado, KYC não aprovado ou token não existir
   */
  static async distributeTokensToInvestor(investorId, assetCode, amount) {
    try {
      const investor = await Investor.findById(investorId);
      
      if (!investor) {
        throw new Error('Investor not found');
      }

      if (!investor.stellar_public_key) {
        throw new Error('Investor does not have a Stellar public key configured');
      }

      if (investor.kyc_status !== 'approved') {
        throw new Error('Investor KYC status must be approved to receive tokens');
      }

      const token = await Token.findByAssetCode(assetCode);
      if (!token) {
        throw new Error('Token not found');
      }

      const stellarResult = await StellarService.distributeTokens(
        assetCode,
        investor.stellar_public_key,
        amount
      );

      const distribution = await Token.createDistribution({
        investorId,
        assetCode,
        amount,
        transactionHash: stellarResult.transactionHash,
        memo: null, // Memo não usado em pagamentos de juros
      });

      return {
        success: true,
        distribution,
        transactionHash: stellarResult.transactionHash,
        ledger: stellarResult.ledger,
      };
    } catch (error) {
      logger.error('Error distributing tokens', error);
      throw new Error(`Token distribution failed: ${error.message}`);
    }
  }

  /**
   * Obtém histórico completo de pagamentos de um investidor
   * Inclui distribuições de tokens e pagamentos de juros
   * @param {number} investorId - ID do investidor
   * @returns {Promise<Object>} Histórico completo de pagamentos
   * @returns {number} returns.investorId - ID do investidor
   * @returns {Array} returns.tokenDistributions - Array de distribuições de tokens
   * @returns {Array} returns.interestPayments - Array de pagamentos de juros
   * @returns {number} returns.totalPayments - Total de pagamentos (distribuições + juros)
   * @throws {Error} Se houver erro ao consultar o banco de dados
   */
  static async getPaymentHistory(investorId) {
    try {
      const distributions = await Token.getDistributionsByInvestor(investorId);
      const interestPayments = await prisma.interestPayment.findMany({
        where: { investorId },
        orderBy: [
          { paymentDate: 'desc' },
          { createdAt: 'desc' },
        ],
      });
      
      return {
        investorId,
        tokenDistributions: distributions,
        interestPayments,
        totalPayments: distributions.length + interestPayments.length,
      };
    } catch (error) {
      logger.error('Error getting payment history', error);
      throw new Error(`Failed to get payment history: ${error.message}`);
    }
  }
}
