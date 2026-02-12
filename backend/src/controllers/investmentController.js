import { Investor } from '../models/Investor.js';
import { Token } from '../models/Token.js';
import { Investment } from '../models/Investment.js';
import { StellarService } from '../services/stellar.service.js';
import { PaymentService } from '../services/payment.service.js';
import { getTreasuryPublicKey } from '../config/stellar.js';
import { PasskeyWalletService } from '../services/passkeyWallet.service.js';
import { addDistributionJob, isQueueAvailable } from '../services/distributionQueue.service.js';
import { ConfigService } from '../services/config.service.js';
import prisma from '../config/prisma.js';
import crypto from 'crypto';


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
        .then(() => console.log(`[JIT Onboarding] Successfully ensured trustline for ${investor.id} / ${assetCode}`))
        .catch(err => console.warn(`[JIT Onboarding] Non-critical failure during early trustline setup for ${investor.id}:`, err.message));
    }

    // Cancel any stale pending investments for same investor/offer
    const existingPending = await Investment.findPendingByInvestorAndOffer(parseInt(investorId, 10), offerId);
    if (existingPending) {
      console.log(`[Investment] Cancelling stale pending investment #${existingPending.id} for investor ${investorId}`);
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
        const cutoffDays = await ConfigService.getFloat('MATURITY_CUTOFF_DAYS', 90);
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

    // Criar registro de investimento primeiro
    const investment = await Investment.create({
      investor_id: investorId,
      offer_id: offerId || null,
      asset_code: assetCode,
      usdc_amount: totalDeduction, // Total wallet deduction (investment + fee)
      token_amount: tokenAmount,   // Full investment amount in tokens
      memo: null,
    });

    // Generate Memo using the new ID
    const memo = generateInvestmentMemo(investment.id, investorId, assetCode);

    // Update investment with the generated memo
    await Investment.updateStatus(investment.id, { memo: memo });

    // --- SMART WALLET FLOW: Build SAC transfer for passkey signing ---
    if (investorWallet.startsWith('C') && offerId) {
      try {
        // Resolve company wallet from offer
        const offer = await (await import('../models/Offer.js')).Offer.findById(parseInt(offerId));
        const companyWallet = offer?.company?.stellarContractId || offer?.company?.stellarPublicKey;

        if (!companyWallet) {
          throw new Error('Company wallet not found for this offer');
        }

        // Route to treasury muxed address (per-company fund segregation)
        // Funds pool in treasury G-address; muxed ID (company.id) is recorded on-chain
        // Company claims funds later via admin-approved settlement
        const { getTreasuryPublicKey } = await import('../config/stellar.js');
        const { MuxedAccount, Account: StellarAccount } = await import('@stellar/stellar-sdk');
        const treasuryPubKey = getTreasuryPublicKey();
        const companyId = offer?.company?.id || 0;
        const muxedAcct = new MuxedAccount(
          new StellarAccount(treasuryPubKey, '0'),
          companyId.toString()
        );
        const treasuryMuxed = muxedAcct.accountId(); // M... address

        console.log(`[Investment] Routing ${totalDeduction} USDC to treasury muxed address (company #${companyId}): ${treasuryMuxed}`);

        const txData = await PasskeyWalletService.buildInvestmentTx(
          investorWallet,
          treasuryMuxed,
          totalDeduction
        );

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
            },
            // Smart wallet transaction for passkey signing
            transaction: {
              xdr: txData.xdr,
              networkPassphrase: txData.networkPassphrase,
              walletId: txData.walletId,
              companyWallet: companyWallet,
            },
          },
        });
      } catch (txError) {
        console.error('[Investment] Failed to build smart wallet transfer:', txError);
        // Cancel the investment if we can't build the transaction
        await Investment.updateStatus(investment.id, {
          status: 'failed',
          error_message: `Transaction build failed: ${txError.message}`,
        });
        return res.status(500).json({
          success: false,
          error: `Failed to prepare investment transaction: ${txError.message}`,
        });
      }
    }

    // --- LEGACY FLOW: Manual USDC transfer (classic G-address accounts) ---
    const treasuryAddress = getTreasuryPublicKey();

    // Verificar se pagamento USDC já foi recebido (Passando o Memo)
    const usdcPayment = await StellarService.verifyUSDCPayment(
      investorWallet,
      usdcAmount,
      treasuryAddress,
      USDC_PAYMENT_WINDOW_MINUTES,
      memo
    );

    if (!usdcPayment) {
      return res.status(202).json({
        success: true,
        message: 'Investment created. Please send USDC payment.',
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
          },
          paymentInstructions: {
            treasuryAddress: treasuryAddress,
            requiredAmount: totalDeduction.toString(),
            investmentAmount: grossAmount.toString(),
            blockchainFee: fixedFee.toString(),
            assetCode: 'USDC',
            memo: memo,
            memoType: 'text',
            windowMinutes: USDC_PAYMENT_WINDOW_MINUTES,
            message: `Send ${totalDeduction} USDC to ${treasuryAddress} with MEMO: ${memo}`,
          },
        },
      });
    }

    // Pagamento encontrado, processar distribuição
    // Tentar usar fila se disponível, senão processar sincronamente
    if (isQueueAvailable()) {
      return await processInvestmentPaymentWithQueue(investment, usdcPayment, req, res, next);
    } else {
      return await processInvestmentPayment(investment, usdcPayment, req, res, next);
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
      console.log(`[InvestmentController] JIT Authorizing ${targetWallet} for ${investment.assetCode}...`);
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
      console.error('Failed to update investment status:', updateError);
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
    if (investment.status !== 'pending_payment') {
      return res.status(400).json({
        success: false,
        error: `Investment is not pending payment (status: ${investment.status})`,
      });
    }

    // Add operations keypair signature and submit directly to Soroban RPC
    // The frontend only signed the Soroban auth entries (passkey).
    // We need to add the envelope signature (ops keypair = source account).
    const { TransactionBuilder, xdr } = await import('@stellar/stellar-sdk');
    const { getNetworkPassphrase, getOperationsKeypair } = await import('../config/stellar.js');

    const networkPassphrase = getNetworkPassphrase();
    const opsKeypair = getOperationsKeypair();
    const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

    // === DIAGNOSTIC: Log inner TX details ===
    console.log(`[Investment] Inner TX source: ${tx.source}`);
    console.log(`[Investment] Inner TX fee: ${tx.fee}`);
    console.log(`[Investment] Ops keypair: ${opsKeypair.publicKey()}`);
    console.log(`[Investment] Source matches opsKeypair? ${tx.source === opsKeypair.publicKey()}`);
    const innerOp = tx.operations?.[0];
    if (innerOp?.type === 'invokeHostFunction') {
      const authEntries = innerOp.auth || [];
      console.log(`[Investment] Auth entries count: ${authEntries.length}`);
      authEntries.forEach((entry, i) => {
        try {
          const creds = entry.credentials();
          const credType = creds.switch().name;
          console.log(`[Investment] Auth[${i}] cred type: ${credType}`);
          if (credType === 'sorobanCredentialsAddress') {
            const addr = creds.address();
            console.log(`[Investment] Auth[${i}] address: ${addr.address().toString()}`);
            console.log(`[Investment] Auth[${i}] nonce: ${addr.nonce().toString()}`);
            console.log(`[Investment] Auth[${i}] expiration: ${addr.signatureExpirationLedger()}`);
            console.log(`[Investment] Auth[${i}] sig type: ${addr.signature().switch().name}`);
          }
        } catch (e) {
          console.log(`[Investment] Auth[${i}] parse error: ${e.message}`);
        }
      });
    }
    // === END DIAGNOSTIC ===

    // Add the source account signature
    tx.sign(opsKeypair);

    // === DIAGNOSTIC: Pre-submission simulation to get contract error details ===
    try {
      const { rpc } = await import('@stellar/stellar-sdk');
      const sorobanServer = new rpc.Server(process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org');
      const simResult = await sorobanServer.simulateTransaction(tx);
      if ('error' in simResult || simResult.error) {
        console.log('[Investment] PRE-SUBMIT SIMULATION FAILED:');
        console.log('[Investment] Sim error:', JSON.stringify(simResult.error));
        if (simResult.events) {
          console.log('[Investment] Sim diagnostic events:', JSON.stringify(simResult.events, null, 2));
        }
        if (simResult.results) {
          console.log('[Investment] Sim results:', JSON.stringify(simResult.results));
        }
      } else {
        console.log('[Investment] Pre-submit simulation OK, minResourceFee:', simResult.minResourceFee);
      }
    } catch (simErr) {
      console.log('[Investment] Pre-submit sim error:', simErr.message);
    }
    // === END DIAGNOSTIC ===

    console.log(`[Investment] Submitting passkey-signed TX for investment #${investmentId}...`);

    // === DEBUG: Submit via Soroban RPC directly (bypasses fee-bump) ===
    // This gives us diagnostic events on failure, unlike Horizon's empty result_xdr.
    // TODO: Revert to fee-bump after fixing the auth issue.
    const { rpc: rpcLib } = await import('@stellar/stellar-sdk');
    const sorobanRpc = new rpcLib.Server(process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org');

    const sendResult = await sorobanRpc.sendTransaction(tx);
    console.log(`[Investment] sendTransaction status: ${sendResult.status}`);
    console.log(`[Investment] sendTransaction hash: ${sendResult.hash}`);

    if (sendResult.status === 'ERROR') {
      console.error('[Investment] sendTransaction immediate ERROR:', JSON.stringify(sendResult, null, 2));
      throw new Error(`Soroban sendTransaction rejected: ${sendResult.errorResult?.toXDR('base64') || 'unknown'}`);
    }

    // Poll getTransaction until resolved or timeout (60s max)
    let txResult;
    const maxWait = 60_000;
    const pollInterval = 3_000;
    let waited = 0;

    while (waited < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));
      waited += pollInterval;

      txResult = await sorobanRpc.getTransaction(sendResult.hash);
      console.log(`[Investment] getTransaction status: ${txResult.status} (${waited / 1000}s elapsed)`);

      if (txResult.status !== 'NOT_FOUND') break;
    }

    if (!txResult || txResult.status === 'NOT_FOUND') {
      throw new Error('Transaction not found after 60s polling');
    }

    if (txResult.status === 'FAILED') {
      console.error('[Investment] === TRANSACTION FAILED ===');
      console.error('[Investment] Result XDR:', txResult.resultXdr?.toXDR?.('base64') || 'N/A');
      console.error('[Investment] Result meta XDR:', txResult.resultMetaXdr?.toXDR?.('base64') || 'N/A');

      // Extract diagnostic events from result meta
      try {
        const meta = txResult.resultMetaXdr;
        if (meta) {
          const v3 = meta.value?.()?.sorobanMeta?.();
          if (v3) {
            const diagEvents = v3.diagnosticEvents?.() || [];
            console.error(`[Investment] Diagnostic events (${diagEvents.length}):`);
            diagEvents.forEach((evt, i) => {
              try {
                console.error(`[Investment]   Event[${i}]:`, JSON.stringify(evt.toXDR('base64')));
                // Try to decode the event body
                const body = evt.event?.()?.body?.();
                if (body) {
                  const data = body.value?.()?.data?.();
                  if (data) {
                    console.error(`[Investment]   Event[${i}] data type:`, data.switch?.()?.name);
                    if (data.switch?.()?.name === 'scvError') {
                      console.error(`[Investment]   Event[${i}] ERROR:`, data.error?.()?.switch?.()?.name, data.error?.()?.value?.());
                    }
                    if (data.switch?.()?.name === 'scvU32') {
                      console.error(`[Investment]   Event[${i}] U32 value:`, data.u32?.());
                    }
                  }
                }
              } catch (evtErr) {
                console.error(`[Investment]   Event[${i}] decode error:`, evtErr.message);
              }
            });
          }
        }
      } catch (metaErr) {
        console.error('[Investment] Meta decode error:', metaErr.message);
      }

      throw new Error(`Transaction FAILED on-chain. Hash: ${sendResult.hash}. Check logs for diagnostic events.`);
    }

    console.log(`[Investment] Transaction SUCCEEDED: ${sendResult.hash}`);
    const result = { hash: sendResult.hash, ledger: txResult.ledger };

    // Update investment status
    await Investment.updateStatus(parseInt(investmentId), {
      status: 'payment_received',
      usdc_payment_hash: result.hash,
    });

    console.log(`[Investment] Smart wallet payment submitted for investment #${investmentId}: ${result.hash}`);

    // Funds are now in the treasury muxed address (per-company segregation).
    // Company claims funds via admin-approved settlement (Phase 2).

    // Trigger token distribution
    if (isQueueAvailable()) {
      await addDistributionJob({
        investmentId: parseInt(investmentId),
        investorPublicKey: investment.investorId?.toString(),
        assetCode: investment.assetCode,
        amount: investment.tokenAmount?.toString(),
        memo: investment.memo,
      });
    }

    return res.json({
      success: true,
      message: 'Investment payment submitted successfully',
      data: {
        investmentId: parseInt(investmentId),
        transactionHash: result.hash,
        status: 'payment_received',
      },
    });
  } catch (error) {
    console.error('[Investment] Submit TX failed:', error);

    // If we have an investmentId, mark the investment as failed
    if (req.body?.investmentId) {
      try {
        await Investment.updateStatus(parseInt(req.body.investmentId), {
          status: 'failed',
          error_message: `Payment submission failed: ${error.message}`,
        });
      } catch (updateErr) {
        console.error('[Investment] Failed to update investment status:', updateErr);
      }
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit investment transaction',
    });
  }
};
