import { Investor } from '../models/Investor.js';
import { Token } from '../models/Token.js';
import { Investment } from '../models/Investment.js';
import { StellarService } from '../services/stellar.service.js';
import { PasskeyWalletService } from '../services/passkeyWallet.service.js';
import { SorobanSaleService } from '../services/sorobanSale.service.js';
import { ConfigService } from '../services/config.service.js';
import { StrKey } from '@stellar/stellar-sdk';
import prisma from '../config/prisma.js';
import crypto from 'crypto';
import logger from '../utils/logger.js';
const log = logger.scope('InvestmentController');

// ── SECURITY: HMAC integrity for investmentContext ──
// Signs context server-side in purchaseInvestment, verifies in submitInvestmentTx.
// Prevents client-side tampering of tokenAmount, totalDeduction, etc.
//
//   purchaseInvestment              submitInvestmentTx
//   ┌────────────────┐              ┌──────────────────┐
//   │ Build context   │              │ Receive context   │
//   │ Sign with HMAC  │──→ client ──→│ Verify HMAC       │
//   │ Return to client│              │ Re-derive amounts │
//   └────────────────┘              │ Create DB records │
//                                   └──────────────────┘

const HMAC_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret';

/**
 * Create HMAC signature for investmentContext
 * @param {object} ctx - investmentContext fields
 * @returns {string} hex HMAC signature
 */
function signInvestmentContext(ctx) {
  const payload = `${ctx.investorId}:${ctx.offerId}:${ctx.usdcAmount}:${ctx.assetCode}`;
  return crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
}

/**
 * Verify HMAC signature on investmentContext
 * @param {object} ctx - investmentContext with hmac field
 * @returns {boolean} true if valid
 */
