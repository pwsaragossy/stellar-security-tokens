import { CompanyUser } from '../models/CompanyUser.js';
import { Company } from '../models/Company.js';
import { PasskeyWalletService, UserType } from '../services/passkeyWallet.service.js';
import { EmailService } from '../services/email.service.js';
import { generateToken, generateRefreshToken, setRefreshCookie } from '../middleware/auth.js';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
const log = logger.scope('CompanyUserController');

/**
 * Controller para gerenciar usuários de empresas
 */
export class CompanyUserController {
  /**
   * Lista usuários de uma empresa
   * GET /api/company-users
   */
  static async getCompanyUsers(req, res) {
    try {
      const companyId = req.user.companyId;

      if (!companyId) {
        return res.status(403).json({
          success: false,
          error: 'Company ID not found in token',
        });
      }

      const users = await CompanyUser.findByCompany(companyId);

      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      log.error('Error fetching company users:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch company users',
        details: error.message,
      });
    }
  }

  /**
   * Atualiza usuário da empresa
   * PUT /api/company-users/:id
   */
  static async updateCompanyUser(req, res) {
    try {
      const { id } = req.params;
      const { name, role, is_active } = req.body;

      const companyId = req.user.companyId;
      const user = await CompanyUser.findById(parseInt(id));

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Verificar se o usuário pertence à mesma empresa
      if (user.companyId !== companyId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. User does not belong to your company.',
        });
      }

      const updatedUser = await CompanyUser.update(parseInt(id), {
        name,
        role,
        is_active,
      });

      res.json({
        success: true,
        data: updatedUser,
      });
    } catch (error) {
      log.error('Error updating company user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update company user',
        details: error.message,
      });
    }
  }

  /**
   * Register company user with email verification (Step 1 of Passkey Wallet flow)
   * POST /api/company-users/register-passkey
   * 
   * Now supports single-step registration (like investors):
   * - If credentialId + contractId provided: create user with wallet immediately
   * - If not provided: use legacy multi-step flow (email verification → create-wallet)
   */
  static async registerWithPasskey(req, res) {
    try {
      const {
        company_id,
        email,
        name,
        role = 'user',
        // New fields for single-step registration
        credentialId,
        publicKey,
        contractId
      } = req.body;

      // Validate required fields
      if (!company_id || !email || !name) {
        const missing = [];
        if (!company_id) missing.push('company_id');
        if (!email) missing.push('email');
        if (!name) missing.push('name');
        return res.status(400).json({
          success: false,
          error: `Required fields missing: ${missing.join(', ')}`,
        });
      }

      // Check if company exists and is approved
      const company = await Company.findById(company_id);
      if (!company) {
        return res.status(404).json({
          success: false,
          error: 'Company not found',
        });
      }

      if (company.status !== 'approved') {
        return res.status(403).json({
          success: false,
          error: 'Company must be approved to create users',
        });
      }

      // Check for existing email
      const existingUser = await CompanyUser.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Email already registered',
        });
      }

      // Single-step flow (frontend already created passkey and deployed wallet)
      if (credentialId && contractId) {
        // Reject a duplicate passkey credential (the DB also enforces @unique).
        const existingCredential = await prisma.companyUser.findFirst({
          where: { passkeyCredentialId: credentialId },
          select: { id: true },
        });
        if (existingCredential) {
          return res.status(409).json({
            success: false,
            error: 'This passkey is already registered.',
          });
        }

        // The passkey public key is required so logins can be verified server-side
        // (a credentialId alone is a public identifier, not proof of possession).
        let publicKeyBuffer;
        try {
          publicKeyBuffer = Buffer.from(publicKey || '', 'base64');
        } catch {
          publicKeyBuffer = Buffer.alloc(0);
        }
        if (publicKeyBuffer.length !== 65 || publicKeyBuffer[0] !== 0x04) {
          return res.status(400).json({
            success: false,
            error: 'A valid passkey public key is required. Please update the app and try again.',
          });
        }

        // Wallet is already deployed by frontend via smart-account-kit
        log.info(`[CompanyRegistration] Creating company user for ${email} with wallet ${contractId}`);

        // Generate verification token for email
        const verificationToken = EmailService.generateVerificationToken();
        const verificationExpiry = EmailService.getVerificationExpiry();

        // Create company user with passkey data - wallet already deployed!
        const user = await prisma.companyUser.create({
          data: {
            companyId: company_id,
            email,
            name,
            role,
            stellarContractId: contractId, // Use the contract ID from frontend
            passkeyCredentialId: credentialId,
            passkeyPublicKey: publicKeyBuffer, // raw 65-byte secp256r1 — verifies login assertions
            emailVerified: false,
            emailVerificationToken: verificationToken,
            emailVerificationExpiry: verificationExpiry,
          },
        });

        // Send verification email (async, don't block)
        EmailService.sendVerificationEmail(email, name, verificationToken)
          .catch(error => {
            log.error('Failed to send verification email:', error);
          });

        // Generate JWT token for immediate login
        const token = generateToken({
          userId: user.id,
          email: user.email,
          userType: 'company',
          role: user.role,
          companyId: user.companyId,
        });

        // Generate refresh token and set httpOnly cookie
        const refreshToken = await generateRefreshToken('company', user.id);
        setRefreshCookie(res, refreshToken, 'company');

        return res.status(201).json({
          success: true,
          message: 'Registration successful. Please verify your email.',
          data: {
            token,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              companyId: user.companyId,
              role: user.role,
              stellarContractId: user.stellarContractId,
              emailVerified: false,
            },
            company: {
              id: company.id,
              name: company.name,
              cnpj: company.cnpj,
              email: company.email,
              status: company.status,
              kycStatus: company.kycStatus,
            },
          },
        });
      }

      // Legacy multi-step flow (no passkey data provided)
      // Generate verification token
      const verificationToken = EmailService.generateVerificationToken();
      const verificationExpiry = EmailService.getVerificationExpiry();

      // Create company user without password (will use passkey)
      const user = await prisma.companyUser.create({
        data: {
          companyId: company_id,
          email,
          name,
          role,
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
          id: user.id,
          name: user.name,
          email: user.email,
          companyId: user.companyId,
          role: user.role,
          emailVerified: false,
          nextStep: 'verify_email',
        },
      });
    } catch (error) {
      log.error('Error registering company user with passkey:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register company user',
        details: error.message,
      });
    }
  }

  /**
   * Verify email address (Step 2 of Passkey Wallet flow)
   * POST /api/company-users/verify-email
   */
  static async verifyEmail(req, res) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Verification token is required',
        });
      }

      // Find user by verification token
      const user = await prisma.companyUser.findFirst({
        where: {
          emailVerificationToken: token,
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Invalid verification token',
        });
      }

      // Check if token is expired
      if (user.emailVerificationExpiry && new Date() > user.emailVerificationExpiry) {
        return res.status(400).json({
          success: false,
          error: 'Verification token has expired. Please request a new one.',
        });
      }

      // Check if already verified
      if (user.emailVerified) {
        return res.status(400).json({
          success: false,
          error: 'Email is already verified',
        });
      }

      // Mark email as verified
      const updatedUser = await prisma.companyUser.update({
        where: { id: user.id },
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
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          emailVerified: true,
          nextStep: 'create_passkey',
        },
      });
    } catch (error) {
      log.error('Error verifying company user email:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify email',
        details: error.message,
      });
    }
  }

  /**
   * Resend verification email
   * POST /api/company-users/resend-verification
   */
  static async resendVerificationEmail(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required',
        });
      }

      const user = await prisma.companyUser.findUnique({
        where: { email },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      if (user.emailVerified) {
        return res.status(400).json({
          success: false,
          error: 'Email is already verified',
        });
      }

      // Generate new verification token
      const verificationToken = EmailService.generateVerificationToken();
      const verificationExpiry = EmailService.getVerificationExpiry();

      // Update user with new token
      await prisma.companyUser.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: verificationToken,
          emailVerificationExpiry: verificationExpiry,
        },
      });

      // Send verification email
      await EmailService.sendVerificationEmail(email, user.name, verificationToken);

      res.json({
        success: true,
        message: 'Verification email sent successfully',
      });
    } catch (error) {
      log.error('Error resending verification email:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to resend verification email',
        details: error.message,
      });
    }
  }

  /**
   * Create smart wallet after passkey registration (Step 3 of Passkey Wallet flow)
   * POST /api/company-users/create-wallet
   */
  static async createSmartWallet(req, res) {
    try {
      const { userId, credentialId, publicKey } = req.body;

      if (!userId || !credentialId || !publicKey) {
        return res.status(400).json({
          success: false,
          error: 'userId, credentialId, and publicKey are required',
        });
      }

      // Convert publicKey from base64 to Buffer if needed
      const publicKeyBuffer = Buffer.isBuffer(publicKey)
        ? publicKey
        : Buffer.from(publicKey, 'base64');

      // Create smart wallet using PasskeyWalletService
      const result = await PasskeyWalletService.createSmartWallet(
        UserType.COMPANY_USER,
        parseInt(userId, 10),
        credentialId,
        publicKeyBuffer
      );

      // Send welcome email
      const user = await prisma.companyUser.findUnique({
        where: { id: parseInt(userId, 10) },
      });

      if (user) {
        await EmailService.sendWelcomeEmail(
          user.email,
          user.name,
          result.contractId
        );
      }

      res.status(201).json({
        success: true,
        message: 'Smart wallet created successfully',
        data: {
          contractId: result.contractId,
          transactionHash: result.transactionHash,
          user: result.user,
          nextStep: 'ready',
        },
      });
    } catch (error) {
      log.error('Error creating company user smart wallet:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create smart wallet',
        details: error.message,
      });
    }
  }

  /**
   * Get wallet creation status for a company user
   * GET /api/company-users/:userId/wallet-status
   */
  static async getWalletStatus(req, res) {
    try {
      const { userId } = req.params;

      // SECURITY: Ownership check — requesting user must be the wallet owner
      if (parseInt(userId, 10) !== req.user?.userId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized access to wallet',
        });
      }

      const status = await PasskeyWalletService.getWalletStatus(
        UserType.COMPANY_USER,
        parseInt(userId, 10)
      );

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      log.error('Error getting company user wallet status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get wallet status',
        details: error.message,
      });
    }
  }

  /**
   * Get passkey kit client configuration
   * GET /api/company-users/passkey/config
   */
  static async getPasskeyConfig(req, res) {
    try {
      const config = PasskeyWalletService.getClientConfig();

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      log.error('Error getting passkey config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get passkey configuration',
        details: error.message,
      });
    }
  }

  /**
   * Propose a withdrawal transaction for company user
   * POST /api/company-users/:userId/withdraw/propose
   */
  static async proposeWithdrawal(req, res) {
    try {
      const { userId } = req.params;
      const { destination, amount, assetCode } = req.body;

      // Verify the requesting user owns this wallet
      if (parseInt(userId, 10) !== req.user?.userId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized access to wallet',
        });
      }

      const result = await PasskeyWalletService.buildWithdrawalTx(
        parseInt(userId, 10),
        destination,
        amount,
        assetCode,
        UserType.COMPANY_USER
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      log.error('Error proposing company user withdrawal:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to propose withdrawal',
        details: error.message,
      });
    }
  }

  /**
   * Submit a signed withdrawal transaction
   * POST /api/company-users/withdraw/submit
   */
  static async submitWithdrawal(req, res) {
    try {
      const { signedXdr } = req.body;

      const result = await PasskeyWalletService.submitWithdrawalTx(signedXdr);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      log.error('Error submitting company user withdrawal:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit withdrawal',
        details: error.message,
      });
    }
  }
}

