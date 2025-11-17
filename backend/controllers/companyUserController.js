import { CompanyUser } from '../models/CompanyUser.js';
import { Company } from '../models/Company.js';
import { generateToken } from '../middleware/auth.js';

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
      const company = await Company.findById(user.company_id);
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
        companyId: user.company_id,
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
            kyc_status: company.kyc_status,
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
      if (user.company_id !== companyId) {
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
}

