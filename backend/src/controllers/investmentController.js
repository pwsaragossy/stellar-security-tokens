import { Investor } from '../models/Investor.js';
import { Token } from '../models/Token.js';
import { Investment } from '../models/Investment.js';
import { StellarService } from '../services/stellar.service.js';
import { PasskeyWalletService } from '../services/passkeyWallet.service.js';
import { SorobanSaleService } from '../services/sorobanSale.service.js';
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

    if (!offerId) {
      return res.status(400).json({ success: false, error: 'Offer ID is required.' });
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

    if (!investorWallet.startsWith('C')) {
      return res.status(400).json({
        success: false,
        error: 'A smart wallet (passkey) is required to invest. Please register a passkey in Settings.',
      });
    }

    if (investor.kycStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        error: 'Investor KYC status must be approved to purchase tokens',
      });
    }

    const token = await Token.findByAssetCode(assetCode);
    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      });
    }

    // ─── SOROBAN-ONLY PATH ───
    if (process.env.ENABLE_SOROBAN_SALE !== 'true') {
      return res.status(503).json({
        success: false,
        error: 'Investment service is temporarily unavailable. Please try again later.',
      });
    }

    // --- SUPPLY CHECK: Prevent over-subscription ---
    const offer = await (await import('../models/Offer.js')).Offer.findById(parseInt(offerId));
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

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

    // Fee Logic — platform fee is enforced on-chain via contract fee_bps.
    // Here we log it for audit trail only.
    const grossAmount = parseFloat(usdcAmount);
    const fixedFee = await ConfigService.getFloat('BLOCKCHAIN_OPERATION_FEE_FIXED', 0);
    const platformFeeBps = offer.platformFeeBps ?? 0;
    const feePercent = platformFeeBps / 100; // bps → percent

    if (grossAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Investment amount must be greater than zero.',
      });
    }

    const tokenAmount = grossAmount;
    const totalDeduction = grossAmount + fixedFee;
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
        category: 'PLATFORM_FEE',
        sourceId: offerId || null,
        description: `Platform Fee: ${platformFeeBps}bps (${investmentFeeAmount.toFixed(2)} USDC) - Enforced on-chain`,
      });
    }

    // ─── BUILD SOROBAN XDR (no DB record yet) ───
    try {
      const companyWallet = offer?.company?.stellarContractId || offer?.company?.stellarPublicKey;

      if (!companyWallet) {
        throw new Error('Company wallet not found for this offer');
      }

      if (!offer.sorobanContractId) {
        throw new Error(`Offer #${offerId} does not have a Soroban sale contract. Activate the offer first to trigger auto-deployment.`);
      }

      log.info(`[Investment] Building XDR via Soroban contract ${offer.sorobanContractId} for trade (${totalDeduction} USDC)`);
      const txData = await SorobanSaleService.buildTradeXdr(
        offer.sorobanContractId,
        investorWallet,
        totalDeduction
      );

      // Return XDR + context (NO DB record created)
      return res.status(200).json({
        success: true,
        message: 'Transaction prepared. Sign with your passkey to complete.',
        data: {
          // Context needed by submitInvestmentTx after signing
          investmentContext: {
            investorId: parseInt(investorId, 10),
            offerId: parseInt(offerId),
            usdcAmount: grossAmount,
            feeAmount: fixedFee,
            totalDeduction: totalDeduction,
            tokenAmount: tokenAmount,
            assetCode: assetCode,
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
    const blockchainFee = await ConfigService.getFloat('BLOCKCHAIN_OPERATION_FEE_FIXED', 0);

    res.json({
      success: true,
      data: {
        blockchainFee,
        platformFee: 'Per-offer (set at approval, enforced on-chain)',
        description: 'Blockchain fee is added on top of the investment amount. Platform fee is set per-offer and enforced by the smart contract.',
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
 * Submits via fee-bumped sponsorship, then creates the Investment +
 * tokenDistribution records AFTER on-chain confirmation.
 * No DB record exists until the transaction is confirmed by Horizon.
 */
export const submitInvestmentTx = async (req, res, next) => {
  try {
    const { signedXdr, investmentContext } = req.body;

    if (!signedXdr || !investmentContext) {
      return res.status(400).json({
        success: false,
        error: 'signedXdr and investmentContext are required',
      });
    }

    const { investorId, offerId, usdcAmount, totalDeduction, tokenAmount, assetCode } = investmentContext;
    if (!investorId || !offerId || !assetCode || !totalDeduction) {
      return res.status(400).json({
        success: false,
        error: 'investmentContext must include investorId, offerId, assetCode, and totalDeduction',
      });
    }

    // ─── RATE LIMIT: prevent fee bump drain via spam ───
    const investorKey = `submit_tx:${investorId}`;
    if (!submitInvestmentTx._rateLimiter) submitInvestmentTx._rateLimiter = new Map();
    const limiter = submitInvestmentTx._rateLimiter;
    const now = Date.now();
    const windowMs = 60_000;
    const maxAttempts = 3;
    const attempts = limiter.get(investorKey) || [];
    const recent = attempts.filter(t => now - t < windowMs);
    if (recent.length >= maxAttempts) {
      log.warn(`[Investment] Rate limit hit for investor ${investorId}`);
      return res.status(429).json({
        success: false,
        error: 'Too many submission attempts. Please wait 1 minute.',
      });
    }
    recent.push(now);
    limiter.set(investorKey, recent);

    // ─── RE-SIMULATE WITH SIGNED AUTH ENTRIES ───
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

    log.info(`[Investment] Submitting passkey-signed TX for investor #${investorId}, offer #${offerId}...`);
    const metricsStart = Date.now();

    // ─── CAPTURE INNER TX HASH before fee bumping ───
    const innerTxHash = tx.hash().toString('hex');
    log.info(`[Investment] Inner TX hash: ${innerTxHash}`);

    // ─── FEE BUMP SPONSORSHIP ───
    let feeBumpHash;
    try {
      const sponsorResult = await PasskeyWalletService.submitWithSponsorship(tx);
      feeBumpHash = sponsorResult.hash;
      log.info(`[Investment] Fee-bumped TX submitted: ${feeBumpHash} (inner: ${innerTxHash})`);
    } catch (sponsorErr) {
      // No DB record to revert — just throw
      log.error(`[Investment] Fee bump sponsorship failed: ${sponsorErr.message}`);
      throw new Error(`Fee-bump sponsorship failed: ${sponsorErr.message}`);
    }

    // ─── HORIZON CONFIRMED — create DB records NOW ───
    log.info(`[Investment] Transaction confirmed by Horizon: ${innerTxHash}`);

    // Create the Investment record directly as 'distributed'
    const investment = await Investment.create({
      investor_id: investorId,
      offer_id: offerId,
      asset_code: assetCode,
      usdc_amount: totalDeduction,
      token_amount: tokenAmount,
      memo: null,
    });

    await Investment.updateStatus(investment.id, {
      status: 'distributed',
      usdc_payment_hash: innerTxHash,
      distribution_tx_hash: innerTxHash,
    });

    log.info(`[Investment] Created investment #${investment.id} as distributed (atomic swap).`);

    // Create token_distributions record for portfolio
    try {
      await prisma.tokenDistribution.create({
        data: {
          investorId: investorId,
          assetCode: assetCode,
          amount: tokenAmount,
          transactionHash: innerTxHash,
          usdcPaymentHash: innerTxHash,
          offerId: offerId,
          memo: null,
          approvalStatus: 'approved',
        },
      });
      log.info(`[Investment] Created token_distributions record for atomic trade #${investment.id}`);
    } catch (distErr) {
      log.error(`[Investment] Failed to create distribution record: ${distErr.message}`);
    }

    // ─── BACKGROUND: Soroban RPC diagnostic polling (fire-and-forget) ───
    (async () => {
      try {
        const { rpc: rpcLib } = await import('@stellar/stellar-sdk');
        const sorobanRpc = new rpcLib.Server(process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org');
        const maxWait = 60_000;
        const pollInterval = 3_000;
        let waited = 0;
        let txResult;

        while (waited < maxWait) {
          await new Promise(r => setTimeout(r, pollInterval));
          waited += pollInterval;
          txResult = await sorobanRpc.getTransaction(innerTxHash);
          if (txResult.status !== 'NOT_FOUND') break;
        }

        if (txResult?.status === 'FAILED') {
          log.error(`[Investment] [BG] TX ${innerTxHash} FAILED on Soroban RPC`);
        } else if (txResult?.status === 'SUCCESS') {
          log.info(`[Investment] [BG] Soroban RPC confirmed SUCCESS for ${innerTxHash} (ledger ${txResult.ledger})`);
        } else {
          log.warn(`[Investment] [BG] Soroban RPC status: ${txResult?.status || 'TIMEOUT'} for ${innerTxHash}`);
        }
      } catch (bgErr) {
        log.warn(`[Investment] [BG] RPC poll error (non-fatal): ${bgErr.message}`);
      }
    })();

    // ─── RECORD METRICS ───
    try {
      const { SorobanMetrics } = await import('../services/sorobanMetrics.service.js');
      const durationMs = Date.now() - metricsStart;
      SorobanMetrics.recordTrade({ durationMs, success: true, investmentId: investment.id });
    } catch (metricsErr) {
      log.warn(`[Investment] Metrics recording failed: ${metricsErr.message}`);
    }

    return res.json({
      success: true,
      message: 'Investment completed — tokens received',
      data: {
        investmentId: investment.id,
        transactionHash: innerTxHash,
        status: 'distributed',
      },
    });
  } catch (error) {
    log.error('[Investment] Submit TX failed:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit investment transaction',
    });
  }
};
