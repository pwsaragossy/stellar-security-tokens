import {
    getTreasuryKeypair,
    getIssuerKeypair,
    getDistributorKeypair,
    stellarServer,
    buildTransaction,
    createAsset,
} from '../config/stellar.js';
import prisma from '../config/prisma.js';
import { TransactionBuilder, Transaction, Networks as StellarNetworks, Operation, Asset } from '@stellar/stellar-sdk';

export const WalletController = {
    /**
     * Get the status and balances of system wallets
     */
    getWalletStatuses: async (req, res) => {
        try {
            const wallets = [
                { name: 'Treasury', keypair: getTreasuryKeypair() },
                { name: 'Issuer', keypair: getIssuerKeypair() },
                { name: 'Distributor', keypair: getDistributorKeypair() },
            ];

            const statuses = await Promise.all(wallets.map(async (w) => {
                try {
                    const account = await stellarServer.loadAccount(w.keypair.publicKey());
                    return {
                        name: w.name,
                        publicKey: w.keypair.publicKey(),
                        balances: account.balances,
                        exists: true,
                    };
                } catch (error) {
                    console.error(`[WalletController] Error loading ${w.name} account:`, error.message);
                    if (error.response && error.response.status === 404) {
                        return {
                            name: w.name,
                            publicKey: w.keypair.publicKey(),
                            exists: false,
                            balances: [],
                        };
                    }
                    // Log the full error for non-404 errors
                    console.error(`[WalletController] ${w.name} full error:`, error);
                    return {
                        name: w.name,
                        publicKey: w.keypair.publicKey(),
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
            const { sourceWallet, destination, amount, assetCode, description } = req.body;
            const adminId = req.user.id;

            let sourceKeypair;
            switch (sourceWallet.toLowerCase()) {
                case 'treasury': sourceKeypair = getTreasuryKeypair(); break;
                case 'issuer': sourceKeypair = getIssuerKeypair(); break;
                case 'distributor': sourceKeypair = getDistributorKeypair(); break;
                default: return res.status(400).json({ error: 'Invalid source wallet' });
            }

            // Check if source account exists
            let sourceAccount;
            try {
                sourceAccount = await stellarServer.loadAccount(sourceKeypair.publicKey());
            } catch (e) {
                return res.status(400).json({ error: 'Source wallet not found on network' });
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
                    nativeToScVal(sourceKeypair.publicKey(), { type: 'address' }),
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
                            asset: createAsset(assetCode, getIssuerKeypair().publicKey()),
                            clearFlags: 1, // AUTHORIZED_FLAG = 1
                        });
                        break;
                    case 'unfreeze_account':
                        operation = Operation.setTrustLineFlags({
                            trustor: destination,
                            asset: createAsset(assetCode, getIssuerKeypair().publicKey()),
                            setFlags: 1, // AUTHORIZED_FLAG = 1
                        });
                        break;
                    case 'clawback':
                        operation = Operation.clawback({
                            asset: createAsset(assetCode, getIssuerKeypair().publicKey()),
                            from: destination,
                            amount: amount.toString(),
                        });
                        break;
                    case 'disable_clawback':
                        operation = Operation.setTrustLineFlags({
                            trustor: destination,
                            asset: createAsset(assetCode, getIssuerKeypair().publicKey()),
                            clearFlags: 4, // AuthClawbackEnabledFlag = 4
                        });
                        break;
                    default:
                        // Default to payment if no operationType is specified (backwards compatibility)
                        if (assetCode !== 'XLM') {
                            return res.status(400).json({ error: 'Only XLM transfers supported currently' });
                        }

                        operation = Operation.payment({
                            destination: destination,
                            asset: Asset.native(),
                            amount: amount.toString(),
                        });
                }

                transaction = new TransactionBuilder(sourceAccount, {
                    fee: '100', // Base fee
                    networkPassphrase: process.env.STELLAR_NETWORK === 'public' ? StellarNetworks.PUBLIC : StellarNetworks.TESTNET,
                })
                    .addOperation(operation)
                    .setTimeout(24 * 60 * 60) // 24 hours for multisig
                    .build();
            }

            const xdr = transaction.toEnvelope().toXDR('base64');

            const proposal = await prisma.multiSigTransaction.create({
                data: {
                    xdr,
                    description,
                    initiatorId: adminId,
                    status: 'pending',
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
                    }
                });

                res.status(200).json({ success: true, result });
            } catch (submitError) {
                console.error('Stellar Submission Error:', submitError);

                await prisma.multiSigTransaction.update({
                    where: { id: parseInt(id) },
                    data: {
                        errorMessage: submitError.message
                        // Don't mark as failed immediately if it's just a bad signature?
                        // But for simulation, let's keep it pending or mark as failed?
                        // Let's keep pending but log error
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
