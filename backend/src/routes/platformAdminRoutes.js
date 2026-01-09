import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePlatformAdmin, requireAdminRole } from '../middleware/authorize.js';
import { PlatformAdminController } from '../controllers/platformAdminController.js';
import { InvestmentMetricsController } from '../controllers/investmentMetricsController.js';

const router = express.Router();

const createValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('role').optional().isIn(['admin', 'manager', 'super_admin']).withMessage('Invalid role'),
  validate,
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

/**
 * @swagger
 * /api/platform-admins/login:
 *   post:
 *     summary: Login de administrador
 *     tags: [Platform Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login realizado, retorna JWT
 *       401:
 *         description: Credenciais inválidas
 */
// Rotas públicas
router.post('/login', loginValidation, PlatformAdminController.loginPlatformAdmin);

// Rota de debug para criar admin sem autenticação (apenas em desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
  router.post('/debug/create', createValidation, PlatformAdminController.createPlatformAdmin);
}

/**
 * @swagger
 * /api/platform-admins:
 *   post:
 *     summary: Criar administrador
 *     description: Apenas super_admin pode criar outros admins
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, manager, super_admin]
 *     responses:
 *       201:
 *         description: Admin criado
 *       403:
 *         description: Acesso negado
 *   get:
 *     summary: Listar administradores
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de administradores
 */
// Rotas para platform_admins (apenas super_admin pode criar)
router.post('/', requireAdminRole('super_admin'), createValidation, PlatformAdminController.createPlatformAdmin);
router.get('/', requirePlatformAdmin, PlatformAdminController.getPlatformAdmins);

// Rotas de configuração e logs (DEVEM vir antes de /:id)
/**
 * @swagger
 * /api/platform-admins/system-config:
 *   get:
 *     summary: Obter configurações do sistema (Taxas)
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configurações retornadas
 *   put:
 *     summary: Atualizar configurações do sistema
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               settings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key:
 *                       type: string
 *                     value:
 *                       type: string
 *     responses:
 *       200:
 *         description: Configurações atualizadas
 */
router.get('/system-config', authenticateToken, requirePlatformAdmin, PlatformAdminController.getSystemConfig);
router.put('/system-config', authenticateToken, requirePlatformAdmin, PlatformAdminController.updateSystemConfig);

/**
 * @swagger
 * /api/platform-admins/investments/metrics:
 *   get:
 *     summary: Obter métricas gerais de investimento
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema: { type: string }
 *       - in: query
 *         name: end_date
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Métricas retornadas
 */
router.get('/investments/metrics', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getMetrics);

/**
 * @swagger
 * /api/platform-admins/investments/statistics:
 *   get:
 *     summary: Obter estatísticas de investimento por período
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Estatísticas retornadas
 */
router.get('/investments/statistics', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getStatistics);

/**
 * @swagger
 * /api/platform-admins/investments/pending:
 *   get:
 *     summary: Obter investimentos pendentes de pagamento
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lista de investimentos pendentes
 */
router.get('/investments/pending', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getPendingInvestments);

/**
 * @swagger
 * /api/platform-admins/investments/fundraising:
 *   get:
 *     summary: Obter progresso de captação (Ofertas ativas)
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de progresso das ofertas
 */
router.get('/investments/fundraising', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getFundraisingProgress);

/**
 * @swagger
 * /api/platform-admins/investments/revenue-breakdown:
 *   get:
 *     summary: Obter breakdown de receita por categoria
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Totais de receita por categoria
 */
router.get('/investments/revenue-breakdown', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getRevenueBreakdown);

/**
 * @swagger
 * /api/platform-admins/investments/cohorts:
 *   get:
 *     summary: Obter coortes de investidores (Ativos vs Inativos)
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contagem de usuários ativos e inativos
 */
router.get('/investments/cohorts', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getInvestorCohorts);

