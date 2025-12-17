import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  getInvestors,
  getInvestorById,
  getInvestorBalance,
  getInvestorPayments,
  updateInvestor,
  // Passkey Wallet Registration Flow (now primary)
  registerInvestorWithPasskey,
  verifyEmail,
  resendVerificationEmail,
  getPasskeyConfig,
  getInvestorPortfolio,
  getInvestorMetrics,
  getWalletStatus,
  proposeWithdrawal,
  submitWithdrawal,
} from '../controllers/investorController.js';
import { requireInvestor, requireOwnData } from '../middleware/authorize.js';

const router = express.Router();



// ============================================================================
// PASSKEY-ONLY REGISTRATION FLOW
// ============================================================================

/**
 * @swagger
 * /api/investors/register:
 *   post:
 *     summary: Registrar novo investidor
 *     description: Primeiro passo do fluxo de registro - cria conta com email
 *     tags: [Investors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - document
 *             properties:
 *               name:
 *                 type: string
 *                 example: João Silva
 *               email:
 *                 type: string
 *                 format: email
 *               document:
 *                 type: string
 *                 description: CPF ou documento de identificação
 *     responses:
 *       201:
 *         description: Investidor registrado, email de verificação enviado
 *       400:
 *         description: Dados inválidos ou email já cadastrado
 */
// Step 1: Register with email (no password needed)
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('document').trim().notEmpty().withMessage('Document is required'),
  validate,
], registerInvestorWithPasskey);

/**
 * @swagger
 * /api/investors/verify-email:
 *   post:
 *     summary: Verificar email
 *     description: Confirma email com token recebido por email
 *     tags: [Investors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verificado com sucesso
 *       400:
 *         description: Token inválido ou expirado
 */
// Step 2: Verify email
router.post('/verify-email', [
  body('token').notEmpty().withMessage('Verification token is required'),
  validate,
], verifyEmail);

/**
 * @swagger
 * /api/investors/resend-verification:
 *   post:
 *     summary: Reenviar email de verificação
 *     tags: [Investors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Email reenviado
 */
// Resend verification email
router.post('/resend-verification', [
  body('email').isEmail().withMessage('Valid email is required'),
  validate,
], resendVerificationEmail);



/**
 * @swagger
 * /api/investors/passkey/config:
 *   get:
 *     summary: Obter configuração da passkey
 *     description: Retorna configuração do passkey-kit para o frontend
 *     tags: [Investors]
 *     responses:
 *       200:
 *         description: Configuração retornada
 */
// Get passkey kit configuration for frontend
router.get('/passkey/config', getPasskeyConfig);

// ============================================================================
// AUTHENTICATION & DATA ACCESS
// ============================================================================



// ============================================================================
// INVESTOR MANAGEMENT (requires authentication)
// ============================================================================



/**
 * @swagger
 * /api/investors:
 *   get:
 *     summary: Listar investidores
 *     tags: [Investors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de investidores
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
 *                     $ref: '#/components/schemas/Investor'
 */
router.get('/', authenticateToken, getInvestors);

/**
 * @swagger
 * /api/investors/{id}:
 *   get:
 *     summary: Buscar investidor por ID
 *     tags: [Investors]
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
 *         description: Dados do investidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Investor'
 *       404:
 *         description: Investidor não encontrado
 *   put:
 *     summary: Atualizar investidor
 *     tags: [Investors]
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
 *         description: Investidor atualizado
 */
router.get('/:id', authenticateToken, getInvestorById);

/**
 * @swagger
 * /api/investors/{id}/portfolio:
 *   get:
 *     summary: Obter portfólio do investidor
 *     tags: [Investors]
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
 *         description: Portfólio do investidor
 */
router.get('/:id/portfolio', requireInvestor, requireOwnData, getInvestorPortfolio);

/**
 * @swagger
 * /api/investors/{id}/metrics:
 *   get:
 *     summary: Obter métricas do investidor
 *     tags: [Investors]
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
 *         description: Métricas do investidor
 */
router.get('/:id/metrics', requireInvestor, requireOwnData, getInvestorMetrics);

/**
 * @swagger
 * /api/investors/{investorId}/balance:
 *   get:
 *     summary: Obter saldo do investidor
 *     tags: [Investors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investorId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Saldo do investidor
 */
router.get('/:investorId/balance', authenticateToken, getInvestorBalance);

/**
 * @swagger
 * /api/investors/{investorId}/payments:
 *   get:
 *     summary: Listar pagamentos do investidor
 *     tags: [Investors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investorId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Histórico de pagamentos
 */
router.get('/:investorId/payments', authenticateToken, getInvestorPayments);

/**
 * @swagger
 * /api/investors/{investorId}/wallet-status:
 *   get:
 *     summary: Status da wallet do investidor
 *     tags: [Investors]
 *     parameters:
 *       - in: path
 *         name: investorId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Status da wallet
 */
router.get('/:investorId/wallet-status', getWalletStatus);
router.put('/:id', authenticateToken, updateInvestor);

/**
 * @swagger
 * /api/investors/{investorId}/withdraw/propose:
 *   post:
 *     summary: Propose a withdrawal transaction
 *     description: Builds a withdrawal transaction for signing
 *     tags: [Investors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investorId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - assetCode
 *               - destination
 *             properties:
 *               amount:
 *                 type: string
 *               assetCode:
 *                 type: string
 *                 enum: [USDC, XLM]
 *               destination:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transaction built successfully
 */
router.post('/:investorId/withdraw/propose', authenticateToken, proposeWithdrawal);

/**
 * @swagger
 * /api/investors/withdraw/submit:
 *   post:
 *     summary: Submit a signed withdrawal transaction
 *     tags: [Investors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signedXdr
 *             properties:
 *               signedXdr:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transaction submitted successfully
 */
router.post('/withdraw/submit', authenticateToken, submitWithdrawal);

export default router;
