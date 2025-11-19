import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { requireCompanyUser, requirePlatformAdmin } from '../middleware/authorize.js';
import { CompanyUserController } from './controllers/companyUserController.js';

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

// Rotas públicas
router.post('/register', registerValidation, CompanyUserController.registerCompanyUser);
router.post('/login', loginValidation, CompanyUserController.loginCompanyUser);

// Rotas para company_users
router.get('/', requireCompanyUser, CompanyUserController.getCompanyUsers);
router.put('/:id', requireCompanyUser, CompanyUserController.updateCompanyUser);

export default router;

