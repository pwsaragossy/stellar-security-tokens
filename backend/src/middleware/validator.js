import { validationResult } from 'express-validator';

/**
 * Middleware para validar requisições usando express-validator
 * Verifica se há erros de validação e retorna resposta de erro se necessário
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 * @param {Function} next - Função next do Express
 * @returns {void|Object} Retorna resposta de erro 400 se houver erros de validação, ou chama next()
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

