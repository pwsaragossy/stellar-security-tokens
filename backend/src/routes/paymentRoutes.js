import express from 'express';
import { body, query } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  processMonthlyPayments,
  processBulletPayments,
  processQuarterlyPayments,
  processSemiAnnualPayments,
  getPaymentHistory,
  getPaymentStatistics,
} from '../controllers/paymentController.js';

const router = express.Router();

const processPaymentsValidation = [
  body('assetCode').optional().trim().isLength({ min: 1, max: 12 }).matches(/^[A-Z0-9]+$/).withMessage('Asset code must be 1-12 uppercase alphanumeric characters'),
  validate,
];

const getHistoryValidation = [
  query('assetCode').optional().trim().isLength({ min: 1, max: 12 }).withMessage('Asset code must be 1-12 characters'),
  query('investorId').optional().isInt({ min: 1 }).withMessage('Investor ID must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer'),
  validate,
];

const getStatisticsValidation = [
  query('assetCode').optional().trim().isLength({ min: 1, max: 12 }).withMessage('Asset code must be 1-12 characters'),
  query('startDate').optional().isISO8601().withMessage('Start date must be in ISO 8601 format'),
  query('endDate').optional().isISO8601().withMessage('End date must be in ISO 8601 format'),
  validate,
];

/**
 * @swagger
 * /api/payments/process:
 *   post:
 *     summary: Processar pagamentos mensais
 *     description: Executa o processamento de pagamentos mensais de juros
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assetCode:
 *                 type: string
 *                 example: REIT01
 *     responses:
 *       200:
 *         description: Pagamentos processados
 *       401:
 *         description: Não autorizado
 */
router.post('/process', processPaymentsValidation, authenticateToken, processMonthlyPayments);

/**
 * @swagger
 * /api/payments/process/bullet:
 *   post:
 *     summary: Processar pagamentos bullet
 *     description: Processa pagamentos tipo bullet (principal + juros no vencimento)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pagamentos bullet processados
 */
router.post('/process/bullet', authenticateToken, processBulletPayments);

/**
 * @swagger
 * /api/payments/process/quarterly:
 *   post:
 *     summary: Processar pagamentos trimestrais
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assetCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pagamentos trimestrais processados
 */
router.post('/process/quarterly', processPaymentsValidation, authenticateToken, processQuarterlyPayments);

/**
 * @swagger
 * /api/payments/process/semi-annual:
 *   post:
 *     summary: Processar pagamentos semestrais
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assetCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pagamentos semestrais processados
 */
router.post('/process/semi-annual', processPaymentsValidation, authenticateToken, processSemiAnnualPayments);

/**
 * @swagger
 * /api/payments/history:
 *   get:
 *     summary: Histórico de pagamentos
 *     description: Retorna o histórico de pagamentos com filtros opcionais
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: assetCode
 *         schema:
 *           type: string
 *         description: Filtrar por código do ativo
 *       - in: query
 *         name: investorId
 *         schema:
 *           type: integer
 *         description: Filtrar por investidor
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Lista de pagamentos
 */
router.get('/history', getHistoryValidation, authenticateToken, getPaymentHistory);

/**
 * @swagger
 * /api/payments/statistics:
 *   get:
 *     summary: Estatísticas de pagamentos
 *     description: Retorna estatísticas agregadas de pagamentos
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: assetCode
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Estatísticas de pagamentos
 */
router.get('/statistics', getStatisticsValidation, authenticateToken, getPaymentStatistics);

export default router;

