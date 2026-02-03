import prisma from '../config/prisma.js';
import { StellarService } from './stellar.service.js';
import { Asset, Operation, TransactionBuilder, Networks, Keypair } from '@stellar/stellar-sdk';
import crypto from 'crypto';

export class DepositRelayService {
    static MEMO_PREFIX = 'DEP-';
    static EXPIRE_MINUTES = 60 * 24; // 24 hours

    /**
     * Initiate a new deposit request
     * @param {number} investorId 
     * @param {number} expectedAmount (optional)
     * @returns {Promise<Object>} The created deposit record
     */
    static async initiateDeposit(investorId, expectedAmount = null) {
        const investor = await prisma.investor.findUnique({
            where: { id: investorId }
        });

        if (!investor) {
            throw new Error('Investor not found');
        }

        // Generate a unique memo for this deposit
        // Format: DEP-<8 random hex chars> (total ~12 chars)
        // Stellar Text Memo limit is 28 chars.
        const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
        const memo = `${this.MEMO_PREFIX}${randomSuffix}`;

        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + this.EXPIRE_MINUTES);

        const deposit = await prisma.deposit.create({
            data: {
                investorId: investor.id,
                memo,
                expectedAmount,
                status: 'pending',
                expiresAt
            }
        });

        return {
            ...deposit,
            treasuryAddress: process.env.TREASURY_PUBLIC_KEY
        };
    }

    /**
     * Process a received payment matching a deposit memo
     * @param {string} memoText 
     * @param {string} amount 
     * @param {string} txHash 
     * @param {string} assetCode - 'XLM' or 'USDC'
     */
    static async handleIncomingPayment(memoText, amount, txHash, assetCode = 'USDC') {
        console.log(`[DepositRelay] Processing incoming payment: ${amount} ${assetCode}, memo: ${memoText}, tx: ${txHash}`);

        const deposit = await prisma.deposit.findUnique({
            where: { memo: memoText },
            include: { investor: true }
        });

        if (!deposit) {
            console.warn(`[DepositRelay] No pending deposit found for memo ${memoText}`);
            return;
        }

        if (deposit.status !== 'pending' && deposit.status !== 'received') {
            console.warn(`[DepositRelay] Deposit ${deposit.id} is in status ${deposit.status}, skipping.`);
            return;
        }

        // Update status to received
        await prisma.deposit.update({
            where: { id: deposit.id },
            data: {
                status: 'received',
                actualAmount: amount,
                incomingTxHash: txHash,
                updatedAt: new Date()
            }
        });

        // Start forwarding process with the correct asset
        await this.forwardAsset(deposit.id, assetCode);
    }

    /**
     * Forward asset (XLM or USDC) to the investor's smart wallet
     * Uses withdrawFromTreasury since funds were deposited to Treasury
     * @param {number} depositId 
     * @param {string} assetCode - 'XLM' or 'USDC'
     */
    static async forwardAsset(depositId, assetCode = 'USDC') {
        const deposit = await prisma.deposit.findUnique({
            where: { id: depositId },
            include: { investor: true }
        });

        if (!deposit || deposit.status !== 'received') return;

        try {
            await prisma.deposit.update({
                where: { id: depositId },
                data: { status: 'forwarding' }
            });

            const destination = deposit.investor.stellarContractId;
            console.log(`[DepositRelay] Forwarding ${deposit.actualAmount} ${assetCode} to ${destination}`);

            // Use withdrawFromTreasury since the funds were deposited to Treasury
            // This method handles both XLM (native) and USDC correctly
            const txResult = await StellarService.withdrawFromTreasury(
                destination,
                deposit.actualAmount,
                assetCode,
                `Deposit relay ${deposit.memo}`
            );

            // Handle multisig pending case
            if (txResult.status === 'pending_multisig') {
                await prisma.deposit.update({
                    where: { id: depositId },
                    data: {
                        status: 'pending_approval',
                        updatedAt: new Date()
                    }
                });
                console.log(`[DepositRelay] Deposit ${depositId} requires multisig approval.`);
                return;
            }

            if (!txResult.success) {
                throw new Error(txResult.error || 'Unknown error during forwarding');
            }

            await prisma.deposit.update({
                where: { id: depositId },
                data: {
                    status: 'completed',
                    outgoingTxHash: txResult.hash,
                    updatedAt: new Date()
                }
            });

            console.log(`[DepositRelay] Deposit ${depositId} completed successfully. Hash: ${txResult.hash}`);

        } catch (error) {
            console.error(`[DepositRelay] Failed to forward ${assetCode} for deposit ${depositId}:`, error);

            await prisma.deposit.update({
                where: { id: depositId },
                data: {
                    status: 'failed',
                    errorMessage: error.message,
                    updatedAt: new Date()
                }
            });
        }
    }

    /**
     * Get all deposits for an investor
     * @param {number} investorId 
     */
    static async getInvestorDeposits(investorId) {
        return prisma.deposit.findMany({
            where: { investorId },
            orderBy: { createdAt: 'desc' }
        });
    }
}
