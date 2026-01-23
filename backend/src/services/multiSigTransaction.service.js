import prisma from '../config/prisma.js';
import { TransactionBuilder, Keypair } from '@stellar/stellar-sdk';
import { getNetworkPassphrase, stellarServer } from '../config/stellar.js';

/**
 * MultiSig Transaction Service
 * 
 * Manages pending transactions that require multiple signatures or Ledger signing.
 * Used for production key management where private keys are kept on hardware wallets.
 * 
 * Flow:
 * 1. Backend builds unsigned transaction → stored in DB
 * 2. Admin receives notification → views pending TXs
 * 3. Admin connects Ledger → signs transaction
 * 4. Signature collected → check if threshold met
 * 5. Threshold met → submit to Stellar network
 */
export class MultiSigTransactionService {
    /**
     * Default transaction transaction expiration time (72 hours)
     * Provides sufficient time for multi-admin coordination.
     */
    static DEFAULT_EXPIRATION_MINUTES = 72 * 60;

    /**
     * Create a new pending transaction awaiting signatures
     * @param {Object} params - Transaction parameters
     * @param {string} params.operationType - Type of operation (token_issue, treasury_payment, etc.)
     * @param {string} params.xdr - Unsigned transaction XDR
     * @param {string[]} params.requiredSigners - Array of public keys that must sign
     * @param {number} [params.thresholdRequired=1] - Number of signatures needed
     * @param {Object} [params.metadata={}] - Context data (offerId, amount, etc.)
     * @param {string} [params.description] - Human-readable description
     * @param {number} [params.initiatorId] - Admin user who initiated
     * @param {string} [params.initiatorType='platform_admin'] - Type of initiator
     * @returns {Promise<Object>} Created transaction record
     */
    static async create({
        operationType,
        xdr,
        requiredSigners,
        thresholdRequired = 1,
        metadata = {},
        description = null,
        initiatorId = null,
        initiatorType = 'platform_admin',
    }) {
        // Calculate expiration time
        const expiresAt = new Date(Date.now() + this.DEFAULT_EXPIRATION_MINUTES * 60 * 1000);

        const tx = await prisma.multiSigTransaction.create({
            data: {
                operationType,
                xdr,
                networkPassphrase: getNetworkPassphrase(),
                description,
                status: 'pending',
                requiredSigners,
                thresholdRequired,
                collectedSignatures: {},
                initiatorId,
                initiatorType,
                metadata,
                expiresAt,
            },
        });

        console.log(`[MultiSig] Created pending TX #${tx.id} (${operationType}) - requires ${thresholdRequired} of ${requiredSigners.length} signatures`);

        // Broadcast new transaction to Pusher
        const { broadcast } = await import('../config/pusher.js');
        broadcast('admin-governance', 'new-proposal', {
            id: tx.id,
            operationType,
            description,
            initiatorId
        });

        return tx;

        return tx;
    }

