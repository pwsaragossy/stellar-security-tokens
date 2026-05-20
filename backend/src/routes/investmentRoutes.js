import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticateToken } from '../middleware/auth.js';
import { intentDebounce } from '../middleware/intentDebounce.js';
import { dailyCapCheck } from '../middleware/dailyCapCheck.js';
import { perUserLimiter } from '../middleware/rateLimit.js';
import { purchaseInvestment, getInvestmentStatus, getFeeSchedule, submitInvestmentTx } from '../controllers/investmentController.js';

const router = express.Router();

const purchaseValidation = [
  body('investorId').isInt({ min: 1 }).withMessage('Valid investor ID is required'),
  body('usdcAmount').isFloat({ min: 0.0000001 }).withMessage('USDC amount must be a positive number'),
  body('assetCode').optional().isString().isLength({ min: 1, max: 12 }).withMessage('Asset code must be 1-12 characters'),
  body('offerId').optional().isInt({ min: 1 }).withMessage('Valid offer ID is required'),
  validate,
];

/**
 * @swagger
 * /api/investments/purchase:
 *   post:
 *     summary: Comprar tokens de uma oferta
 *     description: Inicia uma compra de security tokens com USDC
 *     tags: [Investments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - investorId
 *               - usdcAmount
 *             properties:
 *               investorId:
 *                 type: integer
 *                 example: 1
 *               usdcAmount:
 *                 type: number
 *                 example: 1000.00
 *               assetCode:
 *                 type: string
 *                 example: REIT01
 *               offerId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Compra iniciada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Investment'
 *       400:
 *         description: Dados inválidos ou saldo insuficiente para cobrir taxas (Blockchain Fee + Platform Fee)
 *       401:
 *         description: Não autorizado
 */
/**
 * @swagger
 * /api/investments/fee-schedule:
 *   get:
 *     summary: Get current investment fee schedule
 *     description: Returns the current blockchain fee and platform fee percentages
 *     tags: [Investments]
 *     responses:
 *       200:
 *         description: Fee schedule
 */
router.get('/fee-schedule', getFeeSchedule);

// PR5 audit hardening:
//  - perUserLimiter (O-002): 100/min per authenticated user, prevents IP-rotating bots
//  - intentDebounce (F-008): rejects byte-equal repeat purchase intents within 10s
//  - dailyCapCheck (O-006): enforces Investor.dailyCapUsd if set
// Extract amount from req.body.usdcAmount for the cap check.
router.post(
    '/purchase',
    authenticateToken,
    perUserLimiter,
    purchaseValidation,
    intentDebounce(),
    dailyCapCheck({ amountExtractor: (req) => Number(req.body?.usdcAmount) || null }),
    purchaseInvestment,
);

// Same hardening on submit-tx (the signed half of the purchase flow)
router.post('/submit-tx', authenticateToken, perUserLimiter, intentDebounce(), [
  body('signedXdr').isString().notEmpty().withMessage('Signed XDR is required'),
  body('investmentContext').isObject().withMessage('investmentContext object is required'),
  body('investmentContext.investorId').isInt({ min: 1 }).withMessage('Valid investor ID is required'),
  body('investmentContext.offerId').isInt({ min: 1 }).withMessage('Valid offer ID is required'),
  body('investmentContext.assetCode').isString().notEmpty().withMessage('Asset code is required'),
  body('investmentContext.totalDeduction').isFloat({ gt: 0 }).withMessage('totalDeduction must be positive'),
  validate,
], submitInvestmentTx);

/**
 * @swagger
 * /api/investments/{id}/status:
 *   get:
 *     summary: Consultar status do investimento
 *     description: Retorna o status atual de um investimento
 *     tags: [Investments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do investimento
 *     responses:
 *       200:
 *         description: Status do investimento
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Investment'
 *       404:
 *         description: Investimento não encontrado
 */
router.get('/:id/status', [
  param('id').isInt({ min: 1 }).withMessage('Valid investment ID is required'),
  validate,
], authenticateToken, getInvestmentStatus);

export default router;

