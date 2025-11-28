import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  // REMOVED: createInvestor, registerInvestor (traditional flow deprecated)
  whitelistInvestor,
  getInvestors,
  getInvestorById,
  getInvestorBalance,
  getInvestorPayments,
  updateInvestor,
  // Passkey Wallet Registration Flow (now primary)
  registerInvestorWithPasskey,
  verifyEmail,
  resendVerificationEmail,
  createSmartWallet,
  getWalletStatus,
  getPasskeyConfig,
  loginInvestor,
  getInvestorPortfolio,
  getInvestorMetrics,
} from '../controllers/investorController.js';
import { requireInvestor, requireOwnData } from '../middleware/authorize.js';

const router = express.Router();

const whitelistValidation = [
  param('investorId').isInt({ min: 1 }).withMessage('Valid investor ID is required'),
  body('assetCode').optional().isString().isLength({ min: 1, max: 12 }).withMessage('Asset code must be 1-12 characters'),
  validate,
];

// ============================================================================
// PASSKEY-ONLY REGISTRATION FLOW
// ============================================================================

// Step 1: Register with email (no password needed)
router.post('/register', [
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

// Step 3: Create smart wallet after passkey registration on frontend
router.post('/create-wallet', [
  body('investorId').isInt({ min: 1 }).withMessage('Valid investor ID is required'),
  body('credentialId').notEmpty().withMessage('Credential ID is required'),
  body('publicKey').notEmpty().withMessage('Public key is required'),
  validate,
], createSmartWallet);

// Get passkey kit configuration for frontend
router.get('/passkey/config', getPasskeyConfig);

// ============================================================================
// AUTHENTICATION & DATA ACCESS
// ============================================================================

// Login (passkey-based, handled by frontend WebAuthn)
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  // Note: Password removed - passkey authentication handled client-side
  validate,
], loginInvestor);

// ============================================================================
// INVESTOR MANAGEMENT (requires authentication)
// ============================================================================

router.post('/whitelist/:investorId', whitelistValidation, authenticateToken, whitelistInvestor);
router.get('/', authenticateToken, getInvestors);
router.get('/:id', authenticateToken, getInvestorById);
router.get('/:id/portfolio', requireInvestor, requireOwnData, getInvestorPortfolio);
router.get('/:id/metrics', requireInvestor, requireOwnData, getInvestorMetrics);
router.get('/:investorId/balance', authenticateToken, getInvestorBalance);
router.get('/:investorId/payments', authenticateToken, getInvestorPayments);
router.get('/:investorId/wallet-status', getWalletStatus);
router.put('/:id', authenticateToken, updateInvestor);

export default router;
