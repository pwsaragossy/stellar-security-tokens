import { CompanyUser } from '../models/CompanyUser.js';
import { Company } from '../models/Company.js';
import { PasskeyWalletService, UserType } from '../services/passkeyWallet.service.js';
import { EmailService } from '../services/email.service.js';
import { generateToken } from '../middleware/auth.js';
import prisma from '../config/prisma.js';

/**
 * Controller para gerenciar usuários de empresas
 */
export class CompanyUserController {
  /**
   * Registra um novo usuário da empresa
   * POST /api/company-users/register
   */
  static async registerCompanyUser(req, res) {
    try {
      const {
        company_id,
        email,
        password,
        name,
        role = 'user',
      } = req.body;

      // Validações básicas
      if (!company_id || !email || !password || !name) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: company_id, email, password, name',
        });
      }

      // Verificar se empresa existe e está aprovada
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

      // Verificar se email já existe
      const existingUser = await CompanyUser.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Email already registered',
        });
      }

      const user = await CompanyUser.create({
        company_id,
        email,
        password,
        name,
        role,
      });

      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error('Error registering company user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register company user',
        details: error.message,
      });
    }
  }

  /**
   * Login de usuário da empresa
   * POST /api/company-users/login
   */
  static async loginCompanyUser(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required',
        });
      }

      const user = await CompanyUser.authenticate(email, password);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password',
        });
      }

      // Buscar dados da empresa
      const company = await Company.findById(user.companyId);
      if (!company) {
        return res.status(500).json({
          success: false,
          error: 'Company not found',
        });
      }

      // Gerar token JWT
      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: 'company_user',
        companyId: user.companyId,
        companyName: company.name,
      });

      res.json({
        success: true,
        data: {
          token,
          company: {
            id: company.id,
            name: company.name,
            cnpj: company.cnpj,
            email: company.email,
            legal_representative: company.legal_representative,
            address: company.address,
            phone: company.phone,
            status: company.status,
            kycStatus: company.kycStatus,
            kyc_documents: company.kyc_documents,
            created_at: company.created_at,
            updated_at: company.updated_at,
          },
        },
      });
    } catch (error) {
      console.error('Error logging in company user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to login',
        details: error.message,
      });
    }
  }

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
      console.error('Error fetching company users:', error);
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
      console.error('Error updating company user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update company user',
        details: error.message,
      });
    }
  }

  // ============================================================================
  // PASSKEY WALLET REGISTRATION FLOW
  // ============================================================================

  /**
   * Register company user with email verification (Step 1 of Passkey Wallet flow)
   * POST /api/company-users/register-passkey
   */
  static async registerWithPasskey(req, res) {
    try {
      const { company_id, email, name, role = 'user' } = req.body;

      // Validate required fields
      if (!company_id || !email || !name) {
        return res.status(400).json({
          success: false,
          error: 'company_id, email, and name are required',
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
      console.error('Error registering company user with passkey:', error);
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
      console.error('Error verifying company user email:', error);
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
      console.error('Error resending verification email:', error);
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
      console.error('Error creating company user smart wallet:', error);
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

      const status = await PasskeyWalletService.getWalletStatus(
        UserType.COMPANY_USER,
        parseInt(userId, 10)
      );

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error('Error getting company user wallet status:', error);
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
      console.error('Error getting passkey config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get passkey configuration',
        details: error.message,
      });
    }
  }
}