/**
 * @swagger
 * /api/platform-admins/fee-logs:
 *   get:
 *     summary: Obter logs de taxas (Receita)
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Logs retornados com sumário de receita
 */
router.get('/fee-logs', authenticateToken, requirePlatformAdmin, PlatformAdminController.getFeeLogs);

/**
 * @swagger
 * /api/platform-admins/{id}:
 *   put:
 *     summary: Atualizar administrador
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Admin atualizado
 */
router.put('/:id', requirePlatformAdmin, PlatformAdminController.updatePlatformAdmin);

/**
 * @swagger
 * /api/platform-admins/investors:
 *   get:
 *     summary: "[Admin] Listar todos os investidores"
 *     description: Lista investidores com filtro por status (pending/active/rejected)
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, active, rejected]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de investidores
 */
router.get('/investors', authenticateToken, requirePlatformAdmin, PlatformAdminController.getAllInvestors);

/**
 * @swagger
 * /api/platform-admins/investors/{id}/approve:
 *   put:
 *     summary: "[Admin] Aprovar KYC de investidor"
 *     description: Altera o status do investidor para 'active'
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Investidor aprovado
 *       404:
 *         description: Investidor não encontrado
 */
router.put('/investors/:id/approve', authenticateToken, requirePlatformAdmin, PlatformAdminController.approveInvestor);

/**
 * @swagger
 * /api/platform-admins/investors/{id}/reject:
 *   put:
 *     summary: "[Admin] Rejeitar KYC de investidor"
 *     description: Altera o status do investidor para 'rejected'
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Motivo da rejeição
 *     responses:
 *       200:
 *         description: Investidor rejeitado
 *       400:
 *         description: Motivo não fornecido
 *       404:
 *         description: Investidor não encontrado
 */
router.put('/investors/:id/reject', authenticateToken, requirePlatformAdmin, PlatformAdminController.rejectInvestor);

// ============ Default Management Routes ============
import { CollateralDistributionService } from '../services/collateralDistribution.service.js';

/**
 * GET /api/platform-admins/defaults
 * Get all defaulted offers awaiting admin action
 */
router.get('/defaults', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const defaults = await CollateralDistributionService.getDefaultedOffers();
    const stats = await CollateralDistributionService.getDefaultStatistics();

    res.json({
      success: true,
      data: { defaults, stats }
    });
  } catch (error) {
    console.error('[Admin Defaults] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/platform-admins/defaults/:offerId
 * Get details of a specific defaulted offer
 */
router.get('/defaults/:offerId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { offerId } = req.params;
    const details = await CollateralDistributionService.getDefaultedOfferDetails(parseInt(offerId));

    if (!details) {
      return res.status(404).json({ success: false, error: 'Defaulted offer not found' });
    }

    res.json({ success: true, data: details });
  } catch (error) {
    console.error('[Admin Defaults] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/platform-admins/defaults/:offerId/prepare
 * Prepare collateral distribution transaction for admin signing
 */
router.post('/defaults/:offerId/prepare', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { offerId } = req.params;
    const transaction = await CollateralDistributionService.prepareCollateralDistribution(parseInt(offerId));

    res.json({
      success: true,
      data: transaction,
      message: 'Transaction prepared. Sign with admin passkey to distribute collateral.'
    });
  } catch (error) {
    console.error('[Admin Defaults] Prepare error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/platform-admins/defaults/:offerId/distribute
 * Submit signed collateral distribution transaction
 */
router.post('/defaults/:offerId/distribute', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { offerId } = req.params;
    const { signedXDR } = req.body;

    if (!signedXDR) {
      return res.status(400).json({ success: false, error: 'Signed transaction XDR required' });
    }

    const result = await CollateralDistributionService.processCollateralDistribution(
      signedXDR,
      parseInt(offerId),
      req.user.userId
    );

    res.json({
      success: true,
      data: result,
      message: 'Collateral distributed to investors successfully'
    });
  } catch (error) {
    console.error('[Admin Defaults] Distribute error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