function verifyInvestmentContext(ctx) {
  if (!ctx.hmac) return false;
  const expected = signInvestmentContext(ctx);
  return crypto.timingSafeEqual(Buffer.from(ctx.hmac, 'hex'), Buffer.from(expected, 'hex'));
}


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

    // Fee Logic — fixed processing fee is enforced on-chain via contract fixed_fee.
    // Here we log it for audit trail only.
    const grossAmount = parseFloat(usdcAmount);
    const processingFee = parseFloat(offer.processingFee) || 5; // $5 default

    if (grossAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Investment amount must be greater than zero.',
      });
    }

    const tokenAmount = grossAmount;
    const totalDeduction = grossAmount; // Investment principal only — contract adds fixed_fee on top (additive model v6)

    // Log processing fee for audit
    if (processingFee > 0) {
      await ConfigService.logFee({
        amount: processingFee,
        assetCode: 'USDC',
        category: 'PROCESSING_FEE',
        sourceId: offerId || null,
        description: `Processing Fee: $${processingFee} USDC per trade — enforced on-chain`,
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

      log.info(`[Investment] Building XDR via Soroban contract ${offer.sorobanContractId} for trade (${grossAmount} USDC)`);

      // ─── SAC AUTHORIZATION (auth_required compliance) ───
      // For issuers with AUTH_REQUIRED, both the sale contract (sender)
      // and the buyer (receiver) must have authorized balances on the SAC.
      // The issuer key (SAC admin) signs and submits set_authorized() calls
      // automatically. Pre-flight check avoids redundant TXs.
      if (token.sacContractId) {
        try {
          // Authorize sale contract first, then buyer (sequential — same TX source account)
          const saleAuthResult = await SorobanSaleService.authorizeBuyerOnSac(
            token.sacContractId, offer.sorobanContractId
          );
          const buyerAuthResult = await SorobanSaleService.authorizeBuyerOnSac(
            token.sacContractId, investorWallet
          );

          if (saleAuthResult.alreadyAuthorized) {
            log.info(`[Investment] Sale contract ${offer.sorobanContractId.slice(0, 8)}… already authorized`);
          } else {
            log.info(`[Investment] Sale contract authorized on SAC (tx: ${saleAuthResult.txHash})`);
          }

          if (buyerAuthResult.alreadyAuthorized) {
            log.info(`[Investment] Buyer ${investorWallet.slice(0, 8)}… already authorized on SAC`);
          } else {
            log.info(`[Investment] Buyer ${investorWallet.slice(0, 8)}… authorized on SAC (tx: ${buyerAuthResult.txHash})`);
          }
        } catch (authErr) {
          log.error(`[Investment] SAC authorization failed: ${authErr.message}`);
          return res.status(500).json({
            success: false,
            error: 'Failed to authorize your wallet for this token. Please try again or contact support.',
          });
        }
      }

      const txData = await SorobanSaleService.buildTradeXdr(
        offer.sorobanContractId,
        investorWallet,
        grossAmount
      );

      // Return XDR + context (NO DB record created)
      // SECURITY: HMAC-sign the context so submitInvestmentTx can verify integrity
      const ctx = {
        investorId: parseInt(investorId, 10),
        offerId: parseInt(offerId),
        usdcAmount: grossAmount,
        feeAmount: processingFee,
        totalDeduction: totalDeduction,
        tokenAmount: tokenAmount,
        assetCode: assetCode,
        // Original unsigned XDR with sorobanData (resources/footprint).
        // Frontend's cloneFrom() drops sorobanData when rebuilding the TX
        // with signed auth entries, so we restore it in submitInvestmentTx.
        originalXdr: txData.xdr,
      };
      ctx.hmac = signInvestmentContext(ctx);

      return res.status(200).json({
        success: true,
        message: 'Transaction prepared. Sign with your passkey to complete.',
        data: {
          // Context needed by submitInvestmentTx after signing
          investmentContext: ctx,
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

    res.json({
      success: true,
      data: {
        processingFee: 5.0,    // $5 USDC per trade (globally configurable)
        yieldFee: 'Spread-based (company rate - investor rate)',
        description: 'A fixed $5 processing fee is deducted per trade on-chain. Yield revenue is earned via the spread between company cost of capital and investor advertised return.',
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

    // ── SECURITY: Verify HMAC integrity of investmentContext ──
    if (!verifyInvestmentContext(investmentContext)) {
      log.warn(`[Investment] HMAC verification failed for investor #${investorId}, offer #${offerId}`);
      return res.status(403).json({
        success: false,
        error: 'Investment context integrity check failed. Please restart the purchase flow.',
      });
    }

    // ─── Idempotent return: if investor already has a completed/in-flight investment ───
    // Prevents wasted fee-bump fees and duplicate records on browser retries.
    const existingInvestment = await prisma.investment.findFirst({
      where: {
        investorId: parseInt(investorId, 10),
        offerId: parseInt(offerId, 10),
        status: { in: ['trade_submitted', 'distributed'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingInvestment) {
      log.info(`[Investment] Idempotent return: investor #${investorId} already has investment #${existingInvestment.id} (${existingInvestment.status})`);
      return res.json({
        success: true,
        idempotent: true,
        data: {
          investmentId: existingInvestment.id,
          status: existingInvestment.status,
          transactionHash: existingInvestment.usdcPaymentHash,
        },
      });
    }

    // ─── RACE CONDITION GUARD ───
    // Two simultaneous requests could both pass the idempotency check (no record yet).
    // This catches the second request if the first already created a pending_payment record.
    const pendingDuplicate = await prisma.investment.findFirst({
      where: {
        investorId: parseInt(investorId, 10),
        offerId: parseInt(offerId, 10),
        status: { in: ['pending_payment', 'trade_submitted'] },
      },
    });

    if (pendingDuplicate) {
      log.warn(`[Investment] Duplicate pending investment blocked: investor #${investorId}, existing #${pendingDuplicate.id}`);
      return res.status(409).json({
        success: false,
        error: 'Duplicate pending investment blocked',
        existingInvestmentId: pendingDuplicate.id,
      });
    }

    // ── SECURITY: Re-derive critical values server-side ──
    // Never trust tokenAmount or totalDeduction from the client.
    const { Offer } = await import('../models/Offer.js');
    const offer = await Offer.findById(parseInt(offerId));
    if (!offer || offer.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Offer is not available for investment',
      });
    }

    const serverUsdcAmount = parseFloat(usdcAmount);
    const serverUnitPrice = parseFloat(offer.unitPrice) || 1;
    const serverTokenAmount = serverUsdcAmount / serverUnitPrice;
    const serverTotalDeduction = serverUsdcAmount;

    // Verify the authenticated user matches the investorId in context
    // Note: resolvedInvestorId may differ after auth entry parsing (chain truth),
    // but the JWT user must match the ORIGINAL initiator.
    if (req.user && req.user.userId !== parseInt(investorId, 10)) {
      log.warn(`[Investment] User mismatch: token userId=${req.user.userId}, context investorId=${investorId}`);
      return res.status(403).json({
        success: false,
        error: 'Investment context does not match authenticated user',
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

    // ─── ENFORCING MODE RE-SIMULATION (per Stellar docs) ───
    // Recording Mode simulation doesn't execute __check_auth, so its footprint
    // and resource estimates are INCOMPLETE. The official fee-payer pattern is:
    //   1. Client signs auth entries
    //   2. Fee-payer re-simulates in Enforcing Mode (executes __check_auth)
    //   3. Fee-payer uses assembleTransaction to get correct footprint + resources
    //   4. Fee-payer signs and submits
    //
    // Auth entry signatures use ENVELOPE_TYPE_SOROBAN_AUTHORIZATION preimage
    // (independent of TX body hash), so re-simulation + assemble won't
    // invalidate them.
    const { TransactionBuilder, xdr: stellarXdr, Operation, BASE_FEE } = await import('@stellar/stellar-sdk');
    const rpc = await import('@stellar/stellar-sdk/rpc');
    const { getNetworkPassphrase, getOperationsKeypair, getSorobanRpcUrl } = await import('../config/stellar.js');

    const networkPassphrase = getNetworkPassphrase();
    const opsKeypair = getOperationsKeypair();
    const rpcServer = new rpc.Server(getSorobanRpcUrl());

    // Parse the signed TX from frontend to extract the operation + signed auth entries
    const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
    const invokeOp = signedTx.operations[0];

    if (!invokeOp || invokeOp.type !== 'invokeHostFunction') {
      throw new Error('Expected invokeHostFunction operation');
    }

    log.info(`[Investment] Received signed TX with ${invokeOp.auth?.length || 0} auth entries`);

    // ─── CHAIN TRUTH: Extract actual buyer wallet from signed auth entries ───
    // The user may have signed with a different passkey than the one associated
    // with the investor account that initiated the purchase. The auth entry's
    // credential address tells us which smart wallet actually authorized the TX.
    let resolvedInvestorId = parseInt(investorId, 10);
    let actualBuyerWallet = null;

    if (invokeOp.auth?.length > 0) {
      try {
        const firstAuth = invokeOp.auth[0];
        const credentials = firstAuth.credentials();

        if (credentials.switch().name === 'sorobanCredentialsAddress') {
          const scAddress = credentials.address().address();

          if (scAddress.switch().name === 'scAddressTypeContract') {
            actualBuyerWallet = StrKey.encodeContract(scAddress.contractId());
          } else if (scAddress.switch().name === 'scAddressTypeAccount') {
            actualBuyerWallet = StrKey.encodeEd25519PublicKey(scAddress.accountId().ed25519());
          }
        }
      } catch (authParseErr) {
        log.warn(`[Investment] Failed to parse auth entry address: ${authParseErr.message}`);
      }
    }

    if (actualBuyerWallet) {
      // Look up who owns this wallet on-chain
      const walletOwner = await prisma.investor.findFirst({
        where: { stellarContractId: actualBuyerWallet },
        select: { id: true, name: true },
      });

      if (!walletOwner) {
        // Wallet not found in investors table (e.g., company wallet)
        log.warn(`[Investment] Auth signer wallet ${actualBuyerWallet.slice(0, 12)}… not found in investors table. Rejecting.`);
        return res.status(400).json({
          success: false,
          error: 'The passkey you used belongs to a wallet not registered as an investor. Please select the correct passkey.',
        });
      }

      if (walletOwner.id !== resolvedInvestorId) {
        log.info(`[Investment] Auth signer differs from initiator: wallet belongs to investor #${walletOwner.id} (${walletOwner.name}), context had #${resolvedInvestorId}. Using chain truth.`);
        resolvedInvestorId = walletOwner.id;
      }
    }

    // Rebuild TX with opsKeypair as source (fee-payer pattern from Stellar docs)
    // We need a fresh source account with current sequence number
    const opsAccount = await rpcServer.getAccount(opsKeypair.publicKey());

    // Use BASE_FEE (not signedTx.fee) — the signed TX carries a 5× boosted fee
    // from boostResources (rough frontend estimate). assembleTransaction picks
    // max(existingFee, simMinResourceFee), so passing the inflated fee would
    // leak the boost into the final TX. BASE_FEE lets the Enforcing Mode
    // simulation set the correct fee.
    const rebuiltTx = new TransactionBuilder(opsAccount, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .setTimeout(30)
      .addOperation(
        Operation.invokeHostFunction({
          func: invokeOp.func,
          auth: invokeOp.auth || [],
        })
      )
      .build();

    // Re-simulate in Enforcing Mode — this executes __check_auth and returns
    // the COMPLETE footprint (including WebAuthn verifier entries) and
    // accurate resource estimates.
    log.info(`[Investment] Re-simulating in Enforcing Mode...`);
    const simResult = await rpcServer.simulateTransaction(rebuiltTx);

    if (rpc.Api.isSimulationError(simResult)) {
      log.error(`[Investment] Enforcing Mode simulation FAILED: ${simResult.error}`);
      if (simResult.events?.length) {
        for (const evt of simResult.events) {
          try {
            const diagEvt = evt.event();
            const body = diagEvt.body().v0();
            const topics = body.topics().map(t => {
              if (t.switch().name === 'scvSymbol') return t.sym().toString();
              if (t.switch().name === 'scvString') return t.str().toString();
              return `[${t.switch().name}]`;
            });
            log.error(`[Investment] SimEvent: topics=[${topics.join(', ')}]`);
          } catch (_) {}
        }
      }
      throw new Error(`Enforcing Mode simulation failed: ${simResult.error}`);
    }

    log.info(`[Investment] ✅ Enforcing Mode simulation succeeded`);
    if (simResult.cost) {
      log.info(`[Investment] Sim cost — cpuInsns: ${simResult.cost.cpuInsns}, memBytes: ${simResult.cost.memBytes}`);
    }

    // Assemble the TX — applies the correct footprint, resources, and fees
    // from the Enforcing Mode simulation result
    const { assembleTransaction } = await import('@stellar/stellar-sdk/rpc');
    let tx = assembleTransaction(rebuiltTx, simResult).build();

    // Log the assembled TX's resources for verification
    try {
      const asmEnv = tx.toEnvelope();
      const asmTxBody = asmEnv.v1().tx();
      if (asmTxBody.ext().switch() === 1) {
        const asmRes = asmTxBody.ext().sorobanData().resources();
        log.info(`[Investment] Assembled TX — instructions: ${asmRes.instructions()}, readBytes: ${asmRes.diskReadBytes()}, writeBytes: ${asmRes.writeBytes()}`);
        log.info(`[Investment] Assembled TX — footprint: readOnly=${asmRes.footprint().readOnly().length}, readWrite=${asmRes.footprint().readWrite().length}`);
      }
    } catch (_) {}

    // Sign with operations account (TX source)
    tx.sign(opsKeypair);

    log.info(`[Investment] Submitting passkey-signed TX for investor #${resolvedInvestorId}${resolvedInvestorId !== parseInt(investorId, 10) ? ` (initiated by #${investorId})` : ''}, offer #${offerId}...`);
    const metricsStart = Date.now();

    // ─── CAPTURE INNER TX HASH before fee bumping ───
    const innerTxHash = tx.hash().toString('hex');
    log.info(`[Investment] Inner TX hash: ${innerTxHash}`);

    // ─── CREATE DB RECORD BEFORE BROADCAST (crash recovery anchor) ───
    // If the server crashes after TX broadcast but before this update,
    // SorobanReconciler will find this 'trade_submitted' record and
    // check on-chain status to resolve it.
    const investment = await Investment.create({
      investor_id: resolvedInvestorId,
      offer_id: offerId,
      asset_code: assetCode,
      usdc_amount: serverTotalDeduction,
      token_amount: serverTokenAmount,
      memo: null,
    });

    await Investment.updateStatus(investment.id, {
      status: 'trade_submitted',
      usdc_payment_hash: innerTxHash,
    });

    log.info(`[Investment] Created investment #${investment.id} as trade_submitted (pre-broadcast anchor)`);

    // ─── FEE BUMP SPONSORSHIP ───
    let feeBumpHash;
    try {
      const sponsorResult = await PasskeyWalletService.submitWithSponsorship(tx);
      feeBumpHash = sponsorResult.hash;
      log.info(`[Investment] Fee-bumped TX submitted: ${feeBumpHash} (inner: ${innerTxHash})`);
    } catch (sponsorErr) {
      // TX failed — mark investment as failed so investor can retry
      log.error(`[Investment] Fee bump sponsorship failed: ${sponsorErr.message}`);
      await Investment.updateStatus(investment.id, {
        status: 'failed',
        error_message: `Fee-bump sponsorship failed: ${sponsorErr.message}`,
      });
      throw new Error(`Fee-bump sponsorship failed: ${sponsorErr.message}`);
    }

    // ─── HORIZON CONFIRMED — update to distributed ───
    log.info(`[Investment] Transaction confirmed by Horizon: ${innerTxHash}`);

    await Investment.updateStatus(investment.id, {
      status: 'distributed',
      usdc_payment_hash: innerTxHash,
      distribution_tx_hash: innerTxHash,
    });

    log.info(`[Investment] Investment #${investment.id} updated to distributed (atomic swap confirmed).`);

    // Create token_distributions record for portfolio
    // SECURITY: Use server-derived tokenAmount
    try {
      await prisma.tokenDistribution.create({
        data: {
          investorId: resolvedInvestorId,
          assetCode: assetCode,
          amount: serverTokenAmount,
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
