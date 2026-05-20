import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { requireCompanyUser, requirePlatformAdmin } from '../middleware/authorize.js';
import { CompanyController } from '../controllers/companyController.js';

const router = express.Router();

// ============================================================================
// EMAIL-FIRST REGISTRATION FLOW (Step 1-2-3)
// ============================================================================

/**
 * @swagger
 * /api/companies/initiate-registration:
 *   post:
 *     summary: Start company registration - send verification code
 *     description: Step 1 of email-first flow. Sends 6-digit code to email.
 *     tags: [Companies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification code sent
 *       409:
 *         description: Email already registered
 */
router.post('/initiate-registration', [
  body('email').isEmail().withMessage('Valid email is required'),
  validate,
], CompanyController.initiateCompanyRegistration);

/**
 * @swagger
 * /api/companies/verify-email-code:
 *   post:
 *     summary: Verify email code
 *     description: Step 2 of email-first flow. Returns registration token.
 *     tags: [Companies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *     responses:
 *       200:
 *         description: Email verified, registration token returned
 *       400:
 *         description: Invalid code
 */
router.post('/verify-email-code', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('6-digit code is required'),
  validate,
], CompanyController.verifyCompanyEmailCode);

/**
 * @swagger
 * /api/companies/resend-code:
 *   post:
 *     summary: Resend verification code
 *     tags: [Companies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: New code sent
 */
router.post('/resend-code', [
  body('email').isEmail().withMessage('Valid email is required'),
  validate,
], CompanyController.resendCompanyCode);

// ============================================================================
// REGISTRATION COMPLETION (Step 3 - requires registrationToken)
// ============================================================================

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('legal_representative').optional().isString(), // Now optional
  body('registrationToken').optional().isString(), // Email comes from token
  body('address').optional().isString(),
  body('phone').optional().isString(),
  validate,
];

/**
 * @swagger
 * /api/companies/register:
 *   post:
 *     summary: Complete company registration with passkey
 *     description: Step 3 of email-first flow. Requires registrationToken from verify-email-code.
 *     tags: [Companies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - legal_representative
 *               - registrationToken
 *             properties:
 *               name:
 *                 type: string
 *                 example: Empresa ABC Ltda
 *               registrationToken:
 *                 type: string
 *                 description: JWT token from verify-email-code endpoint
 *               legal_representative:
 *                 type: string
 *               country:
 *                 type: string
 *                 enum: [USA, BRASIL]
 *               tax_id:
 *                 type: string
 *               tax_id_type:
 *                 type: string
 *                 enum: [CNPJ, EIN]
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               credentialId:
 *                 type: string
 *               publicKey:
 *                 type: string
 *               contractId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Company registered successfully
 *       400:
 *         description: Invalid data
 *       401:
 *         description: Invalid or expired registration token
 */
// Rotas públicas
router.post('/register', registerValidation, CompanyController.registerCompany);

/**
 * @swagger
 * /api/companies/profile:
 *   get:
 *     summary: Obter perfil da empresa
 *     description: Retorna dados da empresa do usuário autenticado
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil da empresa
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Company'
 *       401:
 *         description: Não autorizado
 *   put:
 *     summary: Atualizar perfil da empresa
 *     description: Atualiza dados da empresa do usuário autenticado
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Perfil atualizado
 *       401:
 *         description: Não autorizado
 */
// Rotas para company_users
router.get('/profile', requireCompanyUser, CompanyController.getCompanyProfile);
router.put('/profile', requireCompanyUser, CompanyController.updateCompanyProfile);

/**
 * @swagger
 * /api/companies/admin/{id}:
 *   get:
 *     summary: "[Admin] Detalhes de uma empresa"
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalhes da empresa
 *       404:
 *         description: Empresa não encontrada
 */
router.get('/admin/:id', requirePlatformAdmin, CompanyController.getCompanyDetails);

/**
 * @swagger
 * /api/companies/offers:
 *   get:
 *     summary: Listar ofertas da empresa
 *     description: Retorna todas as ofertas criadas pela empresa
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de ofertas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Offer'
 */
router.get('/offers', requireCompanyUser, CompanyController.getCompanyOffers);

/**
 * @swagger
 * /api/companies/admin/companies:
 *   get:
 *     summary: "[Admin] Listar todas as empresas"
 *     description: Lista todas as empresas cadastradas (apenas admin)
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de empresas
 *       401:
 *         description: Não autorizado
 *       403:
 *         description: Acesso negado
 */
// Rotas para platform_admins
router.get('/admin/companies', requirePlatformAdmin, CompanyController.getAllCompanies);

/**
 * @swagger
 * /api/companies/admin/companies/{id}/status:
 *   put:
 *     summary: "[Admin] Atualizar status da empresa"
 *     description: Aprova ou rejeita uma empresa
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *     responses:
 *       200:
 *         description: Status atualizado
 *       404:
 *         description: Empresa não encontrada
 */
router.put('/admin/companies/:id/status', requirePlatformAdmin, CompanyController.updateCompanyStatus);

// ============================================================================
// COMPANY WALLET ROUTES
// ============================================================================

/**
 * @swagger
 * /api/companies/{companyId}/wallet-status:
 *   get:
 *     summary: Get company wallet status and balances
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Wallet status and balances
 */
router.get('/:companyId/wallet-status', requireCompanyUser, CompanyController.getWalletStatus);

/**
 * @swagger
 * /api/companies/{companyId}/withdraw/propose:
 *   post:
 *     summary: Propose a withdrawal transaction
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - destination
 *               - amount
 *               - assetCode
 *             properties:
 *               destination:
 *                 type: string
 *               amount:
 *                 type: string
 *               assetCode:
 *                 type: string
 *                 enum: [USDC, XLM]
 *     responses:
 *       200:
 *         description: Transaction XDR ready for signing
 */
router.post('/:companyId/withdraw/propose', requireCompanyUser, CompanyController.proposeWithdrawal);

/**
 * @swagger
 * /api/companies/withdraw/submit:
 *   post:
 *     summary: Submit a signed withdrawal transaction
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signedXdr
 *             properties:
 *               signedXdr:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transaction submitted successfully
 */
router.post('/withdraw/submit', requireCompanyUser, CompanyController.submitWithdrawal);

export default router;

