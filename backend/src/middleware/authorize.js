import { authenticateToken } from './auth.js';
import { CompanyUser } from '../models/CompanyUser.js';
import { Company } from '../models/Company.js';
import { Offer } from '../models/Offer.js';
import {
  attachAdminAuditHook,
  logAdminAction,
  buildAdminActionPayload,
} from '../services/adminAuditLog.service.js';

/**
 * Middleware para requerer que o usuário seja um investidor
 */
export const requireInvestor = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'investor') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Investor role required.',
      });
    }
    next();
  });
};

/**
 * Middleware para requerer que o usuário seja um usuário de empresa
 */
export const requireCompanyUser = (req, res, next) => {
  authenticateToken(req, res, () => {
    // Check for either userType 'company' (new flow) or role 'company_user' (legacy/employee)
    if (req.user.userType === 'company' || req.user.role === 'company_user') {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Access denied. Company user role required.',
    });
  });
};

/**
 * Middleware para requerer que o usuário seja um administrador da plataforma.
 *
 * Side effect: every admin-gated request — whether allowed or denied at
 * the role check — is recorded in the `admin_actions` audit log via
 * `adminAuditLog.service.js`. Denied attempts are logged immediately;
 * allowed requests hook into `res.on('finish')` so the final status code
 * is captured.
 */
export const requirePlatformAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    // Check for platform admin via userType OR valid admin role
    const isAdmin = req.user.userType === 'platform_admin' ||
      req.user.role === 'platform_admin' ||
      req.user.role === 'super_admin';

    if (!isAdmin) {
      logAdminAction(buildAdminActionPayload(req, res, 'denied'));
      return res.status(403).json({
        success: false,
        error: 'Access denied. Platform admin role required.',
      });
    }
    attachAdminAuditHook(req, res);
    next();
  });
};

/**
 * Middleware para requerer role específica de admin
 * @param {string|Array<string>} allowedRoles - Role(s) permitido(s)
 */
export const requireAdminRole = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    authenticateToken(req, res, () => {
      const isAdmin = req.user.userType === 'platform_admin' ||
        req.user.role === 'platform_admin' ||
        req.user.role === 'super_admin';

      if (!isAdmin) {
        logAdminAction(buildAdminActionPayload(req, res, 'denied'));
        return res.status(403).json({
          success: false,
          error: 'Access denied. Platform admin role required.',
        });
      }

      if (!roles.includes(req.user.role)) {
        logAdminAction(buildAdminActionPayload(req, res, 'denied'));
        return res.status(403).json({
          success: false,
          error: `Access denied. Required role: ${roles.join(' or ')}`,
        });
      }

      attachAdminAuditHook(req, res);
      next();
    });
  };
};

/**
 * Middleware para verificar se o usuário tem acesso à empresa
 * Verifica se o company_user pertence à empresa especificada no parâmetro
 */
export const requireCompanyAccess = async (req, res, next) => {
  try {
    authenticateToken(req, res, async () => {
      // Support for direct Company login (passkey)
      if (req.user.userType === 'company') {
        const requestedCompanyId = parseInt(req.params.companyId || req.body.company_id || req.query.company_id);

        // If specific company requested, verify matches authenticated company
        if (requestedCompanyId && requestedCompanyId !== req.user.companyId) {
          return res.status(403).json({
            success: false,
            error: 'Access denied. You do not have access to this company.',
          });
        }

        req.companyId = req.user.companyId;
        return next();
      }

      if (req.user.role !== 'company_user') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Company user role required.',
        });
      }

      const companyId = parseInt(req.params.companyId || req.body.company_id || req.query.company_id);

      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: 'Company ID is required',
        });
      }

      const user = await CompanyUser.findById(req.user.userId);
      if (!user || user.companyId !== companyId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You do not have access to this company.',
        });
      }

      req.companyId = companyId;
      next();
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Error verifying company access',
    });
  }
};

/**
 * Middleware para verificar se o usuário tem acesso à oferta
 * Verifica se o company_user pertence à empresa dona da oferta
 */
export const requireOfferAccess = async (req, res, next) => {
  try {
    authenticateToken(req, res, async () => {
      // Support for direct Company login (passkey)
      if (req.user.userType === 'company') {
        const offerId = parseInt(req.params.offerId || req.params.id);

        if (!offerId) {
          return res.status(400).json({
            success: false,
            error: 'Offer ID is required',
          });
        }

        const offer = await Offer.findById(offerId);
        if (!offer) {
          return res.status(404).json({
            success: false,
            error: 'Offer not found',
          });
        }

        if (offer.companyId !== req.user.companyId) {
          return res.status(403).json({
            success: false,
            error: 'Access denied. You do not have access to this offer.',
          });
        }

        req.offerId = offerId;
        req.companyId = offer.companyId;
        return next();
      }

      if (req.user.role !== 'company_user') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Company user role required.',
        });
      }

      const offerId = parseInt(req.params.offerId || req.params.id);

      if (!offerId) {
        return res.status(400).json({
          success: false,
          error: 'Offer ID is required',
        });
      }

      const offer = await Offer.findById(offerId);
      if (!offer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      const user = await CompanyUser.findById(req.user.userId);
      if (!user || user.companyId !== offer.companyId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You do not have access to this offer.',
        });
      }

      req.offerId = offerId;
      req.companyId = offer.companyId;
      next();
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Error verifying offer access',
    });
  }
};

/**
 * Middleware para verificar se o usuário pode acessar seus próprios dados
 * Para investidores: verifica se o ID do parâmetro corresponde ao ID do usuário
 */
export const requireOwnData = (req, res, next) => {
  authenticateToken(req, res, () => {
    const resourceId = parseInt(req.params.id || req.params.investorId);
    const userId = req.user.userId;

    if (resourceId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only access your own data.',
      });
    }

    next();
  });
};

/**
 * Middleware para requerer role específica
 * @param {string|Array<string>} allowedRoles - Role(s) permitido(s)
 */
export const requireRole = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    authenticateToken(req, res, () => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: `Access denied. Required role: ${roles.join(' or ')}`,
        });
      }
      next();
    });
  };
};

