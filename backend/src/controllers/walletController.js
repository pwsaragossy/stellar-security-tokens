
import {
    getTreasuryKeypair,
    getIssuerKeypair,
    getDistributorKeypair,
    stellarServer,
    buildTransaction,
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
                    if (error.response && error.response.status === 404) {
                        return {
                            name: w.name,
                            publicKey: w.keypair.publicKey(),
                            exists: false,
                            balances: [],
                        };
                    }
                    return {
                        name: w.name,
                        publicKey: w.keypair.publicKey(),
                        exists: false,
                        error: 'Error loading account',
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
                    .setTimeout(180)
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
                // Classic Payment (G...)
                if (assetCode !== 'XLM') {
                    return res.status(400).json({ error: 'Only XLM transfers supported currently' });
                }

                const paymentOp = Operation.payment({
                    destination: destination,
                    asset: Asset.native(),
                    amount: amount.toString(),
                });

                transaction = new TransactionBuilder(sourceAccount, {
                    fee: '100', // Base fee
                    networkPassphrase: process.env.STELLAR_NETWORK === 'public' ? StellarNetworks.PUBLIC : StellarNetworks.TESTNET,
                })
                    .addOperation(paymentOp)
                    .setTimeout(180)
                    .build();
            }

            const xdr = transaction.toEnvelope().toXDR('base64');

            const proposal = await prisma.multiSigTransaction.create({
                data: {
                    xdr,
                    description,
                    initiatorId: adminId,
                    status: 'pending',
                    network: process.env.STELLAR_NETWORK || 'testnet',
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
                include: { initiator: { select: { name: true, email: true } } },
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

            if (proposal.status !== 'pending') {
                return res.status(400).json({ error: 'Transaction already executed or rejected' });
            }

            // TODO: Verify signatures meet threshold
            // For now, we assume if an admin sends "signedXDR", they have signed it.
            // Since we are simulating, we just try to submit.

            const transaction = new Transaction(signedXDR, process.env.STELLAR_NETWORK === 'public' ? StellarNetworks.PUBLIC : StellarNetworks.TESTNET);

            try {
                const result = await stellarServer.submitTransaction(transaction);

                const updatedProposal = await prisma.multiSigTransaction.update({
                    where: { id: parseInt(id) },
                    data: {
                        status: 'executed',
                        hash: result.hash,
                        xdr: signedXDR, // Updated with signatures
                        thresholdMet: true
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
    }
};
