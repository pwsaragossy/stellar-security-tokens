import prisma from '../config/prisma.js';
import { TransactionBuilder, Keypair } from '@stellar/stellar-sdk';
import { getNetworkPassphrase, createFreshServer } from '../config/stellar.js';
import logger from '../utils/logger.js';
import { decimalSupplyToStroops, usdcToStroops } from '../utils/stellarAmount.js';

// Scoped logger for this service
const log = logger.scope('MultiSig');
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
        const minutes = this.DEFAULT_EXPIRATION_MINUTES;
        const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

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

        log.info(`Created pending TX #${tx.id} (${operationType}) - requires ${thresholdRequired} of ${requiredSigners.length} signatures`);

        const { broadcast } = await import('../config/pusher.js');
        broadcast('admin-governance', 'new-proposal', {
            id: tx.id,
            operationType,
            description,
            initiatorId
        });

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
        const { statuses = ['pending', 'partially_signed', 'ready'], limit = 50 } = options;

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
            log.error(`Cryptographic verification failed for TX #${txId}: ${verificationError.message}`);
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

        log.info(`TX #${txId}: Signature added from ${publicKey.slice(0, 8)}... (${signatureCount}/${tx.thresholdRequired})`);

        // Broadcast signature update to Pusher
        const { broadcast } = await import('../config/pusher.js');
        broadcast('admin-governance', 'signature-added', {
            id: txId,
            signer: publicKey,
            signatureCount,
            thresholdRequired: tx.thresholdRequired,
            status: newStatus
        });

        // Auto-submit when all signatures are collected
        if (thresholdMet) {
            log.info(`TX #${txId}: All signatures collected — auto-submitting to Stellar...`);
            try {
                const submitResult = await this.submit(txId);
                return {
                    ...updated,
                    signatureCount,
                    thresholdMet,
                    remainingSignatures: 0,
                    autoSubmitted: true,
                    submitResult,
                };
            } catch (submitError) {
                log.error(`TX #${txId}: Auto-submit failed: ${submitError.message}`);
                // Fall through to return the normal result — the admin can retry from UI
            }
        }

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
            const result = await createFreshServer().submitTransaction(transaction);

            // PHASE 2.2: Execute Side Effects (Post-Execution Hooks)
            // This ensures DB state updates only happen after on-chain success
            await this.processEffects(tx, result.hash);

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

            log.info(`TX #${txId} executed successfully: ${result.hash}`);

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

            const failedTx = await prisma.multiSigTransaction.update({
                where: { id: txId },
                data: {
                    status: 'failed',
                    errorMessage,
                    submittedAt: new Date(),
                },
            });

            log.error(`TX #${txId} failed: ${errorMessage}`);

            // Propagate failure to linked records
            await this.processRejectionEffects(failedTx);

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

        log.info(`TX #${txId} rejected: ${reason || 'No reason provided'}`);

        // Propagate rejection to linked records (deposits, investments, etc.)
        await this.processRejectionEffects(updated);

        return updated;
    }

    /**
     * Mark a transaction as expired
     * @param {number} txId - Transaction ID
     * @returns {Promise<Object>} Updated transaction
     */
    static async markExpired(txId) {
        const updated = await prisma.multiSigTransaction.update({
            where: { id: txId },
            data: {
                status: 'expired',
                errorMessage: 'Transaction expired before reaching signature threshold',
            },
        });

        // Propagate expiration to linked records
        const tx = await this.getById(txId);
        if (tx) await this.processRejectionEffects(tx);

        return updated;
    }

    /**
     * Cron job to expire old pending transactions
     * Should be run periodically (e.g., every minute)
     * @returns {Promise<number>} Number of expired transactions
     */
    static async expireOldTransactions() {
        // Fetch candidates BEFORE batch update so we can process their side effects
        const expiring = await prisma.multiSigTransaction.findMany({
            where: {
                status: { in: ['pending', 'partially_signed'] },
                expiresAt: { lt: new Date() },
            },
        });

        if (expiring.length === 0) return 0;

        const result = await prisma.multiSigTransaction.updateMany({
            where: {
                id: { in: expiring.map(tx => tx.id) },
            },
            data: {
                status: 'expired',
                errorMessage: 'Transaction expired before reaching signature threshold',
            },
        });

        log.info(`Expired ${result.count} pending transactions`);

        // Propagate expiration to linked records
        for (const tx of expiring) {
            try {
                await this.processRejectionEffects({ ...tx, errorMessage: 'Transaction expired' });
            } catch (effectError) {
                log.error(`Failed to process expiration effects for TX #${tx.id}: ${effectError.message}`);
            }
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
     * Rebuild a Soroban TX XDR with fresh time bounds and simulation data.
     * Called just-in-time when the frontend fetches XDR for signing.
     * Maps each operation type to its builder function using stored metadata.
     *
     * @param {Object} tx - The stored multisig transaction record
     * @returns {Promise<string|null>} Fresh XDR (base64) or null if rebuild not possible
     */
    static async rebuildSorobanXdr(tx) {
        const metadata = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : tx.metadata || {};
        const { SorobanSaleService } = await import('./sorobanSale.service.js');

        let result;

        switch (tx.operationType) {
            case 'contract_resume':
                result = await SorobanSaleService.buildSetActiveXdr(metadata.contractId, true);
                break;
            case 'contract_pause':
                result = await SorobanSaleService.buildSetActiveXdr(metadata.contractId, false);
                break;
            case 'sale_create': {
                const { keyManager: km } = await import('./KeyManager.js');
                const offer = await prisma.offer.findUnique({
                    where: { id: parseInt(metadata.offerId) },
                    include: { tokens: true, company: true },
                });
                if (!offer) return null;
                const sellToken = offer.tokens?.[0]?.sacContractId;
                const buyToken = process.env.USDC_SAC_CONTRACT_ID;
                if (!sellToken || !buyToken) return null;
                const companyWallet = offer.company?.stellarContractId || offer.company?.stellarPublicKey;
                if (!companyWallet) return null;
                const rules = typeof offer.offerRules === 'string' ? JSON.parse(offer.offerRules) : offer.offerRules || {};
                result = await SorobanSaleService.buildCreateSaleXdr(
                    metadata.contractId,
                    km.getIssuerPublicKey(),
                    {
                        admin: km.getIssuerPublicKey(),
                        seller: km.getIssuerPublicKey(),
                        sellToken,
                        buyToken,
                        treasury: km.getTreasuryPublicKey(),
                        company: companyWallet,
                        fixedFee: usdcToStroops(parseFloat(offer.processingFee) || 5),
                        sellPrice: parseInt(offer.unitPrice * 10000000) || 1,
                        buyPrice: 10000000,
                        deadlineLedger: 0,
                        minBuyAmount: usdcToStroops(rules.min_investment || 0, { allowZero: true }),
                        maxBuyPerBuyer: usdcToStroops(rules.max_investment || 0, { allowZero: true }),
                    }
                );
                break;
            }
            case 'contract_freeze':
                result = await SorobanSaleService.buildFreezeBuyerXdr(
                    metadata.contractId, metadata.buyerAddress, metadata.frozen ?? true
                );
                break;
            case 'contract_withdraw':
                result = await SorobanSaleService.buildWithdrawXdr(
                    metadata.contractId, metadata.tokenAddress, BigInt(metadata.amount)
                );
                break;
            case 'contract_drain':
                result = await SorobanSaleService.buildEmergencyDrainXdr(metadata.contractId);
                break;
            case 'contract_propose_admin':
                result = await SorobanSaleService.buildProposeAdminXdr(metadata.contractId, metadata.newAdmin);
                break;
            case 'contract_accept_admin':
                result = await SorobanSaleService.buildAcceptAdminXdr(metadata.contractId);
                break;
            case 'contract_upgrade':
                result = await SorobanSaleService.buildUpgradeXdr(metadata.contractId, metadata.newWasmHash);
                break;
            case 'contract_price':
                result = await SorobanSaleService.buildUpdatePriceXdr(
                    metadata.contractId, metadata.sellPrice, metadata.buyPrice
                );
                break;
            case 'contract_deposit_auth':
                result = await SorobanSaleService.buildSacAuthorizeXdr(
                    metadata.sacContractId, metadata.contractId, true
                );
                break;
            case 'contract_deposit_transfer':
                result = await SorobanSaleService.buildSacTransferXdr(
                    metadata.sacContractId, metadata.from, metadata.contractId, BigInt(metadata.amount)
                );
                break;
            case 'sale_deploy': {
                const { createHash } = await import('crypto');
                const { keyManager: km2 } = await import('./KeyManager.js');
                const { getSaleWasmHash } = await import('../config/stellar.js');
                const salt = createHash('sha256')
                    .update(`radox:sale:${metadata.offerId}`)
                    .digest();
                result = await SorobanSaleService.buildDeployXdr(
                    km2.getIssuerPublicKey(),
                    getSaleWasmHash(),
                    salt,
                );
                break;
            }
            case 'sac_deploy': {
                const { StellarService: StellarSvc } = await import('./stellar.service.js');
                const { keyManager: km3 } = await import('./KeyManager.js');
                const issuerPk = km3.getIssuerPublicKey();
                const { Asset, Operation } = await import('@stellar/stellar-sdk');
                const { buildTransactionWithAccount } = await import('../utils/stellar.js');
                const asset = new Asset(metadata.assetCode, issuerPk);
                const op = Operation.createStellarAssetContract({ asset, source: issuerPk });
                const account = await StellarSvc.getAccountRPC(issuerPk);
                let sacTx = buildTransactionWithAccount(account, [op]);
                sacTx = await StellarSvc.prepareSorobanTransaction(sacTx);
                return sacTx.toXDR('base64');
            }
            default:
                log.warn(`[rebuildSorobanXdr] No rebuild handler for ${tx.operationType}`);
                return null;
        }

        return result?.xdr || null;
    }

    /**
     * Executes post-transaction side effects (database updates)
     * @param {Object} tx - The executed transaction record
     * @param {string} [txHashOverride] - Hash from submit result (tx.txHash may not be set yet)
     */
    static async processEffects(tx, txHashOverride = null) {
        const { operationType, metadata } = tx;
        const txHash = txHashOverride || tx.txHash;
        log.debug(`Processing effects for TX #${tx.id} (${operationType})`);

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

                    // 2. Deploy SAC (Stellar Asset Contract) for the newly issued asset
                    // issueSecurityToken returns early for multisig, skipping SAC deploy.
                    // We deploy it here after the classic issuance is confirmed on-chain.
                    try {
                        const { StellarService } = await import('./stellar.service.js');
                        log.info(`Deploying SAC for ${metadata.assetCode} after multisig confirmation...`);
                        const sacResult = await StellarService.deploySACForAsset(
                            metadata.assetCode,
                            metadata.issuerPublicKey
                        );
                        if (sacResult.success) {
                            await prisma.token.updateMany({
                                where: { assetCode: metadata.assetCode },
                                data: { sacContractId: sacResult.sacContractId }
                            });
                            log.info(`SAC deployed for ${metadata.assetCode}: ${sacResult.sacContractId}`);
                        } else {
                            log.warn(`SAC deployment failed for ${metadata.assetCode}: ${sacResult.error}. Can be retried via deploySACForAsset.`);
                        }
                    } catch (sacError) {
                        // Non-fatal: Token record exists, SAC can be deployed later
                        // AlreadyInitializedError (code 3) means SAC already exists — also fine
                        log.error(`SAC deployment error for ${metadata.assetCode}: ${sacError.message}. Can be retried via deploySACForAsset.`);
                    }

                    // 3. Auto-verify the offer (keeps status as 'approved', company launches when ready)
                    if (metadata.offerId) {
                        const offer = await prisma.offer.findUnique({
                            where: { id: parseInt(metadata.offerId) }
                        });
                        const currentRules = typeof offer?.offerRules === 'string'
                            ? JSON.parse(offer.offerRules)
                            : offer?.offerRules || {};
                        await prisma.offer.update({
                            where: { id: parseInt(metadata.offerId) },
                            data: {
                                offerRules: {
                                    ...currentRules,
                                    admin_verified: true,
                                    verified_at: new Date().toISOString(),
                                }
                            }
                        });
                        log.info(`Offer #${metadata.offerId} auto-verified after token issuance`);
                    }
                    break;

                case 'sac_deploy':
                    // ─── Sale flow: update Token, auto-verify offer, auto-chain sale_deploy ───
                    if (metadata.autoVerifyOffer && metadata.offerId) {
                        try {
                            // Update token with SAC contract ID
                            if (metadata.sacContractId && metadata.tokenId) {
                                await prisma.token.update({
                                    where: { id: parseInt(metadata.tokenId) },
                                    data: { sacContractId: metadata.sacContractId },
                                });
                                log.info(`[sac_deploy] Updated token #${metadata.tokenId} with SAC ${metadata.sacContractId}`);
                            }

                            // Auto-verify the offer
                            const offer = await prisma.offer.findUnique({
                                where: { id: parseInt(metadata.offerId) },
                            });
                            const currentRules = typeof offer?.offerRules === 'string'
                                ? JSON.parse(offer.offerRules)
                                : offer?.offerRules || {};
                            await prisma.offer.update({
                                where: { id: parseInt(metadata.offerId) },
                                data: {
                                    offerRules: {
                                        ...currentRules,
                                        admin_verified: true,
                                        verified_at: new Date().toISOString(),
                                    },
                                },
                            });
                            log.info(`[sac_deploy] Offer #${metadata.offerId} auto-verified after SAC deploy`);

                            // Auto-chain sale_deploy → eliminates the manual "Activate" click
                            const { OfferService } = await import('./offer.service.js');
                            const _activateResult = await OfferService.activateOffer(parseInt(metadata.offerId));
                            log.info(`[sac_deploy] Auto-chained sale_deploy for offer #${metadata.offerId}`);
                        } catch (verifyErr) {
                            log.error(`[sac_deploy] Auto-chain failed: ${verifyErr.message}`);
                        }
                    }

                    // ─── Legacy: chain distribution if requested ───
                    if (metadata.chainAction === 'token_distribute' && metadata.investorPublicKey) {
                        try {
                            const { StellarService } = await import('./stellar.service.js');
                            log.info(`Chaining token_distribute for ${metadata.assetCode} after SAC deploy (TX #${tx.id})`);
                            const distResult = await StellarService.distributeTokens(
                                metadata.investorPublicKey,
                                metadata.amount,
                                metadata.assetCode,
                                {
                                    memo: metadata.memo || null,
                                    investmentId: metadata.investmentId,
                                    investorName: metadata.investorName,
                                    investorEmail: metadata.investorEmail,
                                    investorPublicKey: metadata.investorPublicKey,
                                    usdcAmount: metadata.usdcAmount,
                                    usdcPaymentHash: metadata.usdcPaymentHash,
                                    offerName: metadata.offerName,
                                    offerId: metadata.offerId,
                                }
                            );

                            if (distResult.status === 'pending_multisig') {
                                log.info(`Chained distribution queued for multisig (TX #${distResult.multiSigTransactionId})`);
                                if (metadata.investmentId) {
                                    const { Investment } = await import('../models/Investment.js');
                                    await Investment.updateStatus(parseInt(metadata.investmentId), {
                                        status: 'pending_distribution',
                                        error_message: JSON.stringify({
                                            multiSigTransactionId: distResult.multiSigTransactionId,
                                            step: 'token_distribute',
                                        }),
                                    });
                                }
                            } else if (distResult.success) {
                                log.info(`Chained distribution completed directly: ${distResult.transactionHash}`);
                                if (metadata.investmentId) {
                                    const { Investment } = await import('../models/Investment.js');
                                    await prisma.tokenDistribution.create({
                                        data: {
                                            investorId: parseInt(metadata.investorId || metadata.investmentId),
                                            assetCode: metadata.assetCode,
                                            amount: metadata.amount,
                                            transactionHash: distResult.transactionHash,
                                            usdcPaymentHash: metadata.usdcPaymentHash || null,
                                            offerId: metadata.offerId ? parseInt(metadata.offerId) : null,
                                            memo: metadata.memo || null,
                                        }
                                    });
                                    await Investment.updateStatus(parseInt(metadata.investmentId), {
                                        status: 'distributed',
                                        distribution_tx_hash: distResult.transactionHash,
                                    });
                                }
                            }
                        } catch (chainError) {
                            log.error(`Failed to chain distribution after SAC deploy TX #${tx.id}: ${chainError.message}`);
                        }
                    }
                    break;

                case 'token_distribute': {
                    // Resolve investorId — may come from metadata or from investment lookup
                    let resolvedInvestorId = metadata.investorId ? parseInt(metadata.investorId) : null;
                    if (!resolvedInvestorId && metadata.investmentId) {
                        const inv = await prisma.investment.findUnique({
                            where: { id: parseInt(metadata.investmentId) },
                            select: { investorId: true },
                        });
                        resolvedInvestorId = inv?.investorId || null;
                    }
                    if (!resolvedInvestorId) {
                        log.error(`token_distribute hook: cannot resolve investorId for TX #${tx.id}`);
                        break;
                    }

                    // Create distribution record
                    await prisma.tokenDistribution.create({
                        data: {
                            investorId: resolvedInvestorId,
                            assetCode: metadata.assetCode,
                            amount: metadata.amount,
                            transactionHash: txHash,
                            usdcPaymentHash: metadata.usdcPaymentHash || null,
                            offerId: metadata.offerId ? parseInt(metadata.offerId) : null,
                            memo: metadata.memo || null,
                        }
                    });

                    // Update related investment if we have enough info
                    if (metadata.investmentId) {
                        try {
                            const { Investment } = await import('../models/Investment.js');
                            await Investment.updateStatus(parseInt(metadata.investmentId), {
                                status: 'distributed',
                                distribution_tx_hash: txHash,
                            });
                            log.info(`Investment #${metadata.investmentId} marked as distributed`);
                        } catch (investError) {
                            log.error(`Failed to update investment #${metadata.investmentId}: ${investError.message}`);
                        }
                    }
                    break;
                }

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
                        log.info(`Recorded ${metadata.payments.length} interest payments for ${txHash}`);
                    }
                    break;

                case 'disable_clawback':
                    // If we had a flag in the DB for this, we would update it here.
                    // Since it's on-chain only, we just log it.
                    log.debug(`Clawback disabled on-chain for ${metadata.investorPublicKey} / ${metadata.assetCode}`);
                    break;



                case 'sale_deploy': {
                    // Step 1 complete: contract deployed on-chain.
                    // Update DB and chain the create() TX.
                    const deployOfferId = parseInt(metadata.offerId);
                    await prisma.offer.update({
                        where: { id: deployOfferId },
                        data: {
                            sorobanContractId: metadata.contractId,
                            sorobanInitStatus: 'deployed',
                            sorobanInitError: null,
                        },
                    });
                    log.info(`[sale_deploy] Contract deployed: ${metadata.contractId} for offer #${deployOfferId}`);

                    // Chain: build the create() TX
                    try {
                        const { SorobanSaleService } = await import('./sorobanSale.service.js');
                        const { TransactionManager } = await import('./transactionManager.service.js');
                        const { keyManager: km } = await import('./KeyManager.js');
                        const { _getUsdcAsset } = await import('../config/stellar.js');

                        const offer = await prisma.offer.findUnique({
                            where: { id: deployOfferId },
                            include: { tokens: true, company: true },
                        });

                        const issuerPub = km.getIssuerPublicKey();
                        const treasuryPub = km.getTreasuryPublicKey();
                        const companyWallet = offer.company?.stellarContractId || offer.company?.stellarPublicKey;
                        if (!companyWallet) {
                            throw new Error(`Company wallet not found for offer #${deployOfferId}`);
                        }
                        const rules = typeof offer.offerRules === 'string'
                            ? JSON.parse(offer.offerRules)
                            : offer.offerRules || {};

                        const sellToken = offer.tokens?.[0]?.sacContractId;
                        if (!sellToken) {
                            throw new Error(`Token SAC not deployed for offer #${deployOfferId}`);
                        }
                        const buyToken = process.env.USDC_SAC_CONTRACT_ID;
                        if (!buyToken) {
                            throw new Error('USDC_SAC_CONTRACT_ID environment variable is required');
                        }

                        // Build the create() XDR
                        const createResult = await SorobanSaleService.buildCreateSaleXdr(
                            metadata.contractId,
                            issuerPub,
                            {
                                admin: issuerPub,
                                seller: issuerPub,
                                sellToken: sellToken,
                                buyToken: buyToken,
                                treasury: treasuryPub,
                                company: companyWallet,
                                fixedFee: usdcToStroops(parseFloat(offer.processingFee) || 5),
                                sellPrice: parseInt(offer.unitPrice * 10000000) || 1,
                                buyPrice: 10000000,
                                deadlineLedger: 0,
                                minBuyAmount: usdcToStroops(rules.min_investment || 0, { allowZero: true }),
                                maxBuyPerBuyer: usdcToStroops(rules.max_investment || 0, { allowZero: true }),
                            }
                        );

                        // Queue for Freighter signing
                        await TransactionManager.submit({
                            xdr: createResult.xdr,
                            operationType: 'sale_create',
                            signingRole: 'ISSUER',
                            metadata: {
                                offerId: deployOfferId,
                                contractId: metadata.contractId,
                                assetCode: metadata.assetCode,
                            },
                            description: `Initialize sale contract for ${metadata.assetCode}`,
                        });

                        log.info(`[sale_deploy] Chained sale_create TX for offer #${deployOfferId}`);
                    } catch (chainError) {
                        log.error(`[sale_deploy] Failed to chain create TX: ${chainError.message}`);
                        await prisma.offer.update({
                            where: { id: deployOfferId },
                            data: {
                                sorobanInitStatus: 'failed',
                                sorobanInitError: `Chain create failed: ${chainError.message}`,
                            },
                        });
                    }
                    break;
                }

                case 'sale_create': {
                    // Step 2 complete: create() executed on-chain.
                    // Verify contract state, extend TTL, activate offer.
                    const createOfferId = parseInt(metadata.offerId);
                    try {
                        const { SorobanSaleService } = await import('./sorobanSale.service.js');

                        // Verify: contract is alive and initialized
                        const version = await SorobanSaleService.getVersion(metadata.contractId);
                        log.info(`[sale_create] Contract ${metadata.contractId} verified, version=${version}`);

                        // Best-effort TTL extension (uses ops account for fees only)
                        try {
                            const { StellarService } = await import('./stellar.service.js');
                            await StellarService.extendContractTTL(metadata.contractId);
                            log.info(`[sale_create] TTL extended for ${metadata.contractId}`);
                        } catch (ttlErr) {
                            log.warn(`[sale_create] TTL extension failed (non-fatal): ${ttlErr.message}`);
                        }

                        // Update DB: mark as fully created (but NOT active yet — contract is still inactive)
                        await prisma.offer.update({
                            where: { id: createOfferId },
                            data: {
                                sorobanInitStatus: 'created',
                                sorobanInitError: null,
                            },
                        });

                        // Chain: deposit tokens into the contract before activation
                        // Flow: sale_create → deposit_auth → deposit_transfer → contract_resume
                        const { TransactionManager } = await import('./transactionManager.service.js');
                        const { keyManager: saleKm } = await import('./KeyManager.js');

                        // Fetch offer to get SAC contract ID and totalSupply for deposit
                        const depositOffer = await prisma.offer.findUnique({
                            where: { id: createOfferId },
                            include: { tokens: true },
                        });
                        const sellToken = depositOffer.tokens?.[0]?.sacContractId;
                        if (!sellToken) {
                            throw new Error(`Token SAC not deployed for offer #${createOfferId}`);
                        }
                        const depositAmount = decimalSupplyToStroops(depositOffer.totalSupply);

                        // Step 1/3: Authorize the sale contract on the SAC
                        const authResult = await SorobanSaleService.buildSacAuthorizeXdr(
                            sellToken, metadata.contractId, true
                        );
                        await TransactionManager.submit({
                            xdr: authResult.xdr,
                            operationType: 'contract_deposit_auth',
                            signingRole: 'ISSUER',
                            metadata: {
                                offerId: createOfferId,
                                contractId: metadata.contractId,
                                sacContractId: sellToken,
                                amount: depositAmount.toString(),
                                assetCode: metadata.assetCode,
                                autoActivateOffer: true,
                                from: saleKm.getIssuerPublicKey(),
                            },
                            description: `Authorize sale contract for ${metadata.assetCode} deposit (1/3: auth)`,
                        });

                        log.info(`[sale_create] Chained deposit_auth TX for offer #${createOfferId}`);
                    } catch (verifyError) {
                        log.error(`[sale_create] Verification failed: ${verifyError.message}`);
                        await prisma.offer.update({
                            where: { id: createOfferId },
                            data: {
                                sorobanInitStatus: 'failed',
                                sorobanInitError: `Verification failed: ${verifyError.message}`,
                            },
                        });
                    }
                    break;
                }

                case 'contract_resume': {
                    // set_active(true) succeeded on-chain.
                    // If this was chained from sale_create, activate the offer in the DB.
                    if (metadata?.autoActivateOffer && metadata?.offerId) {
                        const resumeOfferId = parseInt(metadata.offerId);
                        const { Offer } = await import('../models/Offer.js');
                        await Offer.updateStatus(resumeOfferId, 'active');
                        log.info(`[contract_resume] Offer #${resumeOfferId} activated (contract ${metadata.contractId} is now live)`);
                    }
                    break;
                }

                case 'contract_deposit_auth': {
                    // Step 1 complete: SAC set_authorized(contractAddr, true) succeeded.
                    // Chain Step 2: SAC transfer(issuer → contract, amount).
                    try {
                        const { SorobanSaleService } = await import('./sorobanSale.service.js');
                        const { TransactionManager } = await import('./transactionManager.service.js');
                        const { keyManager: km } = await import('./KeyManager.js');

                        const issuerPub = km.getIssuerPublicKey();
                        const depositAmount = BigInt(metadata.amount);

                        const transferResult = await SorobanSaleService.buildSacTransferXdr(
                            metadata.sacContractId,
                            issuerPub,
                            metadata.contractId,
                            depositAmount,
                        );

                        await TransactionManager.submit({
                            xdr: transferResult.xdr,
                            operationType: 'contract_deposit_transfer',
                            signingRole: 'ISSUER',
                            metadata: {
                                offerId: metadata.offerId,
                                contractId: metadata.contractId,
                                sacContractId: metadata.sacContractId,
                                amount: metadata.amount,
                                assetCode: metadata.assetCode,
                                autoActivateOffer: metadata.autoActivateOffer || false,
                            },
                            description: `Deposit ${metadata.assetCode} to sale contract (2/3: transfer)`,
                        });

                        log.info(`[contract_deposit_auth] Chained transfer TX for offer #${metadata.offerId}`);
                    } catch (chainError) {
                        log.error(`[contract_deposit_auth] Failed to chain transfer TX: ${chainError.message}`);
                    }
                    break;
                }

                case 'contract_deposit_transfer': {
                    // Step 2 complete: tokens deposited into sale contract.
                    // Chain Step 3: activate the contract via set_active(true).
                    if (metadata?.autoActivateOffer && metadata?.contractId) {
                        try {
                            const { SorobanSaleService } = await import('./sorobanSale.service.js');
                            const { TransactionManager } = await import('./transactionManager.service.js');

                            const activateResult = await SorobanSaleService.buildSetActiveXdr(
                                metadata.contractId, true
                            );
                            await TransactionManager.submit({
                                xdr: activateResult.xdr,
                                operationType: 'contract_resume',
                                signingRole: 'ISSUER',
                                metadata: {
                                    offerId: metadata.offerId,
                                    contractId: metadata.contractId,
                                    assetCode: metadata.assetCode,
                                    autoActivateOffer: true,
                                },
                                description: `Activate sale contract for ${metadata.assetCode} (3/3: activate)`,
                            });

                            log.info(`[contract_deposit_transfer] Chained contract_resume for offer #${metadata.offerId}`);
                        } catch (activateError) {
                            log.error(`[contract_deposit_transfer] Failed to chain activation: ${activateError.message}`);
                        }
                    }
                    break;
                }

                default:
                    log.debug(`No post-execution hooks for ${operationType}`);
            }
        } catch (error) {
            log.error(`Hook Error for TX #${tx.id}: ${error.message}`);
            // We catch but don't rethrow to avoid breaking the transaction submission record update
        }
    }

    /**
     * Propagate rejection/expiration/failure to linked domain records.
     * Mirror of processEffects() for the unhappy path.
     * @param {Object} tx - The rejected/expired/failed transaction record
     */
    static async processRejectionEffects(tx) {
        const { operationType, metadata } = tx;
        const reason = tx.errorMessage || 'Transaction rejected/cancelled';
        log.debug(`Processing rejection effects for TX #${tx.id} (${operationType})`);

        try {
            switch (operationType) {
                case 'treasury_payment':
                    // Deposit relay: mark the Deposit as rejected so the investor sees the real status
                    if (metadata?.subtype === 'deposit_relay' && metadata?.depositId) {
                        await prisma.deposit.update({
                            where: { id: metadata.depositId },
                            data: {
                                status: 'rejected',
                                errorMessage: reason,
                                updatedAt: new Date(),
                            }
                        });
                        log.info(`Deposit #${metadata.depositId} → rejected (TX #${tx.id})`);
                    }
                    break;

                case 'token_distribute':
                    if (metadata?.investmentId) {
                        const { Investment } = await import('../models/Investment.js');
                        await Investment.updateStatus(parseInt(metadata.investmentId), {
                            status: 'failed',
                            error_message: reason,
                        });
                        log.info(`Investment #${metadata.investmentId} → failed (TX #${tx.id})`);
                    }
                    break;

                case 'sac_deploy':
                    // Sale flow: clean up orphan Token record + reset offer verification
                    if (metadata?.autoVerifyOffer && metadata?.offerId) {
                        // Delete orphan Token record created before SAC deploy
                        if (metadata.tokenId) {
                            await prisma.token.delete({
                                where: { id: parseInt(metadata.tokenId) },
                            }).catch(() => {}); // Ignore if already deleted
                            log.info(`[sac_deploy rejection] Deleted orphan token #${metadata.tokenId}`);
                        }

                        // Reset offer admin_verified flag
                        const offer = await prisma.offer.findUnique({
                            where: { id: parseInt(metadata.offerId) },
                        });
                        const currentRules = typeof offer?.offerRules === 'string'
                            ? JSON.parse(offer.offerRules)
                            : offer?.offerRules || {};
                        delete currentRules.admin_verified;
                        delete currentRules.verified_at;
                        await prisma.offer.update({
                            where: { id: parseInt(metadata.offerId) },
                            data: { offerRules: currentRules },
                        });
                        log.info(`[sac_deploy rejection] Offer #${metadata.offerId} admin_verified reset`);
                    }

                    // Legacy: fail linked investment if this was chained to a distribution
                    if (metadata?.investmentId) {
                        const { Investment } = await import('../models/Investment.js');
                        await Investment.updateStatus(parseInt(metadata.investmentId), {
                            status: 'failed',
                            error_message: reason,
                        });
                        log.info(`Investment #${metadata.investmentId} (SAC chain) → failed (TX #${tx.id})`);
                    }
                    break;

                case 'sale_deploy':
                case 'sale_create':
                case 'contract_deposit_auth':
                case 'contract_deposit_transfer':
                case 'contract_resume':
                    // Any rejection in the activation chain → mark Soroban init as failed so admin can retry
                    if (metadata?.offerId) {
                        await prisma.offer.update({
                            where: { id: parseInt(metadata.offerId) },
                            data: {
                                sorobanInitStatus: 'failed',
                                sorobanInitError: `${operationType} rejected: ${reason}`,
                            },
                        });
                        log.info(`Offer #${metadata.offerId} Soroban init → failed (${operationType} TX #${tx.id})`);
                    }
                    break;



                default:
                    log.debug(`No rejection hooks for ${operationType}`);
            }
        } catch (error) {
            log.error(`Rejection effect error for TX #${tx.id}: ${error.message}`);
        }
    }
}

export default MultiSigTransactionService;
