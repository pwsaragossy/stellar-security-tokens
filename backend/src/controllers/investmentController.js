import { Investor } from '../models/Investor.js';
import { Token } from '../models/Token.js';
import { Investment } from '../models/Investment.js';
import { StellarService } from '../services/stellar.service.js';
import { PaymentService } from '../services/payment.service.js';
import { getTreasuryPublicKey } from '../config/stellar.js';
import { PasskeyWalletService } from '../services/passkeyWallet.service.js';
import { SorobanSaleService } from '../services/sorobanSale.service.js';
import { addDistributionJob, isQueueAvailable } from '../services/distributionQueue.service.js';
import { ConfigService } from '../services/config.service.js';
import prisma from '../config/prisma.js';
import crypto from 'crypto';
import logger from '../utils/logger.js';
const log = logger.scope('InvestmentController');


const USDC_PAYMENT_WINDOW_MINUTES = parseInt(process.env.USDC_PAYMENT_WINDOW_MINUTES || '2', 10);

/**
 * Gera memo único para transação Stellar
 * @param {number} investmentId - ID do investimento
 * @param {number} investorId - ID do investidor
 * @param {string} assetCode - Código do asset
 * @returns {string} Memo único (máximo 28 caracteres)
 */
function generateInvestmentMemo(investmentId, investorId, assetCode) {
  // Formato: INV-{investmentId}-{hash}
  // Limita a 28 caracteres (limite do Stellar)
  const hash = crypto.createHash('sha256')
    .update(`${investmentId}-${investorId}-${assetCode}-${Date.now()}`)
    .digest('hex')
    .substring(0, 8);
  return `INV-${investmentId}-${hash}`.substring(0, 28);
}

