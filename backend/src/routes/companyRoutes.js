import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { requireCompanyUser, requirePlatformAdmin } from '../middleware/authorize.js';
import { CompanyController } from './controllers/companyController.js';

const router = express.Router();

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('cnpj').trim().notEmpty().withMessage('CNPJ is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('legal_representative').trim().notEmpty().withMessage('Legal representative is required'),
  body('address').optional().isString(),
  body('phone').optional().isString(),
  validate,
];

// Rotas públicas
router.post('/register', registerValidation, CompanyController.registerCompany);

// Rota de debug para aprovar empresa sem autenticação (apenas em desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
  router.put('/debug/:id/approve', CompanyController.debugApproveCompany);
}

// Rotas para company_users
router.get('/profile', requireCompanyUser, CompanyController.getCompanyProfile);
router.put('/profile', requireCompanyUser, CompanyController.updateCompanyProfile);
router.get('/offers', requireCompanyUser, CompanyController.getCompanyOffers);

// Rotas para platform_admins
router.get('/admin/companies', requirePlatformAdmin, CompanyController.getAllCompanies);
router.put('/admin/companies/:id/status', requirePlatformAdmin, CompanyController.updateCompanyStatus);

export default router;

