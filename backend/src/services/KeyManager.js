import { Keypair } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import logger from '../utils/logger.js';

dotenv.config();

// Scoped logger for this service
const log = logger.scope('KeyManager');

/**
 * KeyManager Service
 * 
 * Centralizes the retrieval of sensitive keys with dual-mode support:
 * 
 * MODE: 'env' (Automated test scripts ONLY)
 * - Retrieves full keypairs from process.env
 * - Allows auto-signing of transactions
 * - Used exclusively by E2E test scripts that inject throwaway keys
 * - NOT used in normal development — dev uses multisig + Freighter
 * 
 * MODE: 'multisig' (Production)
 * - Only returns public keys
 * - Private keys stay on Ledger hardware wallets
 * - Transactions are queued for manual signing
 * 
 * SECURITY NOTE: Only the Operations ("hot wallet") secret key is stored
 * server-side (.env / Docker Secrets), in BOTH dev and production. It funds
 * automated sponsorships and trustlines with minimal XLM.
 * All other keys (Issuer, Treasury, Distributor) are signed via Freighter and
 * go through MultiSig approval — they are NEVER stored in .env.
 */
class KeyManager {
    constructor() {
        this.mode = process.env.KEY_MANAGEMENT_MODE || 'multisig';
        this.env = process.env.NODE_ENV || 'development';

        if (this.mode === 'multisig') {
            log.info('Running in MULTISIG mode - private keys on hardware wallets');
        } else {
            log.info('Running in ENV mode - using .env secret keys');
        }

        // Initialize Channel Pool for Sequencing (CAP-15)
        this.channels = [];
        this.currentChannelIndex = 0;
        this.#initializeChannels();
    }

    /**
     * Initializes the channel pool from environment variables (CHANNEL_1_SECRET_KEY, etc.)
     * @private
     */
    #initializeChannels() {
        // Load channel accounts in ALL modes.
        // Channels are the "hot wallet pool" for fee-bump sponsorship — they prevent
        // tx_bad_seq errors under concurrent load and are distinct from the privileged
        // ISSUER/DISTRIBUTOR/TREASURY keys that multisig mode protects.
        for (let i = 1; i <= 10; i++) {
            const secret = process.env[`CHANNEL_${i}_SECRET_KEY`];
            if (secret) {
                try {
                    this.channels.push(Keypair.fromSecret(secret));
                } catch (e) {
                    log.error(`Invalid secret for CHANNEL_${i}`);
                }
            }
        }

        // Fallback: Use Operations wallet as the only channel if none defined
        if (this.channels.length === 0) {
            try {
                this.channels.push(this.getOperationsKeypair());
                log.info('No channels defined. Using Operations wallet as primary channel.');
            } catch (e) {
                // Operations might not be defined yet during initial setup
            }
        } else {
            log.info(`Initialized channel pool with ${this.channels.length} accounts.`);
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
            // Operations is the "hot wallet" — allowed in multisig mode
            // for automated sponsorships, trustlines, and channel operations
            if (role.toUpperCase() === 'OPERATIONS') {
                const secret = this.#readOperationsSecret();
                if (!secret) {
                    throw new Error('[KeyManager] Missing OPERATIONS_SECRET_KEY — required as hot wallet in multisig mode');
                }
                return secret;
            }
            throw new Error(
                `[KeyManager] Cannot access ${role} secret key in multisig mode. ` +
                `Use getPublicKey('${role}') and route through MultiSigTransactionService.`
            );
        }

        // In env mode, Operations also tries Docker Secrets first
        if (role.toUpperCase() === 'OPERATIONS') {
            const secret = this.#readOperationsSecret();
            if (secret) return secret;
        }

        const keyName = `${role.toUpperCase()}_SECRET_KEY`;
        const secret = process.env[keyName];

        if (!secret) {
            throw new Error(`[KeyManager] Critical Error: Missing configuration for ${keyName}`);
        }

