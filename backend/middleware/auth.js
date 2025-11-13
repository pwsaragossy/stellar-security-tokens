import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here_change_in_production';

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

