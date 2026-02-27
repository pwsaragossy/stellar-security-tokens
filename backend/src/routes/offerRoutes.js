import express from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { requireCompanyUser, requirePlatformAdmin, requireOfferAccess, requireRole } from '../middleware/authorize.js';
import { optionalAuth } from '../middleware/auth.js';
import { OfferController } from '../controllers/offerController.js';

const router = express.Router();

const createOfferValidation = [
  body('asset_code').trim().isLength({ min: 1, max: 12 }).matches(/^[A-Z0-9]+$/).withMessage('Asset code must be uppercase alphanumeric, max 12 characters'),
  body('offer_name').trim().notEmpty().withMessage('Offer name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('total_supply').isNumeric().withMessage('Total supply must be a number'),
  body('annual_interest_rate').optional().isNumeric().withMessage('Annual interest rate must be a number'),
  body('offer_type').isIn(['collateral', 'sale']).withMessage('Offer type must be "collateral" or "sale"'),
  // Allow object or JSON string (multipart/form-data sends objects as strings)
  body('offer_rules').optional().custom((value) => {
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try { JSON.parse(value); return true; } catch { return false; }
    }
    return false;
  }).withMessage('Offer rules must be an object or valid JSON string'),
  body('legal_documents').optional().custom((value) => {
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try { JSON.parse(value); return true; } catch { return false; }
    }
    return false;
  }).withMessage('Legal documents must be an object or valid JSON string'),
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

import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

/**
 * @swagger
 * /api/companies/offers:
 *   post:
 *     summary: Criar nova oferta
 *     description: Cria uma nova oferta de security token (requer autenticação de empresa)
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - asset_code
 *               - offer_name
 *               - description
 *               - total_supply
 *               - offer_type
 *             properties:
 *               asset_code:
 *                 type: string
 *                 example: REIT01
 *               offer_name:
 *                 type: string
 *                 example: Oferta Imobiliária ABC
 *               description:
 *                 type: string
 *               total_supply:
 *                 type: number
 *               annual_interest_rate:
 *                 type: number
 *               offer_type:
 *                 type: string
 *                 enum: [collateral, sale]
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Oferta criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Offer'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado
 */
// Rotas para company_users
router.post('/companies/offers',
  requireCompanyUser,
  upload.any(), // Allow any files, controller will handle processing
  createOfferValidation,
  OfferController.createOffer
);

/**
 * @swagger
 * /api/companies/offers:
 *   get:
 *     summary: Listar ofertas da empresa
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de ofertas da empresa
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
router.get('/companies/offers', requireCompanyUser, OfferController.getCompanyOffers);

/**
 * @swagger
 * /api/companies/offers/{id}:
 *   get:
 *     summary: Detalhes da oferta (empresa)
 *     tags: [Offers]
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
 *         description: Detalhes da oferta
 *   put:
 *     summary: Atualizar oferta
 *     description: Atualiza oferta existente via Multipart Form Data (permite envio de novos arquivos)
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               offer_name:
 *                 type: string
 *               description:
 *                 type: string
 *               total_supply:
 *                 type: number
 *               annual_interest_rate:
 *                 type: number
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Oferta atualizada
 */
router.get('/companies/offers/:id', requireCompanyUser, OfferController.getOfferDetails);
router.put('/companies/offers/:id', requireCompanyUser, upload.any(), OfferController.updateOffer);
router.post('/companies/offers/:id/activate', requireCompanyUser, OfferController.activateCompanyOffer);

/**
 * @swagger
 * /api/companies/offers/{id}/investors:
 *   get:
 *     summary: Lista investidores da oferta (Cap Table)
 *     description: Retorna a lista de investidores que compraram tokens desta oferta
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
 *         description: Lista de investidores
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
 *                     type: object
 *                     properties:
 *                       investorId:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       totalTokens:
 *                         type: number
 *                       totalInvested:
 *                         type: number
 *       403:
 *         description: Acesso negado
 */
router.get('/companies/offers/:id/investors', requireRole(['company_user', 'platform_admin']), OfferController.getOfferInvestors);

/**
 * @swagger
 * /api/offers/active:
 *   get:
 *     summary: Listar ofertas ativas (público)
 *     description: Retorna ofertas ativas disponíveis para investimento
 *     tags: [Offers]
 *     responses:
 *       200:
 *         description: Lista de ofertas ativas
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
// Rotas públicas (para investidores)
router.get('/offers/active', optionalAuth, OfferController.getActiveOffers);


/**
 * @swagger
 * /api/offers/{id}:
 *   get:
 *     summary: Detalhes da oferta (público)
 *     tags: [Offers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalhes públicos da oferta
 *       404:
 *         description: Oferta não encontrada
 */
router.get('/offers/:id', optionalAuth, OfferController.getPublicOfferDetails);

/**
 * @swagger
 * /api/admin/offers:
 *   get:
 *     summary: "[Admin] Listar todas as ofertas"
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de todas as ofertas
 */
// Rotas para platform_admins
router.get('/admin/offers', requirePlatformAdmin, OfferController.getAllOffers);

/**
 * @swagger
 * /api/admin/offers/{id}/review:
 *   put:
 *     summary: "[Admin] Revisar oferta"
 *     description: Aprovar, rejeitar ou colocar em revisão
 *     tags: [Offers]
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
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected, under_review]
 *               rejection_reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status da oferta atualizado
 */
router.put('/admin/offers/:id/review', requirePlatformAdmin, reviewValidation, OfferController.reviewOffer);

/**
 * @swagger
 * /api/admin/offers/{id}/due-diligence:
 *   post:
 *     summary: "[Admin] Adicionar notas de due diligence"
 *     tags: [Offers]
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
 *             required:
 *               - notes
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Notas adicionadas
 */
router.post('/admin/offers/:id/due-diligence', requirePlatformAdmin, dueDiligenceValidation, OfferController.addDueDiligenceNotes);

/**
 * @swagger
 * /api/admin/offers/{id}/issue:
 *   post:
 *     summary: "[Admin] Emitir token da oferta"
 *     description: Cria o token no Stellar blockchain
 *     tags: [Offers]
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
 *         description: Token emitido
 */
router.post('/admin/offers/:id/issue', requirePlatformAdmin, OfferController.issueTokenFromOffer);

/**
 * @swagger
 * /api/admin/offers/{id}/activate:
 *   post:
 *     summary: "[Admin] Ativar oferta"
 *     description: Torna a oferta disponível para investidores
 *     tags: [Offers]
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
 *         description: Oferta ativada
 */
router.post('/admin/offers/:id/activate', requirePlatformAdmin, OfferController.activateOffer);

/**
 * @swagger
 * /api/admin/offers/{id}/verify:
 *   post:
 *     summary: "[Admin] Verificar emissão e habilitar launch"
 *     description: Marca a emissão como verificada, permitindo que a empresa lance a oferta
 *     tags: [Offers]
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
 *         description: Oferta verificada
 */
router.post('/admin/offers/:id/verify', requirePlatformAdmin, OfferController.verifyOfferIssuance);

export default router;

