import { Keypair } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

dotenv.config();

/**
 * KeyManager Service
 * 
 * Centralizes the retrieval of sensitive keys with dual-mode support:
 * 
 * MODE: 'env' (Development/Testnet)
 * - Retrieves full keypairs from process.env
 * - Allows auto-signing of transactions
 * - Used for local development and testnet
 * 
 * MODE: 'multisig' (Production)
 * - Only returns public keys
 * - Private keys stay on Ledger hardware wallets
 * - Transactions are queued for manual signing
 * 
 * SECURITY NOTE: In production, secret keys should NEVER be stored in .env.
 * They should only exist on hardware wallets (Ledger Nano S/X).
 */
class KeyManager {
    constructor() {
        this.mode = process.env.KEY_MANAGEMENT_MODE || 'env';
        this.env = process.env.NODE_ENV || 'development';

        if (this.mode === 'multisig') {
            console.log('[KeyManager] Running in MULTISIG mode - private keys on hardware wallets');
        } else {
            console.log('[KeyManager] Running in ENV mode - using .env secret keys');
        }
    }

    /**
     * Check if running in multisig mode
     * @returns {boolean} True if multisig mode is enabled
     */
    isMultisigMode() {
        return this.mode === 'multisig';
    }

    /**
     * Safe retrieval of a secret key (ENV mode only)
     * @param {string} role - The role of the wallet (ISSUER, DISTRIBUTOR, OPERATIONS, TREASURY)
     * @returns {string} The secret key
     * @throws {Error} If in multisig mode or key is missing
     */
    getSecretKey(role) {
        if (this.isMultisigMode()) {
            throw new Error(
                `[KeyManager] Cannot access secret keys in multisig mode. ` +
                `Use getPublicKey('${role}') and route through MultiSigTransactionService.`
            );
        }

        const keyName = `${role.toUpperCase()}_SECRET_KEY`;
        const secret = process.env[keyName];

        if (!secret) {
            throw new Error(`[KeyManager] Critical Error: Missing configuration for ${keyName}`);
        }

        return secret;
    }

    /**
     * Get public key for a role (works in both modes)
     * @param {string} role - The role of the wallet
     * @returns {string} The public key
     */
    getPublicKey(role) {
        const publicKeyName = `${role.toUpperCase()}_PUBLIC_KEY`;

        // First try explicit public key env var
        if (process.env[publicKeyName]) {
            return process.env[publicKeyName];
        }

        // In env mode, derive from secret key
        if (!this.isMultisigMode()) {
            const keypair = Keypair.fromSecret(this.getSecretKey(role));
            return keypair.publicKey();
        }

        throw new Error(`[KeyManager] Missing ${publicKeyName} configuration for multisig mode`);
    }

    // ============================================
    // Keypair Getters (ENV mode only)
    // ============================================

    getIssuerKeypair() {
        return Keypair.fromSecret(this.getSecretKey('ISSUER'));
    }

    getDistributorKeypair() {
        return Keypair.fromSecret(this.getSecretKey('DISTRIBUTOR'));
    }

    getTreasuryKeypair() {
        return Keypair.fromSecret(this.getSecretKey('TREASURY'));
    }

    getOperationsKeypair() {
        return Keypair.fromSecret(this.getSecretKey('OPERATIONS'));
    }

    // ============================================
    // Public Key Getters (Both modes)
    // ============================================

    getIssuerPublicKey() {
        return this.getPublicKey('ISSUER');
    }

    getDistributorPublicKey() {
        return this.getPublicKey('DISTRIBUTOR');
    }

    getTreasuryPublicKey() {
        return this.getPublicKey('TREASURY');
    }

    getOperationsPublicKey() {
        return this.getPublicKey('OPERATIONS');
    }

    // ============================================
    // Multisig Configuration
    // ============================================

    /**
     * Get required signers for an operation type
     * @param {string} operationType - Type of operation
     * @returns {string[]} Array of public keys required to sign
     */
    getRequiredSigners(operationType) {
        // In env mode, return the single relevant key
        if (!this.isMultisigMode()) {
            const signerMap = {
                'token_issue': [this.getIssuerPublicKey()],
                'token_distribute': [this.getDistributorPublicKey()],
                'freeze_account': [this.getIssuerPublicKey()],
                'clawback': [this.getIssuerPublicKey()],
                'treasury_payment': [this.getTreasuryPublicKey()],
                'trustline_auth': [this.getIssuerPublicKey()],
                'account_setup': [this.getOperationsPublicKey()],
            };
            return signerMap[operationType] || [this.getOperationsPublicKey()];
        }

        // In multisig mode, use configured signers
        const signerConfig = process.env[`${operationType.toUpperCase()}_SIGNERS`];
        if (signerConfig) {
            return signerConfig.split(',').map(s => s.trim());
        }

        // Default: use appropriate role's public key
        const defaultMap = {
            'token_issue': [this.getIssuerPublicKey()],
            'token_distribute': [this.getDistributorPublicKey()],
            'freeze_account': [this.getIssuerPublicKey()],
            'clawback': [this.getIssuerPublicKey()],
            'treasury_payment': this.getTreasurySigners(),
            'trustline_auth': [this.getIssuerPublicKey()],
            'account_setup': [this.getOperationsPublicKey()],
        };

        return defaultMap[operationType] || [this.getOperationsPublicKey()];
    }

    /**
     * Get threshold for an operation type
     * @param {string} operationType - Type of operation
     * @returns {number} Number of signatures required
     */
    getSignatureThreshold(operationType) {
        // In env mode, always 1 (auto-sign)
        if (!this.isMultisigMode()) {
            return 1;
        }

        // Check for operation-specific threshold
        const thresholdEnv = process.env[`${operationType.toUpperCase()}_THRESHOLD`];
        if (thresholdEnv) {
            return parseInt(thresholdEnv, 10);
        }

        // Default thresholds for production
        const defaultThresholds = {
            'token_issue': 1,           // Single issuer signature
            'token_distribute': 1,      // Single distributor signature
            'freeze_account': 1,        // Single issuer (compliance action)
            'clawback': 2,              // 2-of-N (requires approval)
            'treasury_payment': 2,      // 2-of-3 for treasury (high value)
            'trustline_auth': 1,        // Single issuer
            'account_setup': 1,         // Single operations
        };

        return defaultThresholds[operationType] || 1;
    }

    /**
     * Get treasury signers for multisig
     * @returns {string[]} Array of treasury signer public keys
     */
    getTreasurySigners() {
        const signers = process.env.TREASURY_SIGNERS;
        if (signers) {
            return signers.split(',').map(s => s.trim());
        }
        return [this.getTreasuryPublicKey()];
    }

    /**
     * Check if an operation requires multisig approval
     * @param {string} operationType - Type of operation
     * @returns {boolean} True if multisig approval is required
     */
    requiresMultisigApproval(operationType) {
        if (!this.isMultisigMode()) {
            return false;
        }

        // Operations that ALWAYS require multisig in production
        const criticalOps = ['clawback', 'treasury_payment'];
        return criticalOps.includes(operationType) || this.getSignatureThreshold(operationType) > 1;
    }
}

export const keyManager = new KeyManager();
