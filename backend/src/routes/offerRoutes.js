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
 * /api/admin/offers/{id}/pause-toggle:
 *   put:
 *     summary: "[Admin] Emergency pause/resume an offer"
 *     description: Toggle an active offer to paused or a paused offer to active. Used by emergency controls.
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
 *                 enum: [paused, active]
 *     responses:
 *       200:
 *         description: Offer status toggled
 *       400:
 *         description: Invalid status transition
 */
router.put('/admin/offers/:id/pause-toggle', requirePlatformAdmin, async (req, res) => {
    const { status } = req.body;
    if (!status || !['paused', 'active'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Status must be "paused" or "active"' });
    }

    const { Offer } = await import('../models/Offer.js');
    const offer = await Offer.findById(parseInt(req.params.id));
    if (!offer) {
        return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    // Only allow toggle between active <-> paused
    if (status === 'paused' && offer.status !== 'active') {
        return res.status(400).json({ success: false, error: 'Can only pause active offers' });
    }
    if (status === 'active' && offer.status !== 'paused') {
        return res.status(400).json({ success: false, error: 'Can only resume paused offers' });
    }

    const updated = await Offer.updateStatus(parseInt(req.params.id), status, req.user?.userId);
    res.json({ success: true, data: updated });
});

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
 * /api/admin/offers/{id}/retry-soroban:
 *   post:
 *     summary: "[Admin] Retry failed Soroban deploy"
 *     description: Retries the Soroban contract deployment for a sale offer that previously failed
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
 *         description: Retry queued
 *       400:
 *         description: Only failed deployments can be retried
 */
router.post('/admin/offers/:id/retry-soroban', requirePlatformAdmin, OfferController.retrySorobanInit);

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

/**
 * @swagger
 * /api/admin/offers/{id}/reconcile-chain:
 *   post:
 *     summary: "[Admin] Reconcile on-chain state with DB"
 *     description: Reads on-chain token holder balances and compares with DB records. Useful for verifying state consistency after settlements, distributions, or any on-chain operation.
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
 *         description: Reconciliation results
 */
router.post('/admin/offers/:id/reconcile-chain', requirePlatformAdmin, async (req, res) => {
    const offerId = parseInt(req.params.id);
    const { default: prisma } = await import('../config/prisma.js');
    const { StellarService } = await import('../services/stellar.service.js');
    const offer = await prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });

    // Fetch on-chain token holders
    const holders = await StellarService.listAssetHolders(offer.asset_code);

    // Fetch DB investments
    const investments = await prisma.investment.findMany({
        where: { offerId, status: { in: ['active', 'completed'] } },
        include: { investor: true },
    });

    const discrepancies = [];
    for (const inv of investments) {
        const wallet = inv.investor?.stellarPublicKey || inv.investor?.sorobanContractId;
        const onChain = holders.find(h => h.publicKey === wallet);
        const dbTokens = parseFloat(inv.tokenAmount || '0');
        const chainTokens = onChain ? parseFloat(onChain.balance) : 0;

        if (Math.abs(dbTokens - chainTokens) > 0.0001) {
            discrepancies.push({
                investorId: inv.investorId,
                investorName: inv.investor?.name,
                wallet,
                dbTokens,
                chainTokens,
                diff: chainTokens - dbTokens,
            });
        }
    }

    res.json({
        success: true,
        message: discrepancies.length === 0
            ? 'On-chain state matches DB — all good'
            : `Found ${discrepancies.length} discrepancies`,
        data: {
            holdersOnChain: holders.length,
            investmentsInDb: investments.length,
            discrepancies,
        },
    });
});

// ═══════════════════════════════════════════════════════════════
// SETTLEMENT CONTRACT ENDPOINTS (MaturitySettlement Soroban)
// ═══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/admin/offers/{id}/deploy-settlement:
 *   post:
 *     summary: "[Admin] Deploy MaturitySettlement contract for a debt offer"
 *     description: Deploys and initializes the settlement contract. Only for collateral (debt) offers with a maturity date.
 *     tags: [Settlement]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               max_fee_bps:
 *                 type: integer
 *                 default: 500
 *                 description: Maximum platform fee in basis points (500 = 5%)
 *     responses:
 *       200:
 *         description: Contract deployed
 *       400:
 *         description: Not a debt offer or missing maturityDate
 */
