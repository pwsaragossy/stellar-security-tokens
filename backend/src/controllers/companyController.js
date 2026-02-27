import { Company } from '../models/Company.js';
import { generateToken } from '../middleware/auth.js';
import { StellarService } from '../services/stellar.service.js';
import { ipfsService } from '../services/ipfs.service.js';
import jwt from 'jsonwebtoken';
import { generate6DigitCode, storeEmailCode, verifyEmailCode as redisVerifyEmailCode } from '../config/redis.js';
import { EmailService } from '../services/email.service.js';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
const log = logger.scope('CompanyController');

/**
 * Controller para gerenciar empresas
 */
export class CompanyController {
  /**
   * Formata documentos da empresa adicionando URLs IPFS completas
   * @param {Object} documents - Documentos do banco (JSONB)
   * @returns {Object} Documentos formatados com URLs completas
   */
  static formatDocuments(documents) {
    if (!documents || typeof documents !== 'object') {
      return {};
    }

    const formatted = {};
    // Tipos de documentos de KYC de empresa
    const docTypes = ['articles_incorporation', 'tax_id', 'proof_address', 'legal_rep_id', 'financials', 'other'];

    for (const docType of docTypes) {
      if (documents[docType]) {
        const doc = documents[docType];
        formatted[docType] = {
          hash: doc.hash || null,
          url: doc.url || (doc.hash ? ipfsService.getGatewayUrl(doc.hash) : null),
          fileName: doc.fileName || null,
          uploadedAt: doc.uploadedAt || null,
        };
      }
    }
    // Handle dynamic keys if any
    Object.keys(documents).forEach(key => {
      if (!docTypes.includes(key) && documents[key] && typeof documents[key] === 'object') {
        formatted[key] = {
          hash: documents[key].hash || null,
          url: documents[key].url || (documents[key].hash ? ipfsService.getGatewayUrl(documents[key].hash) : null),
          fileName: documents[key].fileName || null,
          uploadedAt: documents[key].uploadedAt || null,
        };
      }
    });

    return formatted;
  }

  /**
   * Formata empresa para resposta
   */
  static formatCompanyForResponse(company) {
    if (!company) return null;

    const kycDocuments = typeof company.kycDocuments === 'string'
      ? JSON.parse(company.kycDocuments)
      : company.kycDocuments || {};

    return {
      ...company,
      kycDocuments: CompanyController.formatDocuments(kycDocuments),
      kyc_documents: CompanyController.formatDocuments(kycDocuments), // snake_case aliases
    };
  }

