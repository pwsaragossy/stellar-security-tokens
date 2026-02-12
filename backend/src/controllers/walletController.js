import {
    stellarServer,
    createFreshServer,
    buildTransaction,
    createAsset,
    getUsdcIssuer,
} from '../config/stellar.js';
import { keyManager } from '../services/KeyManager.js';
import prisma from '../config/prisma.js';
import { TransactionBuilder, Transaction, Networks as StellarNetworks, Operation, Asset } from '@stellar/stellar-sdk';

/**
 * Resolve wallet role name to its public key via KeyManager.
 * Works in both `env` (dev) and `multisig` (prod) modes.
 */
function getWalletPublicKey(walletName) {
    const role = walletName.toUpperCase();
    return keyManager.getPublicKey(role);
}

/**
 * Post-execution hook: runs after a multisig TX is submitted to Stellar.
 * Handles SAC→Distribution chaining and investment completion.
 */
async function runPostExecutionHook(proposal, stellarResult) {
    const { operationType, metadata, txHash } = proposal;
    const meta = metadata || {};

    // ── SAC Deploy completed → auto-queue distribution ──
    if (operationType === 'sac_deploy' && meta.chainAction === 'token_distribute') {
        console.log(`[PostHook] SAC deploy TX #${proposal.id} executed. Chaining distribution for investor ${meta.investorPublicKey}...`);
        const { StellarService } = await import('../services/stellar.service.js');
        try {
            const distResult = await StellarService.distributeTokens(
                meta.investorPublicKey,
                meta.amount,
                meta.assetCode,
                {
                    investorId: meta.investorId,
                    investorName: meta.investorName,
                    investorEmail: meta.investorEmail,
                    investmentId: meta.investmentId,
                    offerId: meta.offerId,
                    offerName: meta.offerName,
                    usdcAmount: meta.usdcAmount,
                    usdcPaymentHash: meta.usdcPaymentHash,
                }
            );
            console.log(`[PostHook] Distribution chained:`, distResult.status || 'submitted', distResult.multiSigTransactionId || distResult.transactionHash);

            // If distribution also went to multisig, update investment with the new TX ID
            if (distResult.status === 'pending_multisig' && meta.investmentId) {
                const { Investment } = await import('../models/Investment.js');
                await Investment.updateStatus(meta.investmentId, {
                    error_message: JSON.stringify({
                        multiSigTransactionId: distResult.multiSigTransactionId,
                        step: 'token_distribute',
                        message: distResult.message,
                    }),
                });
            }
        } catch (distErr) {
            console.error(`[PostHook] Chained distribution failed for investment ${meta.investmentId}:`, distErr);
        }
        return;
    }

    // ── Distribution completed → finalize investment ──
    if (operationType === 'token_distribute' && meta.investmentId) {
        console.log(`[PostHook] Distribution TX #${proposal.id} executed. Completing investment ${meta.investmentId}...`);
        try {
            const { Investment } = await import('../models/Investment.js');
            const { Token } = await import('../models/Token.js');

            // Create distribution record
            await Token.createDistribution({
                investorId: meta.investorId,
                assetCode: meta.assetCode,
                amount: parseFloat(meta.amount),
                transactionHash: txHash,
                usdcPaymentHash: meta.usdcPaymentHash,
                offerId: meta.offerId ? parseInt(meta.offerId) : null,
            });

            // Update investment to distributed
            await Investment.updateStatus(meta.investmentId, {
                status: 'distributed',
                distribution_tx_hash: txHash,
                error_message: null, // Clear the multisig tracking data
            });

            // Send confirmation email
            if (meta.investorEmail) {
                const { EmailService } = await import('../services/email.service.js');
                const investment = await Investment.findById(meta.investmentId);
                if (investment) {
                    await EmailService.sendInvestmentConfirmation(meta.investorEmail, investment, {
                        transactionHash: txHash,
                        assetCode: meta.assetCode,
                        amount: meta.amount,
                    });
                }
            }

            console.log(`[PostHook] Investment ${meta.investmentId} completed. Distribution hash: ${txHash}`);
        } catch (err) {
            console.error(`[PostHook] Failed to complete investment ${meta.investmentId}:`, err);
        }
        return;
    }
}

