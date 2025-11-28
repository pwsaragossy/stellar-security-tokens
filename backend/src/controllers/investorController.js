import { Investor } from '../models/Investor.js';
import { StellarService } from '../services/stellar.service.js';
import { PaymentService } from '../services/payment.service.js';
import { PasskeyWalletService, UserType } from '../services/passkeyWallet.service.js';
import { EmailService } from '../services/email.service.js';
import { generateToken } from '../middleware/auth.js';
import prisma from '../config/prisma.js';
import bcrypt from 'bcrypt';

// REMOVED: createInvestor and registerInvestor (traditional flow deprecated)
// All investors must now use passkey registration flow via registerInvestorWithPasskey


export const loginInvestor = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    const investor = await Investor.authenticate(email, password);
    if (!investor) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Gerar token JWT
    const token = generateToken({
      userId: investor.id,
      email: investor.email,
      role: 'investor',
    });

    res.json({
      success: true,
      data: {
        token,
        investor: {
          id: investor.id,
          email: investor.email,
          name: investor.name,
          document: investor.document,
          stellarPublicKey: investor.stellarPublicKey,
          kycStatus: investor.kycStatus,
          created_at: investor.created_at,
          updated_at: investor.updated_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const whitelistInvestor = async (req, res, next) => {
  try {
    const { investorId } = req.params;
    const { assetCode = 'SIN01' } = req.body;

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

    const result = await StellarService.whitelistInvestor(
      investor.stellarPublicKey,
      assetCode
    );

    const updatedInvestor = await Investor.update(investorId, {
      kycStatus: 'approved',
    });

    res.json({
      success: true,
      message: 'Investor whitelisted successfully',
      data: {
        investor: updatedInvestor,
        stellarTransaction: {
          transactionHash: result.transactionHash,
          ledger: result.ledger,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

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
    const { assetCode = 'SIN01' } = req.query;

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

    if (updateData.email) {
      const existingEmail = await Investor.findByEmail(updateData.email);
      if (existingEmail && existingEmail.id !== parseInt(id, 10)) {
        return res.status(409).json({
          success: false,
          error: 'Investor with this email already exists',
        });
      }
    }

    const updatedInvestor = await Investor.update(id, updateData);

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
// PASSKEY WALLET REGISTRATION FLOW
// ============================================================================

/**
 * Register investor with email verification (Step 1 of Passkey Wallet flow)
 * Does NOT create Stellar account - that happens after email verification
 */
export const registerInvestorWithPasskey = async (req, res, next) => {
  try {
    const { name, email, document } = req.body;

    // Validate required fields
    if (!name || !email || !document) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and document are required',
      });
    }

    // Check for existing email
    const existingEmail = await Investor.findByEmail(email);
    if (existingEmail) {
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

    // Generate verification token
    const verificationToken = EmailService.generateVerificationToken();
    const verificationExpiry = EmailService.getVerificationExpiry();

    // Create investor without Stellar account (will be created after email verification)
    const investor = await prisma.investor.create({
      data: {
        name,
        email,
        document,
        kycStatus: 'pending',
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationExpiry,
      },
    });

    // Send verification email
    await EmailService.sendVerificationEmail(email, name, verificationToken);

    res.status(201).json({
      success: true,
      message: 'Registration initiated. Please check your email to verify your account.',
      data: {
        id: investor.id,
        name: investor.name,
        email: investor.email,
        emailVerified: false,
        nextStep: 'verify_email',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify email address (Step 2 of Passkey Wallet flow)
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

    // Find investor by verification token
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

    // Check if token is expired
    if (investor.emailVerificationExpiry && new Date() > investor.emailVerificationExpiry) {
      return res.status(400).json({
        success: false,
        error: 'Verification token has expired. Please request a new one.',
      });
    }

    // Check if already verified
    if (investor.emailVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified',
      });
    }

    // Mark email as verified
    const updatedInvestor = await prisma.investor.update({
      where: { id: investor.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    res.json({
      success: true,
      message: 'Email verified successfully. You can now create your passkey wallet.',
      data: {
        id: updatedInvestor.id,
        name: updatedInvestor.name,
        email: updatedInvestor.email,
        emailVerified: true,
        nextStep: 'create_passkey',
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
 * Create smart wallet after passkey registration (Step 3 of Passkey Wallet flow)
 * Called by frontend after WebAuthn credential is created
 */
export const createSmartWallet = async (req, res, next) => {
  try {
    const { investorId, credentialId, publicKey } = req.body;

    if (!investorId || !credentialId || !publicKey) {
      return res.status(400).json({
        success: false,
        error: 'investorId, credentialId, and publicKey are required',
      });
    }

    // Convert publicKey from base64 to Buffer if needed
    const publicKeyBuffer = Buffer.isBuffer(publicKey)
      ? publicKey
      : Buffer.from(publicKey, 'base64');

    // Create smart wallet using PasskeyWalletService
    const result = await PasskeyWalletService.createSmartWallet(
      UserType.INVESTOR,
      parseInt(investorId, 10),
      credentialId,
      publicKeyBuffer
    );

    // Send welcome email
    const investor = await prisma.investor.findUnique({
      where: { id: parseInt(investorId, 10) },
    });

    if (investor) {
      await EmailService.sendWelcomeEmail(
        investor.email,
        investor.name,
        result.contractId
      );
    }

    res.status(201).json({
      success: true,
      message: 'Smart wallet created successfully',
      data: {
        contractId: result.contractId,
        transactionHash: result.transactionHash,
        investor: result.user,
        nextStep: 'complete_kyc',
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
