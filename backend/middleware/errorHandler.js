/**
 * Middleware de tratamento de erros global
 * Captura todos os erros não tratados e retorna respostas apropriadas
 * @param {Error} err - Objeto de erro
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 * @param {Function} next - Função next do Express
 * @returns {Object} Resposta JSON com detalhes do erro
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: err.message,
    });
  }

  if (err.name === 'DatabaseError') {
    return res.status(500).json({
      success: false,
      error: 'Database Error',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    });
  }

  if (err.name === 'StellarError') {
    return res.status(400).json({
      success: false,
      error: 'Stellar Operation Error',
      details: err.message,
    });
  }

  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
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