router.post('/admin/offers/:id/deploy-settlement', requirePlatformAdmin, async (req, res) => {
    try {
        const { SorobanSettlementService } = await import('../services/sorobanSettlement.service.js');
        const offerId = parseInt(req.params.id);
        const result = await SorobanSettlementService.deployForOffer(offerId);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * @swagger
 * /api/admin/offers/{id}/init-settlement:
 *   post:
 *     summary: "[Admin] Initialize a deployed settlement contract"
 *     description: Build initialize TX. Must be called AFTER deploy TX is confirmed on-chain.
 *     tags: [Settlement]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               max_fee_bps:
 *                 type: integer
 *                 default: 500
 *                 description: Maximum platform fee in basis points (500 = 5%)
 *     responses:
 *       200:
 *         description: Initialize XDR ready for signing
 */
router.post('/admin/offers/:id/init-settlement', requirePlatformAdmin, async (req, res) => {
    try {
        const { SorobanSettlementService } = await import('../services/sorobanSettlement.service.js');
        const offerId = parseInt(req.params.id);
        const maxFeeBps = req.body.max_fee_bps || 500;
        const result = await SorobanSettlementService.buildInitializeXdr(offerId, maxFeeBps);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * @swagger
 * /api/admin/offers/{id}/settlement-deposit:
 *   post:
 *     summary: "[Admin] Build deposit TX for company USDC → settlement contract"
 *     description: Returns XDR for the company to sign, depositing USDC into the settlement contract.
 *     tags: [Settlement]
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
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: USDC amount to deposit
 *     responses:
 *       200:
 *         description: Deposit XDR ready for signing
 */
router.post('/admin/offers/:id/settlement-deposit', requirePlatformAdmin, async (req, res) => {
    try {
        const { SorobanSettlementService } = await import('../services/sorobanSettlement.service.js');
        const offerId = parseInt(req.params.id);
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'amount is required and must be positive' });
        }
        const result = await SorobanSettlementService.buildDepositXdr(offerId, amount);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * @swagger
 * /api/admin/offers/{id}/settle:
 *   post:
 *     summary: "[Admin] Execute maturity settlement (all investors, multi-batch)"
 *     description: Calculates payouts, splits into batches of 30, and returns XDRs for signing. Contract pays investors and burns ALL their tokens atomically.
 *     tags: [Settlement]
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
 *         description: Settlement batches prepared
 */
router.post('/admin/offers/:id/settle', requirePlatformAdmin, async (req, res) => {
    try {
        const { SorobanSettlementService } = await import('../services/sorobanSettlement.service.js');
        const offerId = parseInt(req.params.id);
        const result = await SorobanSettlementService.executeFullSettlement(offerId);
        res.json({ success: true, data: result });
    } catch (error) {
        const { SorobanSettlementService } = await import('../services/sorobanSettlement.service.js');
        const parsed = SorobanSettlementService.parseContractError(error);
        res.status(400).json({ success: false, error: parsed.message, code: parsed.code });
    }
});

/**
 * @swagger
 * /api/admin/offers/{id}/settlement-status:
 *   get:
 *     summary: "[Admin] Check settlement contract balance and status"
 *     tags: [Settlement]
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
 *         description: Settlement status
 */
router.get('/admin/offers/:id/settlement-status', requirePlatformAdmin, async (req, res) => {
    try {
        const { SorobanSettlementService } = await import('../services/sorobanSettlement.service.js');
        const { default: prisma } = await import('../config/prisma.js');
        const offerId = parseInt(req.params.id);

        const offer = await prisma.offer.findUnique({ where: { id: offerId } });
        if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });

        const contractBalance = offer.sorobanSettlementContractId
            ? await SorobanSettlementService.getContractBalance(offerId)
            : null;

        res.json({
            success: true,
            data: {
                offerId,
                offerType: offer.offerType,
                offerStatus: offer.status,
                settlementContractId: offer.sorobanSettlementContractId || null,
                contractBalance,
                maturityDate: offer.maturityDate,
                hasSettlementContract: !!offer.sorobanSettlementContractId,
            },
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

export default router;


