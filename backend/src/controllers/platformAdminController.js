import { PlatformAdmin } from './models/PlatformAdmin.js';
import { generateToken } from './middleware/auth.js';

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
      console.error('Error creating platform admin:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create platform admin',
        details: error.message,
      });
    }
  }

  /**
   * Login de administrador da plataforma
   * POST /api/platform-admins/login
   */
  static async loginPlatformAdmin(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required',
        });
      }

      const admin = await PlatformAdmin.authenticate(email, password);
      if (!admin) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password',
        });
      }

      // Gerar token JWT
      const token = generateToken({
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
        },
      });
    } catch (error) {
      console.error('Error logging in platform admin:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to login',
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
      console.error('Error fetching platform admins:', error);
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
      console.error('Error updating platform admin:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update platform admin',
        details: error.message,
      });
    }
  }
}