        return secret;
    }

    /**
     * Read operations secret key with mode-aware priority:
     *   - ENV mode:      process.env first (tests inject throwaway keys)
     *   - MULTISIG mode: Docker Secret first (production hot wallet)
     *
     * Docker Secrets are mounted at /run/secrets/ as tmpfs (never touches disk).
     * @private
     * @returns {string|null} The secret key or null if not found
     */
    #readOperationsSecret() {
        const DOCKER_SECRET_PATH = '/run/secrets/operations_key';

        // In ENV mode (E2E tests), env var takes priority — tests inject
        // throwaway keypairs via process.env before importing KeyManager.
        // The Docker Secret file (tmpfs, read-only) would shadow the test key.
        if (this.mode === 'env') {
            const envSecret = process.env.OPERATIONS_SECRET_KEY;
            if (envSecret) {
                if (!this._opsSecretLogged) {
                    log.info('Operations key loaded from environment variable');
                    this._opsSecretLogged = true;
                }
                return envSecret;
            }
        }

        // 1. Docker Secret (production — tmpfs, never on disk)
        if (existsSync(DOCKER_SECRET_PATH)) {
            try {
                const secret = readFileSync(DOCKER_SECRET_PATH, 'utf8').trim();
                if (secret) {
                    if (!this._opsSecretLogged) {
                        log.info('Operations key loaded from Docker Secret (tmpfs)');
                        this._opsSecretLogged = true;
                    }
                    return secret;
                }
            } catch (e) {
                log.error('Failed to read Docker Secret:', e.message);
            }
        }

        // 2. Environment variable fallback (development)
        const envSecret = process.env.OPERATIONS_SECRET_KEY;
        if (envSecret) {
            if (!this._opsSecretLogged) {
                if (this.env === 'production') {
                    log.warn('⚠️  Operations key loaded from env var (plaintext). Migrate to Docker Secrets.');
                } else {
                    log.info('Operations key loaded from environment variable');
                }
                this._opsSecretLogged = true;
            }
            return envSecret;
        }

        return null;
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
    // Role-based Keypair Resolution
    // ============================================

    /**
     * Get a keypair by role name. Used by TransactionManager for auto-signing in ENV mode.
     * @param {string} role - The wallet role ('ISSUER', 'DISTRIBUTOR', 'TREASURY', 'OPERATIONS')
     * @returns {Keypair} The resolved keypair
     * @throws {Error} In multisig mode for non-Operations roles
     */
    getKeypairForRole(role) {
        return Keypair.fromSecret(this.getSecretKey(role));
    }

    // ============================================
    // Keypair Getters (ENV mode only, or Operations in multisig)
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

    /**
     * Get the next channel keypair from the pool (Round-Robin)
     * @returns {Keypair}
     */
    getNextChannelKeypair() {
        if (this.channels.length === 0) {
            return this.getOperationsKeypair();
        }
        const channel = this.channels[this.currentChannelIndex];
        this.currentChannelIndex = (this.currentChannelIndex + 1) % this.channels.length;
        return channel;
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
                'deposit_relay': [this.getTreasuryPublicKey()],
                'trustline_auth': [this.getIssuerPublicKey()],
                'account_setup': [this.getOperationsPublicKey()],
                'channel_op': this.channels.map(c => c.publicKey()),
                'sale_deploy': [this.getIssuerPublicKey()],
                'sale_create': [this.getIssuerPublicKey()],
                'contract_pause': [this.getIssuerPublicKey()],
                'contract_resume': [this.getIssuerPublicKey()],
                'contract_deposit_auth': [this.getIssuerPublicKey()],
                'contract_deposit_transfer': [this.getIssuerPublicKey()],
                'contract_price': [this.getIssuerPublicKey()],
                'contract_withdraw': [this.getIssuerPublicKey()],
                'contract_freeze': [this.getIssuerPublicKey()],
                'contract_drain': [this.getIssuerPublicKey()],
                'contract_propose_admin': [this.getIssuerPublicKey()],
                'contract_accept_admin': [this.getIssuerPublicKey()],
                'contract_upgrade': [this.getIssuerPublicKey()],
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
            'token_issue': [this.getIssuerPublicKey(), this.getDistributorPublicKey()],
            'token_distribute': [this.getDistributorPublicKey()],
            'freeze_account': [this.getIssuerPublicKey()],
            'clawback': [this.getIssuerPublicKey()],
            'treasury_payment': this.getTreasurySigners(),
            'deposit_relay': [this.getTreasuryPublicKey()],
            'trustline_auth': [this.getIssuerPublicKey()],
            'account_setup': [this.getOperationsPublicKey()],
            'sac_deploy': [this.getIssuerPublicKey()],
            'unlock_token': [this.getIssuerPublicKey()],
            'sale_deploy': [this.getIssuerPublicKey()],
            'sale_create': [this.getIssuerPublicKey()],
            'contract_pause': [this.getIssuerPublicKey()],
            'contract_resume': [this.getIssuerPublicKey()],
            'contract_deposit_auth': [this.getIssuerPublicKey()],
            'contract_deposit_transfer': [this.getIssuerPublicKey()],
            'contract_price': [this.getIssuerPublicKey()],
            'contract_withdraw': [this.getIssuerPublicKey()],
            'contract_freeze': [this.getIssuerPublicKey()],
            'contract_drain': [this.getIssuerPublicKey()],
            'contract_propose_admin': [this.getIssuerPublicKey()],
            'contract_accept_admin': [this.getIssuerPublicKey()],
            'contract_upgrade': [this.getIssuerPublicKey()],
        };

        return defaultMap[operationType] || [this.getOperationsPublicKey()];
    }

    /**
     * Get a mapping of public key → role name for the required signers of an operation.
     * Used by the frontend to display human-readable labels (e.g. "Issuer", "Distributor").
     * @param {string} operationType - Type of operation
     * @returns {Object} Map of { publicKey: roleName }
     */
    getSignerRoles(operationType) {
        const issuer = this.getIssuerPublicKey();
        const distributor = this.getDistributorPublicKey();
        const treasury = this.getTreasuryPublicKey();
        const operations = this.getOperationsPublicKey();

        const keyToRole = {
            [issuer]: 'Issuer',
            [distributor]: 'Distributor',
            [treasury]: 'Treasury',
            [operations]: 'Operations',
        };

        const signers = this.getRequiredSigners(operationType);
        const roles = {};
        for (const signer of signers) {
            roles[signer] = keyToRole[signer] || 'Unknown';
        }
        return roles;
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
            'token_issue': 2,           // Issuer + Distributor (atomic bundled tx needs both)
            'token_distribute': 1,      // Single distributor signature
            'freeze_account': 1,        // Single issuer (compliance action)
            'clawback': 2,              // 2-of-N (requires approval)
            'treasury_payment': 2,      // 2-of-3 for treasury (high value)
            'deposit_relay': 1,         // Auto-forwarding, single Treasury signature
            'dividend_distribution': 2, // 2-of-3 for dividend payments
            'trustline_auth': 1,        // Single issuer
            'account_setup': 1,         // Single operations
            'disable_clawback': 2,      // 2-of-3 consensus (Institutional Requirement)
            'sac_deploy': 1,            // Single issuer
            'unlock_token': 1,          // Single issuer
            'sale_deploy': 1,           // Single issuer (Soroban sale contract deploy)
            'sale_create': 1,           // Single issuer (Soroban sale contract init)
            'contract_pause': 1,        // Day-to-day seller op
            'contract_resume': 1,       // Day-to-day seller op
            'contract_deposit_auth': 1, // Authorize contract trustline
            'contract_deposit_transfer': 1, // Transfer tokens to contract
            'contract_price': 1,        // Day-to-day seller op
            'contract_withdraw': 1,     // Admin withdraws tokens
            'contract_freeze': 1,       // Admin freezes buyer
            'contract_drain': 2,        // DESTRUCTIVE — 2 signers required
            'contract_propose_admin': 1, // Admin proposes transfer
            'contract_accept_admin': 1, // New admin accepts
            'contract_upgrade': 2,      // DESTRUCTIVE — 2 signers required
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

        // In multisig mode, ONLY operations that exclusively use the OPERATIONS
        // hot wallet can bypass multisig. All other roles (ISSUER, DISTRIBUTOR,
        // TREASURY) have their secret keys on hardware wallets / Freighter.
        const opsOnlyOperations = ['account_setup', 'channel_op', 'sponsorship', 'deposit_relay'];
        if (opsOnlyOperations.includes(operationType)) {
            return false;
        }

        // Everything else MUST go through multisig in production
        return true;
    }
}

export const keyManager = new KeyManager();
