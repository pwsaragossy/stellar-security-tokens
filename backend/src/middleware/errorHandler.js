import crypto from 'crypto';
import logger from '../utils/logger.js';
const log = logger.scope('ErrorHandler');

/**
 * Middleware de tratamento de erros global
 * In production: suppresses error.message, returns only a tracking error ID
 * In development: returns full error details for debugging
 */
export const errorHandler = (err, req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const errorId = crypto.randomUUID();

  // Always log full error server-side
  log.error(`[Error ${errorId}] ${req.method} ${req.originalUrl}`, err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: isDev ? err.message : undefined,
      errorId,
    });
  }

  if (err.name === 'DatabaseError') {
    return res.status(500).json({
      success: false,
      error: isDev ? 'Database Error' : 'Internal server error',
      details: isDev ? err.message : undefined,
      errorId,
    });
  }

  if (err.name === 'StellarError') {
    return res.status(400).json({
      success: false,
      error: 'Stellar Operation Error',
      details: isDev ? err.message : undefined,
      errorId,
    });
  }

  res.status(err.status || err.httpStatus || 500).json({
    success: false,
    error: isDev ? (err.message || 'Internal Server Error') : 'Internal server error',
    code: err.code || undefined,
    details: isDev ? err.stack : undefined,
    errorId,
  });
};

/**
 * Middleware para rotas não encontradas (404)
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 * @returns {Object} Resposta JSON 404 com path não encontrado
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
  });
};

