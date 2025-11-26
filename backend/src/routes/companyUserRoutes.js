import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { requireCompanyUser, requirePlatformAdmin } from '../middleware/authorize.js';
import { CompanyUserController } from '../controllers/companyUserController.js';

const router = express.Router();

const registerValidation = [
  body('company_id').isInt({ min: 1 }).withMessage('Valid company ID is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('role').optional().isIn(['user', 'admin']).withMessage('Invalid role'),
  validate,
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

// Rotas públicas (com password)
router.post('/register', registerValidation, CompanyUserController.registerCompanyUser);
router.post('/login', loginValidation, CompanyUserController.loginCompanyUser);

// Rotas para company_users autenticados
router.get('/', requireCompanyUser, CompanyUserController.getCompanyUsers);
router.put('/:id', requireCompanyUser, CompanyUserController.updateCompanyUser);

// ============================================================================
// PASSKEY WALLET REGISTRATION ROUTES
// ============================================================================

// Step 1: Register with email verification (no password required)
router.post('/register-passkey', [
  body('company_id').isInt({ min: 1 }).withMessage('Valid company ID is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('role').optional().isIn(['user', 'admin']).withMessage('Invalid role'),
  validate,
], CompanyUserController.registerWithPasskey);

// Step 2: Verify email
router.post('/verify-email', [
  body('token').notEmpty().withMessage('Verification token is required'),
  validate,
], CompanyUserController.verifyEmail);

// Resend verification email
router.post('/resend-verification', [
  body('email').isEmail().withMessage('Valid email is required'),
  validate,
], CompanyUserController.resendVerificationEmail);

// Step 3: Create smart wallet after passkey registration
router.post('/create-wallet', [
  body('userId').isInt({ min: 1 }).withMessage('Valid user ID is required'),
  body('credentialId').notEmpty().withMessage('Credential ID is required'),
  body('publicKey').notEmpty().withMessage('Public key is required'),
  validate,
], CompanyUserController.createSmartWallet);

// Get wallet creation status
router.get('/:userId/wallet-status', CompanyUserController.getWalletStatus);

// Get passkey kit configuration for frontend
router.get('/passkey/config', CompanyUserController.getPasskeyConfig);

export default router;

