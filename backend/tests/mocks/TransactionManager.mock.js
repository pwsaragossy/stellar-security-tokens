/**
 * Mock TransactionManager for CI-safe integration tests.
 * Always returns pending_multisig — no DB writes, no Stellar signing.
 */

let lastSubmission = null;

export class MockTransactionManager {
    /**
     * Records the submission and returns a mock multisig-pending response.
     */
    static async submit({
        transaction: _transaction,
        xdr,
        signingRole,
        operationType,
        metadata = {},
        description = null,
        initiatorId = null,
    }) {
        lastSubmission = { xdr, signingRole, operationType, metadata, description, initiatorId };
        return {
            success: true,
            status: 'pending_multisig',
            multiSigTransactionId: 42,
            requiredSigners: ['GSIGNER1234567890123456789012345678901234567890123456789012'],
            thresholdRequired: 1,
            message: 'Transaction queued for MultiSig approval',
        };
    }

    /** Test helper: retrieve the last submission for assertions */
    static getLastSubmission() {
        return lastSubmission;
    }

    /** Test helper: reset state between tests */
    static reset() {
        lastSubmission = null;
    }
}
