import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

import path from 'path';
import crypto from 'crypto';
import { isTokenBlocklisted } from '../config/redis.js';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
const log = logger.scope('Auth');

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
 * Also checks if token has been blocklisted (logged out)
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 * @param {Function} next - Função next do Express
 * @returns {void|Object} Retorna erro 401 se token não fornecido, 403 se inválido/expirado, ou chama next()
 */
export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required',
    });
  }

  // Check if token has been blocklisted (user logged out)
  try {
    const isBlocklisted = await isTokenBlocklisted(token);
    if (isBlocklisted) {
      return res.status(401).json({
        success: false,
        error: 'Token has been invalidated. Please login again.',
      });
    }
  } catch (err) {
    // Fail closed: if blocklist check fails, deny access
    log.error('[Auth] Blocklist check failed — failing closed:', err.message);
    return res.status(503).json({
      success: false,
      error: 'Authentication service temporarily unavailable. Please try again.',
    });
  }

  // Wrap jwt.verify in a Promise to make it properly awaitable
  try {
    const user = await new Promise((resolve, reject) => {
      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded);
        }
      });
    });

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
};


/**
 * Gera um token JWT com payload fornecido
 * @param {Object} payload - Dados a serem incluídos no token (ex: { userId, email })
 * @param {string} [expiresIn='24h'] - Tempo de expiração do token (ex: '15m', '1h', '7d')
 * @returns {string} Token JWT assinado (padrão: expira em 24 horas)
 */
export const generateToken = (payload, expiresIn = '24h') => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const COOKIE_NAMES = {
  investor: 'rt_inv',
  company: 'rt_co',
  platform_admin: 'rt_adm',
  admin: 'rt_adm', // Alias
};

/**
 * Hash a refresh token using SHA-256
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a new refresh token and store its hash in the DB
 * @param {string} userType - 'investor' | 'company' | 'platform_admin'
 * @param {number} userId
 * @returns {Promise<string>} Raw refresh token (to be sent in cookie)
 */
export async function generateRefreshToken(userType, userId) {
  const rawToken = crypto.randomBytes(64).toString('base64url');
  const tokenHash = hashToken(rawToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userType,
      userId,
      expiresAt,
    },
  });

  return rawToken;
}

/**
 * Rotate a refresh token: validate the old one, revoke it, issue a new pair
 * @param {string} rawToken - The raw refresh token from the cookie
 * @returns {Promise<{accessToken: string, refreshToken: string, userType: string, userId: number} | null>}
 */
export async function rotateRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    // If the token was already revoked, this might be a replay attack — revoke the entire chain
    if (existing?.revokedAt && existing.replacedBy) {
      await prisma.refreshToken.updateMany({
        where: { userId: existing.userId, userType: existing.userType, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return null;
  }

  // Generate new refresh token
  const newRawToken = crypto.randomBytes(64).toString('base64url');
  const newHash = hashToken(newRawToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  // Revoke old + create new in a transaction
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedBy: newHash },
    }),
    prisma.refreshToken.create({
      data: {
        tokenHash: newHash,
        userType: existing.userType,
        userId: existing.userId,
        expiresAt,
      },
    }),
  ]);

  // Look up user to build access token payload
  let userPayload;
  const { userType, userId } = existing;

  if (userType === 'investor') {
    const user = await prisma.investor.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) return null;
    userPayload = { userId: user.id, email: user.email, userType: 'investor', role: 'investor' };
  } else if (userType === 'company') {
    const user = await prisma.companyUser.findUnique({ where: { id: userId }, select: { id: true, email: true, companyId: true, role: true } });
    if (!user) return null;
    userPayload = { userId: user.id, email: user.email, userType: 'company', role: user.role, companyId: user.companyId };
  } else if (userType === 'platform_admin') {
    const user = await prisma.platformAdmin.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, isActive: true } });
    if (!user || !user.isActive) return null;
    userPayload = { userId: user.id, email: user.email, userType: 'platform_admin', role: user.role };
  } else {
    return null;
  }

  const accessToken = generateToken(userPayload);

  return { accessToken, refreshToken: newRawToken, userType, userId };
}

/**
 * Set the httpOnly refresh cookie on the response
 */
export function setRefreshCookie(res, rawToken, userType) {
  const cookieName = COOKIE_NAMES[userType] || 'rt';
  const isProduction = process.env.NODE_ENV === 'production';
  // Secure flag must be true whenever the frontend uses HTTPS (including Cloudflare Tunnels in dev)
  const frontendUrl = process.env.FRONTEND_URL || '';
  const requiresSecure = isProduction || frontendUrl.startsWith('https://');


  res.cookie(cookieName, rawToken, {
    httpOnly: true,
    secure: requiresSecure,
    sameSite: 'lax', // Same-origin API proxy — no cross-site cookie access needed
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000, // 7 days in ms
    path: '/api/auth', // Only sent to auth endpoints
  });
}

/**
 * Clear the refresh cookie
 */
export function clearRefreshCookie(res, userType) {
  const cookieName = COOKIE_NAMES[userType] || 'rt';
  res.clearCookie(cookieName, { path: '/api/auth' });
}

/**
 * Get the refresh token from the correct cookie based on userType hint.
 * @param {Object} cookies - Parsed cookies from the request
 * @param {string} [preferredType] - Optional userType hint (e.g., 'admin', 'platform_admin') to check first
 */
export function getRefreshTokenFromCookies(cookies, preferredType) {  // If a preferred type is given, check its cookie first
  if (preferredType) {
    // Normalize: 'admin' -> 'platform_admin' for cookie lookup
    const normalized = preferredType === 'admin' ? 'platform_admin' : preferredType;
    const name = COOKIE_NAMES[normalized];
    if (name && cookies[name]) {
      return { token: cookies[name], userType: normalized };
    }
  }

  // Fallback: try all cookie names, return first found
  for (const [type, name] of Object.entries(COOKIE_NAMES)) {
    if (cookies[name]) {
      return { token: cookies[name], userType: type };
    }
  }
  return null;
}

/**
 * Middleware de autenticação JWT opcional
 * Se um token válido for fornecido, adiciona o usuário ao req.user
 * Não retorna erro se token ausente ou inválido
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 * @param {Function} next - Função next do Express
 * @returns {void} Sempre chama next()
 */
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const isBlocklisted = await isTokenBlocklisted(token);
      if (!isBlocklisted) {
        const user = jwt.verify(token, JWT_SECRET);
        req.user = user;
      }
    } catch {
      // Silently skip — optional auth should not block the request
    }
  }

  next();
};