export const WalletController = {
    /**
     * Get the status and balances of system wallets
     */
    getWalletStatuses: async (req, res) => {
        try {
            const walletRoles = [
                { name: 'Treasury', role: 'TREASURY' },
                { name: 'Issuer', role: 'ISSUER' },
                { name: 'Distributor', role: 'DISTRIBUTOR' },
                { name: 'Operations', role: 'OPERATIONS' },
            ];

            const statuses = await Promise.all(walletRoles.map(async (w) => {
                const publicKey = keyManager.getPublicKey(w.role);
                try {
                    console.log(`[WalletController] Loading ${w.name} account: ${publicKey}`);
                    const account = await createFreshServer().loadAccount(publicKey);
                    console.log(`[WalletController] ${w.name} account loaded successfully`);
                    return {
                        name: w.name,
                        publicKey,
                        balances: account.balances,
                        exists: true,
                    };
                } catch (error) {
                    // Comprehensive 404 detection for different SDK versions
                    const is404 =
                        error.message === 'Not Found' ||
                        (error.response && error.response.status === 404) ||
                        error.name === 'NotFoundError' ||
                        (error.response && error.response.data && error.response.data.status === 404);

                    console.error(`[WalletController] Error loading ${w.name} account:`, error.message);
                    console.log(`[WalletController] Error details - name: ${error.name}, is404: ${is404}`);

                    if (is404) {
                        return {
                            name: w.name,
                            publicKey,
                            exists: false,
                            balances: [],
                        };
                    }
                    // Log the full error for non-404 errors
                    console.error(`[WalletController] ${w.name} full error:`, error);
                    return {
                        name: w.name,
                        publicKey,
                        exists: false,
                        error: `Error loading account: ${error.message}`,
                    };
                }
            }));

            res.status(200).json(statuses);
        } catch (error) {
            console.error('Get Wallet Status Error:', error);
            res.status(500).json({ error: 'Failed to fetch wallet statuses' });
        }
    },

    /**
     * Create a new MultiSig Transaction Proposal
     */
    createTransactionProposal: async (req, res) => {
        try {
            const { sourceWallet, destination, amount, assetCode, memo, description } = req.body;
            const adminId = req.user.id;

            // Resolve source wallet to public key only (no secret key needed for proposal building)
            let sourcePublicKey;
            const validWallets = ['treasury', 'issuer', 'distributor'];
            if (!validWallets.includes(sourceWallet.toLowerCase())) {
                return res.status(400).json({ error: 'Invalid source wallet' });
            }
            sourcePublicKey = getWalletPublicKey(sourceWallet);

            // Check if source account exists and get fresh sequence from RPC
            let sourceAccount;
            try {
                // Use RPC for sequence number safety (Hybrid Pattern)
                const { StellarService } = await import('../services/stellar.service.js');
                sourceAccount = await StellarService.getAccountRPC(sourcePublicKey);
            } catch (e) {
                console.warn('[WalletController] RPC fetch failed, falling back to Horizon check:', e.message);
                try {
                    sourceAccount = await stellarServer.loadAccount(sourcePublicKey);
                } catch (innerError) {
                    return res.status(400).json({ error: 'Source wallet not found on network' });
                }
            }

            // Build Transaction
            let transaction;

            // Check if destination is a Soroban Contract (C...) or Classic Account (G...)
            if (destination.startsWith('C')) {
                // Handle Soroban SAC Transfer
                if (assetCode !== 'XLM') {
                    return res.status(400).json({ error: 'Only XLM transfers supported for smart wallets currently' });
                }

                const xlmSacContractId = process.env.XLM_SAC_CONTRACT_ID;
                if (!xlmSacContractId) {
                    return res.status(500).json({ error: 'XLM_SAC_CONTRACT_ID not configured' });
                }

                // Dynamic import for strict Soroban support
                const { Contract, nativeToScVal, rpc } = await import('@stellar/stellar-sdk');
                const xlmSac = new Contract(xlmSacContractId);
                const amountStroops = BigInt(Math.floor(parseFloat(amount) * 10_000_000));

                const transferOp = xlmSac.call(
                    'transfer',
                    nativeToScVal(sourcePublicKey, { type: 'address' }),
                    nativeToScVal(destination, { type: 'address' }),
                    nativeToScVal(amountStroops, { type: 'i128' })
                );

                // Build initial transaction
                let tx = new TransactionBuilder(sourceAccount, {
                    fee: '100000', // Higher fee for Soroban
                    networkPassphrase: process.env.STELLAR_NETWORK === 'public' ? StellarNetworks.PUBLIC : StellarNetworks.TESTNET,
                })
                    .addOperation(transferOp)
                    .setTimeout(24 * 60 * 60) // 24 hours for multisig
                    .build();

                // Simulate to get footprint
                const sorobanRpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
                const server = new rpc.Server(sorobanRpcUrl, { allowHttp: true });

                const simResult = await server.simulateTransaction(tx);

                if (rpc.Api.isSimulationError(simResult)) {
                    throw new Error(`Simulation failed: ${simResult.error}`);
                }

                // Assemble with footprint
                transaction = rpc.assembleTransaction(tx, simResult).build();

            } else {
                // Classic Operations
                let operation;

                switch (req.body.operationType) {
                    case 'freeze_account':
                        operation = Operation.setTrustLineFlags({
                            trustor: destination,
                            asset: createAsset(assetCode, keyManager.getPublicKey('ISSUER')),
                            clearFlags: 1, // AUTHORIZED_FLAG = 1
                        });
                        break;
                    case 'unfreeze_account':
                        operation = Operation.setTrustLineFlags({
                            trustor: destination,
                            asset: createAsset(assetCode, keyManager.getPublicKey('ISSUER')),
                            setFlags: 1, // AUTHORIZED_FLAG = 1
                        });
                        break;
                    case 'clawback':
                        operation = Operation.clawback({
                            asset: createAsset(assetCode, keyManager.getPublicKey('ISSUER')),
                            from: destination,
                            amount: amount.toString(),
                        });
                        break;
                    case 'disable_clawback':
                        operation = Operation.setTrustLineFlags({
                            trustor: destination,
                            asset: createAsset(assetCode, keyManager.getPublicKey('ISSUER')),
                            clearFlags: 4, // AuthClawbackEnabledFlag = 4
                        });
                        break;
                    default:
                        // Default to payment if no operationType is specified (backwards compatibility)
                        let paymentAsset;
                        if (!assetCode || assetCode === 'XLM') {
                            paymentAsset = Asset.native();
                        } else if (assetCode === 'USDC') {
                            paymentAsset = new Asset('USDC', getUsdcIssuer());
                        } else {
                            return res.status(400).json({ error: `Unsupported asset: ${assetCode}. Use XLM or USDC.` });
                        }

                        operation = Operation.payment({
                            destination: destination,
                            asset: paymentAsset,
                            amount: amount.toString(),
                        });
                }

                let txBuilder = new TransactionBuilder(sourceAccount, {
                    fee: '100', // Base fee
                    networkPassphrase: process.env.STELLAR_NETWORK === 'public' ? StellarNetworks.PUBLIC : StellarNetworks.TESTNET,
                })
                    .addOperation(operation)
                    .setTimeout(24 * 60 * 60); // 24 hours for multisig

                // Add memo if provided
                if (memo && memo.trim()) {
                    const { Memo } = await import('@stellar/stellar-sdk');
                    txBuilder = txBuilder.addMemo(Memo.text(memo.trim().substring(0, 28)));
                }

                transaction = txBuilder.build();
            }

            const xdr = transaction.toEnvelope().toXDR('base64');

            // Determine required signers based on key management mode
            // In dev mode (KEY_MANAGEMENT_MODE=env), the source wallet's public key is the signer
            const requiredSigners = [sourcePublicKey];
            const thresholdRequired = 1;

            const proposal = await prisma.multiSigTransaction.create({
                data: {
                    xdr,
                    description,
                    initiatorId: adminId,
                    status: 'pending',
                    requiredSigners,
                    thresholdRequired,
                    networkPassphrase: process.env.STELLAR_NETWORK === 'public' ? 'Public Global Stellar Network ; September 2015' : 'Test SDF Network ; September 2015',
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
                }
            });

            res.status(201).json(proposal);
        } catch (error) {
            console.error('Create Proposal Error:', error);
            res.status(500).json({ error: 'Failed to create transaction proposal' });
        }
    },

    /**
     * List Transaction Proposals
     */
    getTransactionProposals: async (req, res) => {
        try {
            const { status, limit = 10, offset = 0 } = req.query;
            const where = {};

            if (status) where.status = status;

            const proposals = await prisma.multiSigTransaction.findMany({
                where,
                take: parseInt(limit),
                skip: parseInt(offset),
                include: { initiator: true },
                orderBy: { createdAt: 'desc' },
            });

            // Prisma doesn't return count with findMany like Sequelize findAndCountAll
            // We can run a separate count or just return rows
            const total = await prisma.multiSigTransaction.count({ where });

            res.status(200).json({ rows: proposals, count: total });
        } catch (error) {
            console.error('List Proposals Error:', error);
            res.status(500).json({ error: 'Failed to fetch proposals' });
        }
    },

    /**
     * Submit a signed transaction (Simulation/Execution)
     */
    signAndSubmitProposal: async (req, res) => {
        try {
            const { id } = req.params;
            const { signedXDR } = req.body;

            const proposal = await prisma.multiSigTransaction.findUnique({ where: { id: parseInt(id) } });

            if (!proposal) {
                return res.status(404).json({ error: 'Proposal not found' });
            }

            const transaction = new Transaction(signedXDR, process.env.STELLAR_NETWORK === 'public' ? StellarNetworks.PUBLIC : StellarNetworks.TESTNET);

            // Verify thresholds if it's a known multisig transaction
            if (proposal.requiredSigners && proposal.requiredSigners.length > 0) {
                const signatureCount = transaction.signatures.length;
                if (signatureCount < proposal.thresholdRequired) {
                    return res.status(400).json({
                        error: `Insufficient signatures. Collected: ${signatureCount}, Required: ${proposal.thresholdRequired}`
                    });
                }
            }

            try {
                const result = await stellarServer.submitTransaction(transaction);

                const updatedProposal = await prisma.multiSigTransaction.update({
                    where: { id: parseInt(id) },
                    data: {
                        status: 'executed',
                        txHash: result.hash,
                        ledger: result.ledger,
                        xdr: signedXDR,
                        submittedAt: new Date()
                    },
                    select: { id: true, operationType: true, metadata: true, txHash: true }
                });

                // Post-execution hook — runs async, doesn't block the response
                runPostExecutionHook(updatedProposal, result).catch(err => {
                    console.error(`[WalletController] Post-execution hook failed for TX #${updatedProposal.id}:`, err);
                });

                res.status(200).json({ success: true, result });
            } catch (submitError) {
                console.error('Stellar Submission Error:', submitError);

                await prisma.multiSigTransaction.update({
                    where: { id: parseInt(id) },
                    data: {
                        status: 'failed',
                        errorMessage: submitError.message
                    }
                });

                res.status(400).json({ success: false, error: submitError.message });
            }

        } catch (error) {
            console.error('Submit Proposal Error:', error);
            res.status(500).json({ error: 'Failed to submit proposal' });
        }
    },

    /**
     * Sign a transaction with system keys (Development Only)
     */
    adminSignTransaction: async (req, res) => {
        try {
            // Guard: Only allow in development
            if (process.env.NODE_ENV !== 'development' && process.env.ENABLE_DEV_LOGIN !== 'true') {
                return res.status(403).json({
                    success: false,
                    error: 'Admin signing is only available in development mode',
                });
            }

            const { xdr, publicKey } = req.body;

            if (!xdr || !publicKey) {
                return res.status(400).json({ success: false, error: 'XDR and publicKey are required' });
            }

            // Identify which system account it is
            const { keyManager } = await import('../services/KeyManager.js');
            const roles = ['ISSUER', 'DISTRIBUTOR', 'TREASURY', 'OPERATIONS'];
            let secretKey = null;

            for (const role of roles) {
                try {
                    if (keyManager.getPublicKey(role) === publicKey) {
                        secretKey = keyManager.getSecretKey(role);
                        break;
                    }
                } catch (e) {
                    // Ignore errors for unconfigured roles
                }
            }

            if (!secretKey) {
                return res.status(400).json({
                    success: false,
                    error: 'Public key does not match any system wallets in .env'
                });
            }

            const { TransactionBuilder, Keypair } = await import('@stellar/stellar-sdk');
            const { getNetworkPassphrase } = await import('../config/stellar.js');

            const keypair = Keypair.fromSecret(secretKey);
            const tx = TransactionBuilder.fromXDR(xdr, getNetworkPassphrase());

            // Sign the transaction
            tx.sign(keypair);

            res.json({
                success: true,
                signedXdr: tx.toXDR()
            });
        } catch (error) {
            console.error('[WalletController] Admin signing error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to sign transaction'
            });
        }
    }
};
