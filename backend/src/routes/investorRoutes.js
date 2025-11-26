import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  createInvestor,
  registerInvestor,
  whitelistInvestor,
  getInvestors,
  getInvestorById,
  getInvestorBalance,
  getInvestorPayments,
  updateInvestor,
  // Passkey Wallet Registration Flow
  registerInvestorWithPasskey,
  verifyEmail,
  resendVerificationEmail,
  createSmartWallet,
  getWalletStatus,
  getPasskeyConfig,
} from '../controllers/investorController.js';

const router = express.Router();

const investorValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('document').trim().notEmpty().withMessage('Document is required'),
  body('stellarPublicKey').optional().isString().withMessage('Stellar public key must be a string'),
  body('kycStatus').optional().isIn(['pending', 'approved', 'rejected']).withMessage('Invalid KYC status'),
  validate,
];

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('document').trim().notEmpty().withMessage('Document is required'),
  validate,
];

const whitelistValidation = [
  param('investorId').isInt({ min: 1 }).withMessage('Valid investor ID is required'),
  body('assetCode').optional().isString().isLength({ min: 1, max: 12 }).withMessage('Asset code must be 1-12 characters'),
  validate,
];

import { loginInvestor, getInvestorPortfolio, getInvestorMetrics } from '../controllers/investorController.js';
import { requireInvestor, requireOwnData } from '../middleware/authorize.js';

router.post('/', investorValidation, authenticateToken, createInvestor);
router.post('/register', registerValidation, registerInvestor);
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
], loginInvestor);
router.post('/whitelist/:investorId', whitelistValidation, authenticateToken, whitelistInvestor);
router.get('/', authenticateToken, getInvestors);
router.get('/:id', authenticateToken, getInvestorById);
router.get('/:id/portfolio', requireInvestor, requireOwnData, getInvestorPortfolio);
router.get('/:id/metrics', requireInvestor, requireOwnData, getInvestorMetrics);
router.get('/:investorId/balance', authenticateToken, getInvestorBalance);
router.get('/:investorId/payments', authenticateToken, getInvestorPayments);
router.put('/:id', investorValidation, authenticateToken, updateInvestor);

// ============================================================================
// PASSKEY WALLET REGISTRATION ROUTES
// ============================================================================

// Step 1: Register with email verification
router.post('/register-passkey', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('document').trim().notEmpty().withMessage('Document is required'),
  validate,
], registerInvestorWithPasskey);

// Step 2: Verify email
router.post('/verify-email', [
  body('token').notEmpty().withMessage('Verification token is required'),
  validate,
], verifyEmail);

// Resend verification email
router.post('/resend-verification', [
  body('email').isEmail().withMessage('Valid email is required'),
  validate,
], resendVerificationEmail);

// Step 3: Create smart wallet after passkey registration
router.post('/create-wallet', [
  body('investorId').isInt({ min: 1 }).withMessage('Valid investor ID is required'),
  body('credentialId').notEmpty().withMessage('Credential ID is required'),
  body('publicKey').notEmpty().withMessage('Public key is required'),
  validate,
], createSmartWallet);

// Get wallet creation status
router.get('/:investorId/wallet-status', getWalletStatus);

// Get passkey kit configuration for frontend
router.get('/passkey/config', getPasskeyConfig);

export default router;
