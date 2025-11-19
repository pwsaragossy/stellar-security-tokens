import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { WebAuthnController } from './controllers/webauthnController.js';

const router = express.Router();

const startRegistrationValidation = [
  body('email').optional().isEmail().withMessage('Valid email is required if provided'),
  body('userId').optional().isInt({ min: 1 }).withMessage('Valid userId is required if provided'),
  param('userType').isIn(['investor', 'company_user', 'platform_admin']).withMessage('Invalid user type'),
  validate,
];

const completeRegistrationValidation = [
  body('credential').notEmpty().withMessage('Credential is required'),
  body('challenge').notEmpty().withMessage('Challenge is required'),
  body('deviceName').optional().isString().withMessage('Device name must be a string'),
  param('userType').isIn(['investor', 'company_user', 'platform_admin']).withMessage('Invalid user type'),
  validate,
];

const startAuthenticationValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  param('userType').isIn(['investor', 'company_user', 'platform_admin']).withMessage('Invalid user type'),
  validate,
];

const completeAuthenticationValidation = [
  body('credential').notEmpty().withMessage('Credential is required'),
  body('challenge').notEmpty().withMessage('Challenge is required'),
  param('userType').isIn(['investor', 'company_user', 'platform_admin']).withMessage('Invalid user type'),
  validate,
];

// Rotas de registro (criar passkey)
router.post(
  '/:userType/register/start',
  startRegistrationValidation,
  WebAuthnController.startRegistration
);

router.post(
  '/:userType/register/complete',
  completeRegistrationValidation,
  WebAuthnController.completeRegistration
);

// Rotas de autenticação (login com passkey)
router.post(
  '/:userType/login/start',
  startAuthenticationValidation,
  WebAuthnController.startAuthentication
);

router.post(
  '/:userType/login/complete',
  completeAuthenticationValidation,
  WebAuthnController.completeAuthentication
);

export default router;

