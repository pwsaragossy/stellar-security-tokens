import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { requireCompanyUser, requirePlatformAdmin } from '../middleware/authorize.js';
import { authenticateToken } from '../middleware/auth.js';
import { CompanyUserController } from '../controllers/companyUserController.js';

const router = express.Router();

// ============================================================================
// AUTHENTICATED COMPANY USER ROUTES
// ============================================================================

// List company users
router.get('/', requireCompanyUser, CompanyUserController.getCompanyUsers);

// Update company user
router.put('/:id', requireCompanyUser, CompanyUserController.updateCompanyUser);

// ============================================================================
// PASSKEY WALLET REGISTRATION ROUTES
// ============================================================================



/**
 * @swagger
 * /api/company-users/register-passkey:
 *   post:
 *     summary: Registrar usuário com passkey
 *     description: Fluxo de registro sem senha
 *     tags: [Company Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - company_id
 *               - email
 *               - name
 *             properties:
 *               company_id:
 *                 type: integer
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *     responses:
 *       201:
 *         description: Email de verificação enviado
 */
// Step 1: Register with email verification (no password required)
router.post('/register-passkey', [
  body('company_id').isInt({ min: 1 }).withMessage('Valid company ID is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('role').optional().isIn(['user', 'admin']).withMessage('Invalid role'),
  validate,
], CompanyUserController.registerWithPasskey);

/**
 * @swagger
 * /api/company-users/verify-email:
 *   post:
 *     summary: Verificar email
 *     tags: [Company Users]
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
 *         description: Email verificado
 */
// Step 2: Verify email
router.post('/verify-email', [
  body('token').notEmpty().withMessage('Verification token is required'),
  validate,
], CompanyUserController.verifyEmail);

/**
 * @swagger
 * /api/company-users/resend-verification:
 *   post:
 *     summary: Reenviar email de verificação
 *     tags: [Company Users]
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
], CompanyUserController.resendVerificationEmail);

/**
 * @swagger
 * /api/company-users/create-wallet:
 *   post:
 *     summary: Criar smart wallet
 *     tags: [Company Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - credentialId
 *               - publicKey
 *             properties:
 *               userId:
 *                 type: integer
 *               credentialId:
 *                 type: string
 *               publicKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Wallet criada
 */
// Step 3: Create smart wallet after passkey registration
// SECURITY: Requires auth + ownership verification to prevent wallet replacement attacks (CWE-306)
router.post('/create-wallet', authenticateToken, [
  body('userId').isInt({ min: 1 }).withMessage('Valid user ID is required'),
  body('credentialId').notEmpty().withMessage('Credential ID is required'),
  body('publicKey').notEmpty().withMessage('Public key is required'),
  validate,
], (req, res, next) => {
  // Ownership check: authenticated user must match the userId in the request
  if (req.user.userId !== req.body.userId) {
    return res.status(403).json({
      success: false,
      error: 'Cannot create wallet for a different user',
    });
  }
  next();
}, CompanyUserController.createSmartWallet);

/**
 * @swagger
 * /api/company-users/{userId}/wallet-status:
 *   get:
 *     summary: Status da wallet do usuário
 *     tags: [Company Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Status da wallet
 */
// Get wallet creation status
// SECURITY: Requires auth to prevent wallet enumeration (CWE-200)
router.get('/:userId/wallet-status', authenticateToken, CompanyUserController.getWalletStatus);

/**
 * @swagger
 * /api/company-users/passkey/config:
 *   get:
 *     summary: Configuração da passkey
 *     tags: [Company Users]
 *     responses:
 *       200:
 *         description: Configuração retornada
 */
// Get passkey kit configuration for frontend
// SECURITY: Requires auth to prevent config leakage
router.get('/passkey/config', authenticateToken, CompanyUserController.getPasskeyConfig);

// ============================================================================
// WITHDRAWAL ROUTES (Wallet Operations)
// ============================================================================

/**
 * @swagger
 * /api/company-users/{userId}/withdraw/propose:
 *   post:
 *     summary: Propose a withdrawal transaction
 *     tags: [Company Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *               - destination
 *               - amount
 *               - assetCode
 *             properties:
 *               destination:
 *                 type: string
 *               amount:
 *                 type: string
 *               assetCode:
 *                 type: string
 *                 enum: [USDC, XLM]
 *     responses:
 *       200:
 *         description: Transaction XDR ready for signing
 */
router.post('/:userId/withdraw/propose', requireCompanyUser, CompanyUserController.proposeWithdrawal);

/**
 * @swagger
 * /api/company-users/withdraw/submit:
 *   post:
 *     summary: Submit a signed withdrawal transaction
 *     tags: [Company Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
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
router.post('/withdraw/submit', requireCompanyUser, CompanyUserController.submitWithdrawal);

export default router;

