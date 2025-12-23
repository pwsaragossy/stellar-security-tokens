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

export default router;

