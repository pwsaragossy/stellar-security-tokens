import { PlatformAdmin } from '../models/PlatformAdmin.js';
import { StellarService } from '../services/stellar.service.js';
import prisma from '../config/prisma.js';
import { EmailService } from '../services/email.service.js';
import logger from '../utils/logger.js';
const log = logger.scope('PlatformAdminController');

/**
 * Controller para gerenciar administradores da plataforma
 */
export class PlatformAdminController {
  /**
   * Cria um novo administrador (apenas super_admin)
   * POST /api/platform-admins
   */
  static async createPlatformAdmin(req, res) {
    try {
      const {
        email,
        password,
        name,
        role = 'admin',
      } = req.body;

      // Validações básicas
      if (!email || !password || !name) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: email, password, name',
        });
      }

      // Verificar se email já existe
      const existingAdmin = await PlatformAdmin.findByEmail(email);
      if (existingAdmin) {
        return res.status(409).json({
          success: false,
          error: 'Email already registered',
        });
      }

      const admin = await PlatformAdmin.create({
        email,
        password,
        name,
        role,
      });

      res.status(201).json({
        success: true,
        data: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          is_active: admin.is_active,
        },
      });
    } catch (error) {
      log.error('Error creating platform admin:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create platform admin',
        details: error.message,
      });
    }
  }

  /**
   * Lista todos os administradores (apenas para platform_admins)
   * GET /api/platform-admins
   */
  static async getPlatformAdmins(req, res) {
    try {
      const { limit = 100, offset = 0 } = req.query;

      const admins = await PlatformAdmin.findAll(parseInt(limit), parseInt(offset));

      res.json({
        success: true,
        data: admins,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      log.error('Error fetching platform admins:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch platform admins',
        details: error.message,
      });
    }
  }

  /**
   * Atualiza administrador
   * PUT /api/platform-admins/:id
   */
  static async updatePlatformAdmin(req, res) {
    try {
      const { id } = req.params;
      const { name, role, is_active } = req.body;

      // Apenas super_admin pode alterar roles
      if (role && req.user.adminRole !== 'super_admin') {
        return res.status(403).json({
          success: false,
          error: 'Only super_admin can change roles',
        });
      }

      const updatedAdmin = await PlatformAdmin.update(parseInt(id), {
        name,
        role,
        is_active,
      });

      if (!updatedAdmin) {
        return res.status(404).json({
          success: false,
          error: 'Admin not found',
        });
      }

      res.json({
        success: true,
        data: updatedAdmin,
      });
    } catch (error) {
      log.error('Error updating platform admin:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update platform admin',
        details: error.message,
      });
    }
  }
  /**
   * Obtém configuração do sistema
   * GET /api/platform-admins/system-config
   */
  static async getSystemConfig(req, res) {
    try {
      const config = await prisma.systemConfig.findMany();
      // Reduce array to object { key: value } for easier frontend consumption
      const configMap = config.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {});

      res.json({
        success: true,
        data: configMap,
      });
    } catch (error) {
      log.error('Error fetching system config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch system config',
      });
    }
  }

  /**
   * Atualiza configuração do sistema
   * PUT /api/platform-admins/system-config
   * Body: { settings: [{ key: 'withdrawal_fee', value: '5' }] }
   */
  static async updateSystemConfig(req, res) {
    try {
      const { settings } = req.body;
      if (!Array.isArray(settings)) {
        return res.status(400).json({ success: false, error: 'Settings must be an array' });
      }

      const results = [];
      // Transaction to update all keys
      await prisma.$transaction(async (tx) => {
        for (const setting of settings) {
          const { key, value, description } = setting;
          const updated = await tx.systemConfig.upsert({
            where: { key },
            update: { value, description, updatedAt: new Date() },
            create: { key, value, description, updatedAt: new Date() },
          });
          results.push(updated);
        }
      });

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      log.error('Error updating system config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update system config',
      });
    }
  }

  /**
   * Obtém logs de taxas (Receita)
   * GET /api/platform-admins/fee-logs
   */
  static async getFeeLogs(req, res) {
    try {
      const { limit = 100, offset = 0 } = req.query;

      const logs = await prisma.feeLog.findMany({
        take: parseInt(limit),
        skip: parseInt(offset),
        orderBy: { createdAt: 'desc' },
      });

      // Calculate total revenue by currency (simple aggregation)
      // Note: For large datasets, use native database aggregation
      const revenue = await prisma.feeLog.groupBy({
        by: ['assetCode'],
        _sum: {
          amount: true,
        },
      });

      res.json({
        success: true,
        data: logs,
        revenueSummary: revenue,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      log.error('Error fetching fee logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch fee logs',
      });
    }
  }

  /**
   * Get all investors for Admin review
   * Supports filtering by status (pending, active, rejected)
   */
  static async getAllInvestors(req, res) {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      const whereClause = status ? { kycStatus: status } : {};

      const investors = await prisma.investor.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
        select: {
          id: true,
          name: true,
          email: true,
          document: true,
          kycStatus: true,
          emailVerified: true,
          stellarContractId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Map kycStatus to status and stellarContractId to walletAddress for frontend
      const mappedInvestors = investors.map(i => ({
        ...i,
        status: i.kycStatus,
        walletAddress: i.stellarContractId,
      }));

      const total = await prisma.investor.count({ where: whereClause });

      res.json({
        success: true,
        data: mappedInvestors,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      log.error('Error fetching investors:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch investors',
      });
    }
  }

  /**
   * Approve an investor's KYC
   * Sets status to 'active'
   */
  static async approveInvestor(req, res) {
    try {
      const { id } = req.params;

      const investor = await prisma.investor.findUnique({
        where: { id: parseInt(id) },
      });

      if (!investor) {
        return res.status(404).json({
          success: false,
          error: 'Investor not found',
        });
      }

      if (investor.kycStatus === 'approved') {
        return res.status(400).json({
          success: false,
          error: 'Investor is already approved',
        });
      }

      const updatedInvestor = await prisma.investor.update({
        where: { id: parseInt(id) },
        data: {
          kycStatus: 'approved',
          updatedAt: new Date(),
        },
      });

      // Automated Whitelisting: If investor has a smart wallet (stellarContractId), authorize all trustlines
      if (updatedInvestor.stellarContractId) {
        try {
          log.info(`[KYC Approval] Triggering automated whitelisting for ${updatedInvestor.email} (${updatedInvestor.stellarContractId})`);
          await StellarService.authorizeAllUserTrustlines(updatedInvestor.stellarContractId);
        } catch (whitelistError) {
          log.error(`[KYC Approval] Automated whitelisting failed for ${updatedInvestor.email}:`, whitelistError.message);
          // We don't fail the approval if whitelisting fails, but we log it
        }
      }



      // Send approval email to investor
      await EmailService.sendKYCApprovalEmail(updatedInvestor.email, updatedInvestor.name);
      log.info(`[Admin] Investor ${id} approved by admin ${req.user?.id}`);

      res.json({
        success: true,
        message: 'Investor approved successfully',
        data: {
          id: updatedInvestor.id,
          name: updatedInvestor.name,
          email: updatedInvestor.email,
          status: updatedInvestor.kycStatus,
        },
      });
    } catch (error) {
      log.error('Error approving investor:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to approve investor',
      });
    }
  }

  /**
   * Reject an investor's KYC
   * Sets status to 'rejected' with a reason
   */
  static async rejectInvestor(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Rejection reason is required',
        });
      }

      const investor = await prisma.investor.findUnique({
        where: { id: parseInt(id) },
      });

      if (!investor) {
        return res.status(404).json({
          success: false,
          error: 'Investor not found',
        });
      }

      const updatedInvestor = await prisma.investor.update({
        where: { id: parseInt(id) },
        data: {
          kycStatus: 'rejected',
          // Store rejection reason in a JSON field or dedicated column if available
          updatedAt: new Date(),
        },
      });


      // Send rejection email to investor with reason
      await EmailService.sendKYCRejectionEmail(updatedInvestor.email, updatedInvestor.name, reason);
      log.info(`[Admin] Investor ${id} rejected by admin ${req.user?.id}. Reason: ${reason}`);

      res.json({
        success: true,
        message: 'Investor rejected',
        data: {
          id: updatedInvestor.id,
          name: updatedInvestor.name,
          email: updatedInvestor.email,
          status: updatedInvestor.kycStatus,
          rejectionReason: reason,
        },
      });
    } catch (error) {
      log.error('Error rejecting investor:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reject investor',
      });
    }
  }

  /**
   * Obtém estatísticas de manutenção de TTL (Soroban)
   * GET /api/platform-admins/maintenance/ttl-stats
   */
  static async getTTLStats(req, res) {
    try {
      const sacCount = await prisma.token.count({
        where: { sacContractId: { not: null } }
      });
      const walletCount = await prisma.investor.count({
        where: { stellarContractId: { startsWith: 'C' } }
      });

      res.json({
        success: true,
        data: {
          sacCount,
          walletCount,
          threshold: 50000, // Matching MaintenanceService.TTL_THRESHOLD
          extensionAmount: 500000, // Matching MaintenanceService.EXTEND_AMOUNT
          status: 'active',
          nextSweep: 'Daily at 03:00 UTC'
        }
      });
    } catch (error) {
      log.error('Error fetching TTL stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch TTL stats' });
    }
  }
}

