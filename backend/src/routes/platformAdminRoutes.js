import express from 'express';
import { body, param } from 'express-validator';
import { validate } from './middleware/validator.js';
import { authenticateToken } from './middleware/auth.js';
import { requirePlatformAdmin, requireAdminRole } from './middleware/authorize.js';
import { PlatformAdminController } from './controllers/platformAdminController.js';
import { InvestmentMetricsController } from './controllers/investmentMetricsController.js';

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

// Rotas públicas
router.post('/login', loginValidation, PlatformAdminController.loginPlatformAdmin);

// Rota de debug para criar admin sem autenticação (apenas em desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
  router.post('/debug/create', createValidation, PlatformAdminController.createPlatformAdmin);
}

// Rotas para platform_admins (apenas super_admin pode criar)
router.post('/', requireAdminRole('super_admin'), createValidation, PlatformAdminController.createPlatformAdmin);
router.get('/', requirePlatformAdmin, PlatformAdminController.getPlatformAdmins);
router.put('/:id', requirePlatformAdmin, PlatformAdminController.updatePlatformAdmin);

// Investment metrics routes (platform admin only)
router.get('/investments/metrics', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getMetrics);
router.get('/investments/statistics', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getStatistics);
router.get('/investments/pending', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getPendingInvestments);

export default router;

