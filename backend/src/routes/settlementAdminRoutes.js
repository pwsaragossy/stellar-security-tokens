/**
 * @swagger
 * tags:
 *   name: Settlements
 *   description: MaturitySettlement v2 contract management (admin only)
 */
// follow-up — operator-facing pause / resume / 2-step admin rotation
// for deployed MaturitySettlement contracts. Mirrors /api/admin/contracts/*.
import { Router } from 'express';
import { requirePlatformAdmin } from '../middleware/authorize.js';
import { SettlementController } from '../controllers/settlementController.js';

const router = Router();

// All settlement-admin routes require platform admin; auto-audit via authorize.js.
router.use(requirePlatformAdmin);

/**
 * @swagger
 * /api/admin/settlements/{offerId}:
 *   get:
 *     summary: Aggregated on-chain settlement status
 *     description: Returns paused flag, admin, pending admin, balance, version.
 *       Single round-trip for the UI status panel.
 *     tags: [Settlements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: offerId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Status payload (deployed=false if contract not yet deployed)
 */
router.get('/:offerId', SettlementController.status);

/**
 * @swagger
 * /api/admin/settlements/{offerId}/pause:
 *   post:
 *     summary: Pause the settlement contract (blocks deposit/settle/withdraw/refund)
 *     tags: [Settlements]
 */
router.post('/:offerId/pause', SettlementController.pause);

/**
 * @swagger
 * /api/admin/settlements/{offerId}/resume:
 *   post:
 *     summary: Resume a paused settlement contract
 *     tags: [Settlements]
 */
router.post('/:offerId/resume', SettlementController.resume);

/**
 * @swagger
 * /api/admin/settlements/{offerId}/propose-admin:
 *   post:
 *     summary: Step 1 of admin rotation — current admin proposes a new admin
 *     description: The new admin must call accept-admin to take ownership.
 *     tags: [Settlements]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newAdmin]
 *             properties:
 *               newAdmin:
 *                 type: string
 *                 pattern: "^G[A-Z2-7]{55}$"
 *                 description: 56-char Stellar account address (G...)
 */
router.post('/:offerId/propose-admin', SettlementController.proposeAdmin);

/**
 * @swagger
 * /api/admin/settlements/{offerId}/accept-admin:
 *   post:
 *     summary: Step 2 of admin rotation — pending admin accepts ownership
 *     description: The proposed (pending) admin must sign. Source account is
 *       read from chain to ensure correct signer.
 *     tags: [Settlements]
 */
router.post('/:offerId/accept-admin', SettlementController.acceptAdmin);

/**
 * @swagger
 * /api/admin/settlements/{offerId}/mark-defaulted:
 *   post:
 *     summary: Formally declare a collateral offer as defaulted
 *     description: |
 *       Admin-driven default declaration. Requires:
 *       - offerType=collateral
 *       - maturityDate in the past + grace period elapsed (>10 days)
 *       - settlement contract deployed
 *       - typed confirmation matching assetCode
 *       - status not already 'defaulted' (idempotent if it is)
 *
 *       Sets status='defaulted' + paymentDueStatus='defaulted' atomically,
 *       unblocks collateral distribution (DefaultCases), and notifies
 *       distributed investors (in-app + email, best effort).
 *     tags: [Settlements]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [confirm_asset_code]
 *             properties:
 *               confirm_asset_code:
 *                 type: string
 *                 description: Must match offer.assetCode exactly (typed confirmation gate)
 *     responses:
 *       200:
 *         description: Defaulted (or already-defaulted idempotent response)
 *       400:
 *         description: Validation failed (grace period, missing settlement, mismatch, etc.)
 */
router.post('/:offerId/mark-defaulted', SettlementController.markDefaulted);

export default router;
