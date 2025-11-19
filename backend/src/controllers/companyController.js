import { Company } from './models/Company.js';
import { generateToken } from './middleware/auth.js';

/**
 * Controller para gerenciar empresas
 */
export class CompanyController {
  /**
   * Registra uma nova empresa
   * POST /api/companies/register
   */
  static async registerCompany(req, res) {
    try {
      const {
        name,
        cnpj,
        email,
        legal_representative,
        address,
        phone,
      } = req.body;

      // Validações básicas
      if (!name || !cnpj || !email || !legal_representative) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, cnpj, email, legal_representative',
        });
      }

      // Verificar se email ou CNPJ já existem
      const existingEmail = await Company.findByEmail(email);
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'Email already registered',
        });
      }

      const existingCnpj = await Company.findByCnpj(cnpj);
      if (existingCnpj) {
        return res.status(409).json({
          success: false,
          error: 'CNPJ already registered',
        });
      }

      const company = await Company.create({
        name,
        cnpj,
        email,
        legal_representative,
        address,
        phone,
        status: 'pending',
        kyc_status: 'pending',
      });

      res.status(201).json({
        success: true,
        data: company,
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
        data: company,
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
        data: updatedCompany,
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
      const offers = await Offer.findByCompany(companyId);

      res.json({
        success: true,
        data: offers,
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

      res.json({
        success: true,
        data: companies,
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

      res.json({
        success: true,
        data: updatedCompany,
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
        data: updatedCompany,
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

