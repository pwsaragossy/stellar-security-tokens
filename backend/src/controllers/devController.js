import { Investor } from './models/Investor.js';
import { Company } from './models/Company.js';
import { CompanyUser } from './models/CompanyUser.js';
import { PlatformAdmin } from './models/PlatformAdmin.js';
import { StellarService } from './services/stellar.service.js';
import { generateToken } from './middleware/auth.js';
import prisma from './config/prisma.js';
import bcrypt from 'bcrypt';

/**
 * Controller para endpoints de debug (apenas desenvolvimento)
 */
export class DevController {
  /**
   * Login direto de investor mock
   * POST /api/dev/login/investor
   */
  static async devLoginInvestor(req, res) {
    try {
      const MOCK_EMAIL = 'investor@debug.local';
      const MOCK_PASSWORD = 'Test123456';
      const MOCK_DOCUMENT = '11144477735';
      const MOCK_NAME = 'Debug Investor';

      // Buscar ou criar investor
      let investor = await Investor.findByEmail(MOCK_EMAIL);
      
      if (!investor) {
        // Criar conta Stellar
        const stellarAccount = await StellarService.createInvestorAccount();
        
        // Criar investor
        investor = await Investor.create({
          name: MOCK_NAME,
          email: MOCK_EMAIL,
          document: MOCK_DOCUMENT,
          stellarPublicKey: stellarAccount.publicKey,
          kycStatus: 'pending',
        });

        // Adicionar senha
        await Investor.updatePassword(investor.id, MOCK_PASSWORD);
      }

      // Gerar token
      const token = generateToken({
        id: investor.id,
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
          role: 'investor',
        },
      });
    } catch (error) {
      console.error('Error in devLoginInvestor:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create/login investor',
        details: error.message,
      });
    }
  }

  /**
   * Login direto de company mock
   * POST /api/dev/login/company
   */
  static async devLoginCompany(req, res) {
    try {
      const MOCK_EMAIL = 'company@debug.local';
      const MOCK_PASSWORD = 'Test123456';
      const MOCK_CNPJ = '11222333000181';
      const MOCK_COMPANY_NAME = 'Debug Company LTDA';
      const MOCK_USER_NAME = 'Debug Company User';

      // Buscar ou criar company user
      let companyUser = await CompanyUser.findByEmail(MOCK_EMAIL);
      
      if (!companyUser) {
        // Buscar empresa existente por CNPJ ou criar nova
        let company = await Company.findByCnpj(MOCK_CNPJ);
        
        if (!company) {
          // Criar empresa
          company = await Company.create({
            name: MOCK_COMPANY_NAME,
            cnpj: MOCK_CNPJ,
            email: `company-${Date.now()}@debug.local`,
            legal_representative: MOCK_USER_NAME,
            address: 'Debug Address',
            phone: '11999999999',
            status: 'approved',
            kyc_status: 'pending',
          });
        } else if (company.status !== 'approved') {
          // Aprovar empresa se não estiver aprovada
          await Company.updateStatus(company.id, 'approved');
          company = await Company.findById(company.id);
        }

        // Criar company user
        companyUser = await CompanyUser.create({
          company_id: company.id,
          email: MOCK_EMAIL,
          password: MOCK_PASSWORD,
          name: MOCK_USER_NAME,
          role: 'admin',
        });
      }

      // Buscar dados completos da empresa
      const company = await Company.findById(companyUser.company_id);
      if (!company) {
        throw new Error('Company not found');
      }

      // Gerar token
      const token = generateToken({
        id: companyUser.id,
        userId: companyUser.id,
        email: companyUser.email,
        role: 'company_user',
        companyId: company.id,
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
          role: 'company',
        },
      });
    } catch (error) {
      console.error('Error in devLoginCompany:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create/login company',
        details: error.message,
      });
    }
  }

  /**
   * Login direto de admin mock
   * POST /api/dev/login/admin
   */
  static async devLoginAdmin(req, res) {
    try {
      const MOCK_EMAIL = 'admin@debug.local';
      const MOCK_PASSWORD = 'Test123456';
      const MOCK_NAME = 'Debug Admin';

      // Buscar ou criar admin
      let admin = await PlatformAdmin.findByEmail(MOCK_EMAIL);
      
      if (!admin) {
        // Criar admin
        admin = await PlatformAdmin.create({
          email: MOCK_EMAIL,
          password: MOCK_PASSWORD,
          name: MOCK_NAME,
          role: 'super_admin',
        });
      }

      // Gerar token
      const token = generateToken({
        id: admin.id,
        userId: admin.id,
        email: admin.email,
        role: 'platform_admin',
        adminRole: admin.role,
      });

      res.json({
        success: true,
        data: {
          token,
          admin: {
            id: admin.id,
            email: admin.email,
            name: admin.name,
            role: admin.role,
            is_active: admin.is_active,
            created_at: admin.created_at,
            updated_at: admin.updated_at,
          },
          role: 'admin',
        },
      });
    } catch (error) {
      console.error('Error in devLoginAdmin:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create/login admin',
        details: error.message,
      });
    }
  }
}