  /**
   * Registra uma nova empresa (Step 3 of email-first flow)
   * POST /api/companies/register
   * REQUIRES: registrationToken from verify-email-code endpoint
   */
  static async registerCompany(req, res) {
    try {
      const {
        name,
        cnpj, // Legacy field - still supported
        country, // USA or BRASIL
        tax_id, // EIN for USA, CNPJ for Brasil
        tax_id_type, // EIN or CNPJ
        legal_representative,
        address,
        phone,
        // Passkey fields from frontend
        credentialId,
        publicKey,
        contractId,
        // Email verification token
        registrationToken,
      } = req.body;

      // Verify registration token (from email verification step)
      let verifiedEmail;
      if (registrationToken) {
        try {
          const decoded = jwt.verify(registrationToken, process.env.JWT_SECRET);
          if (decoded.purpose !== 'company_registration' || !decoded.verified) {
            return res.status(401).json({
              success: false,
              error: 'Invalid registration token',
            });
          }
          verifiedEmail = decoded.email;
        } catch (jwtError) {
          return res.status(401).json({
            success: false,
            error: 'Registration token expired or invalid. Please start the registration process again.',
          });
        }
      } else {
        // For backwards compatibility, allow email in body (but log warning)
        log.warn('[registerCompany] Registration without token - email not verified');
        verifiedEmail = req.body.email;
      }

      // Validações básicas - only name is required now
      if (!name || !verifiedEmail) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name (email comes from verification token)',
        });
      }

      // Verificar se email já existe
      const existingEmail = await Company.findByEmail(verifiedEmail);
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'Email already registered',
        });
      }

      // Handle tax_id (new) or cnpj (legacy)
      const effectiveTaxId = tax_id || cnpj;
      const effectiveTaxIdType = tax_id_type || (cnpj ? 'CNPJ' : null);

      // Verificar CNPJ apenas se fornecido (for backwards compatibility)
      if (effectiveTaxIdType === 'CNPJ' && effectiveTaxId) {
        const existingCnpj = await Company.findByCnpj(effectiveTaxId);
        if (existingCnpj) {
          return res.status(409).json({
            success: false,
            error: 'CNPJ already registered',
          });
        }
      }

      // Prepare passkey data if provided
      let passkeyData = {};
      if (credentialId && contractId) {
        let publicKeyBuffer = null;
        if (publicKey) {
          if (typeof publicKey === 'string') {
            publicKeyBuffer = Buffer.from(publicKey, 'base64');
          } else if (Buffer.isBuffer(publicKey)) {
            publicKeyBuffer = publicKey;
          }
        }

        passkeyData = {
          stellarContractId: contractId,
          passkeyCredentialId: credentialId,
          passkeyPublicKey: publicKeyBuffer,
        };
      }

      const company = await Company.create({
        name,
        cnpj: effectiveTaxIdType === 'CNPJ' ? effectiveTaxId : null,
        country: country || null,
        tax_id: effectiveTaxId || null,
        tax_id_type: effectiveTaxIdType || null,
        email: verifiedEmail,
        email_verified: !!registrationToken, // true if registered via email verification flow
        legal_representative,
        address,
        phone,
        status: 'pending',
        kyc_status: 'pending',
        ...passkeyData,
      });

      // Auto-create ghost CompanyUser for offer creation
      // This allows the company to create offers without manual CompanyUser setup
      const ghostCompanyUser = await prisma.companyUser.create({
        data: {
          companyId: company.id,
          email: company.email,
          name: `${company.name} Admin`,
          role: 'admin',
          isActive: true,
          stellarContractId: company.stellarContractId || null,
          passkeyCredentialId: company.passkeyCredentialId || null,
          passkeyPublicKey: company.passkeyPublicKey || null,
        }
      });
      log.info(`[registerCompany] Created ghost CompanyUser ${ghostCompanyUser.id} for Company ${company.id}`);

      // TODO: Send "registration pending" email to company
      // TODO: Send notification to admins about new company

      res.status(201).json({
        success: true,
        message: 'Company registered successfully. Your account is under review.',
        data: CompanyController.formatCompanyForResponse(company),
      });
    } catch (error) {
      log.error('Error registering company:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register company',
        details: error.message,
      });
    }
  }

  /**
   * Busca perfil da empresa (apenas para company_users autenticados)
   * GET /api/companies/profile
   */
  static async getCompanyProfile(req, res) {
    try {
      const companyId = req.user.companyId;

      if (!companyId) {
        return res.status(403).json({
          success: false,
          error: 'Company ID not found in token',
        });
      }

      const company = await Company.findById(companyId);
      if (!company) {
        return res.status(404).json({
          success: false,
          error: 'Company not found',
        });
      }

      res.json({
        success: true,
        data: CompanyController.formatCompanyForResponse(company),
      });
    } catch (error) {
      log.error('Error fetching company profile:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch company profile',
        details: error.message,
      });
    }
  }

  /**
   * Atualiza perfil da empresa
   * PUT /api/companies/profile
   */
  static async updateCompanyProfile(req, res) {
    try {
      const companyId = req.user.companyId;

      if (!companyId) {
        return res.status(403).json({
          success: false,
          error: 'Company ID not found in token',
        });
      }

      const {
        name,
        email,
        legal_representative,
        address,
        phone,
      } = req.body;

      const updatedCompany = await Company.update(companyId, {
        name,
        email,
        legal_representative,
        address,
        phone,
      });

      if (!updatedCompany) {
        return res.status(404).json({
          success: false,
          error: 'Company not found',
        });
      }

      res.json({
        success: true,
        data: CompanyController.formatCompanyForResponse(updatedCompany),
      });
    } catch (error) {
      log.error('Error updating company profile:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update company profile',
        details: error.message,
      });
    }
  }

  /**
   * Lista ofertas da empresa
   * GET /api/companies/offers
   */
  static async getCompanyOffers(req, res) {
    try {
      const companyId = req.user.companyId;

      if (!companyId) {
        return res.status(403).json({
          success: false,
          error: 'Company ID not found in token',
        });
      }

      const { Offer } = await import('../models/Offer.js');
      const { OfferController } = await import('./offerController.js');
      const offers = await Offer.findByCompany(companyId);

      // Formatar ofertas também
      const formattedOffers = offers.map(o => OfferController.formatOfferForResponse(o));

      res.json({
        success: true,
        data: formattedOffers,
      });
    } catch (error) {
      log.error('Error fetching company offers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch company offers',
        details: error.message,
      });
    }
  }

  /**
   * Detalhes de uma empresa (admin/public)
   * GET /api/admin/companies/:id
   */
  static async getCompanyDetails(req, res) {
    try {
      const { id } = req.params;
      const company = await Company.findById(parseInt(id));

      if (!company) {
        return res.status(404).json({
          success: false,
          error: 'Company not found',
        });
      }

      res.json({
        success: true,
        data: CompanyController.formatCompanyForResponse(company),
      });
    } catch (error) {
      log.error('Error fetching company details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch company details',
        details: error.message,
      });
    }
  }

  /**
   * Lista todas as empresas (apenas para platform_admins)
   * GET /api/admin/companies
   */
  static async getAllCompanies(req, res) {
    try {
      const { limit = 100, offset = 0, status } = req.query;

      const companies = await Company.findAll(
        parseInt(limit),
        parseInt(offset),
        status || null
      );

      const formattedCompanies = companies.map(c => CompanyController.formatCompanyForResponse(c));

      res.json({
        success: true,
        data: formattedCompanies,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      log.error('Error fetching companies:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch companies',
        details: error.message,
      });
    }
  }

  /**
   * Atualiza status da empresa (apenas para platform_admins)
   * PUT /api/admin/companies/:id/status
   */
  static async updateCompanyStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !['pending', 'approved', 'suspended', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status. Must be: pending, approved, suspended, or rejected',
        });
      }

      const updatedCompany = await Company.updateStatus(parseInt(id), status);

      if (!updatedCompany) {
        return res.status(404).json({
          success: false,
          error: 'Company not found',
        });
      }

      // Send email notification
      const { EmailService } = await import('../services/email.service.js');
      await EmailService.sendCompanyStatusUpdate(
        updatedCompany.email,
        updatedCompany.name,
        status
      );

      res.json({
        success: true,
        data: CompanyController.formatCompanyForResponse(updatedCompany),
      });
    } catch (error) {
      log.error('Error updating company status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update company status',
        details: error.message,
      });
    }
  }

  /**
   * Endpoint de debug para aprovar empresa sem autenticação (apenas em desenvolvimento)
   * PUT /api/companies/debug/:id/approve
   */
  static async debugApproveCompany(req, res) {
    try {
      const { id } = req.params;

      const updatedCompany = await Company.updateStatus(parseInt(id), 'approved');

      if (!updatedCompany) {
        return res.status(404).json({
          success: false,
          error: 'Company not found',
        });
      }

      res.json({
        success: true,
        data: CompanyController.formatCompanyForResponse(updatedCompany),
      });
    } catch (error) {
      log.error('Error approving company (debug):', error);
      res.status(500).json({
        success: false,
        error: 'Failed to approve company',
        details: error.message,
      });
    }
  }

  // ============================================================================
  // EMAIL-FIRST REGISTRATION FLOW
  // ============================================================================

  /**
   * Step 1: Initiate company registration by sending 6-digit verification code
   * POST /api/companies/initiate-registration
   */
  static async initiateCompanyRegistration(req, res) {
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
      const existingCompany = await Company.findByEmail(email);
      if (existingCompany) {
        return res.status(409).json({
          success: false,
          error: 'A company with this email already exists. Please log in instead.',
        });
      }

      // Generate and store 6-digit code
      const code = generate6DigitCode();
      const stored = await storeEmailCode(email, code);

      if (!stored) {
        log.warn('[initiateCompanyRegistration] Redis unavailable, code storage failed');
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
      log.error('Error initiating company registration:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send verification code',
        details: error.message,
      });
    }
  }

  /**
   * Step 2: Verify email code and return registration token
   * POST /api/companies/verify-email-code
   */
  static async verifyCompanyEmailCode(req, res) {
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
          purpose: 'company_registration',
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
          nextStep: 'Complete registration with your company details and create a passkey',
        },
      });
    } catch (error) {
      log.error('Error verifying company email code:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify code',
        details: error.message,
      });
    }
  }

  /**
   * Resend verification code for company registration
   * POST /api/companies/resend-code
   */
  static async resendCompanyCode(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required',
        });
      }

      // Check if email already registered
      const existingCompany = await Company.findByEmail(email);
      if (existingCompany) {
        return res.status(409).json({
          success: false,
          error: 'A company with this email already exists',
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
      log.error('Error resending company verification code:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to resend verification code',
        details: error.message,
      });
    }
  }

  // ============================================================================
  // WALLET OPERATIONS
  // ============================================================================

  /**
   * Get wallet status and balances for a company
   * GET /api/companies/:companyId/wallet-status
   */
  static async getWalletStatus(req, res) {
    try {
      const { companyId } = req.params;
      const requestingCompanyId = req.user.companyId;

      // Verify the requesting user belongs to this company
      if (parseInt(companyId) !== requestingCompanyId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized access to wallet',
        });
      }

      const company = await Company.findById(parseInt(companyId));
      if (!company) {
        return res.status(404).json({
          success: false,
          error: 'Company not found',
        });
      }

      if (!company.stellarContractId) {
        return res.status(400).json({
          success: false,
          error: 'Company does not have a wallet',
          data: {
            hasWallet: false,
            passkeyRegistered: !!company.passkeyCredentialId,
          },
        });
      }

      // Import service dynamically to avoid circular dependency
      const { PasskeyWalletService } = await import('../services/passkeyWallet.service.js');

      // Get balances from the Soroban wallet
      let balances = { xlm: '0', usdc: '0' };
      let explorer = null;

      try {
        const isContractAddress = company.stellarContractId.startsWith('C');
        if (isContractAddress) {
          balances = await PasskeyWalletService.getSorobanWalletBalances(company.stellarContractId);
          explorer = `https://stellar.expert/explorer/${process.env.STELLAR_NETWORK === 'PUBLIC' ? 'public' : 'testnet'}/contract/${company.stellarContractId}`;
        } else {
          const accountInfo = await StellarService.getAccountInfo(company.stellarContractId);
          balances.xlm = accountInfo.balances.find(b => b.asset_type === 'native')?.balance || '0';
          balances.usdc = accountInfo.balances.find(b => b.asset_code === 'USDC')?.balance || '0';
          explorer = `https://stellar.expert/explorer/${process.env.STELLAR_NETWORK === 'PUBLIC' ? 'public' : 'testnet'}/account/${company.stellarContractId}`;
        }
      } catch (balanceError) {
        log.error('Failed to fetch wallet balances:', balanceError);
        // Continue with zero balances - wallet exists, just can't fetch balances
      }

      res.json({
        success: true,
        data: {
          hasWallet: true,
          walletAddress: company.stellarContractId,
          passkeyRegistered: !!company.passkeyCredentialId,
          balances,
          explorer,
        },
      });
    } catch (error) {
      log.error('Error getting company wallet status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get wallet status',
        details: error.message,
      });
    }
  }

  /**
   * Propose a withdrawal transaction for company
   * POST /api/companies/:companyId/withdraw/propose
   */
  static async proposeWithdrawal(req, res) {
    try {
      const { companyId } = req.params;
      const { destination, amount, assetCode } = req.body;
      const requestingCompanyId = req.user.companyId;

      // Verify the requesting user belongs to this company
      if (parseInt(companyId) !== requestingCompanyId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized access to wallet',
        });
      }

      const company = await Company.findById(parseInt(companyId));
      if (!company || !company.stellarContractId) {
        return res.status(400).json({
          success: false,
          error: 'Company wallet not found',
        });
      }

      // Import service dynamically
      const { PasskeyWalletService, UserType } = await import('../services/passkeyWallet.service.js');

      // Build the withdrawal transaction using Company's wallet
      // Note: We pass company ID but use COMPANY type (need to add this type support)
      const result = await PasskeyWalletService.buildWithdrawalTxForCompany(
        parseInt(companyId),
        destination,
        amount,
        assetCode
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      log.error('Error proposing company withdrawal:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to propose withdrawal',
        details: error.message,
      });
    }
  }

  /**
   * Submit a signed withdrawal transaction
   * POST /api/companies/withdraw/submit
   */
  static async submitWithdrawal(req, res) {
    try {
      const { signedXdr } = req.body;

      const { PasskeyWalletService } = await import('../services/passkeyWallet.service.js');
      const result = await PasskeyWalletService.submitWithdrawalTx(signedXdr);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      log.error('Error submitting company withdrawal:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit withdrawal',
        details: error.message,
      });
    }
  }
}

