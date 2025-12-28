import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import {
  issueToken,
  getTokens,
  getTokenByAssetCode,
  distributeTokens,
  getTokenBalance,
} from '../controllers/tokenController.js';

const router = express.Router();

const issueTokenValidation = [
  body('assetCode').trim().isLength({ min: 1, max: 12 }).matches(/^[A-Z0-9]+$/).withMessage('Asset code must be 1-12 uppercase alphanumeric characters'),
  body('totalSupply').isFloat({ min: 0.0000001 }).withMessage('Total supply must be a positive number'),
  body('description').optional().isString().withMessage('Description must be a string'),
  validate,
];

const distributeTokenValidation = [
  body('investorId').isInt({ min: 1 }).withMessage('Valid investor ID is required'),
  body('assetCode').trim().notEmpty().withMessage('Asset code is required'),
  body('amount').isFloat({ min: 0.0000001 }).withMessage('Amount must be a positive number'),
  validate,
];

/**
 * @swagger
 * /api/tokens/issue:
 *   post:
 *     summary: Emitir novo token
 *     description: Cria um novo security token no Stellar blockchain
 *     tags: [Tokens]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assetCode
 *               - totalSupply
 *             properties:
 *               assetCode:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 12
 *                 example: REIT01
 *               totalSupply:
 *                 type: number
 *                 example: 1000000
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Token emitido com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/issue', issueTokenValidation, issueToken);

/**
 * @swagger
 * /api/tokens:
 *   get:
 *     summary: Listar todos os tokens
 *     description: Retorna lista de todos os security tokens emitidos
 *     tags: [Tokens]
 *     responses:
 *       200:
 *         description: Lista de tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Token'
 */
router.get('/', getTokens);

/**
 * @swagger
 * /api/tokens/{assetCode}:
 *   get:
 *     summary: Buscar token por código
 *     description: Retorna detalhes de um token específico
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: assetCode
 *         required: true
 *         schema:
 *           type: string
 *         description: Código do ativo (ex. REIT01)
 *     responses:
 *       200:
 *         description: Detalhes do token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Token'
 *       404:
 *         description: Token não encontrado
 */
router.get('/:assetCode', getTokenByAssetCode);

/**
 * @swagger
 * /api/tokens/distribute:
 *   post:
 *     summary: Distribuir tokens
 *     description: Distribui tokens para um investidor
 *     tags: [Tokens]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - investorId
 *               - assetCode
 *               - amount
 *             properties:
 *               investorId:
 *                 type: integer
 *                 example: 1
 *               assetCode:
 *                 type: string
 *                 example: REIT01
 *               amount:
 *                 type: number
 *                 example: 1000
 *     responses:
 *       200:
 *         description: Tokens distribuídos com sucesso
 *       400:
 *         description: Dados inválidos
 */
router.post('/distribute', distributeTokenValidation, distributeTokens);

/**
 * @swagger
 * /api/tokens/{assetCode}/balance:
 *   get:
 *     summary: Consultar balanço do token
 *     description: Retorna o balanço total de um token específico
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: assetCode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Balanço do token
 */
router.get('/:assetCode/balance', getTokenBalance);

export default router;

