import prisma from '../config/prisma.js';
import { Investor } from '../models/Investor.js';
import { Token } from '../models/Token.js';
import { Offer } from '../models/Offer.js';
import { StellarService } from './stellar.service.js';
import { EmailService } from './email.service.js';
import { ConfigService } from './config.service.js';
import {
  stellarServer,
  buildTransactionWithAccount,
  getSorobanRpcUrl,
  getUsdcIssuer,
} from '../config/stellar.js';
import { keyManager } from './KeyManager.js';
import { TransactionManager } from './transactionManager.service.js';
import { Operation, Asset, rpc, scValToNative, Address } from '@stellar/stellar-sdk';
import cron from 'node-cron';
import logger from '../utils/logger.js';
const log = logger.scope('PaymentService');

const DEFAULT_ANNUAL_INTEREST_RATE = 10.0; // Fallback se não encontrar no banco
const MAX_OPERATIONS_PER_TX = 95; // Buffer de segurança (Stellar limit is 100)

// Balance source types for dividend calculations
const BALANCE_SOURCE = {
  DATABASE: 'database',      // Token is locked, DB is source of truth
  ON_CHAIN: 'on_chain',       // Token is unlocked, ledger is source of truth
};

/**
 * Gets the USDC configuration
 * Uses centralized getUsdcIssuer() for automatic testnet/mainnet detection
 * @returns {Promise<{issuer: string, code: string}>}
 */
