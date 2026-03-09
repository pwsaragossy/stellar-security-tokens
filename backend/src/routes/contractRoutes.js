/**
 * @swagger
 * tags:
 *   name: Contracts
 *   description: Soroban sale contract management (admin only)
 */
import { Router } from 'express';
import { requirePlatformAdmin } from '../middleware/authorize.js';
import { ContractController } from '../controllers/contractController.js';

const router = Router();

// All routes require platform admin authentication
router.use(requirePlatformAdmin);

/**
 * @swagger
 * /api/admin/contracts:
 *   get:
 *     summary: List all offers with deployed Soroban contracts
 *     tags: [Contracts]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of contracts
 */
router.get('/', ContractController.list);

/**
 * @swagger
 * /api/admin/contracts/batch/ttl:
 *   post:
 *     summary: Batch extend TTL for multiple contracts
 *     tags: [Contracts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [offerIds]
 *             properties:
 *               offerIds: { type: array, items: { type: integer } }
 */
router.post('/batch/ttl', ContractController.batchExtendTtl);

/**
 * @swagger
 * /api/admin/contracts/{offerId}:
 *   get:
 *     summary: Get contract detail with on-chain state
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: offerId
 *         required: true
 *         schema: { type: integer }
 */
router.get('/:offerId', ContractController.detail);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/pause:
 *   post:
 *     summary: Pause the sale contract (set_active=false)
 *     tags: [Contracts]
 */
router.post('/:offerId/pause', ContractController.pause);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/resume:
 *   post:
 *     summary: Resume the sale contract (set_active=true)
 *     tags: [Contracts]
 */
router.post('/:offerId/resume', ContractController.resume);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/deposit:
 *   post:
 *     summary: Deposit sell tokens to contract (2-TX chain - authorize + transfer)
 *     tags: [Contracts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: number, description: "Amount in human units (e.g. 100.50)" }
 */
router.post('/:offerId/deposit', ContractController.deposit);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/price:
 *   post:
 *     summary: Update sell/buy prices
 *     tags: [Contracts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sellPrice, buyPrice]
 *             properties:
 *               sellPrice: { type: integer, minimum: 1 }
 *               buyPrice: { type: integer, minimum: 1 }
 */
router.post('/:offerId/price', ContractController.updatePrice);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/ttl:
 *   post:
 *     summary: Extend contract TTL (ops pays fee, no Freighter needed)
 *     tags: [Contracts]
 */
router.post('/:offerId/ttl', ContractController.extendTtl);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/retry:
 *   post:
 *     summary: Retry failed Soroban deploy/create
 *     tags: [Contracts]
 */
router.post('/:offerId/retry', ContractController.retry);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/withdraw:
 *   post:
 *     summary: Withdraw tokens from the contract (sent to admin/issuer account)
 *     tags: [Contracts]
 */
router.post('/:offerId/withdraw', ContractController.withdraw);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/freeze:
 *   post:
 *     summary: Freeze/unfreeze a buyer on the contract
 *     tags: [Contracts]
 */
router.post('/:offerId/freeze', ContractController.freeze);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/drain:
 *   post:
 *     summary: EMERGENCY DRAIN — atomic pause + withdraw ALL (requires X-Confirm header)
 *     tags: [Contracts]
 *     parameters:
 *       - in: header
 *         name: X-Confirm
 *         required: true
 *         schema: { type: string, enum: ['true'] }
 */
router.post('/:offerId/drain', ContractController.drain);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/propose-admin:
 *   post:
 *     summary: Propose admin transfer to a new address
 *     tags: [Contracts]
 */
router.post('/:offerId/propose-admin', ContractController.proposeAdmin);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/accept-admin:
 *   post:
 *     summary: Accept admin role (called by the proposed new admin)
 *     tags: [Contracts]
 */
router.post('/:offerId/accept-admin', ContractController.acceptAdmin);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/upgrade:
 *   post:
 *     summary: Upgrade contract WASM (requires X-Confirm header)
 *     tags: [Contracts]
 *     parameters:
 *       - in: header
 *         name: X-Confirm
 *         required: true
 *         schema: { type: string, enum: ['true'] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [wasmHash]
 *             properties:
 *               wasmHash: { type: string, pattern: "^[0-9a-f]{64}$", description: "64-char hex WASM hash" }
 */
router.post('/:offerId/upgrade', ContractController.upgrade);

/**
 * @swagger
 * /api/admin/contracts/{offerId}/buyers/{addr}:
 *   get:
 *     summary: Get buyer info (total spent + frozen status)
 *     tags: [Contracts]
 */
router.get('/:offerId/buyers/:addr', ContractController.buyerInfo);

export default router;
