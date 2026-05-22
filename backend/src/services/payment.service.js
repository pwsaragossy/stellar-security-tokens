import prisma from '../config/prisma.js';

import { StellarService } from './stellar.service.js';
import { ConfigService } from './config.service.js';
import {
  getSorobanRpcUrl,
  getUsdcIssuer,
} from '../config/stellar.js';
import { keyManager } from './KeyManager.js';
import { Asset, rpc, scValToNative, Address } from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';




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
const _getUSDCConfig = async () => {
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
const _retryOperation = async (operation, maxRetries = 3, delayMs = 1000) => {
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
      const _balanceKey = {
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
            // Smart Wallet contract address (C...)
            const walletAddress = investor.stellarContractId;

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
            // F-37: Skip offers that have completed all periodic payments.
            // nextPaymentDue = null with a maturityDate set means calculateNextPaymentDate
            // returned null (next date exceeds maturity). Don't send false notifications
            // or overwrite the status for completed offers.
            if (offer.maturityDate && offer.nextPaymentDue === null) {
              logger.debug(`[MVP] Skipping completed offer ${offer.assetCode} — all yields paid`);
              continue;
            }

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
}