const getUSDCConfig = async () => {
  const issuer = getUsdcIssuer();
  const code = await ConfigService.get('USDC_ASSET_CODE', 'USDC');
  return { issuer, code };
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
   * Determines the balance source for dividend calculations.
   * 
   * - LOCKED tokens: DB is source of truth (all transfers controlled by platform)
   * - UNLOCKED tokens: Ledger is source of truth (free trading on DEXes)
   * 
   * @param {Object} offer - Offer with isTokenLocked field
   * @returns {string} BALANCE_SOURCE.DATABASE or BALANCE_SOURCE.ON_CHAIN
   */
  static getBalanceSource(offer) {
    // If token is locked, platform controls all transfers → DB is accurate
    // If token is unlocked, DEX trades can move tokens → must query ledger
    if (offer.isTokenLocked === false) {
      return BALANCE_SOURCE.ON_CHAIN;
    }
    return BALANCE_SOURCE.DATABASE;
  }

  /**
   * Query on-chain token balance for a given investor/wallet on a SAC (Stellar Asset Contract).
   * 
   * Uses Soroban RPC to query the SAC's balance function directly.
   * 
   * @param {string} assetCode - The token asset code
   * @param {string} investorAddress - Investor's wallet address (G... or C...)
   * @returns {Promise<string>} Token balance as string (7 decimal precision)
   */
  static async getOnChainTokenBalance(assetCode, investorAddress) {
    try {
      const sorobanUrl = getSorobanRpcUrl();
      const sorobanServer = new rpc.Server(sorobanUrl);

      // Get the SAC contract ID for this asset
      const issuerPublicKey = keyManager.getIssuerPublicKey();
      const asset = new Asset(assetCode, issuerPublicKey);
      const sacContractId = StellarService.getSACContractId(asset);

      // Convert investor address to ScVal
      const addressScVal = new Address(investorAddress).toScVal();

      // Build the balance query
      const balanceKey = {
        type: 'LedgerKeyContractData',
        contract: sacContractId,
        key: {
          vec: [
            { sym: 'Balance' },
            addressScVal
          ]
        },
        durability: 'persistent'
      };

      // Query the ledger
      const result = await sorobanServer.getContractData(
        sacContractId,
        addressScVal,
        'persistent'
      );

      if (!result || !result.val) {
        return '0'; // No balance entry = 0 tokens
      }

      // Parse the balance from ScVal
      const balanceRaw = scValToNative(result.val);

      // SAC balances are stored as i128, we need to convert to decimal string
      // Assumes 7 decimal places (Stellar default)
      const balance = typeof balanceRaw === 'bigint'
        ? (Number(balanceRaw) / 10_000_000).toFixed(7)
        : balanceRaw.toString();

      logger.info(`On-chain balance for ${investorAddress}: ${balance} ${assetCode}`);
      return balance;
    } catch (error) {
      // If contract data not found, investor has 0 balance
      if (error.code === 404 || error.message?.includes('not found')) {
        return '0';
      }
      logger.error(`Error querying on-chain balance for ${investorAddress}`, error);
      throw error;
    }
  }

  /**
   * Busca lista de investidores aprovados com saldos de tokens do banco de dados
   * @param {string} assetCode - Código do asset a consultar (REQUIRED)
   * @param {number|null} offerId - ID da oferta opcional
   * @returns {Promise<Object>} Objeto com investidores e taxa de juros
   * @returns {Array} returns.investors - Array de investidores com saldos
   * @returns {number} returns.annualInterestRate - Taxa de juros anual do token
   * @throws {Error} Se assetCode não for fornecido ou houver erro ao consultar
   */
  static async getInvestorsWithBalances(assetCode, offerId = null) {
    if (!assetCode) {
      throw new Error('assetCode is required');
    }
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

      const distributorPublicKey = keyManager.getDistributorPublicKey();
      const distributorAccount = await stellarServer.loadAccount(distributorPublicKey);

      const { issuer: usdcIssuer, code: usdcAssetCode } = await getUSDCConfig();

      // Verificar liquidez USDC antes de criar operações
      const usdcBalance = distributorAccount.balances.find(
        b => b.asset_code === usdcAssetCode && b.asset_issuer === usdcIssuer
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

      const usdcAsset = new Asset(usdcAssetCode, usdcIssuer);

      // Preparar operações válidas
      const validPayments = [];
      for (const payment of payments) {
        const investor = investors.find(inv => inv.id === payment.investorId);
        if (!investor || !investor.stellarPublicKey) {
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
            destination: investor.stellarPublicKey,
            asset: usdcAsset,
            amount: payment.usdcAmount.toString(),
            source: distributorPublicKey,
          })
        );

        // Use RPC for sequence number safety
        const distributorAccountForTx = await StellarService.getAccountRPC(distributorPublicKey);
        const transaction = await buildTransactionWithAccount(distributorAccountForTx, operations);

        const result = await TransactionManager.submit({
          transaction,
          signingRole: 'DISTRIBUTOR',
          operationType: 'dividend_distribution',
          description: `Interest Distribution: ${operations.length} payments`,
          metadata: {
            payments: batch.map(b => ({
              ...b.payment,
              investorId: b.investor.id,
              assetCode: usdcAssetCode
            })),
            paymentDate: new Date().toISOString(),
            operationCount: operations.length
          }
        });

        if (result.status === 'pending_multisig') {
          results.push({
            batchIndex: index,
            status: 'pending_multisig',
            multiSigTransactionId: result.multiSigTransactionId,
            operationsCount: operations.length
          });
          continue;
        }

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

      const hasPendingMultisig = results.some(r => r.status === 'pending_multisig');

      return {
        success: true,
        status: hasPendingMultisig ? 'pending_multisig' : 'executed',
        transactionHash: results[0].transactionHash || null,
        ledger: results[0].ledger || null,
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
   * @param {string} assetCode - Código do asset a processar (REQUIRED)
   * @returns {Promise<Object>} Resultado completo do processamento
   * @throws {Error} Se assetCode não for fornecido ou houver erro no processo
   */
  static async processMonthlyInterestPayments(assetCode) {
    if (!assetCode) {
      throw new Error('assetCode is required');
    }
    const startTime = Date.now();
    const paymentDate = new Date().toISOString().split('T')[0];

    logger.info('Starting monthly interest payment process', { assetCode, paymentDate });

    try {
      // Fetch token and offer FIRST to determine balance source
      const token = await Token.findByAssetCode(assetCode);
      const offerId = token?.offerId || null;

      if (!offerId) {
        logger.warn('Token has no associated offer, falling back to DB-only balance query');
      }

      // Use offer-aware balance query (handles locked vs unlocked tokens)
      const result = offerId
        ? await retryOperation(() => this.getInvestorsWithBalancesByOffer(offerId), 3)
        : await retryOperation(() => this.getInvestorsWithBalances(assetCode), 3);

      const { investors, annualInterestRate } = result;

      if (investors.length === 0) {
        logger.warn('No investors found with balances');
        return {
          success: true,
          message: 'No investors to process',
          processed: 0,
        };
      }

      logger.info(`Processing payments for ${investors.length} investors with ${annualInterestRate}% annual rate`,
        { offerId, isTokenLocked: offerId ? 'checked via getInvestorsWithBalancesByOffer' : 'N/A' });

      const feePercent = await ConfigService.getFloat('DIVIDEND_FEE_PERCENT', 0);
      logger.info(`Applying Dividend Fee: ${feePercent}%`);

      const payments = [];
      for (const investor of investors) {
        const tokenBalance = parseFloat(investor.token_balance);
        const grossInterest = this.calculateMonthlyInterest(tokenBalance, annualInterestRate);

        if (grossInterest <= 0) {
          logger.warn('Skipping investor - zero interest', { investorId: investor.id });
          continue;
        }

        // Apply Fee
        let feeAmount = 0;
        let netInterest = grossInterest;

        if (feePercent > 0) {
          feeAmount = grossInterest * (feePercent / 100);
          netInterest = grossInterest - feeAmount;

          const { code: usdcAssetCode } = await getUSDCConfig();

          // Log Fee (Fire and forget, or await?) Await to ensure log.
          await ConfigService.logFee({
            amount: feeAmount,
            assetCode: usdcAssetCode,
            category: 'DIVIDEND_FEE',
            sourceId: investor.id,
            description: `Dividend Fee ${feePercent}% on ${grossInterest} USDC`,
          });
        }

        payments.push({
          investorId: investor.id,
          assetCode,
          tokenBalance: tokenBalance.toString(),
          interestRate: annualInterestRate.toString(),
          // interestAmount stores GROSS interest; usdcAmount stores NET amount (paid to investor)
          interestAmount: grossInterest.toString(),
          usdcAmount: netInterest.toString(),
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

      // If pending multisig, skip local recording and emails (handled by hook later)
      if (batchResult.status === 'pending_multisig') {
        logger.info('Monthly interest payment process queued for MultiSig approval');
        return {
          success: true,
          status: 'pending_multisig',
          paymentDate,
          processed: payments.length,
          message: 'Process queued for MultiSig approval. Database will be updated after execution.'
        };
      }

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

      const { code: usdcAssetCode } = await getUSDCConfig();

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
   * @param {string} assetCode - Código do asset a processar (REQUIRED)
   * @returns {Object} Job do cron para controle (start/stop)
   */
  static scheduleMonthlyPayments(assetCode) {
    if (!assetCode) {
      throw new Error('assetCode is required for scheduling');
    }
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

      if (!investor.stellarPublicKey) {
        throw new Error('Investor does not have a Stellar public key configured');
      }

      if (investor.kycStatus !== 'approved') {
        throw new Error('Investor KYC status must be approved to receive tokens');
      }

      const token = await Token.findByAssetCode(assetCode);
      if (!token) {
        throw new Error('Token not found');
      }

      const stellarResult = await StellarService.distributeTokens(
        investor.stellarPublicKey,
        amount,
        assetCode
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

  /**
   * Processa ofertas bullet que atingiram a maturidade
   * MVP: Marca ofertas como 'matured' e notifica a empresa ao invés de processar pagamentos automaticamente
   * @param {string} assetCode - Código do asset (opcional, para filtrar)
   * @returns {Promise<Object>} Resultado do processamento
   */
  static async processBulletPayments(assetCode = null) {
    const startTime = Date.now();

    logger.info('[MVP] Checking for matured bullet offers (notification-only mode)', { assetCode });

    try {
      // Buscar ofertas bullet ativas que venceram hoje
      let expiredBulletOffers = await this.getExpiredBulletOffers();

      // Se assetCode for fornecido, filtrar apenas essa oferta
      if (assetCode) {
        expiredBulletOffers = expiredBulletOffers.filter(o => o.assetCode === assetCode);
      }

      if (expiredBulletOffers.length === 0) {
        logger.info('No expired bullet offers found');
        return {
          success: true,
          message: 'No bullet offers to process',
          processed: 0,
        };
      }

      logger.info(`[MVP] Found ${expiredBulletOffers.length} matured bullet offers - marking for manual payment`);

      const processedOffers = [];

      for (const offer of expiredBulletOffers) {
        try {
          // Mark offer as matured (no automatic payment)
          await prisma.offer.update({
            where: { id: offer.id },
            data: { status: 'matured' }
          });

          // Get company users to notify
          const companyUsers = await prisma.companyUser.findMany({
            where: {
              companyId: offer.companyId,
              isActive: true
            },
            select: { id: true, email: true, name: true }
          });

          // Create notification for each company user
          for (const user of companyUsers) {
            await prisma.notification.create({
              data: {
                userId: user.id,
                userType: 'company_user',
                type: 'warning',
                title: 'Bullet Payment Due',
                message: `Your offer "${offer.offerName}" (${offer.assetCode}) has reached maturity. Please initiate the bullet payment to investors.`,
                actionLink: `/company/payments/${offer.id}`,
              }
            });
          }

          logger.info(`[MVP] Offer ${offer.assetCode} marked as matured, ${companyUsers.length} users notified`);

          processedOffers.push({
            offerId: offer.id,
            assetCode: offer.assetCode,
            maturityDate: offer.maturityDate,
            usersNotified: companyUsers.length
          });

        } catch (error) {
          logger.error(`[MVP] Failed to process matured offer ${offer.assetCode}`, error);
        }
      }

      const duration = Date.now() - startTime;

      logger.info('[MVP] Bullet maturity check completed', {
        duration: `${duration}ms`,
        offersMatured: processedOffers.length,
      });

      return {
        success: true,
        message: 'Offers marked as matured - awaiting company payment',
        data: {
          offersMatured: processedOffers.length,
          offers: processedOffers,
          duration: `${duration}ms`,
        },
      };
    } catch (error) {
      logger.error('[MVP] Bullet maturity check failed', error);

      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message,
        duration: `${duration}ms`,
      };
    }
  }

  /**
   * Busca ofertas bullet expiradas (data de vencimento chegou)
   * @returns {Promise<Array>} Array de ofertas bullet expiradas
   */
  static async getExpiredBulletOffers() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const expiredOffers = await prisma.offer.findMany({
        where: {
          paymentType: 'bullet',
          maturityDate: {
            lte: new Date(today + 'T23:59:59.999Z'), // Até o final do dia
          },
          status: 'active',
        },
        include: {
          tokens: true,
        },
      });

      return expiredOffers.filter(offer => offer.tokens.length > 0);
    } catch (error) {
      logger.error('Error fetching expired bullet offers', error);
      throw new Error(`Failed to get expired bullet offers: ${error.message}`);
    }
  }

  /**
   * Busca investidores com saldos em uma oferta específica
   * 
   * For LOCKED tokens (isTokenLocked=true): Uses DB balances (platform controls all transfers)
   * For UNLOCKED tokens (isTokenLocked=false): Queries on-chain SAC balances via Soroban RPC
   * 
   * @param {number} offerId - ID da oferta
   * @returns {Promise<Array>} Array de investidores com saldos
   */
  static async getInvestorsWithBalancesByOffer(offerId) {
    try {
      // First, get the offer to check isTokenLocked status
      const offer = await prisma.offer.findUnique({
        where: { id: offerId },
        select: {
          id: true,
          assetCode: true,
          isTokenLocked: true,
          annualInterestRate: true
        }
      });

      if (!offer) {
        throw new Error(`Offer ${offerId} not found`);
      }

      const balanceSource = this.getBalanceSource(offer);
      logger.info(`Balance source for offer ${offerId}: ${balanceSource}`, { assetCode: offer.assetCode });

      // Get the list of investors who have ever held this token (from DB)
      const dbResult = await prisma.$queryRaw`
        SELECT
          i.id,
          i.name,
          i.email,
          i.stellar_public_key as "stellarPublicKey",
          i.stellar_contract_id as "stellarContractId",
          i.kyc_status::text as "kycStatus",
          COALESCE(SUM(td.amount), 0) as token_balance
        FROM investors i
        LEFT JOIN token_distributions td ON td.investor_id = i.id
        LEFT JOIN tokens t ON t.asset_code = td.asset_code
        WHERE t.offer_id = ${offerId}
          AND i.kyc_status = 'approved'
        GROUP BY i.id, i.name, i.email, i.stellar_public_key, i.stellar_contract_id, i.kyc_status
        HAVING COALESCE(SUM(td.amount), 0) > 0
        ORDER BY i.id
      `;

      // If token is locked, DB is authoritative - return DB balances
      if (balanceSource === BALANCE_SOURCE.DATABASE) {
        logger.info(`Using DB balances for locked token ${offer.assetCode}`);
        return dbResult;
      }

      // Token is unlocked - query on-chain balances for each investor
      logger.info(`Querying on-chain balances for unlocked token ${offer.assetCode}`);

      const investorsWithOnChainBalances = await Promise.all(
        dbResult.map(async (investor) => {
          try {
            // Use stellarContractId (Smart Wallet) if available, otherwise stellarPublicKey
            const walletAddress = investor.stellarContractId || investor.stellarPublicKey;

            if (!walletAddress) {
              logger.warn(`Investor ${investor.id} has no wallet address`);
              return { ...investor, token_balance: '0' };
            }

            const onChainBalance = await this.getOnChainTokenBalance(offer.assetCode, walletAddress);

            return {
              ...investor,
              token_balance: onChainBalance,
              _balanceSource: 'on_chain'
            };
          } catch (error) {
            logger.error(`Failed to get on-chain balance for investor ${investor.id}`, error);
            // Fallback to DB balance if on-chain query fails
            return { ...investor, _balanceSource: 'db_fallback' };
          }
        })
      );

      // Filter out investors with 0 balance (may have sold all tokens on DEX)
      const activeHolders = investorsWithOnChainBalances.filter(
        inv => parseFloat(inv.token_balance) > 0
      );

      logger.info(`Found ${activeHolders.length} active holders on-chain (${dbResult.length} in DB)`);
      return activeHolders;
    } catch (error) {
      logger.error('Error fetching investors with balances by offer', error);
      throw new Error(`Failed to get investors with balances: ${error.message}`);
    }
  }

  /**
   * Registra pagamentos bullet no banco de dados
   * @param {Array} payments - Array de pagamentos
   * @param {string} transactionHash - Hash da transação Stellar
   * @param {string} paymentDate - Data do pagamento
   */
  static async recordBulletPayments(payments, transactionHash, paymentDate) {
    try {
      const paymentRecords = payments.map(payment => ({
        investor_id: payment.investorId,
        asset_code: payment.assetCode,
        token_balance: payment.tokenBalance,
        interest_rate: payment.interestRate,
        interest_amount: payment.interestAmount,
        usdc_amount: payment.usdcAmount,
        transaction_hash: transactionHash,
        payment_date: paymentDate,
        offer_id: payment.offerId,
        payment_type: payment.paymentType,
        is_bullet_payment: payment.isBulletPayment,
        status: 'completed',
      }));

      await prisma.interestPayment.createMany({
        data: paymentRecords,
        skipDuplicates: true,
      });

      logger.info(`Recorded ${paymentRecords.length} bullet payments`, { transactionHash });
    } catch (error) {
      logger.error('Error recording bullet payments', error);
      throw new Error(`Failed to record bullet payments: ${error.message} `);
    }
  }

  /**
   * Envia emails de confirmação para pagamentos bullet
   * @param {Array} payments - Array de pagamentos
   * @param {string} transactionHash - Hash da transação
   * @param {string} paymentDate - Data do pagamento
   * @returns {Promise<Array>} Resultados dos envios de email
   */
  static async sendBulletPaymentEmails(payments, transactionHash, paymentDate) {
    // Agrupar pagamentos por investidor
    const paymentsByInvestor = payments.reduce((acc, payment) => {
      if (!acc[payment.investorId]) {
        acc[payment.investorId] = {
          investorId: payment.investorId,
          payments: [],
          totalAmount: 0,
        };
      }
      acc[payment.investorId].payments.push(payment);
      acc[payment.investorId].totalAmount += parseFloat(payment.usdcAmount);
      return acc;
    }, {});

    const emailPromises = Object.values(paymentsByInvestor).map(async (investorData) => {
      try {
        // Buscar dados do investidor
        const investor = await prisma.investor.findUnique({
          where: { id: investorData.investorId },
        });

        if (!investor) {
          logger.warn(`Investor ${investorData.investorId} not found for email`);
          return { success: false, investorId: investorData.investorId, error: 'Investor not found' };
        }

        // Enviar email de confirmação
        await EmailService.sendBulletPaymentConfirmation(
          investor.email,
          {
            investorName: investor.name,
            paymentDate,
            transactionHash,
            totalAmount: investorData.totalAmount,
            payments: investorData.payments,
          }
        );

        logger.info(`Bullet payment confirmation email sent to ${investor.email} `);
        return { success: true, investorId: investorData.investorId };
      } catch (error) {
        logger.error(`Failed to send bullet payment email to investor ${investorData.investorId} `, error);
        return { success: false, investorId: investorData.investorId, error: error.message };
      }
    });

    return await Promise.all(emailPromises);
  }

  /**
   * Agenda processamento de pagamentos bullet (diariamente)
   * Executa diariamente às 01:00 UTC para verificar vencimentos
   * @returns {Object} Job agendado
   */
  static scheduleBulletPayments() {
    logger.info('Scheduling bullet payments', {
      schedule: '0 1 * * *', // Daily at 01:00 UTC
    });

    const job = cron.schedule('0 1 * * *', async () => {
      logger.info('Scheduled bullet payment job triggered');
      try {
        await this.processAllScheduledPayments();
      } catch (error) {
        logger.error('Scheduled bullet payment job failed', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC',
    });

    logger.info('Bullet payment schedule activated');
    return job;
  }

  /**
   * Processa todos os pagamentos agendados (Bullet e Periódicos)
   * MVP: Apenas envia notificações - todos os pagamentos são manuais
   * Executa diariamente:
   * 1. Verifica vencimentos de ofertas Bullet (diário)
   * 2. Se for dia 1 do mês, notifica sobre pagamentos periódicos devidos
   */
  static async processAllScheduledPayments() {
    const today = new Date();
    const isFirstOfMonth = today.getDate() === 1;
    const currentMonth = today.getMonth() + 1; // 1-12

    logger.info('[MVP] Starting payment notification process (all payments are manual)', {
      date: today.toISOString().split('T')[0],
      isFirstOfMonth
    });

    // 1. Processar maturidade de ofertas Bullet (sempre verifica diariamente)
    try {
      await this.processBulletPayments();
    } catch (error) {
      logger.error('[MVP] Error checking bullet maturity', error);
    }

    // 2. Notificar sobre pagamentos periódicos no primeiro dia do mês
    if (isFirstOfMonth) {
      try {
        // Buscar todas as ofertas ativas que não são bullet
        const periodicOffers = await prisma.offer.findMany({
          where: {
            status: 'active',
            paymentType: { not: 'bullet' }
          },
          include: {
            company: true
          }
        });

        logger.info(`[MVP] Found ${periodicOffers.length} periodic offers to check for due payments`);

        let notificationsSent = 0;

        for (const offer of periodicOffers) {
          try {
            const frequency = offer.paymentFrequency || 1;

            // Lógica simplificada: notificar se (mês atual - 1) % frequência == 0
            // Ex: Mensal (freq 1): todos os meses
            // Ex: Trimestral (freq 3): meses 1, 4, 7, 10
            // Ex: Semestral (freq 6): meses 1, 7
            if ((currentMonth - 1) % frequency === 0) {
              logger.info(`[MVP] Payment due for ${offer.paymentType} offer ${offer.assetCode}`, {
                frequency,
                currentMonth
              });

              // Get company users to notify
              const companyUsers = await prisma.companyUser.findMany({
                where: {
                  companyId: offer.companyId,
                  isActive: true
                },
                select: { id: true, email: true, name: true }
              });

              // Create notification for each company user
              for (const user of companyUsers) {
                await prisma.notification.create({
                  data: {
                    userId: user.id,
                    userType: 'company_user',
                    type: 'warning',
                    title: `${offer.paymentType.charAt(0).toUpperCase() + offer.paymentType.slice(1)} Payment Due`,
                    message: `Your ${offer.paymentType} interest payment for "${offer.offerName}" (${offer.assetCode}) is due. Please initiate payment to investors.`,
                    actionLink: `/company/payments/${offer.id}`,
                  }
                });
                notificationsSent++;
              }

              // Update nextPaymentDue for tracking
              await prisma.offer.update({
                where: { id: offer.id },
                data: {
                  paymentDueStatus: 'due',
                  nextPaymentDue: today
                }
              });

              logger.info(`[MVP] Notified ${companyUsers.length} users about payment due for ${offer.assetCode}`);
            }
          } catch (error) {
            logger.error(`[MVP] Error notifying about payment for offer ${offer.assetCode}`, error);
          }
        }

        logger.info(`[MVP] Periodic payment notification complete: ${notificationsSent} notifications sent`);
      } catch (error) {
        logger.error('[MVP] Error during periodic payment notification', error);
      }
    }

    return { success: true };
  }

  /**
   * Agenda processamento de pagamentos trimestrais
   * Executa no 1º dia de janeiro, abril, julho e outubro
   * @param {string} assetCode - Código do asset (REQUIRED)
   * @returns {Object} Job agendado
   */
  static scheduleQuarterlyPayments(assetCode) {
    if (!assetCode) {
      throw new Error('assetCode is required for scheduling');
    }
    logger.info('Scheduling quarterly payments', {
      schedule: '0 0 1 1,4,7,10 *',
      assetCode,
    });

    const job = cron.schedule('0 0 1 1,4,7,10 *', async () => {
      logger.info('Scheduled quarterly payment job triggered');
      try {
        await this.processQuarterlyPayments(assetCode);
      } catch (error) {
        logger.error('Scheduled quarterly payment job failed', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC',
    });

    logger.info('Quarterly payment schedule activated');
    return job;
  }

  /**
   * Agenda processamento de pagamentos semestrais
   * Executa no 1º dia de janeiro e julho
   * @param {string} assetCode - Código do asset (REQUIRED)
   * @returns {Object} Job agendado
   */
  static scheduleSemiAnnualPayments(assetCode) {
    if (!assetCode) {
      throw new Error('assetCode is required for scheduling');
    }
    logger.info('Scheduling semi-annual payments', {
      schedule: '0 0 1 1,7 *',
      assetCode,
    });

    const job = cron.schedule('0 0 1 1,7 *', async () => {
      logger.info('Scheduled semi-annual payment job triggered');
      try {
        await this.processSemiAnnualPayments(assetCode);
      } catch (error) {
        logger.error('Scheduled semi-annual payment job failed', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC',
    });

    logger.info('Semi-annual payment schedule activated');
    return job;
  }

  /**
   * Processa pagamentos trimestrais
   * @param {string} assetCode - Código do asset (REQUIRED)
   * @returns {Promise<Object>} Resultado do processamento
   */
  static async processQuarterlyPayments(assetCode) {
    if (!assetCode) {
      throw new Error('assetCode is required');
    }
    const startTime = Date.now();
    const paymentDate = new Date().toISOString().split('T')[0];

    logger.info('Starting quarterly payment process', { assetCode, paymentDate });

    try {
      // Buscar ofertas trimestrais ativas
      const quarterlyOffers = await this.getOffersByPaymentTypeAndFrequency('quarterly', 3);

      if (quarterlyOffers.length === 0) {
        logger.info('No quarterly offers found');
        return {
          success: true,
          message: 'No quarterly offers to process',
          processed: 0,
        };
      }

      // Usar a lógica existente de pagamentos mensais, mas com frequência trimestral
      return await this.processPeriodicPayments(assetCode, quarterlyOffers, paymentDate, 'quarterly');
    } catch (error) {
      logger.error('Quarterly payment process failed', error);

      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message,
        duration: `${duration} ms`,
      };
    }
  }

  /**
   * Processa pagamentos semestrais
   * @param {string} assetCode - Código do asset (REQUIRED)
   * @returns {Promise<Object>} Resultado do processamento
   */
  static async processSemiAnnualPayments(assetCode) {
    if (!assetCode) {
      throw new Error('assetCode is required');
    }
    const startTime = Date.now();
    const paymentDate = new Date().toISOString().split('T')[0];

    logger.info('Starting semi-annual payment process', { assetCode, paymentDate });

    try {
      // Buscar ofertas semestrais ativas
      const semiAnnualOffers = await this.getOffersByPaymentTypeAndFrequency('semi_annual', 6);

      if (semiAnnualOffers.length === 0) {
        logger.info('No semi-annual offers found');
        return {
          success: true,
          message: 'No semi-annual offers to process',
          processed: 0,
        };
      }

      // Usar a lógica existente de pagamentos mensais, mas com frequência semestral
      return await this.processPeriodicPayments(assetCode, semiAnnualOffers, paymentDate, 'semi_annual');
    } catch (error) {
      logger.error('Semi-annual payment process failed', error);

      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message,
        duration: `${duration} ms`,
      };
    }
  }

  /**
   * Busca ofertas por tipo de pagamento e frequência
   * @param {string} paymentType - Tipo de pagamento
   * @param {number} frequency - Frequência em meses
   * @returns {Promise<Array>} Array de ofertas
   */
  static async getOffersByPaymentTypeAndFrequency(paymentType, frequency) {
    try {
      const offers = await prisma.offer.findMany({
        where: {
          payment_type: paymentType,
          payment_frequency: frequency,
          status: 'active',
        },
        include: {
          tokens: true,
        },
      });

      return offers.filter(offer => offer.tokens.length > 0);
    } catch (error) {
      logger.error('Error fetching offers by payment type and frequency', error);
      throw new Error(`Failed to get offers: ${error.message} `);
    }
  }

  /**
   * Processa pagamentos periódicos (trimestrais, semestrais)
   * @param {string} assetCode - Código do asset
   * @param {Array} offers - Ofertas a processar
   * @param {string} paymentDate - Data do pagamento
   * @param {string} paymentType - Tipo de pagamento
   * @returns {Promise<Object>} Resultado do processamento
   */
  static async processPeriodicPayments(assetCode, offers, paymentDate, paymentType) {
    const startTime = Date.now();

    try {
      const allPayments = [];

      for (const offer of offers) {
        if (assetCode && offer.asset_code !== assetCode) continue;

        try {
          // Use offer-aware balance query (handles locked vs unlocked tokens)
          const result = await this.getInvestorsWithBalancesByOffer(offer.id);
          const { investors, annualInterestRate } = result;

          if (investors.length === 0) continue;

          // Calcular juros baseado na frequência
          const frequency = offer.payment_frequency || 1;
          const periodicRate = annualInterestRate / 12 * frequency; // Taxa proporcional à frequência

          for (const investor of investors) {
            const tokenBalance = parseFloat(investor.token_balance);
            const interestAmount = this.calculateMonthlyInterest(tokenBalance, annualInterestRate) * frequency;

            if (interestAmount <= 0) continue;

            allPayments.push({
              investorId: investor.id,
              assetCode,
              tokenBalance: tokenBalance.toString(),
              interestRate: annualInterestRate.toString(),
              interestAmount: interestAmount.toString(),
              usdcAmount: interestAmount.toString(),
              offerId: offer.id,
              paymentType,
              isBulletPayment: false,
            });
          }
        } catch (error) {
          logger.error(`Failed to process ${paymentType} offer ${offer.asset_code} `, error);
        }
      }

      if (allPayments.length === 0) {
        return {
          success: true,
          message: `No ${paymentType} payments to process`,
          processed: 0,
        };
      }

      // Usar lógica existente para processamento em lote
      const investors = allPayments.map(p => ({
        id: p.investorId,
        stellar_public_key: null, // Será buscado na função
        name: '',
        email: '',
        kyc_status: 'approved',
        token_balance: p.tokenBalance
      }));

      const batchResult = await retryOperation(
        () => this.createBatchUSDCPayment(investors, allPayments),
        3,
        2000
      );

      // Registrar pagamentos
      await retryOperation(
        () => this.recordPeriodicPayments(allPayments, batchResult.transactionHash, paymentDate, paymentType),
        3
      );

      const emailResults = await this.sendPeriodicPaymentEmails(
        allPayments,
        batchResult.transactionHash,
        paymentDate,
        paymentType
      );

      const successfulEmails = emailResults.filter(r => r.success).length;
      const failedEmails = emailResults.filter(r => !r.success).length;

      const duration = Date.now() - startTime;

      logger.info(`${paymentType} payment process completed`, {
        duration: `${duration} ms`,
        paymentsProcessed: allPayments.length,
        transactionHash: batchResult.transactionHash,
        emailsSent: successfulEmails,
        emailsFailed: failedEmails,
      });

      return {
        success: true,
        message: `${paymentType} payments processed successfully`,
        data: {
          paymentDate,
          paymentsProcessed: allPayments.length,
          totalAmount: allPayments.reduce((sum, p) => sum + parseFloat(p.usdcAmount), 0),
          transactionHash: batchResult.transactionHash,
          emailsSent: successfulEmails,
          emailsFailed: failedEmails,
          duration: `${duration} ms`,
        },
      };
    } catch (error) {
      logger.error(`${paymentType} payment process failed`, error);
      throw error;
    }
  }

  /**
   * Registra pagamentos periódicos no banco de dados
   * @param {Array} payments - Array de pagamentos
   * @param {string} transactionHash - Hash da transação Stellar
   * @param {string} paymentDate - Data do pagamento
   * @param {string} paymentType - Tipo de pagamento
   */
  static async recordPeriodicPayments(payments, transactionHash, paymentDate, paymentType) {
    try {
      const paymentRecords = payments.map(payment => ({
        investor_id: payment.investorId,
        asset_code: payment.assetCode,
        token_balance: payment.tokenBalance,
        interest_rate: payment.interestRate,
        interest_amount: payment.interestAmount,
        usdc_amount: payment.usdcAmount,
        transaction_hash: transactionHash,
        payment_date: paymentDate,
        offer_id: payment.offerId,
        payment_type: paymentType,
        is_bullet_payment: false,
        status: 'completed',
      }));

      await prisma.interestPayment.createMany({
        data: paymentRecords,
        skipDuplicates: true,
      });

      logger.info(`Recorded ${paymentRecords.length} ${paymentType} payments`, { transactionHash });
    } catch (error) {
      logger.error(`Error recording ${paymentType} payments`, error);
      throw new Error(`Failed to record ${paymentType} payments: ${error.message} `);
    }
  }

  /**
   * Envia emails de confirmação para pagamentos periódicos
   * @param {Array} payments - Array de pagamentos
   * @param {string} transactionHash - Hash da transação
   * @param {string} paymentDate - Data do pagamento
   * @param {string} paymentType - Tipo de pagamento
   * @returns {Promise<Array>} Resultados dos envios de email
   */
  static async sendPeriodicPaymentEmails(payments, transactionHash, paymentDate, paymentType) {
    // Agrupar pagamentos por investidor
    const paymentsByInvestor = payments.reduce((acc, payment) => {
      if (!acc[payment.investorId]) {
        acc[payment.investorId] = {
          investorId: payment.investorId,
          payments: [],
          totalAmount: 0,
        };
      }
      acc[payment.investorId].payments.push(payment);
      acc[payment.investorId].totalAmount += parseFloat(payment.usdcAmount);
      return acc;
    }, {});

    const emailPromises = Object.values(paymentsByInvestor).map(async (investorData) => {
      try {
        const investor = await prisma.investor.findUnique({
          where: { id: investorData.investorId },
        });

        if (!investor) {
          logger.warn(`Investor ${investorData.investorId} not found for email`);
          return { success: false, investorId: investorData.investorId, error: 'Investor not found' };
        }

        // Enviar email apropriado baseado no tipo
        const emailMethod = paymentType === 'quarterly' ? 'sendQuarterlyPaymentConfirmation' : 'sendSemiAnnualPaymentConfirmation';

        await EmailService[emailMethod](
          investor.email,
          {
            investorName: investor.name,
            paymentDate,
            transactionHash,
            totalAmount: investorData.totalAmount,
            payments: investorData.payments,
            paymentType,
          }
        );

        logger.info(`${paymentType} payment confirmation email sent to ${investor.email} `);
        return { success: true, investorId: investorData.investorId };
      } catch (error) {
        logger.error(`Failed to send ${paymentType} payment email to investor ${investorData.investorId} `, error);
        return { success: false, investorId: investorData.investorId, error: error.message };
      }
    });

    return await Promise.all(emailPromises);
  }
}
