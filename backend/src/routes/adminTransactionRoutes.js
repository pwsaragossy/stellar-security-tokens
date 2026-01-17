import express from 'express';
import { MultiSigTransactionService } from '../services/multiSigTransaction.service.js';
import { authenticatePlatformAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin Transactions
 *   description: Manage pending multisig transactions for admin approval
 */

/**
 * @swagger
 * /api/admin/transactions/pending:
 *   get:
 *     summary: List all pending transactions
 *     tags: [Admin Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending transactions
 */
router.get('/pending', authenticatePlatformAdmin, async (req, res) => {
    try {
        const transactions = await MultiSigTransactionService.listPending();
        const stats = await MultiSigTransactionService.getStats();

        res.json({
            success: true,
            data: {
                transactions,
                stats,
            },
        });
    } catch (error) {
        console.error('Error listing pending transactions:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/admin/transactions/{id}:
 *   get:
 *     summary: Get transaction details
 *     tags: [Admin Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction details with signature status
 */
router.get('/:id', authenticatePlatformAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await MultiSigTransactionService.getById(parseInt(id, 10));

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found',
            });
        }

        // Calculate signature status
        const collectedCount = Object.keys(transaction.collectedSignatures || {}).length;
        const signatureStatus = {
            collected: collectedCount,
            required: transaction.thresholdRequired,
            remainingSigners: transaction.requiredSigners.filter(
                pk => !(transaction.collectedSignatures || {})[pk]
            ),
            isReady: collectedCount >= transaction.thresholdRequired,
            isExpired: transaction.expiresAt < new Date(),
        };

        res.json({
            success: true,
            data: {
                ...transaction,
                signatureStatus,
            },
        });
    } catch (error) {
        console.error('Error getting transaction:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/admin/transactions/{id}/xdr:
 *   get:
 *     summary: Get unsigned XDR for Ledger signing
 *     tags: [Admin Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: XDR and network passphrase for signing
 */
router.get('/:id/xdr', authenticatePlatformAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await MultiSigTransactionService.getById(parseInt(id, 10));

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found',
            });
        }

        if (transaction.expiresAt < new Date()) {
            return res.status(400).json({
                success: false,
                error: 'Transaction has expired',
            });
        }

        res.json({
            success: true,
            data: {
                xdr: transaction.xdr,
                networkPassphrase: transaction.networkPassphrase,
                requiredSigners: transaction.requiredSigners,
                description: transaction.description,
                operationType: transaction.operationType,
                expiresAt: transaction.expiresAt,
            },
        });
    } catch (error) {
        console.error('Error getting XDR:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/admin/transactions/{id}/sign:
 *   post:
 *     summary: Submit a signature for the transaction
 *     tags: [Admin Transactions]
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
 *               publicKey:
 *                 type: string
 *                 description: Signer's public key
 *               signature:
 *                 type: string
 *                 description: Base64 encoded signature
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Signature added successfully
 */
router.post('/:id/sign', authenticatePlatformAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { publicKey, signature } = req.body;

        if (!publicKey || !signature) {
            return res.status(400).json({
                success: false,
                error: 'publicKey and signature are required',
            });
        }

        const result = await MultiSigTransactionService.addSignature(
            parseInt(id, 10),
            publicKey,
            signature
        );

        res.json({
            success: true,
            data: result,
            message: result.thresholdMet
                ? 'Signature added. Transaction is ready for submission.'
                : `Signature added. ${result.remainingSignatures} more signature(s) needed.`,
        });
    } catch (error) {
        console.error('Error adding signature:', error);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/admin/transactions/{id}/submit:
 *   post:
 *     summary: Submit a fully-signed transaction to Stellar
 *     tags: [Admin Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction submitted successfully
 */
router.post('/:id/submit', authenticatePlatformAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await MultiSigTransactionService.submit(parseInt(id, 10));

        if (result.success) {
            res.json({
                success: true,
                data: {
                    hash: result.hash,
                    ledger: result.ledger,
                    transaction: result.transaction,
                },
                message: 'Transaction submitted successfully to Stellar network',
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error,
            });
        }
    } catch (error) {
        console.error('Error submitting transaction:', error);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/admin/transactions/{id}/reject:
 *   post:
 *     summary: Reject/cancel a pending transaction
 *     tags: [Admin Transactions]
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
 *               reason:
 *                 type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction rejected
 */
router.post('/:id/reject', authenticatePlatformAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const transaction = await MultiSigTransactionService.reject(
            parseInt(id, 10),
            reason
        );

        res.json({
            success: true,
            data: transaction,
            message: 'Transaction rejected',
        });
    } catch (error) {
        console.error('Error rejecting transaction:', error);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/admin/transactions/stats:
 *   get:
 *     summary: Get transaction statistics
 *     tags: [Admin Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction statistics
 */
router.get('/stats', authenticatePlatformAdmin, async (req, res) => {
    try {
        const stats = await MultiSigTransactionService.getStats();

        res.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

export default router;
