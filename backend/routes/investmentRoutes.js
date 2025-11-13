import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticateToken } from '../middleware/auth.js';
import { purchaseInvestment } from '../controllers/investmentController.js';

const router = express.Router();

const purchaseValidation = [
  body('investorId').isInt({ min: 1 }).withMessage('Valid investor ID is required'),
  body('usdcAmount').isFloat({ min: 0.0000001 }).withMessage('USDC amount must be a positive number'),
  body('assetCode').optional().isString().isLength({ min: 1, max: 12 }).withMessage('Asset code must be 1-12 characters'),
  validate,
];

router.post('/purchase', purchaseValidation, authenticateToken, purchaseInvestment);

export default router;

