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

router.post('/', investorValidation, authenticateToken, createInvestor);
router.post('/register', registerValidation, registerInvestor);
router.post('/whitelist/:investorId', whitelistValidation, authenticateToken, whitelistInvestor);
router.get('/', authenticateToken, getInvestors);
router.get('/:id', authenticateToken, getInvestorById);
router.get('/:investorId/balance', authenticateToken, getInvestorBalance);
router.get('/:investorId/payments', authenticateToken, getInvestorPayments);
router.put('/:id', investorValidation, authenticateToken, updateInvestor);

export default router;
