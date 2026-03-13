import express from 'express';
import { body, param, query } from 'express-validator';
import { WalletController } from '../controllers/walletController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePlatformAdmin } from '../middleware/authorize.js';
import { validate } from '../middleware/validator.js';

import { strictLimiter } from '../middleware/rateLimit.js';
import { PasskeyWalletService } from '../services/passkeyWallet.service.js';
import logger from '../utils/logger.js';
const log = logger.scope('WalletRoutes');

const router = express.Router();

/**
 * @swagger
 * /api/wallets/submit-tx:
 *   post:
 *     summary: Submit a signed transaction to the network (public endpoint for passkey wallet deployment)
 *     tags: [Wallets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [xdr]
 *             properties:
 *               xdr:
 *                 type: string
 *                 description: The signed transaction XDR
 *     responses:
 *       200:
 *         description: Transaction submitted successfully
 *       400:
 *         description: Invalid transaction
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Submission failed
 */
router.post('/submit-tx',
    strictLimiter,
    body('xdr').isString().notEmpty().withMessage('xdr is required'),
    validate,
    async (req, res, next) => {
        try {
            const { xdr } = req.body;
            log.info('[WalletRoutes] Submitting transaction from frontend (XDR length:', xdr.length, ')');

            // Use the service method which has the sponsorship fallback
            const result = await PasskeyWalletService.sendTransaction(xdr);

            log.info('[WalletRoutes] Submission result:', JSON.stringify(result));

            // Check if submission returned an error or failure
            if (result && (result.status === 'ERROR' || result.status === 'FAILED' || !result.hash)) {
                log.error('[WalletRoutes] Transaction failed:', result);
                return res.status(400).json({
                    success: false,
                    error: result.error || result.message || 'Transaction failed',
                    details: result
                });
            }

            log.info('[WalletRoutes] Transaction successful:', result.hash);

            res.json({
                success: true,
                hash: result.hash,
                message: 'Transaction submitted successfully',
                sponsored: result.sponsored || false
            });
        } catch (error) {
            log.error('[WalletRoutes] Transaction submission error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to submit transaction'
            });
        }
    }
);

/**
 * @swagger
 * /api/wallets/relay:
 *   post:
 *     summary: Relay endpoint for SmartAccountKit (fee-sponsored submission)
 *     description: |
 *       Public endpoint used by the frontend SmartAccountKit SDK.
 *       The SDK posts deploy/invoke transactions here for fee-sponsored submission.
 *       Supports both XDR envelope and Soroban func+auth formats.
 *     tags: [Wallets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               xdr:
 *                 type: string
 *                 description: Signed transaction XDR envelope
 *               func:
 *                 type: string
 *                 description: Soroban host function XDR (alternative to xdr)
 *               auth:
 *                 type: array
 *                 items: { type: string }
 *                 description: Authorization entry XDRs (used with func)
 *     responses:
 *       200:
 *         description: Transaction submitted successfully
 *       400:
 *         description: Invalid transaction or missing parameters
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Submission failed
 */
router.post('/relay',
    strictLimiter,
    async (req, res) => {
        try {
            const { xdr, func, auth } = req.body;

            if (!xdr && !func) {
                return res.status(400).json({
                    success: false,
                    error: 'Either xdr or func is required',
                });
            }

            let result;

            if (xdr) {
                // Standard XDR envelope submission (deploy transactions)
                log.info('[Relay] Submitting XDR transaction (length:', xdr.length, ')');
                result = await PasskeyWalletService.sendTransaction(xdr);
            } else {
                // Soroban func + auth submission (invoke transactions)
                log.info('[Relay] Submitting Soroban func+auth transaction');
                result = await PasskeyWalletService.sendSorobanTransaction(func, auth || []);
            }

            log.info('[Relay] Result:', JSON.stringify(result));

            if (result && (result.status === 'ERROR' || result.status === 'FAILED' || !result.hash)) {
                log.error('[Relay] Transaction failed:', result);
                return res.status(400).json({
                    success: false,
                    error: result.error || result.message || 'Transaction failed',
                    details: result,
                });
            }

            res.json({
                success: true,
                hash: result.hash,
                status: result.status,
                message: 'Transaction submitted successfully',
            });
        } catch (error) {
            log.error('[Relay] Submission error:', error.message);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to submit transaction',
            });
        }
    }
);

// All routes below require Platform Admin access
router.use(authenticateToken, requirePlatformAdmin);

/**
 * @swagger
 * tags:
 *   name: Wallets
 *   description: System Wallet Management and Multisig
 */

/**
 * @swagger
 * /api/wallets:
 *   get:
 *     summary: Get status and balances of system wallets
 *     tags: [Wallets]
 *     responses:
 *       200:
 *         description: List of wallets with balances
 */
router.get('/', WalletController.getWalletStatuses);

/**
 * @swagger
 * /api/wallets/transactions:
 *   get:
 *     summary: List transaction proposals
 *     tags: [Wallets]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, executed, rejected]
 *     responses:
 *       200:
 *         description: List of transactions
 *   post:
 *     summary: Create a new transaction proposal
 *     tags: [Wallets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceWallet
 *               - amount
 *               - destination
 *             properties:
 *               sourceWallet:
 *                 type: string
 *                 enum: [treasury, issuer, distributor]
 *               amount:
 *                 type: string
 *               destination:
 *                 type: string
 *               assetCode:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Proposal created
 */
router.get('/transactions',
    query('status').optional().isIn(['pending', 'executed', 'rejected']).withMessage('Invalid status filter'),
    validate,
    WalletController.getTransactionProposals
);

router.post('/transactions',
    body('sourceWallet').isIn(['treasury', 'issuer', 'distributor']).withMessage('Invalid source wallet'),
    body('amount').isNumeric().withMessage('Amount must be numeric'),
    body('destination').isString().isLength({ min: 56, max: 56 }).withMessage('Destination must be a valid Stellar address'),
    body('assetCode').optional().isString().isLength({ max: 12 }).withMessage('Asset code must be 12 characters or less'),
    body('description').optional().isString().isLength({ max: 500 }).withMessage('Description must be 500 characters or less'),
    validate,
    WalletController.createTransactionProposal
);

/**
 * @swagger
 * /api/wallets/transactions/{id}/submit:
 *   post:
 *     summary: Submit a signed transaction proposal
 *     tags: [Wallets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [signedXDR]
 *             properties:
 *               signedXDR:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transaction submitted or updated
 */
router.post('/transactions/:id/submit',
    param('id').isInt({ min: 1 }).withMessage('Transaction ID must be a positive integer'),
    body('signedXDR').isString().notEmpty().withMessage('signedXDR is required'),
    validate,
    WalletController.signAndSubmitProposal
);

export default router;

