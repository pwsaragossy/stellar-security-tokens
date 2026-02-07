import { keyManager } from './KeyManager.js';
import { MultiSigTransactionService } from './multiSigTransaction.service.js';
import { signAndSubmitTransaction, stellarServer } from '../config/stellar.js';

/**
 * TransactionManager Service
 * 
 * Provides a unified interface for submitting Stellar transactions that
 * automatically branches between direct signing (ENV/Dev mode) and 
 * MultiSig queueing (Production mode).
 */
export class TransactionManager {
    /**
     * Submits or queues a transaction based on the current environment and operation type.
     * 
     * @param {Object} params - Submission parameters
     * @param {Transaction} params.transaction - The built, unsigned Stellar transaction
     * @param {string} params.signingRole - Role for signing: 'ISSUER', 'DISTRIBUTOR', 'TREASURY', 'OPERATIONS'
     * @param {string} params.operationType - Type of operation for threshold checking (e.g., 'token_issue')
     * @param {Object} [params.metadata={}] - Context metadata for multisig records
     * @param {string} [params.description] - Description for admins in multisig queue
     * @param {string} [params.initiatorId] - ID of the admin who triggered the action
     * @returns {Promise<Object>} Result with either success hash or pending_multisig status
     */
    static async submit({
        transaction,
        signingRole,
        operationType,
        metadata = {},
        description = null,
        initiatorId = null,
    }) {
        const requiresMultisig = keyManager.requiresMultisigApproval(operationType);

        if (!requiresMultisig) {
            // --- DIRECT SIGNING (ENV MODE) ---
            console.log(`[TransactionManager] Direct signing ${operationType} (Auto-signing enabled)`);
            const signingKeypair = keyManager.getKeypairForRole(signingRole);
            return await signAndSubmitTransaction(transaction, signingKeypair);
        }

        // --- MULTISIG QUEUEING (PRODUCTION MODE) ---
        console.log(`[TransactionManager] Queueing ${operationType} for MultiSig approval`);

        const xdr = transaction.toXDR();
        const requiredSigners = keyManager.getRequiredSigners(operationType);
        const threshold = keyManager.getSignatureThreshold(operationType);

        const pendingTx = await MultiSigTransactionService.create({
            operationType,
            xdr,
            requiredSigners,
            thresholdRequired: threshold,
            metadata,
            description: description || `Automated ${operationType} request`,
            initiatorId,
        });

        return {
            success: true,
            status: 'pending_multisig',
            multiSigTransactionId: pendingTx.id,
            requiredSigners,
            thresholdRequired: threshold,
            message: 'Transaction queued for MultiSig approval',
        };
    }
}

export default TransactionManager;
