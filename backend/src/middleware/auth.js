import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

import path from 'path';

// Try loading from current dir, then parent dir
dotenv.config();
if (!process.env.JWT_SECRET) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required. Set it in your .env file.');
}

/**
 * Middleware de autenticação JWT obrigatória
 * Verifica o token JWT no header Authorization e adiciona o usuário ao req.user
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 * @param {Function} next - Função next do Express
 * @returns {void|Object} Retorna erro 401 se token não fornecido, 403 se inválido/expirado, ou chama next()
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required',
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    req.user = user;
    next();
  });
};

/**
 * Gera um token JWT com payload fornecido
 * @param {Object} payload - Dados a serem incluídos no token (ex: { userId, email })
 * @returns {string} Token JWT assinado (expira em 24 horas)
 */
export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};

/**
 * Middleware de autenticação JWT opcional
 * Se um token válido for fornecido, adiciona o usuário ao req.user
 * Não retorna erro se token ausente ou inválido
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 * @param {Function} next - Função next do Express
 * @returns {void} Sempre chama next()
 */
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  }

  next();
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

/**
 * Middleware para verificar se o usuário pode acessar seus próprios dados
 * Para investidores: verifica se o ID do parâmetro corresponde ao ID do usuário
 */
export const requireOwnData = (req, res, next) => {
  authenticateToken(req, res, () => {
    // Issue 4 Fix: Admins can access any user's data
    if (req.user.role === 'platform_admin') {
      return next();
    }

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
 * Middleware to require company user role
 * Verifies that the authenticated user is a company_user
 */
export const requireCompanyUser = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'company_user') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Company user role required.',
      });
    }
    next();
  });
};
