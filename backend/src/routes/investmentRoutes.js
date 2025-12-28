import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticateToken } from '../middleware/auth.js';
import { purchaseInvestment, getInvestmentStatus } from '../controllers/investmentController.js';

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
router.post('/purchase', purchaseValidation, authenticateToken, purchaseInvestment);

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

