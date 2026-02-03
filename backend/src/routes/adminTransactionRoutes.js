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
        const { signedXDR } = req.body;

        // If signedXDR is provided (from dev signing), submit it directly
        if (signedXDR) {
            const { TransactionBuilder } = await import('@stellar/stellar-sdk');
            const { stellarServer, getNetworkPassphrase } = await import('../config/stellar.js');
            const prisma = (await import('../config/prisma.js')).default;

            const tx = await prisma.multiSigTransaction.findUnique({ where: { id: parseInt(id, 10) } });
            if (!tx) {
                return res.status(404).json({ success: false, error: 'Transaction not found' });
            }

            // Parse and submit the signed XDR
            console.log(`[AdminTx] Parsing signed XDR (length: ${signedXDR.length})`);
            const transaction = TransactionBuilder.fromXDR(signedXDR, getNetworkPassphrase());
            console.log(`[AdminTx] Transaction parsed, hash: ${transaction.hash().toString('hex')}`);

            try {
                console.log(`[AdminTx] Submitting to Stellar network...`);
                console.log(`[AdminTx] Horizon URL: ${stellarServer.serverURL}`);

                // Use submitSignedTransaction helper which has proper URL validation
                const { submitSignedTransaction } = await import('../config/stellar.js');
                const result = await submitSignedTransaction(signedXDR);

                // Check if submission was successful
                if (!result.success) {
                    // Update transaction status to failed
                    await prisma.multiSigTransaction.update({
                        where: { id: parseInt(id, 10) },
                        data: {
                            status: 'failed',
                            errorMessage: result.userFriendlyError || result.error,
                            submittedAt: new Date()
                        }
                    });

                    console.error(`[AdminTx] TX #${id} failed:`, result.error);
                    return res.status(400).json({
                        success: false,
                        error: result.userFriendlyError || result.error
                    });
                }

                // Process side effects
                await MultiSigTransactionService.processEffects({
                    ...tx,
                    txHash: result.hash
                });

                // Update transaction status to executed
                await prisma.multiSigTransaction.update({
                    where: { id: parseInt(id, 10) },
                    data: {
                        status: 'executed',
                        txHash: result.hash,
                        ledger: result.ledger,
                        submittedAt: new Date(),
                        xdr: signedXDR // Store the signed XDR
                    }
                });

                console.log(`[AdminTx] TX #${id} submitted via Dev Keys: ${result.hash}`);

                return res.json({
                    success: true,
                    data: {
                        hash: result.hash,
                        ledger: result.ledger,
                    },
                    message: 'Transaction submitted successfully via Dev Keys',
                });
            } catch (submitError) {
                // Enhanced error logging for debugging
                console.error(`[AdminTx] Horizon error details:`, {
                    status: submitError.response?.status,
                    statusText: submitError.response?.statusText,
                    data: submitError.response?.data,
                    extras: submitError.response?.data?.extras,
                    message: submitError.message
                });

                const errorMessage = submitError.response?.data?.extras?.result_codes
                    ? JSON.stringify(submitError.response.data.extras.result_codes)
                    : submitError.response?.data?.detail || submitError.message;

                await prisma.multiSigTransaction.update({
                    where: { id: parseInt(id, 10) },
                    data: {
                        status: 'failed',
                        errorMessage,
                        submittedAt: new Date()
                    }
                });

                console.error(`[AdminTx] TX #${id} failed:`, errorMessage);
                return res.status(400).json({ success: false, error: errorMessage });
            }
        }

        // Standard flow: use MultiSigTransactionService.submit
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
/**
 * @swagger
 * /api/admin/transactions/deposits/{depositId}/retry:
 *   post:
 *     summary: Retry forwarding a deposit that is stuck in 'received' status
 *     tags: [Admin Transactions]
 *     parameters:
 *       - in: path
 *         name: depositId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assetCode:
 *                 type: string
 *                 default: USDC
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deposit forwarding triggered
 */
router.post('/deposits/:depositId/retry', authenticatePlatformAdmin, async (req, res) => {
    try {
        const { depositId } = req.params;
        const { assetCode = 'USDC' } = req.body;

        const { DepositRelayService } = await import('../services/depositRelay.service.js');

        await DepositRelayService.forwardAsset(parseInt(depositId, 10), assetCode);

        res.json({
            success: true,
            message: `Deposit ${depositId} forwarding triggered with asset ${assetCode}`,
        });
    } catch (error) {
        console.error('Error retrying deposit forward:', error);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

export default router;