export const purchaseInvestment = async (req, res, next) => {
  try {
    const { investorId, usdcAmount, assetCode, offerId } = req.body;

    if (!assetCode) {
      return res.status(400).json({
        success: false,
        error: 'assetCode is required. Please specify the token asset code.',
      });
    }

    if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'USDC amount must be a positive number',
      });
    }

    const investor = await Investor.findById(parseInt(investorId, 10));
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    // Resolve wallet address: Soroban contract (C...) or classic account (G...)
    const investorWallet = investor.stellarContractId || investor.stellarPublicKey;
    if (!investorWallet) {
      return res.status(400).json({
        success: false,
        error: 'Investor does not have a Stellar wallet configured',
      });
    }

    if (investor.kycStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        error: 'Investor KYC status must be approved to purchase tokens',
      });
    }

    // --- PHASE 2.1: AUTONOMOUS JIT ONBOARDING ---
    // Ensure investor has the trustline for the asset they are buying.
    // Skip for Soroban contracts (C...) — they use SAC, no classic trustlines.
    if (!investorWallet.startsWith('C')) {
      StellarService.setupSponsoredTrustline(investorWallet, assetCode)
        .then(() => log.info(`[JIT Onboarding] Successfully ensured trustline for ${investor.id} / ${assetCode}`))
        .catch(err => log.warn(`[JIT Onboarding] Non-critical failure during early trustline setup for ${investor.id}:`, err.message));
    }

    // Cancel any stale pending investments for same investor/offer
    const existingPending = await Investment.findPendingByInvestorAndOffer(parseInt(investorId, 10), offerId);
    if (existingPending) {
      log.info(`[Investment] Cancelling stale pending investment #${existingPending.id} for investor ${investorId}`);
      await Investment.updateStatus(existingPending.id, { status: 'cancelled' });
    }

    const token = await Token.findByAssetCode(assetCode);
    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      });
    }

    // --- SUPPLY CHECK: Prevent over-subscription ---
    if (offerId) {
      const offer = await (await import('../models/Offer.js')).Offer.findById(parseInt(offerId));
      if (!offer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      // Reject if offer is not active
      if (offer.status !== 'active') {
        return res.status(400).json({
          success: false,
          error: `Offer is not accepting investments (status: ${offer.status})`,
        });
      }

      const totalSupply = parseFloat(offer.totalSupply);
      const unitPrice = parseFloat(offer.unitPrice) || 1;
      const tokensSold = await Investment.getTokensSoldByOffer(parseInt(offerId));
      const remainingTokens = totalSupply - tokensSold;
      const requestedTokens = parseFloat(usdcAmount) / unitPrice;

      if (requestedTokens > remainingTokens) {
        const remainingUsdc = remainingTokens * unitPrice;
        return res.status(400).json({
          success: false,
          error: remainingTokens <= 0
            ? 'This offer is fully subscribed. No tokens remaining.'
            : `Requested amount exceeds remaining supply. Maximum investment: $${remainingUsdc.toFixed(2)} USDC (${remainingTokens.toFixed(0)} tokens remaining).`,
          remaining_supply: remainingTokens,
          remaining_usdc: remainingUsdc,
        });
      }

      // --- MATURITY CUTOFF: Block investments too close to maturity ---
      if (offer.maturityDate) {
        const cutoffDays = await ConfigService.getFloat('MATURITY_CUTOFF_DAYS', 7);
        const now = new Date();
        const maturity = new Date(offer.maturityDate);
        const daysUntilMaturity = Math.ceil((maturity - now) / (1000 * 60 * 60 * 24));

        if (daysUntilMaturity < cutoffDays) {
          return res.status(400).json({
            success: false,
            error: daysUntilMaturity <= 0
              ? 'This offer has reached maturity and is no longer accepting investments.'
              : `This offer closes for new investments ${cutoffDays} days before maturity. Only ${daysUntilMaturity} days remain.`,
            days_until_maturity: daysUntilMaturity,
            cutoff_days: cutoffDays,
          });
        }
      }
    }

    // Fee Logic
    const grossAmount = parseFloat(usdcAmount);
    const feePercent = await ConfigService.getFloat('INVESTMENT_FEE_PERCENT', 0);
    const fixedFee = await ConfigService.getFloat('BLOCKCHAIN_OPERATION_FEE_FIXED', 5.0); // Blockchain Fee (Investor pays ON TOP)

    // Validation: Investment amount must be positive
    if (grossAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Investment amount must be greater than zero.',
      });
    }

    // Investor pays Blockchain Fee ON TOP — full amount goes to tokens
    const tokenAmount = grossAmount;
    const totalDeduction = grossAmount + fixedFee; // Total deducted from wallet

    // Company pays Investment Fee (calculated on gross amount, charged later/accounted for)
    const investmentFeeAmount = grossAmount * (feePercent / 100);

    // Log Fees
    if (fixedFee > 0) {
      await ConfigService.logFee({
        amount: fixedFee,
        assetCode: 'USDC',
        category: 'BLOCKCHAIN_FEE',
        sourceId: investor.id,
        description: `Blockchain Operation Fee: ${fixedFee} USDC (Paid by Investor)`,
      });
    }

    if (investmentFeeAmount > 0) {
      await ConfigService.logFee({
        amount: investmentFeeAmount,
        assetCode: 'USDC',
        category: 'INVESTMENT_FEE',
        sourceId: offerId || null, // Issue 8 Fix: Use offerId (Company pays this fee)
        description: `Investment Fee: ${feePercent}% (${investmentFeeAmount} USDC) - Charge to Company`,
      });
    }

    // ─── RACE CONDITION GUARD ───
    // Prevent duplicate pending investments for the same investor/offer.
    // Without this, concurrent requests can over-subscribe an offer.
    if (offerId) {
      const existingPending = await prisma.investment.findFirst({
        where: {
          investorId: investorId,
          offerId: parseInt(offerId),
          status: { in: ['pending_payment', 'trade_submitted'] },
        },
      });
      if (existingPending) {
        log.warn(`[Investment] Duplicate pending investment blocked: investor #${investorId}, offer #${offerId} (existing: #${existingPending.id})`);
        return res.status(409).json({
          success: false,
          error: 'You already have a pending investment for this offer. Please complete or cancel it first.',
          existingInvestmentId: existingPending.id,
        });
      }
    }

    // Criar registro de investimento
    const investment = await Investment.create({
      investor_id: investorId,
      offer_id: offerId || null,
      asset_code: assetCode,
      usdc_amount: totalDeduction,
      token_amount: tokenAmount,
      memo: null,
    });

    // Generate Memo using the new ID
    const memo = generateInvestmentMemo(investment.id, investorId, assetCode);

    // Update investment with the generated memo
    await Investment.updateStatus(investment.id, { memo: memo });

    // ─── SOROBAN-ONLY PATH ───
    // All investments go through Soroban contract atomic swap.
    // Kill switch: returns 503 when ENABLE_SOROBAN_SALE is false.
    if (process.env.ENABLE_SOROBAN_SALE !== 'true') {
      await Investment.updateStatus(investment.id, {
        status: 'failed',
        error_message: 'Soroban sale is currently disabled (maintenance)',
      });
      return res.status(503).json({
        success: false,
        error: 'Investment service is temporarily unavailable. Please try again later.',
      });
    }

    if (!investorWallet.startsWith('C')) {
      await Investment.updateStatus(investment.id, {
        status: 'failed',
        error_message: 'Legacy G-address wallets are no longer supported',
      });
      return res.status(400).json({
        success: false,
        error: 'A smart wallet (passkey) is required to invest. Please register a passkey in Settings.',
      });
    }

    if (!offerId) {
      await Investment.updateStatus(investment.id, {
        status: 'failed',
        error_message: 'Offer ID is required for all investments',
      });
      return res.status(400).json({ success: false, error: 'Offer ID is required.' });
    }

    try {
      // Resolve company wallet from offer
      const offer = await (await import('../models/Offer.js')).Offer.findById(parseInt(offerId));
      const companyWallet = offer?.company?.stellarContractId || offer?.company?.stellarPublicKey;

      if (!companyWallet) {
        throw new Error('Company wallet not found for this offer');
      }

      if (!offer.sorobanContractId) {
        throw new Error(`Offer #${offerId} does not have a Soroban sale contract. Activate the offer first to trigger auto-deployment.`);
      }

      log.info(`[Investment] Using Soroban contract ${offer.sorobanContractId} for trade (${totalDeduction} USDC)`);
      const txData = await SorobanSaleService.buildTradeXdr(
        offer.sorobanContractId,
        investorWallet,
        totalDeduction
      );
      // Mark as contract-based so submitInvestmentTx knows to skip distribution
      txData._isContractTrade = true;

      return res.status(200).json({
        success: true,
        message: 'Investment created. Sign with your passkey to complete.',
        data: {
          investment: {
            id: investment.id,
            status: investment.status,
            usdcAmount: grossAmount,
            feeAmount: fixedFee,
            totalDeduction: totalDeduction,
            tokenAmount: tokenAmount,
            assetCode: assetCode,
            memo: memo,
            isContractTrade: true,
          },
          // Smart wallet transaction for passkey signing
          transaction: {
            xdr: txData.xdr,
            networkPassphrase: txData.networkPassphrase,
            walletId: txData.walletId,
            companyWallet: companyWallet,
            contractId: txData.contractId || null,
          },
        },
      });
    } catch (txError) {
      log.error('[Investment] Failed to build smart wallet transfer:', txError);
      // Cancel the investment if we can't build the transaction
      await Investment.updateStatus(investment.id, {
        status: 'failed',
        error_message: `Transaction build failed: ${txError.message}`,
      });

      // If it's a SaleError, return the mapped HTTP status
      const contractErr = SorobanSaleService.parseContractError?.(txError);
      if (contractErr) {
        return res.status(contractErr.httpStatus).json({
          success: false,
          error: contractErr.message,
          code: contractErr.code,
        });
      }

      return res.status(500).json({
        success: false,
        error: `Failed to prepare investment transaction: ${txError.message}`,
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Processa pagamento USDC usando fila assíncrona (com retry automático)
 * @param {Object} investment - Investimento criado
 * @param {Object} usdcPayment - Dados do pagamento USDC
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 */
async function processInvestmentPaymentWithQueue(investment, usdcPayment, req, res, next) {
  try {
    // Verificar idempotência: se já existe distribuição para este pagamento
    const existingDistribution = await Token.findDistributionByUSDC(usdcPayment.transactionHash);

    if (existingDistribution) {
      await Investment.updateStatus(investment.id, {
        status: 'distributed',
        usdc_payment_hash: usdcPayment.transactionHash,
        distribution_tx_hash: existingDistribution.transaction_hash,
      });

      return res.status(200).json({
        success: true,
        message: 'Investment already processed (idempotency)',
        data: {
          investment: {
            id: investment.id,
            status: 'distributed',
          },
          distribution: existingDistribution,
        },
      });
    }

    // Buscar investidor para obter chave pública
    const investor = await Investor.findById(investment.investorId);
    const walletAddress = investor?.stellarContractId || investor?.stellarPublicKey;
    if (!investor || !walletAddress) {
      throw new Error(`Investor ${investment.investorId} not found or missing Stellar wallet`);
    }

    // Gerar memo único
    const memo = generateInvestmentMemo(investment.id, investment.investorId, investment.assetCode);

    // Atualizar investment com hash do pagamento
    await Investment.updateStatus(investment.id, {
      status: 'payment_received',
      usdc_payment_hash: usdcPayment.transactionHash,
    });

    // Adicionar job à fila para processamento assíncrono com retry
    const job = await addDistributionJob({
      investmentId: investment.id,
      investorPublicKey: walletAddress,
      assetCode: investment.assetCode,
      amount: investment.tokenAmount.toString(),
      memo,
    });

    res.status(202).json({
      success: true,
      message: 'Payment received. Token distribution queued for processing.',
      data: {
        investment: {
          id: investment.id,
          status: 'payment_received',
          usdcAmount: parseFloat(investment.usdcAmount.toString()),
          tokenAmount: parseFloat(investment.tokenAmount.toString()),
          assetCode: investment.assetCode,
        },
        queue: {
          jobId: job.id,
          status: 'queued',
          message: 'Distribution will be processed automatically with retry on failure',
        },
        usdcPayment: {
          transactionHash: usdcPayment.transactionHash,
          ledger: usdcPayment.ledger,
          verifiedAt: usdcPayment.createdAt,
        },
      },
    });
  } catch (error) {
    await Investment.updateStatus(investment.id, {
      status: 'failed',
      error_message: error.message,
    });
    next(error);
  }
}

/**
 * Processa pagamento USDC e distribui tokens (síncrono, fallback)
 * @param {Object} investment - Investimento criado
 * @param {Object} usdcPayment - Dados do pagamento USDC
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 */
async function processInvestmentPayment(investment, usdcPayment, req, res, next) {
  try {
    // Verificar idempotência: se já existe distribuição para este pagamento
    const existingDistribution = await Token.findDistributionByUSDC(usdcPayment.transactionHash);

    if (existingDistribution) {
      // Já processado, atualizar investment e retornar distribuição existente
      await Investment.updateStatus(investment.id, {
        status: 'distributed',
        usdc_payment_hash: usdcPayment.transactionHash,
        distribution_tx_hash: existingDistribution.transaction_hash,
      });

      return res.status(200).json({
        success: true,
        message: 'Investment already processed (idempotency)',
        data: {
          investment: {
            id: investment.id,
            status: 'distributed',
          },
          distribution: existingDistribution,
        },
      });
    }

    // Verificar se investment já foi processado
    const currentInvestment = await Investment.findById(investment.id);
    if (currentInvestment.status === 'distributed') {
      return res.status(200).json({
        success: true,
        message: 'Investment already processed',
        data: {
          investment: currentInvestment,
        },
      });
    }

    // Gerar memo único
    const memo = generateInvestmentMemo(investment.id, investment.investorId, investment.assetCode);

    // Atualizar investment com hash do pagamento
    await Investment.updateStatus(investment.id, {
      status: 'payment_received',
      usdc_payment_hash: usdcPayment.transactionHash,
    });

    // Distribuir tokens com memo
    const investor = await Investor.findById(investment.investorId);

    // JIT AUTHORIZATION
    const targetWallet = investor.stellarContractId || investor.stellarPublicKey;

    if (targetWallet) {
      log.info(`[InvestmentController] JIT Authorizing ${targetWallet} for ${investment.assetCode}...`);
      await StellarService.authorizeInvestor(targetWallet, investment.assetCode);
    }

    // Fetch offer name for metadata
    const offer = investment.offerId ? await prisma.offer.findUnique({ where: { id: investment.offerId }, select: { offerName: true } }) : null;

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
        offerName: offer?.offerName || investment.assetCode,
        usdcAmount: investment.usdcAmount?.toString(),
        usdcPaymentHash: usdcPayment.transactionHash,
      }
    );

    // Handle pending multisig (distribution queued for admin signing)
    if (stellarResult.status === 'pending_multisig') {
      await Investment.updateStatus(investment.id, {
        status: 'pending_distribution',
        error_message: JSON.stringify({
          multiSigTransactionId: stellarResult.multiSigTransactionId,
          step: stellarResult.step,
          message: stellarResult.message,
        }),
      });

      return res.status(202).json({
        success: true,
        message: 'Distribution queued for multisig approval',
        data: {
          investment: {
            id: investment.id,
            status: 'pending_distribution',
            usdcAmount: parseFloat(investment.usdcAmount.toString()),
            tokenAmount: parseFloat(investment.tokenAmount.toString()),
            assetCode: investment.assetCode,
          },
          multisig: {
            transactionId: stellarResult.multiSigTransactionId,
            step: stellarResult.step,
            message: stellarResult.message,
          },
        },
      });
    }

    // Criar distribuição (com verificação de idempotência interna)
    const distribution = await Token.createDistribution({
      investorId: investment.investorId,
      assetCode: investment.assetCode,
      amount: investment.tokenAmount,
      transactionHash: stellarResult.transactionHash,
      usdcPaymentHash: usdcPayment.transactionHash,
      offerId: investment.offerId,
      memo,
    });

    // Atualizar investment com hash da distribuição
    await Investment.updateStatus(investment.id, {
      status: 'distributed',
      distribution_tx_hash: stellarResult.transactionHash,
    });

    res.status(201).json({
      success: true,
      message: 'Investment purchased successfully',
      data: {
        investment: {
          id: investment.id,
          status: 'distributed',
          usdcAmount: parseFloat(investment.usdcAmount.toString()),
          tokenAmount: parseFloat(investment.tokenAmount.toString()),
          assetCode: investment.assetCode,
        },
        distribution: {
          id: distribution.id,
          amount: distribution.amount,
          transactionHash: distribution.transaction_hash,
          memo: distribution.memo,
          createdAt: distribution.created_at,
        },
        transactions: {
          usdcPayment: {
            hash: usdcPayment.transactionHash,
            ledger: usdcPayment.ledger,
            verifiedAt: usdcPayment.createdAt,
          },
          tokenDistribution: {
            hash: stellarResult.transactionHash,
            ledger: stellarResult.ledger,
            memo: memo,
          },
        },
      },
    });
  } catch (error) {
    // Marcar investment como failed em caso de erro
    try {
      await Investment.updateStatus(investment.id, {
        status: 'failed',
        error_message: error.message,
      });
    } catch (updateError) {
      log.error('Failed to update investment status:', updateError);
    }
    next(error);
  }
}

/**
 * Verifica status de um investimento
 * GET /api/investments/:id/status
 */
export const getInvestmentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const investment = await Investment.findById(parseInt(id));

    if (!investment) {
      return res.status(404).json({
        success: false,
        error: 'Investment not found',
      });
    }


    res.json({
      success: true,
      data: {
        id: investment.id,
        status: investment.status,
        usdcAmount: investment.usdcAmount !== null && investment.usdcAmount !== undefined ? parseFloat(investment.usdcAmount.toString()) : null,
        tokenAmount: investment.tokenAmount !== null && investment.tokenAmount !== undefined ? parseFloat(investment.tokenAmount.toString()) : null,
        assetCode: investment.assetCode,
        usdcPaymentHash: investment.usdcPaymentHash,
        distributionTxHash: investment.distributionTxHash,
        memo: investment.memo,
        errorMessage: investment.errorMessage,
        createdAt: investment.createdAt,
        updatedAt: investment.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns the current investment fee schedule
 * GET /api/investments/fee-schedule
 */
export const getFeeSchedule = async (req, res, next) => {
  try {
    const blockchainFee = await ConfigService.getFloat('BLOCKCHAIN_OPERATION_FEE_FIXED', 5.0);
    const investmentFeePercent = await ConfigService.getFloat('INVESTMENT_FEE_PERCENT', 0);

    res.json({
      success: true,
      data: {
        blockchainFee,
        investmentFeePercent,
        description: 'Blockchain fee is added on top of the investment amount.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit a signed investment SAC transfer transaction
 * POST /api/investments/submit-tx
 * 
 * Called after the investor signs the XDR with their Passkey.
 * Submits via fee-bumped sponsorship and updates the investment record.
 */
export const submitInvestmentTx = async (req, res, next) => {
  try {
    const { signedXdr, investmentId } = req.body;

    if (!signedXdr || !investmentId) {
      return res.status(400).json({
        success: false,
        error: 'signedXdr and investmentId are required',
      });
    }

    // Verify investment exists and is pending
    const investment = await Investment.findById(parseInt(investmentId));
    if (!investment) {
      return res.status(404).json({ success: false, error: 'Investment not found' });
    }
    if (investment.status !== 'pending_payment' && investment.status !== 'trade_submitted') {
      // Idempotency: if already has a payment hash, return it (retry scenario)
      if (investment.usdcPaymentHash && (investment.status === 'payment_received' || investment.status === 'distributed')) {
        log.info(`[Investment] Idempotent return — investment #${investmentId} already processed with hash ${investment.usdcPaymentHash}`);
        return res.json({
          success: true,
          message: 'Investment already processed',
          data: {
            investmentId: parseInt(investmentId),
            transactionHash: investment.usdcPaymentHash,
            status: investment.status,
            idempotent: true,
          },
        });
      }
      return res.status(400).json({
        success: false,
        error: `Investment is not pending payment (status: ${investment.status})`,
      });
    }

    // ─── RATE LIMIT: prevent fee bump drain via spam ───
    // Max 3 submit attempts per investor per minute
    const investorKey = `submit_tx:${investment.investorId}`;
    if (!submitInvestmentTx._rateLimiter) submitInvestmentTx._rateLimiter = new Map();
    const limiter = submitInvestmentTx._rateLimiter;
    const now = Date.now();
    const windowMs = 60_000;
    const maxAttempts = 3;
    const attempts = limiter.get(investorKey) || [];
    const recent = attempts.filter(t => now - t < windowMs);
    if (recent.length >= maxAttempts) {
      log.warn(`[Investment] Rate limit hit for investor ${investment.investorId}`);
      return res.status(429).json({
        success: false,
        error: 'Too many submission attempts. Please wait 1 minute.',
      });
    }
    recent.push(now);
    limiter.set(investorKey, recent);

    // ─── RE-SIMULATE WITH SIGNED AUTH ENTRIES ───
    // The initial simulation (in buildTradeXdr) mocked auth, so __check_auth
    // costs (passkey secp256r1 verification) weren't included in the resource estimate.
    // Now that the frontend's passkey-kit sign() has signed the auth entries,
    // we re-simulate to get accurate resource estimates.
    //
    // IMPORTANT: We only extract sorobanData (resources) via cloneFrom().
    // The operation's signed auth entries are preserved — cloneFrom only touches
    // the TX envelope's ext field (sorobanData + fee), not the operations.
    const { TransactionBuilder, xdr, rpc: rpcMod } = await import('@stellar/stellar-sdk');
    const { getNetworkPassphrase, getOperationsKeypair, getSorobanRpcUrl } = await import('../config/stellar.js');

    const networkPassphrase = getNetworkPassphrase();
    const opsKeypair = getOperationsKeypair();
    let tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

    try {
      const sorobanRpc = new rpcMod.Server(getSorobanRpcUrl());
      log.info(`[Investment] Re-simulating signed TX to include __check_auth costs...`);
      const simResult = await sorobanRpc.simulateTransaction(tx);

      if (simResult.error) {
        log.error(`[Investment] Re-simulation error: ${simResult.error}`);
      } else if (simResult.transactionData) {
        // Extract ONLY the resource allocation from re-simulation.
        // cloneFrom preserves operations (including passkey-signed auth entries).
        const newSorobanData = simResult.transactionData.build();
        const newFee = Math.ceil(parseInt(simResult.minResourceFee) * 1.15).toString();

        tx = TransactionBuilder.cloneFrom(tx, {
          fee: newFee,
          sorobanData: newSorobanData,
        }).build();

        const resources = newSorobanData.resources();
        log.info(`[Investment] Re-simulated: instructions=${resources.instructions()}, readBytes=${resources.diskReadBytes()}, writeBytes=${resources.writeBytes()}, fee=${newFee}`);
      }
    } catch (resimErr) {
      log.warn(`[Investment] Re-simulation failed (non-fatal): ${resimErr.message}`);
    }

    // Add the source account signature
    tx.sign(opsKeypair);


    log.info(`[Investment] Submitting passkey-signed TX for investment #${investmentId}...`);
    const metricsStart = Date.now(); // ← Metrics timer

    // ─── SET STATUS TO trade_submitted BEFORE SENDING ───
    // This ensures reconciler can find and fix orphans if we crash after send.
    await Investment.updateStatus(parseInt(investmentId), {
      status: 'trade_submitted',
    });

    // ─── CAPTURE INNER TX HASH before fee bumping ───
    // Fee bump wraps the TX → Horizon returns the OUTER hash.
    // But Soroban RPC getTransaction() needs the INNER hash.
    const innerTxHash = tx.hash().toString('hex');
    log.info(`[Investment] Inner TX hash: ${innerTxHash}`);

    // ─── FEE BUMP SPONSORSHIP ───
    // Wrap the signed TX in a fee bump so the investor doesn't need XLM (gasless UX).
    let feeBumpHash;
    try {
      const sponsorResult = await PasskeyWalletService.submitWithSponsorship(tx);
      feeBumpHash = sponsorResult.hash;
      log.info(`[Investment] Fee-bumped TX submitted: ${feeBumpHash} (inner: ${innerTxHash})`);
    } catch (sponsorErr) {
      // ─── RECOVERY: revert to pending_payment so investor can retry ───
      log.error(`[Investment] Fee bump sponsorship failed: ${sponsorErr.message}`);
      await Investment.updateStatus(parseInt(investmentId), {
        status: 'pending_payment',
        error_message: `Fee bump failed: ${sponsorErr.message}`,
      });
      throw new Error(`Fee-bump sponsorship failed: ${sponsorErr.message}`);
    }

    // Record the INNER TX hash (for Soroban RPC lookups) and fee bump hash
    await Investment.updateStatus(parseInt(investmentId), {
      usdc_payment_hash: innerTxHash,
    });

    // ─── POLL SOROBAN RPC for result with diagnostic events ───
    // Use INNER hash — getTransaction() returns NOT_FOUND for fee bump hashes.
    const { rpc: rpcLib } = await import('@stellar/stellar-sdk');
    const sorobanRpc = new rpcLib.Server(process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org');

    let txResult;
    const maxWait = 60_000;
    const pollInterval = 3_000;
    let waited = 0;

    while (waited < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));
      waited += pollInterval;

      txResult = await sorobanRpc.getTransaction(innerTxHash);
      log.info(`[Investment] getTransaction status: ${txResult.status} (${waited / 1000}s elapsed)`);

      if (txResult.status !== 'NOT_FOUND') break;
    }

    if (!txResult || txResult.status === 'NOT_FOUND') {
      throw new Error('Transaction not found after 60s polling');
    }

    if (txResult.status === 'FAILED') {
      log.error('[Investment] === TRANSACTION FAILED ===');
      log.error('[Investment] Result XDR:', txResult.resultXdr?.toXDR?.('base64') || 'N/A');
      log.error('[Investment] Result meta XDR:', txResult.resultMetaXdr?.toXDR?.('base64') || 'N/A');

      // Extract diagnostic events from result meta
      try {
        const meta = txResult.resultMetaXdr;
        if (meta) {
          const v3 = meta.value?.()?.sorobanMeta?.();
          if (v3) {
            const diagEvents = v3.diagnosticEvents?.() || [];
            log.error(`[Investment] Diagnostic events (${diagEvents.length}):`);
            diagEvents.forEach((evt, i) => {
              try {
                log.error(`[Investment]   Event[${i}]:`, JSON.stringify(evt.toXDR('base64')));
                // Try to decode the event body
                const body = evt.event?.()?.body?.();
                if (body) {
                  const data = body.value?.()?.data?.();
                  if (data) {
                    log.error(`[Investment]   Event[${i}] data type:`, data.switch?.()?.name);
                    if (data.switch?.()?.name === 'scvError') {
                      log.error(`[Investment]   Event[${i}] ERROR:`, data.error?.()?.switch?.()?.name, data.error?.()?.value?.());
                    }
                    if (data.switch?.()?.name === 'scvU32') {
                      log.error(`[Investment]   Event[${i}] U32 value:`, data.u32?.());
                    }
                  }
                }
              } catch (evtErr) {
                log.error(`[Investment]   Event[${i}] decode error:`, evtErr.message);
              }
            });
          }
        }
      } catch (metaErr) {
        log.error('[Investment] Meta decode error:', metaErr.message);
      }

      // Try to parse SaleError from contract diagnostic events
      const saleError = SorobanSaleService.parseContractError(txResult);
      if (saleError) {
        log.error(`[Investment] SaleError detected: ${saleError.code} (${saleError.name}) — ${saleError.message}`);
        throw Object.assign(
          new Error(`Contract error: ${saleError.message}`),
          { saleError }
        );
      }

      throw new Error(`Transaction FAILED on-chain. Hash: ${innerTxHash}. Check logs for diagnostic events.`);
    }

    log.info(`[Investment] Transaction SUCCEEDED: ${innerTxHash}`);
    const result = { hash: innerTxHash, ledger: txResult.ledger };

    // ─── RECORD METRICS ───
    try {
      const { SorobanMetrics } = await import('../services/sorobanMetrics.service.js');
      const offerForMetrics = investment.offerId
        ? await (await import('../models/Offer.js')).Offer.findById(parseInt(investment.offerId))
        : null;
      const isContractMetric = !!offerForMetrics?.sorobanContractId;
      const durationMs = Date.now() - metricsStart;
      if (isContractMetric) {
        SorobanMetrics.recordTrade({ durationMs, success: true, investmentId: parseInt(investmentId) });
      } else {
        SorobanMetrics.recordLegacyTransfer({ durationMs, success: true, investmentId: parseInt(investmentId) });
      }
    } catch (metricsErr) {
      log.warn(`[Investment] Metrics recording failed: ${metricsErr.message}`);
    }

    // Update investment status
    await Investment.updateStatus(parseInt(investmentId), {
      status: 'payment_received',
      usdc_payment_hash: result.hash,
    });

    log.info(`[Investment] Smart wallet payment submitted for investment #${investmentId}: ${result.hash}`);

    // Determine if this was a Soroban contract trade or a legacy SAC transfer.
    // For contract trades, distribution is ATOMIC — the contract already sent tokens to buyer.
    // For legacy transfers, we still need to trigger separate token distribution.
    // Note: Investment.findById() doesn't include offer relation, so query separately.
    let isContractTrade = false;
    if (investment.offerId) {
      const { Offer } = await import('../models/Offer.js');
      const offer = await Offer.findById(investment.offerId);
      isContractTrade = !!offer?.sorobanContractId;
    }

    if (isContractTrade) {
      // Contract trade: tokens already in buyer's wallet. Update to 'distributed' directly.
      log.info(`[Investment] Contract trade complete — tokens distributed atomically. Skipping distributeTokens.`);
      await Investment.updateStatus(parseInt(investmentId), {
        status: 'distributed',
        distribution_tx_hash: result.hash, // Same TX did both payment + distribution
      });

      // Create token_distributions record so the portfolio query shows this investment.
      // Soroban atomic swaps bypass the traditional distribution pipeline but the
      // portfolio page (Investor.getPortfolio) depends on token_distributions rows.
      try {
        const { default: prisma } = await import('../config/database.js');
        await prisma.tokenDistribution.create({
          data: {
            investorId: investment.investorId,
            assetCode: investment.assetCode,
            amount: investment.tokenAmount,
            transactionHash: result.hash,
            usdcPaymentHash: result.hash,
            offerId: investment.offerId,
            memo: investment.memo || null,
            approvalStatus: 'approved',
          },
        });
        log.info(`[Investment] Created token_distributions record for atomic trade #${investmentId}`);
      } catch (distErr) {
        // Non-fatal — tokens are on-chain regardless
        log.error(`[Investment] Failed to create distribution record: ${distErr.message}`);
      }
    } else {
      // Legacy SAC transfer: funds are in treasury, tokens need separate distribution.
      log.info(`[Investment] Legacy flow — triggering token distribution...`);
      if (isQueueAvailable()) {
        await addDistributionJob({
          investmentId: parseInt(investmentId),
          investorPublicKey: investment.investorId?.toString(),
          assetCode: investment.assetCode,
          amount: investment.tokenAmount?.toString(),
          memo: investment.memo,
        });
      }
    }

    return res.json({
      success: true,
      message: isContractTrade
        ? 'Investment completed — tokens received'
        : 'Investment payment submitted successfully',
      data: {
        investmentId: parseInt(investmentId),
        transactionHash: result.hash,
        status: isContractTrade ? 'distributed' : 'payment_received',
        isContractTrade,
      },
    });
  } catch (error) {
    log.error('[Investment] Submit TX failed:', error);

    // If we have an investmentId, mark the investment as failed
    if (req.body?.investmentId) {
      try {
        await Investment.updateStatus(parseInt(req.body.investmentId), {
          status: 'failed',
          error_message: `Payment submission failed: ${error.message}`,
        });
      } catch (updateErr) {
        log.error('[Investment] Failed to update investment status:', updateErr);
      }
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit investment transaction',
    });
  }
};
