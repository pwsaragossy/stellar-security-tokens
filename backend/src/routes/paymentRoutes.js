import express from 'express';
import { body, query } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  processMonthlyPayments,
  processBulletPayments,
  processQuarterlyPayments,
  processSemiAnnualPayments,
  getPaymentHistory,
  getPaymentStatistics,
} from './controllers/paymentController.js';

const router = express.Router();

const processPaymentsValidation = [
  body('assetCode').optional().trim().isLength({ min: 1, max: 12 }).matches(/^[A-Z0-9]+$/).withMessage('Asset code must be 1-12 uppercase alphanumeric characters'),
  validate,
];

const getHistoryValidation = [
  query('assetCode').optional().trim().isLength({ min: 1, max: 12 }).withMessage('Asset code must be 1-12 characters'),
  query('investorId').optional().isInt({ min: 1 }).withMessage('Investor ID must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer'),
  validate,
];

const getStatisticsValidation = [
  query('assetCode').optional().trim().isLength({ min: 1, max: 12 }).withMessage('Asset code must be 1-12 characters'),
  query('startDate').optional().isISO8601().withMessage('Start date must be in ISO 8601 format'),
  query('endDate').optional().isISO8601().withMessage('End date must be in ISO 8601 format'),
  validate,
];

router.post('/process', processPaymentsValidation, authenticateToken, processMonthlyPayments);
router.post('/process/bullet', authenticateToken, processBulletPayments);
router.post('/process/quarterly', processPaymentsValidation, authenticateToken, processQuarterlyPayments);
router.post('/process/semi-annual', processPaymentsValidation, authenticateToken, processSemiAnnualPayments);
router.get('/history', getHistoryValidation, authenticateToken, getPaymentHistory);
router.get('/statistics', getStatisticsValidation, authenticateToken, getPaymentStatistics);

export default router;

