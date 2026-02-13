import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { requirePlatformAdmin } from '../middleware/authorize.js';
import { optionalAuth } from '../middleware/auth.js';
import {
  issueToken,
  getTokens,
  getTokenByAssetCode,

  freezeAccount,
  unfreezeAccount,
  clawbackTokens,
  disableClawback,
  listAssetHolders,
  syncTokens,
  deploySAC,
} from '../controllers/tokenController.js';

const router = express.Router();

const issueTokenValidation = [
  body('assetCode').trim().isLength({ min: 1, max: 12 }).matches(/^[A-Z0-9]+$/).withMessage('Asset code must be 1-12 uppercase alphanumeric characters'),
  body('totalSupply').isFloat({ min: 0.0000001 }).withMessage('Total supply must be a positive number'),
  body('description').optional().isString().withMessage('Description must be a string'),
  validate,
];



/**
 * @swagger
 * /api/tokens/issue:
 *   post:
 *     summary: Emitir novo token
 *     description: Cria um novo security token no Stellar blockchain
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
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
router.post('/issue', requirePlatformAdmin, issueTokenValidation, issueToken);

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
router.get('/', optionalAuth, getTokens);

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
 * /api/tokens/sync:
 *   post:
 *     summary: Sincronizar tokens com a carteira distribuidora
 *     description: Descobre tokens na rede Stellar que não estão no banco de dados
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resumo da sincronização
 */
router.post('/sync', requirePlatformAdmin, syncTokens);





/**
 * @swagger
 * /api/tokens/freeze:
 *   post:
 *     summary: Congelar conta de investidor
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - investorPublicKey
 *               - assetCode
 *             properties:
 *               investorPublicKey:
 *                 type: string
 *               assetCode:
 *                 type: string
 */
router.post('/freeze', requirePlatformAdmin, freezeAccount);

/**
 * @swagger
 * /api/tokens/unfreeze:
 *   post:
 *     summary: Descongelar conta de investidor
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 */
router.post('/unfreeze', requirePlatformAdmin, unfreezeAccount);

router.post('/clawback', requirePlatformAdmin, clawbackTokens);

/**
 * @swagger
 * /api/tokens/disable-clawback:
 *   post:
 *     summary: Desabilitar Clawback para uma trustline (Finalidade de Compliance)
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 */
router.post('/disable-clawback', requirePlatformAdmin, disableClawback);

/**
 * @swagger
 * /api/tokens/{assetCode}/holders:
 *   get:
 *     summary: Listar holders de um token
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:assetCode/holders', requirePlatformAdmin, listAssetHolders);

/**
 * @swagger
 * /api/tokens/deploy-sac:
 *   post:
 *     summary: Deploy SAC for an existing token
 *     description: Deploys the Stellar Asset Contract (Soroban) for a token that is missing its SAC. In multisig mode, creates a pending transaction for Freighter signing.
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assetCode
 *             properties:
 *               assetCode:
 *                 type: string
 *                 example: QWE
 */
router.post('/deploy-sac', requirePlatformAdmin, deploySAC);

export default router;

