import express from 'express';
import { MultiSigTransactionService } from '../services/multiSigTransaction.service.js';
import { authenticatePlatformAdmin } from '../middleware/auth.js';
import logger from '../utils/logger.js';
const log = logger.scope('AdminTxRoutes');

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
        log.error('Error listing pending transactions:', error);
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
        log.error('Error getting transaction:', error);
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

        // Soroban TXs need just-in-time rebuild — simulation data + time bounds expire in ~5 min
        const SOROBAN_OPS = [
            'sale_deploy', 'sale_create',
            'contract_pause', 'contract_resume',
            'contract_deposit_auth', 'contract_deposit_transfer',
            'contract_price', 'contract_withdraw',
            'contract_freeze', 'contract_drain',
            'contract_propose_admin', 'contract_accept_admin',
            'contract_upgrade',
        ];

        let xdr = transaction.xdr;

        if (SOROBAN_OPS.includes(transaction.operationType)) {
            try {
                const freshXdr = await MultiSigTransactionService.rebuildSorobanXdr(transaction);
                if (freshXdr) {
                    xdr = freshXdr;
                    // Persist the fresh XDR so the sign endpoint uses it too
                    const prisma = (await import('../config/prisma.js')).default;
                    await prisma.multiSigTransaction.update({
                        where: { id: transaction.id },
                        data: { xdr: freshXdr },
                    });
                    log.info(`[AdminTx] Rebuilt Soroban XDR for TX #${id} (${transaction.operationType})`);
                }
            } catch (rebuildErr) {
                log.warn(`[AdminTx] JIT rebuild failed for TX #${id}, serving stale XDR: ${rebuildErr.message}`);
            }
        }

        res.json({
            success: true,
            data: {
                xdr,
                networkPassphrase: transaction.networkPassphrase,
                requiredSigners: transaction.requiredSigners,
                description: transaction.description,
                operationType: transaction.operationType,
                expiresAt: transaction.expiresAt,
            },
        });
    } catch (error) {
        log.error('Error getting XDR:', error);
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
        log.error('Error adding signature:', error);
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
            log.info(`[AdminTx] Parsing signed XDR (length: ${signedXDR.length})`);
            const transaction = TransactionBuilder.fromXDR(signedXDR, getNetworkPassphrase());
            log.info(`[AdminTx] Transaction parsed, hash: ${transaction.hash().toString('hex')}`);

            try {
                log.info(`[AdminTx] Submitting to Stellar network...`);
                log.info(`[AdminTx] Horizon URL: ${stellarServer.serverURL}`);

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

                    log.error(`[AdminTx] TX #${id} failed:`, result.error);
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

                log.info(`[AdminTx] TX #${id} submitted via Dev Keys: ${result.hash}`);

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
                log.error(`[AdminTx] Horizon error details:`, {
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

                log.error(`[AdminTx] TX #${id} failed:`, errorMessage);
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
        log.error('Error submitting transaction:', error);
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
        log.error('Error rejecting transaction:', error);
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
        log.error('Error getting stats:', error);
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
        log.error('Error retrying deposit forward:', error);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/admin/transactions/deposits/retry-all:
 *   post:
 *     summary: Heal all stuck approval items — expire stale multisig, retry stuck deposits
 *     tags: [Admin Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Heal results summary
 */
router.post('/deposits/retry-all', authenticatePlatformAdmin, async (req, res) => {
    try {
        const prisma = (await import('../config/prisma.js')).default;
        const { DepositRelayService } = await import('../services/depositRelay.service.js');
        const summary = { expiredMultisig: 0, retriedDeposits: [] };

        // 1. Expire stale multisig transactions (and propagate side effects)
        try {
            summary.expiredMultisig = await MultiSigTransactionService.expireOldTransactions();
        } catch (err) {
            log.error('[RetryAll] Error expiring multisig:', err.message);
        }

        // 2. Retry stuck deposits (received / failed / rejected)
        try {
            const stuckDeposits = await prisma.deposit.findMany({
                where: { status: { in: ['received', 'failed', 'rejected'] } },
            });

            for (const dep of stuckDeposits) {
                try {
                    await DepositRelayService.forwardAsset(dep.id, 'USDC');
                    summary.retriedDeposits.push({ id: dep.id, memo: dep.memo, success: true });
                } catch (err) {
                    summary.retriedDeposits.push({ id: dep.id, memo: dep.memo, success: false, error: err.message });
                }
            }
        } catch (err) {
            log.error('[RetryAll] Error retrying deposits:', err.message);
        }

        res.json({
            success: true,
            data: summary,
            message: `Healed: ${summary.expiredMultisig} expired tx, ${summary.retriedDeposits.length} retried deposits`,
        });
    } catch (error) {
        log.error('Error in retry-all:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * @swagger
 * /api/admin/transactions/setup-thresholds:
 *   post:
 *     summary: Queue a setOptions TX to add operations key as signer on issuer
 *     tags: [Admin Transactions]
 *     description: |
 *       One-time setup per issuer. Adds the operations key as a weight=2 signer
 *       on the issuer account and sets thresholds (low=1, med=2, high=10).
 *       This allows the backend to auto-authorize buyer balances on SACs.
 *       Soroban require_auth() uses medium threshold for admin operations.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Threshold setup TX queued for signing
 */
router.post('/setup-thresholds', authenticatePlatformAdmin, async (req, res) => {
    try {
        const { SorobanSaleService } = await import('../services/sorobanSale.service.js');
        const { keyManager: km } = await import('../services/KeyManager.js');
        const issuerPublicKey = km.getIssuerPublicKey();

        const result = await SorobanSaleService.buildIssuerThresholdSetupXdr();

        // Queue as multisig TX for Freighter signing
        const tx = await MultiSigTransactionService.create({
            operationType: 'issuer_setup_thresholds',
            xdr: result.xdr,
            requiredSigners: [issuerPublicKey],
            thresholdRequired: 1,
            metadata: {
                issuerPublicKey,
                operationsPublicKey: km.getOperationsPublicKey(),
                thresholds: { masterWeight: 10, opsWeight: 2, low: 1, med: 2, high: 10 },
            },
            description: 'One-time setup: Add operations key as weight=2 signer for auto-authorization (med=2, high=10)',
            initiatorId: req.user?.userId || null,
            initiatorType: 'platform_admin',
        });

        log.info(`[AdminTx] Queued issuer threshold setup TX #${tx.id}`);

        res.json({
            success: true,
            data: { transactionId: tx.id },
            message: 'Issuer threshold setup TX queued. Sign with Freighter to activate auto-authorization.',
        });
    } catch (error) {
        log.error('Error creating threshold setup TX:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

export default router;

