import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import {
  issueToken,
  getTokens,
  getTokenByAssetCode,
  distributeTokens,
  getTokenBalance,
} from './controllers/tokenController.js';

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

router.post('/issue', issueTokenValidation, issueToken);
router.get('/', getTokens);
router.get('/:assetCode', getTokenByAssetCode);
router.post('/distribute', distributeTokenValidation, distributeTokens);
router.get('/:assetCode/balance', getTokenBalance);

export default router;

