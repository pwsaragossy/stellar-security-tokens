import { Investor } from '../models/Investor.js';
import { StellarService } from '../services/stellar.service.js';
import { PaymentService } from '../services/payment.service.js';
import { PasskeyWalletService, UserType } from '../services/passkeyWallet.service.js';
import { EmailService } from '../services/email.service.js';
import { generateToken } from '../middleware/auth.js';
import prisma from '../config/prisma.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generate6DigitCode, storeEmailCode, verifyEmailCode as redisVerifyEmailCode } from '../config/redis.js';





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
        stellarPublicKey: investor.stellarPublicKey,
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

export const getInvestorBalance = async (req, res, next) => {
  try {
    const { investorId } = req.params;
    const { assetCode } = req.query;

    if (!assetCode) {
      return res.status(400).json({
        success: false,
        error: 'assetCode query parameter is required',
      });
    }

    const investor = await Investor.findById(parseInt(investorId, 10));
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    if (!investor.stellarPublicKey) {
      return res.status(400).json({
        success: false,
        error: 'Investor does not have a Stellar public key',
      });
    }

    const balance = await StellarService.getTokenBalance(
      assetCode,
      investor.stellarPublicKey
    );

    const distributions = await prisma.tokenDistribution.findMany({
      where: {
        investorId: parseInt(investorId, 10),
        assetCode,
      },
      include: {
        token: {
          select: {
            description: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const interestPayments = await prisma.interestPayment.findMany({
      where: {
        investorId: parseInt(investorId, 10),
        assetCode,
      },
      orderBy: [
        { paymentDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json({
      success: true,
      data: {
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
          stellarPublicKey: investor.stellarPublicKey,
          kycStatus: investor.kycStatus,
        },
        balance: {
          assetCode: balance.assetCode,
          balance: balance.balance,
          isAuthorized: balance.isAuthorized,
        },
        tokenDistributions: distributions,
        interestPayments,
        summary: {
          totalTokensReceived: distributions.reduce(
            (sum, d) => sum + parseFloat(d.amount),
            0
          ),
          totalInterestReceived: interestPayments.reduce(
            (sum, p) => sum + parseFloat(p.usdcAmount),
            0
          ),
          distributionCount: distributions.length,
          interestPaymentCount: interestPayments.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getInvestorPayments = async (req, res, next) => {
  try {
    const { investorId } = req.params;
    const { assetCode, limit = 100, offset = 0 } = req.query;

    const investor = await Investor.findById(parseInt(investorId, 10));
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    const where = { investorId: parseInt(investorId, 10) };
    if (assetCode) where.assetCode = assetCode;

    const [payments, total] = await Promise.all([
      prisma.interestPayment.findMany({
        where,
        take: parseInt(limit, 10),
        skip: parseInt(offset, 10),
        orderBy: [
          { paymentDate: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      prisma.interestPayment.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
        },
        payments,
        pagination: {
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          count: payments.length,
        },
        summary: {
          totalInterestReceived: payments.reduce(
            (sum, p) => sum + parseFloat(p.usdcAmount || 0),
            0
          ),
          totalPayments: total,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateInvestor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const investor = await Investor.findById(parseInt(id, 10));
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    // Whitelist allowed fields for self-update (security: block sensitive fields)
    const ALLOWED_FIELDS = ['name', 'document'];
    const BLOCKED_FIELDS = ['status', 'walletAddress', 'emailVerified', 'kycStatus', 'role', 'credentialId', 'publicKey'];

    // Filter to only allowed fields
    const safeUpdateData = {};
    for (const key of Object.keys(updateData)) {
      if (BLOCKED_FIELDS.includes(key)) {
        return res.status(403).json({
          success: false,
          error: `Field '${key}' cannot be updated by the user`,
        });
      }
      if (ALLOWED_FIELDS.includes(key)) {
        safeUpdateData[key] = updateData[key];
      }
    }

    if (Object.keys(safeUpdateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
      });
    }

    if (safeUpdateData.email) {
      const existingEmail = await Investor.findByEmail(safeUpdateData.email);
      if (existingEmail && existingEmail.id !== parseInt(id, 10)) {
        return res.status(409).json({
          success: false,
          error: 'Investor with this email already exists',
        });
      }
    }

    const updatedInvestor = await Investor.update(id, safeUpdateData);

    res.json({
      success: true,
      data: updatedInvestor,
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

export const getInvestorMetrics = async (req, res, next) => {
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

    const metrics = await Investor.getConsolidatedMetrics(investorId);

    res.json({
      success: true,
      data: {
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
        },
        metrics,
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
      console.warn('[initiateRegistration] Redis unavailable, code storage failed');
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
      process.env.JWT_SECRET || 'stellar-tokens-secret',
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
    const { name, document, credentialId, publicKey, contractId, registrationToken } = req.body;

    // Validate required fields
    if (!name || !document || !credentialId || !contractId || !registrationToken) {
      return res.status(400).json({
        success: false,
        error: 'Name, document, credentialId, contractId, and registrationToken are required',
      });
    }

    // Validate registration token and extract verified email
    let verifiedEmail;
    try {
      const decoded = jwt.verify(
        registrationToken,
        process.env.JWT_SECRET || 'stellar-tokens-secret'
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

    // Convert publicKey from base64 to Buffer if provided
    const publicKeyBuffer = publicKey
      ? (Buffer.isBuffer(publicKey) ? publicKey : Buffer.from(publicKey, 'base64'))
      : null;

    // Create investor with wallet contract ID from frontend - email already verified!
    const investor = await prisma.investor.create({
      data: {
        name,
        email: verifiedEmail, // Use verified email from token
        document,
        stellarContractId: contractId, // From client-side deployment
        passkeyCredentialId: credentialId,
        passkeyPublicKey: publicKeyBuffer,
        kycStatus: 'pending',
        emailVerified: true, // Email was verified before passkey creation!
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    // Send welcome email (async, don't wait)
    EmailService.sendWelcomeEmail(verifiedEmail, name, contractId)
      .catch(error => {
        console.error('Failed to send welcome email:', error);
      });

    // Generate JWT token for immediate login
    const token = generateToken({
      userId: investor.id,
      email: investor.email,
      userType: 'investor',
      role: 'investor',
    });

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
          verifyEmail: '/api/investors/verify-email',
          startKyc: '/api/kyc/start', // After email verified
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify email address
 * Called when user clicks link in verification email
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Verification token is required',
      });
    }

    // Find investor by token
    const investor = await prisma.investor.findFirst({
      where: {
        emailVerificationToken: token,
      },
    });

    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Invalid verification token',
      });
    }

    // Check expiry
    if (investor.emailVerificationExpiry && investor.emailVerificationExpiry < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Verification token has expired',
      });
    }

    // Check if already verified
    if (investor.emailVerified) {
      return res.status(200).json({
        success: true,
        message: 'Email is already verified',
        data: {
          emailVerified: true,
        },
      });
    }

    // Mark as verified
    const updated = await prisma.investor.update({
      where: { id: investor.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    res.json({
      success: true,
      message: 'Email verified successfully! You can now complete KYC and invest.',
      data: {
        emailVerified: true,
        kycStatus: updated.kycStatus,
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
 * Resend verification email
 */
export const resendVerificationEmail = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

    const investor = await prisma.investor.findUnique({
      where: { email },
    });

    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    if (investor.emailVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified',
      });
    }

    // Generate new verification token
    const verificationToken = EmailService.generateVerificationToken();
    const verificationExpiry = EmailService.getVerificationExpiry();

    // Update investor with new token
    await prisma.investor.update({
      where: { id: investor.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationExpiry,
      },
    });

    // Send verification email
    await EmailService.sendVerificationEmail(email, investor.name, verificationToken);

    res.json({
      success: true,
      message: 'Verification email sent successfully',
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

    const status = await PasskeyWalletService.getWalletStatus(
      UserType.INVESTOR,
      parseInt(investorId, 10)
    );

    res.json({
      success: true,
      data: status,
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

    if (parseInt(investorId, 10) !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to wallet'
      });
    }

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