    /**
     * Get a pending transaction by ID
     * @param {number} id - Transaction ID
     * @returns {Promise<Object|null>} Transaction or null
     */
    static async getById(id) {
        return prisma.multiSigTransaction.findUnique({
            where: { id },
            include: {
                initiator: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
    }

    /**
     * List all pending transactions
     * @param {Object} [options] - Query options
     * @param {string[]} [options.statuses=['pending', 'partially_signed']] - Status filter
     * @param {number} [options.limit=50] - Max results
     * @returns {Promise<Object[]>} Array of pending transactions
     */
    static async listPending(options = {}) {
        const { statuses = ['pending', 'partially_signed'], limit = 50 } = options;

        return prisma.multiSigTransaction.findMany({
            where: {
                status: { in: statuses },
                expiresAt: { gt: new Date() }, // Not expired
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                initiator: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
    }

    /**
     * Add a signature to a pending transaction
     * @param {number} txId - Transaction ID
     * @param {string} publicKey - Signer's public key
     * @param {string} signature - Base64 encoded signature
     * @returns {Promise<Object>} Updated transaction with signature status
     */
    static async addSignature(txId, publicKey, signature) {
        const tx = await this.getById(txId);

        if (!tx) {
            throw new Error(`Transaction #${txId} not found`);
        }

        if (tx.status === 'expired' || tx.expiresAt < new Date()) {
            throw new Error('Transaction has expired');
        }

        if (['executed', 'submitted', 'failed', 'rejected'].includes(tx.status)) {
            throw new Error(`Transaction is already ${tx.status}`);
        }

        // Verify signer is in required list
        if (!tx.requiredSigners.includes(publicKey)) {
            throw new Error(`Public key ${publicKey.slice(0, 8)}... is not a required signer`);
        }

        // Cryptographically verify signature
        try {
            const transaction = TransactionBuilder.fromXDR(tx.xdr, tx.networkPassphrase);
            const txHash = transaction.hash();
            const keypair = Keypair.fromPublicKey(publicKey);

            // Signature is expected to be base64 from the frontend (as returned by Freighter/Ledger)
            if (!keypair.verify(txHash, Buffer.from(signature, 'base64'))) {
                throw new Error('Invalid signature: verification failed');
            }
        } catch (verificationError) {
            console.error(`[MultiSig] Cryptographic verification failed for TX #${txId}:`, verificationError.message);
            throw new Error(`Signature verification failed: ${verificationError.message}`);
        }

        // Check if already signed by this key
        const collectedSigs = tx.collectedSignatures || {};
        if (collectedSigs[publicKey]) {
            throw new Error('This key has already signed this transaction');
        }

        // Add signature
        collectedSigs[publicKey] = signature;
        const signatureCount = Object.keys(collectedSigs).length;
        const thresholdMet = signatureCount >= tx.thresholdRequired;

        // Update status
        let newStatus = 'partially_signed';
        if (thresholdMet) {
            newStatus = 'ready';
        }

        const updated = await prisma.multiSigTransaction.update({
            where: { id: txId },
            data: {
                collectedSignatures: collectedSigs,
                status: newStatus,
            },
        });

        console.log(`[MultiSig] TX #${txId}: Signature added from ${publicKey.slice(0, 8)}... (${signatureCount}/${tx.thresholdRequired})`);

        // Broadcast signature update to Pusher
        const { broadcast } = await import('../config/pusher.js');
        broadcast('admin-governance', 'signature-added', {
            id: txId,
            signer: publicKey,
            signatureCount,
            thresholdRequired: tx.thresholdRequired,
            status: newStatus
        });

        return {
            ...updated,
            signatureCount,
            thresholdMet,
            remainingSignatures: Math.max(0, tx.thresholdRequired - signatureCount),
        };
    }

    /**
     * Submit a fully-signed transaction to the Stellar network
     * @param {number} txId - Transaction ID
     * @returns {Promise<Object>} Submission result with hash and ledger
     */
    static async submit(txId) {
        const tx = await this.getById(txId);

        if (!tx) {
            throw new Error(`Transaction #${txId} not found`);
        }

        if (tx.status !== 'ready') {
            throw new Error(`Transaction is not ready for submission (status: ${tx.status})`);
        }

        if (tx.expiresAt < new Date()) {
            await this.markExpired(txId);
            throw new Error('Transaction has expired');
        }

        // Reconstruct transaction from XDR
        const transaction = TransactionBuilder.fromXDR(tx.xdr, tx.networkPassphrase);

        // Add all collected signatures to the transaction
        const collectedSigs = tx.collectedSignatures || {};
        for (const [publicKey, signature] of Object.entries(collectedSigs)) {
            // The signature should be the raw signature, we need to add it to the TX
            transaction.addSignature(publicKey, signature);
        }

        // Update status to submitted
        await prisma.multiSigTransaction.update({
            where: { id: txId },
            data: { status: 'submitted' },
        });

        try {
            const result = await stellarServer.submitTransaction(transaction);

            // PHASE 2.2: Execute Side Effects (Post-Execution Hooks)
            // This ensures DB state updates only happen after on-chain success
            await this.processEffects(tx);

            // Update with success
            const updated = await prisma.multiSigTransaction.update({
                where: { id: txId },
                data: {
                    status: 'executed',
                    txHash: result.hash,
                    ledger: result.ledger,
                    submittedAt: new Date(),
                },
            });

            console.log(`[MultiSig] TX #${txId} executed successfully: ${result.hash}`);

            // Broadcast execution success to Pusher
            const { broadcast } = await import('../config/pusher.js');
            broadcast('admin-governance', 'transaction-executed', {
                id: txId,
                hash: result.hash,
                status: 'executed'
            });

            return {
                success: true,
                transaction: updated,
                hash: result.hash,
                ledger: result.ledger,
            };
        } catch (error) {
            // Update with failure
            const errorMessage = error.response?.data?.extras?.result_codes
                ? JSON.stringify(error.response.data.extras.result_codes)
                : error.message;

            await prisma.multiSigTransaction.update({
                where: { id: txId },
                data: {
                    status: 'failed',
                    errorMessage,
                    submittedAt: new Date(),
                },
            });

            console.error(`[MultiSig] TX #${txId} failed:`, errorMessage);

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Reject/cancel a pending transaction
     * @param {number} txId - Transaction ID
     * @param {string} [reason] - Rejection reason
     * @returns {Promise<Object>} Updated transaction
     */
    static async reject(txId, reason = null) {
        const tx = await this.getById(txId);

        if (!tx) {
            throw new Error(`Transaction #${txId} not found`);
        }

        if (['executed', 'submitted'].includes(tx.status)) {
            throw new Error('Cannot reject an already submitted transaction');
        }

        const updated = await prisma.multiSigTransaction.update({
            where: { id: txId },
            data: {
                status: 'rejected',
                errorMessage: reason || 'Rejected by admin',
            },
        });

        console.log(`[MultiSig] TX #${txId} rejected: ${reason || 'No reason provided'}`);

        return updated;
    }

    /**
     * Mark a transaction as expired
     * @param {number} txId - Transaction ID
     * @returns {Promise<Object>} Updated transaction
     */
    static async markExpired(txId) {
        return prisma.multiSigTransaction.update({
            where: { id: txId },
            data: {
                status: 'expired',
                errorMessage: 'Transaction expired before reaching signature threshold',
            },
        });
    }

    /**
     * Cron job to expire old pending transactions
     * Should be run periodically (e.g., every minute)
     * @returns {Promise<number>} Number of expired transactions
     */
    static async expireOldTransactions() {
        const result = await prisma.multiSigTransaction.updateMany({
            where: {
                status: { in: ['pending', 'partially_signed'] },
                expiresAt: { lt: new Date() },
            },
            data: {
                status: 'expired',
                errorMessage: 'Transaction expired before reaching signature threshold',
            },
        });

        if (result.count > 0) {
            console.log(`[MultiSig] Expired ${result.count} pending transactions`);
        }

        return result.count;
    }

    /**
     * Get transaction statistics
     * @returns {Promise<Object>} Statistics object
     */
    static async getStats() {
        const [pending, executed, failed, expired] = await Promise.all([
            prisma.multiSigTransaction.count({ where: { status: { in: ['pending', 'partially_signed', 'ready'] } } }),
            prisma.multiSigTransaction.count({ where: { status: 'executed' } }),
            prisma.multiSigTransaction.count({ where: { status: 'failed' } }),
            prisma.multiSigTransaction.count({ where: { status: 'expired' } }),
        ]);

        return {
            pending,
            executed,
            failed,
            expired,
            total: pending + executed + failed + expired,
        };
    }

    /**
     * Executes post-transaction side effects (database updates)
     * @param {Object} tx - The executed transaction record
     */
    static async processEffects(tx) {
        const { operationType, metadata, txHash } = tx;
        console.log(`[MultiSig] Processing effects for TX #${tx.id} (${operationType})`);

        try {
            switch (operationType) {
                case 'token_issue':
                    // 1. Create the Token record
                    await prisma.token.create({
                        data: {
                            assetCode: metadata.assetCode,
                            issuerPublicKey: metadata.issuerPublicKey,
                            totalSupply: metadata.totalSupply,
                            description: metadata.description,
                            offerId: metadata.offerId ? parseInt(metadata.offerId) : null,
                            issuedBy: tx.initiatorId,
                            sacContractId: metadata.sacContractId || null,
                        }
                    });

                    // 2. Update the Offer status to active
                    if (metadata.offerId) {
                        await prisma.offer.update({
                            where: { id: parseInt(metadata.offerId) },
                            data: { status: 'active' }
                        });
                        console.log(`[MultiSig] Offer #${metadata.offerId} set to ACTIVE`);
                    }
                    break;

                case 'token_distribute':
                    await prisma.tokenDistribution.create({
                        data: {
                            investorId: parseInt(metadata.investorId),
                            assetCode: metadata.assetCode,
                            amount: metadata.amount,
                            transactionHash: txHash,
                            offerId: metadata.offerId ? parseInt(metadata.offerId) : null,
                            memo: metadata.memo || null,
                        }
                    });
                    break;

                case 'treasury_payment':
                    // Record the fee in the log
                    await prisma.feeLog.create({
                        data: {
                            amount: metadata.amount,
                            assetCode: metadata.assetCode || 'USDC',
                            category: metadata.category || 'WITHDRAWAL',
                            description: metadata.description || `Multisig payment: ${tx.description}`,
                            transactionHash: txHash
                        }
                    });
                    break;

                case 'dividend_distribution':
                    // Record all payments in the batch
                    if (metadata.payments && Array.isArray(metadata.payments)) {
                        await prisma.$transaction(
                            metadata.payments.map((payment) =>
                                prisma.interestPayment.create({
                                    data: {
                                        investorId: payment.investorId,
                                        assetCode: payment.assetCode,
                                        tokenBalance: payment.tokenBalance,
                                        interestRate: payment.interestRate,
                                        interestAmount: payment.interestAmount,
                                        usdcAmount: payment.usdcAmount,
                                        transactionHash: txHash,
                                        paymentDate: new Date(metadata.paymentDate || Date.now()),
                                        status: 'completed',
                                        offerId: payment.offerId || null,
                                    }
                                })
                            )
                        );
                        console.log(`[MultiSig] Recorded ${metadata.payments.length} interest payments for ${txHash}`);
                    }
                    break;

                case 'disable_clawback':
                    // If we had a flag in the DB for this, we would update it here.
                    // Since it's on-chain only, we just log it.
                    console.log(`[MultiSig] Clawback disabled on-chain for ${metadata.investorPublicKey} / ${metadata.assetCode}`);
                    break;

                default:
                    console.log(`[MultiSig] No post-execution hooks for ${operationType}`);
            }
        } catch (error) {
            console.error(`[MultiSig] Hook Error for TX #${tx.id}:`, error.message);
            // We catch but don't rethrow to avoid breaking the transaction submission record update
        }
    }
}

export default MultiSigTransactionService;
