/**
 * @swagger
 * tags:
 *   name: Distributor
 *   description: YieldDistributor v3 contract management (admin only, singleton)
 *
 * F-004 audit follow-up — operator pause / resume / 2-step admin rotation
 * for the platform's singleton YieldDistributor contract.
 */
import { Router } from 'express';
import { requirePlatformAdmin } from '../middleware/authorize.js';
import { DistributorController } from '../controllers/distributorController.js';

const router = Router();

// All routes require platform admin; auto-audit via authorize.js.
router.use(requirePlatformAdmin);

/**
 * @swagger
 * /api/admin/distributor:
 *   get:
 *     summary: Aggregated on-chain status of the singleton YieldDistributor
 *     tags: [Distributor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: { deployed, contractId, paused, admin, pendingAdmin, version, v3Ready }
 */
router.get('/', DistributorController.status);

/**
 * @swagger
 * /api/admin/distributor/pause:
 *   post:
 *     summary: Pause the YieldDistributor (blocks distribute calls)
 *     tags: [Distributor]
 */
router.post('/pause', DistributorController.pause);

/**
 * @swagger
 * /api/admin/distributor/resume:
 *   post:
 *     summary: Resume a paused YieldDistributor
 *     tags: [Distributor]
 */
router.post('/resume', DistributorController.resume);

/**
 * @swagger
 * /api/admin/distributor/propose-admin:
 *   post:
 *     summary: Step 1 of admin rotation — propose a new admin
 *     tags: [Distributor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newAdmin]
 *             properties:
 *               newAdmin: { type: string, pattern: "^G[A-Z2-7]{55}$" }
 */
router.post('/propose-admin', DistributorController.proposeAdmin);

/**
 * @swagger
 * /api/admin/distributor/accept-admin:
 *   post:
 *     summary: Step 2 of admin rotation — pending admin accepts ownership
 *     tags: [Distributor]
 */
router.post('/accept-admin', DistributorController.acceptAdmin);

export default router;
