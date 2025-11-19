import express from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { requireCompanyUser, requirePlatformAdmin, requireOfferAccess } from '../middleware/authorize.js';
import { optionalAuth } from '../middleware/auth.js';
import { OfferController } from './controllers/offerController.js';

const router = express.Router();

const createOfferValidation = [
  body('asset_code').trim().isLength({ min: 1, max: 12 }).matches(/^[A-Z0-9]+$/).withMessage('Asset code must be uppercase alphanumeric, max 12 characters'),
  body('offer_name').trim().notEmpty().withMessage('Offer name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('total_supply').isNumeric().withMessage('Total supply must be a number'),
  body('annual_interest_rate').optional().isNumeric().withMessage('Annual interest rate must be a number'),
  body('offer_type').isIn(['collateral', 'sale']).withMessage('Offer type must be "collateral" or "sale"'),
  body('offer_rules').optional().isObject().withMessage('Offer rules must be an object'),
  body('legal_documents').optional().isObject().withMessage('Legal documents must be an object'),
  validate,
];

const reviewValidation = [
  body('status').isIn(['approved', 'rejected', 'under_review']).withMessage('Invalid status'),
  body('rejection_reason').optional().isString().withMessage('Rejection reason must be a string'),
  validate,
];

const dueDiligenceValidation = [
  body('notes').trim().notEmpty().withMessage('Notes are required'),
  validate,
];

// Rotas para company_users
router.post('/companies/offers', requireCompanyUser, createOfferValidation, OfferController.createOffer);
router.get('/companies/offers', requireCompanyUser, OfferController.getCompanyOffers);
router.get('/companies/offers/:id', requireCompanyUser, OfferController.getOfferDetails);
router.put('/companies/offers/:id', requireCompanyUser, OfferController.updateOffer);

// Rotas públicas (para investidores)
router.get('/offers/active', optionalAuth, OfferController.getActiveOffers);
router.get('/offers/:id', optionalAuth, OfferController.getPublicOfferDetails);

// Rotas para platform_admins
router.get('/admin/offers', requirePlatformAdmin, OfferController.getAllOffers);
router.put('/admin/offers/:id/review', requirePlatformAdmin, reviewValidation, OfferController.reviewOffer);
router.post('/admin/offers/:id/due-diligence', requirePlatformAdmin, dueDiligenceValidation, OfferController.addDueDiligenceNotes);
router.post('/admin/offers/:id/issue', requirePlatformAdmin, OfferController.issueTokenFromOffer);
router.post('/admin/offers/:id/activate', requirePlatformAdmin, OfferController.activateOffer);

export default router;

