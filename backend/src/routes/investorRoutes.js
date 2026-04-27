import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  getInvestors,
  getInvestorById,
  getInvestorPayments,
  // Email-first registration flow (NEW)
  initiateRegistration,
  verifyEmailCode,
  resendVerificationCode,
  // Passkey Wallet Registration Flow
  registerInvestorWithPasskey,
  getPasskeyConfig,
  getInvestorPortfolio,

  getInvestorInvestments,
  getWalletStatus,
  proposeWithdrawal,
  submitWithdrawal,
  initiateDeposit,
  getInvestorDeposits,
} from '../controllers/investorController.js';
import { requireInvestor, requireOwnData, requirePlatformAdmin } from '../middleware/authorize.js';

const router = express.Router();

// ============================================================================
// EMAIL-FIRST REGISTRATION FLOW (NEW - for MVP)
// ============================================================================

/**
 * @swagger
 * /api/investors/initiate-registration:
 *   post:
 *     summary: Start registration - send verification code
 *     description: Step 1 of email-first flow. Sends 6-digit code to email.
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
 *         description: Verification code sent
 *       409:
 *         description: Email already registered
 */
router.post('/initiate-registration', [
  body('email').isEmail().withMessage('Valid email is required'),
  validate,
], initiateRegistration);

/**
 * @swagger
 * /api/investors/verify-email-code:
 *   post:
 *     summary: Verify email code
 *     description: Step 2 of email-first flow. Returns registration token.
 *     tags: [Investors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email verified, registration token returned
 *       400:
 *         description: Invalid or expired code
 */
router.post('/verify-email-code', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('6-digit code is required'),
  validate,
], verifyEmailCode);

/**
 * @swagger
 * /api/investors/resend-code:
 *   post:
 *     summary: Resend verification code
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
 *         description: New code sent
 */
router.post('/resend-code', [
  body('email').isEmail().withMessage('Valid email is required'),
  validate,
], resendVerificationCode);

// ============================================================================
// PASSKEY REGISTRATION FLOW (Step 3 - requires registrationToken)
// ============================================================================

/**
 * @swagger
 * /api/investors/register:
 *   post:
 *     summary: Complete investor registration with passkey
 *     description: Step 3 of email-first flow. Requires registrationToken from verify-email-code.
 *     tags: [Investors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - document
 *               - registrationToken
 *               - credentialId
 *               - contractId
 *             properties:
 *               name:
 *                 type: string
 *                 example: João Silva
 *               document:
 *                 type: string
 *                 description: CPF ou documento de identificação
 *               registrationToken:
 *                 type: string
 *                 description: JWT token from verify-email-code
 *               credentialId:
 *                 type: string
 *                 description: WebAuthn credential ID
 *               contractId:
 *                 type: string
 *                 description: Stellar smart wallet contract ID
 *     responses:
 *       201:
 *         description: Investor registered successfully
 *       400:
 *         description: Invalid data
 *       401:
 *         description: Invalid or expired registration token
 */
// Step 3: Complete registration with passkey (email verified via token)
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('document').trim().notEmpty().withMessage('Document is required'),
  body('registrationToken').notEmpty().withMessage('Registration token is required'),
  body('credentialId').notEmpty().withMessage('Credential ID is required'),
  body('contractId').notEmpty().withMessage('Contract ID is required'),
  validate,
], registerInvestorWithPasskey);



/**
 * @swagger
 * /api/investors/passkey/config:
 *   get:
 *     summary: Obter configuração da passkey
 *     description: Retorna configuração do smart-account-kit para o frontend
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
// SECURITY: Restricted to platform admins (F-03). Frontend uses /api/admin/investors instead.
router.get('/', requirePlatformAdmin, getInvestors);

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
 */
// SECURITY: Investor can only read their own profile (F-02 IDOR fix)
router.get('/:id', requireInvestor, requireOwnData, getInvestorById);

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
 * /api/investors/{id}/investments:
 *   get:
 *     summary: Get investor investments with optional status filter
 *     tags: [Investors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status (comma-separated, e.g. pending_payment,payment_received)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of investor investments
 */
router.get('/:id/investments', requireInvestor, requireOwnData, getInvestorInvestments);



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
router.get('/:investorId/payments', requireInvestor, requireOwnData, getInvestorPayments);

/**
 * @swagger
 * /api/investors/{investorId}/wallet-status:
 *   get:
 *     summary: Status da wallet do investidor
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
 *         description: Status da wallet
 */
router.get('/:investorId/wallet-status', requireInvestor, requireOwnData, getWalletStatus);

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
// SECURITY: requireOwnData replaces broken inline guard (F-01/F-04 — req.user.id vs req.user.userId)
router.post('/:investorId/withdraw/propose', requireInvestor, requireOwnData, proposeWithdrawal);

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

/**
 * @swagger
 * /api/investors/{id}/deposit/initiate:
 *   post:
 *     summary: Initiate a new USDC deposit relay
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
 *       201:
 *         description: Deposit relay initiated
 */
router.post('/:id/deposit/initiate', requireInvestor, requireOwnData, initiateDeposit);

/**
 * @swagger
 * /api/investors/{id}/deposits:
 *   get:
 *     summary: Get all deposit requests for an investor
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
 *         description: List of deposits
 */
router.get('/:id/deposits', requireInvestor, requireOwnData, getInvestorDeposits);

export default router;
