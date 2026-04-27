import { Investor } from '../models/Investor.js';
import { StellarService } from '../services/stellar.service.js';
import { isTestnet } from '../config/stellar.js';

import { DepositRelayService } from '../services/depositRelay.service.js';
import { PasskeyWalletService, UserType } from '../services/passkeyWallet.service.js';
import { EmailService } from '../services/email.service.js';
import { generateToken } from '../middleware/auth.js';
import { generateRefreshToken, setRefreshCookie } from '../middleware/auth.js';
import prisma from '../config/prisma.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generate6DigitCode, storeEmailCode, verifyEmailCode as redisVerifyEmailCode } from '../config/redis.js';
import logger from '../utils/logger.js';
const log = logger.scope('InvestorController');





export const getInvestors = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const offset = parseInt(req.query.offset || '0', 10);

    const investors = await Investor.findAll(limit, offset);

    res.json({
      success: true,
      data: investors,
      pagination: {
        limit,
        offset,
        count: investors.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getInvestorById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const investor = await Investor.findById(parseInt(id, 10));

    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: investor.id,
        name: investor.name,
        email: investor.email,
        document: investor.document,
        stellarContractId: investor.stellarContractId,
        kycStatus: investor.kycStatus,
        emailVerified: investor.emailVerified,
        lastLogin: investor.lastLogin,
        createdAt: investor.createdAt,
        updatedAt: investor.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};



export const getInvestorPayments = async (req, res, next) => {
  try {
    const { investorId } = req.params;
    const { assetCode, type, limit = 100, offset = 0, offerId } = req.query;

    const parsedId = parseInt(investorId, 10);
    const investor = await Investor.findById(parsedId);
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    const baseWhere = { investorId: parsedId };
    if (assetCode) baseWhere.assetCode = assetCode;

    // offerId filter — applied per-query (Deposit has no offerId field)
    const offerFilter = offerId ? { offerId: parseInt(offerId, 10) } : {};

    // Fetch all 4 sources in parallel
    const [interestPayments, investments, deposits, distributions] = await Promise.all([
      (!type || type === 'interest') ? prisma.interestPayment.findMany({
        where: { ...baseWhere, ...offerFilter },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      }) : [],
      (!type || type === 'purchase') ? prisma.investment.findMany({
        where: { ...baseWhere, ...offerFilter },
        include: { offer: { select: { offerName: true } } },
        orderBy: { createdAt: 'desc' },
      }) : [],
      (!type || type === 'deposit') ? prisma.deposit.findMany({
        where: { investorId: parsedId },
        orderBy: { createdAt: 'desc' },
      }) : [],
      (!type || type === 'distribution') ? prisma.tokenDistribution.findMany({
        where: { ...baseWhere, ...offerFilter },
        orderBy: { createdAt: 'desc' },
      }) : [],
    ]);

    // Deduplicate: for Soroban atomic swaps, the investment and distribution
    // share the same TX hash. Keep only the investment entry (richer data).
    const investmentTxHashes = new Set(
      investments
        .filter(inv => inv.usdcPaymentHash || inv.distributionTxHash)
        .map(inv => inv.distributionTxHash || inv.usdcPaymentHash)
    );

    // Normalize into unified shape
    const all = [
      ...interestPayments.map(p => ({
        id: `ip-${p.id}`,
        type: 'Interest Payment',
        amount: parseFloat(p.usdcAmount || 0),
        date: p.paymentDate || p.createdAt,
        status: p.status || 'completed',
        assetCode: p.assetCode,
        txHash: p.transactionHash || null,
        details: { paymentType: p.paymentType, isBullet: p.isBulletPayment },
      })),
      ...investments.map(inv => ({
        id: `inv-${inv.id}`,
        type: 'Token Purchase',
        amount: parseFloat(inv.usdcAmount || 0),
        date: inv.createdAt,
        status: inv.status,
        assetCode: inv.assetCode,
        txHash: inv.distributionTxHash || inv.usdcPaymentHash || null,
        details: { offerName: inv.offer?.offerName || null, tokenAmount: parseFloat(inv.tokenAmount || 0) },
      })),
      ...deposits.map(d => ({
        id: `dep-${d.id}`,
        type: 'USDC Deposit',
        amount: parseFloat(d.actualAmount || d.expectedAmount || 0),
        date: d.createdAt,
        status: d.status,
        assetCode: 'USDC',
        txHash: d.incomingTxHash || d.outgoingTxHash || null,
        details: null,
      })),
      ...distributions
        .filter(td => !td.transactionHash || !investmentTxHashes.has(td.transactionHash))
        .map(td => ({
          id: `td-${td.id}`,
          type: 'Token Distribution',
          amount: parseFloat(td.amount || 0),
          date: td.createdAt,
          status: td.approvalStatus || 'completed',
          assetCode: td.assetCode,
          txHash: td.transactionHash || null,
          details: null,
        })),
    ];

    // Sort by date descending
    all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Paginate
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    const paginated = all.slice(parsedOffset, parsedOffset + parsedLimit);

    res.json({
      success: true,
      data: {
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
        },
        transactions: paginated,
        pagination: {
          total: all.length,
          limit: parsedLimit,
          offset: parsedOffset,
          count: paginated.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};



export const getInvestorPortfolio = async (req, res, next) => {
  try {
    const { id } = req.params;
    const investorId = parseInt(id, 10);

    const investor = await Investor.findById(investorId);
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    const portfolio = await Investor.getPortfolio(investorId);

    res.json({
      success: true,
      data: {
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
        },
        portfolio,
      },
    });
  } catch (error) {
    next(error);
  }
};



/**
 * Get investor investments with optional status filter
 * GET /api/investors/:id/investments
 */
export const getInvestorInvestments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;
    const investorId = parseInt(id, 10);

    const investor = await Investor.findById(investorId);
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    // Build query filter
    const where = { investorId };
    if (status) {
      // Support comma-separated status list (e.g., "pending_payment,payment_received")
      const statuses = status.split(',').map(s => s.trim().toLowerCase());
      where.status = { in: statuses };
    }

    // Fetch investments with offer details
    const [investments, total] = await Promise.all([
      prisma.investment.findMany({
        where,
        include: {
          offer: {
            select: {
              id: true,
              offerName: true,
              assetCode: true,
              description: true,
            },
          },
        },
        take: parseInt(limit, 10),
        skip: parseInt(offset, 10),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.investment.count({ where }),
    ]);

    // Enhance investments with status-specific info
    const enhancedInvestments = investments.map(inv => ({
      id: inv.id,
      offerId: inv.offerId,
      offerName: inv.offer?.offerName || null,
      assetCode: inv.assetCode,
      usdcAmount: parseFloat(inv.usdcAmount),
      tokenAmount: parseFloat(inv.tokenAmount),
      status: inv.status,
      memo: inv.memo,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
      // Status-specific info
      ...(inv.status === 'payment_received' ? {
        usdcPaymentHash: inv.usdcPaymentHash,
      } : {}),
      ...(inv.status === 'distributed' ? {
        distributionTxHash: inv.distributionTxHash,
      } : {}),
      ...(inv.status === 'failed' ? {
        errorMessage: inv.errorMessage,
      } : {}),
      ...(inv.status === 'pending_distribution' ? {
        usdcPaymentHash: inv.usdcPaymentHash,
        multisigInfo: inv.errorMessage ? JSON.parse(inv.errorMessage) : null,
      } : {}),
    }));

    res.json({
      success: true,
      data: {
        investments: enhancedInvestments,
        pagination: {
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          count: investments.length,
        },
        summary: {
          pending: investments.filter(i => i.status === 'pending_payment').length,
          processing: investments.filter(i => ['payment_received', 'pending_distribution'].includes(i.status)).length,
          distributed: investments.filter(i => i.status === 'distributed').length,
          failed: investments.filter(i => i.status === 'failed').length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// EMAIL-FIRST REGISTRATION FLOW (NEW)
// ============================================================================


/**
 * Step 1: Initiate registration by sending 6-digit verification code
 * POST /api/investors/initiate-registration
 */
export const initiateRegistration = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    // Check if email already registered
    const existingInvestor = await Investor.findByEmail(email);
    if (existingInvestor) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists. Please log in instead.',
      });
    }

    // Generate and store 6-digit code
    const code = generate6DigitCode();
    const stored = await storeEmailCode(email, code);

    if (!stored) {
      log.warn('[initiateRegistration] Redis unavailable, code storage failed');
      // Continue anyway - email service will log code in dev mode
    }

    // Send verification email
    await EmailService.send6DigitVerificationCode(email, code);

    res.json({
      success: true,
      message: 'Verification code sent to your email',
      data: {
        email,
        expiresIn: '10 minutes',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Step 2: Verify email code and return registration token
 * POST /api/investors/verify-email-code
 */
export const verifyEmailCode = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: 'Email and code are required',
      });
    }

    // Verify code from Redis
    const result = await redisVerifyEmailCode(email, code);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Invalid verification code',
      });
    }

    // Generate registration token (JWT valid for 30 minutes)
    const registrationToken = jwt.sign(
      {
        email: email.toLowerCase(),
        purpose: 'registration',
        verified: true,
      },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );

    res.json({
      success: true,
      message: 'Email verified successfully',
      data: {
        email,
        registrationToken,
        expiresIn: '30 minutes',
        nextStep: 'Complete registration with your details and create a passkey',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resend verification code
 * POST /api/investors/resend-code
 */
export const resendVerificationCode = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

    // Check if email already registered
    const existingInvestor = await Investor.findByEmail(email);
    if (existingInvestor) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists',
      });
    }

    // Generate new code
    const code = generate6DigitCode();
    await storeEmailCode(email, code);

    // Send verification email
    await EmailService.send6DigitVerificationCode(email, code);

    res.json({
      success: true,
      message: 'New verification code sent',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// PASSKEY WALLET REGISTRATION FLOW (UPDATED)
// ============================================================================

/**
 * Register investor with verified email + passkey (Step 3 of email-first flow)
 * Frontend creates WebAuthn passkey FIRST, then calls this endpoint
 * 
 * REQUIRES: registrationToken from verify-email-code endpoint
 * 
 * Flow:
 * 1. Validate registrationToken → extract verified email
 * 2. Create investor with emailVerified: true
 * 3. Return JWT token (user can login immediately)
 */
export const registerInvestorWithPasskey = async (req, res, next) => {
  try {
    const { name, document, credentialId, publicKey, contractId, registrationToken, passkeyEcosystem } = req.body;

    // Debug logging
    log.info('[Registration] Received registration request:', {
      name,
      email: registrationToken ? 'present' : 'missing',
      hasCredentialId: !!credentialId,
      hasPublicKey: !!publicKey,
      publicKeyType: typeof publicKey,
      hasContractId: !!contractId,
    });

    // Validate required fields
    // Note: contractId is optional - backend deploys and generates contractId
    if (!name || !document || !credentialId || !registrationToken) {
      const missing = [];
      if (!name) missing.push('name');
      if (!document) missing.push('document');
      if (!credentialId) missing.push('credentialId');
      if (!registrationToken) missing.push('registrationToken');

      return res.status(400).json({
        success: false,
        error: `Required fields missing: ${missing.join(', ')}`,
      });
    }

    // Validate registration token and extract verified email
    let verifiedEmail;
    try {
      const decoded = jwt.verify(
        registrationToken,
        process.env.JWT_SECRET
      );

      if (decoded.purpose !== 'registration' || !decoded.verified) {
        return res.status(401).json({
          success: false,
          error: 'Invalid registration token',
        });
      }

      verifiedEmail = decoded.email;
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Registration token expired. Please verify your email again.',
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid registration token',
      });
    }

    // Check for existing investor (double-check even though we verified earlier)
    const existingInvestor = await Investor.findByEmail(verifiedEmail);
    if (existingInvestor) {
      return res.status(409).json({
        success: false,
        error: 'Investor with this email already exists',
      });
    }

    // Check for existing document
    const existingDocument = await Investor.findByDocument(document);
    if (existingDocument) {
      return res.status(409).json({
        success: false,
        error: 'Investor with this document already exists',
      });
    }

    // Validate that contractId was provided (wallet deployed by frontend via smart-account-kit)
    if (!contractId) {
      return res.status(400).json({
        success: false,
        error: 'Contract ID is required - wallet should be deployed by the frontend',
      });
    }

    // Verify contract exists on-chain — prevents ghost wallets from fake/failed deploys
    try {
      const { xdr: sdkXdr } = await import('@stellar/stellar-sdk');
      const sdkRpc = await import('@stellar/stellar-sdk/rpc');
      const { getSorobanRpcUrl } = await import('../config/stellar.js');
      const rpcServer = new sdkRpc.Server(getSorobanRpcUrl());
      await rpcServer.getContractData(contractId, sdkXdr.ScVal.scvLedgerKeyContractInstance());
    } catch (verifyErr) {
      log.warn(`[Registration] Contract ${contractId} not found on-chain:`, verifyErr.message);
      return res.status(400).json({
        success: false,
        error: 'Smart wallet contract not found on-chain. The deployment may have failed. Please try again.',
      });
    }

    log.info(`[Registration] Creating investor for ${verifiedEmail} with wallet ${contractId}`);

    // Create investor with wallet contract ID from frontend - wallet already deployed!
    const investor = await prisma.investor.create({
      data: {
        name,
        email: verifiedEmail, // Use verified email from token
        document,
        stellarContractId: contractId, // Use the contract ID from frontend
        passkeyCredentialId: credentialId,
        passkeyPublicKey: null, // No longer tracked separately - embedded in wallet contract
        passkeyEcosystem: passkeyEcosystem || null, // apple, google, windows_local, other
        kycStatus: isTestnet() ? 'approved' : 'pending',
        emailVerified: true, // Email was verified before passkey creation!
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    // ─── TESTNET AUTO-FUND: Send 1000 USDC to new wallet ───
    // Fire-and-forget so registration response isn't delayed
    if ((process.env.STELLAR_NETWORK || 'testnet') === 'testnet' && contractId) {
      (async () => {
        try {
          const { Contract, Address, nativeToScVal, TransactionBuilder, BASE_FEE } = await import('@stellar/stellar-sdk');
          const rpcMod = await import('@stellar/stellar-sdk/rpc');
          const { getNetworkPassphrase, getOperationsKeypair, getSorobanRpcUrl } = await import('../config/stellar.js');

          const sacContractId = process.env.USDC_SAC_CONTRACT_ID;
          if (!sacContractId) return;

          const opsKeypair = getOperationsKeypair();
          const rpcServer = new rpcMod.Server(getSorobanRpcUrl());
          const AMOUNT = 12_0000000n; // 12 USDC (7 decimals)

          const sac = new Contract(sacContractId);
          const op = sac.call('transfer',
            new Address(opsKeypair.publicKey()).toScVal(),
            new Address(contractId).toScVal(),
            nativeToScVal(AMOUNT, { type: 'i128' }),
          );

          const account = await rpcServer.getAccount(opsKeypair.publicKey());
          let tx = new TransactionBuilder(account, {
            fee: BASE_FEE,
            networkPassphrase: getNetworkPassphrase(),
          }).addOperation(op).setTimeout(30).build();

          const sim = await rpcServer.simulateTransaction(tx);
          if (rpcMod.Api.isSimulationError(sim)) {
            log.warn(`[Registration] Testnet auto-fund sim failed: ${sim.error}`);
            return;
          }

          tx = rpcMod.assembleTransaction(tx, sim).build();
          tx.sign(opsKeypair);
          const result = await rpcServer.sendTransaction(tx);
          log.info(`[Registration] ✅ Auto-funded 2 USDC to ${contractId} — tx: ${result.hash}`);
        } catch (err) {
          log.warn(`[Registration] Testnet auto-fund failed (non-fatal): ${err.message}`);
        }
      })();
    }

    // Send welcome email (async, don't wait)
    EmailService.sendWelcomeEmail(verifiedEmail, name, contractId)
      .catch(error => {
        log.error('Failed to send welcome email:', error);
      });

    // Generate JWT token for immediate login
    const token = generateToken({
      userId: investor.id,
      email: investor.email,
      userType: 'investor',
      role: 'investor',
    });

    // Generate refresh token and set httpOnly cookie
    const refreshToken = await generateRefreshToken('investor', investor.id);
    setRefreshCookie(res, refreshToken, 'investor');

    res.status(201).json({
      success: true,
      message: 'Registration successful! Your email is verified and wallet is ready.',
      data: {
        token,
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
          stellarContractId: investor.stellarContractId,
          kycStatus: investor.kycStatus,
          emailVerified: investor.emailVerified,
        },
        nextSteps: {
          startKyc: '/api/kyc/start',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Get wallet creation status for an investor
 */
export const getWalletStatus = async (req, res, next) => {
  try {
    const { investorId } = req.params;
    const id = parseInt(investorId, 10);

    const status = await PasskeyWalletService.getWalletStatus(
      UserType.INVESTOR,
      id
    );

    // Compute deterministic deposit memo for this investor (DEP-XXXX format)
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(`investor-${id}`).digest('hex');
    const depositMemo = `DEP${hash.substring(0, 4).toUpperCase()}`;

    res.json({
      success: true,
      data: { ...status, depositMemo },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get passkey kit client configuration
 */
export const getPasskeyConfig = async (req, res, next) => {
  try {
    const config = PasskeyWalletService.getClientConfig();

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Propose a withdrawal transaction
 */
export const proposeWithdrawal = async (req, res, next) => {
  try {
    const { investorId } = req.params;
    const { destination, amount, assetCode } = req.body;

    const result = await PasskeyWalletService.buildWithdrawalTx(
      parseInt(investorId, 10),
      destination,
      amount,
      assetCode
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit a signed withdrawal transaction
 */
export const submitWithdrawal = async (req, res, next) => {
  try {
    const { signedXdr } = req.body;

    const result = await PasskeyWalletService.submitWithdrawalTx(signedXdr);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initiate a new USDC deposit relay
 * POST /api/investors/:id/deposit/initiate
 */
export const initiateDeposit = async (req, res, next) => {
  try {
    const investorId = parseInt(req.params.id, 10);

    const depositInfo = await DepositRelayService.initiateDeposit(investorId);

    res.status(200).json({
      success: true,
      data: depositInfo,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all deposit requests for an investor
 * GET /api/investors/:id/deposits
 */
export const getInvestorDeposits = async (req, res, next) => {
  try {
    const investorId = parseInt(req.params.id, 10);
    const deposits = await DepositRelayService.getInvestorDeposits(investorId);

    res.status(200).json({
      success: true,
      data: deposits,
    });
  } catch (error) {
    next(error);
  }
};

