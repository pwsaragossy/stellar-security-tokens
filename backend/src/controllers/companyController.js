import { Company } from '../models/Company.js';
import { generateToken } from '../middleware/auth.js';
import { StellarService } from '../services/stellar.service.js';
import { ipfsService } from '../services/ipfs.service.js';

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
   * Registra uma nova empresa
   * POST /api/companies/register
   */
  static async registerCompany(req, res) {
    try {
      const {
        name,
        cnpj, // Legacy field - still supported
        country, // USA or BRASIL
        tax_id, // EIN for USA, CNPJ for Brasil
        tax_id_type, // EIN or CNPJ
        email,
        legal_representative,
        address,
        phone,
        // Passkey fields from frontend
        credentialId,
        publicKey,
        contractId,
      } = req.body;

      // Validações básicas
      if (!name || !email || !legal_representative) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, email, legal_representative',
        });
      }

      // Verificar se email já existe
      const existingEmail = await Company.findByEmail(email);
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
        email,
        legal_representative,
        address,
        phone,
        status: 'pending',
        kyc_status: 'pending',
        ...passkeyData,
      });

      // TODO: Send "registration pending" email to company
      // TODO: Send notification to admins about new company

      res.status(201).json({
        success: true,
        message: 'Company registered successfully. Your account is under review.',
        data: CompanyController.formatCompanyForResponse(company),
      });
    } catch (error) {
      console.error('Error registering company:', error);
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
      console.error('Error fetching company profile:', error);
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
      console.error('Error updating company profile:', error);
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
      console.error('Error fetching company offers:', error);
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
      console.error('Error fetching company details:', error);
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
      console.error('Error fetching companies:', error);
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
      console.error('Error updating company status:', error);
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
      console.error('Error approving company (debug):', error);
      res.status(500).json({
        success: false,
        error: 'Failed to approve company',
        details: error.message,
      });
    }
  }
}

