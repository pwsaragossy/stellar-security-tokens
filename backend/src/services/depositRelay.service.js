import prisma from '../config/prisma.js';
import { StellarService } from './stellar.service.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

// Scoped logger for this service
const log = logger.scope('DepositRelay');
export class DepositRelayService {
    static MEMO_PREFIX = 'DEP';


    /**
     * Initiate a new deposit request
     * Generate deposit instructions for an investor (read-only, no DB record).
     * The deposit record is only created when actual payment arrives via handleIncomingPayment.
     * @param {number} investorId 
     * @returns {Promise<Object>} Deposit instructions (memo + treasury address)
     */
    static async initiateDeposit(investorId) {
        const investor = await prisma.investor.findUnique({
            where: { id: investorId }
        });

        if (!investor) {
            throw new Error('Investor not found');
        }

        // Deterministic memo from investor ID — always the same for this investor
        const hash = crypto.createHash('sha256').update(`investor-${investorId}`).digest('hex');
        const memo = `${this.MEMO_PREFIX}${hash.substring(0, 4).toUpperCase()}`;

        return {
            memo,
            treasuryAddress: process.env.TREASURY_PUBLIC_KEY,
            status: 'ready', // UI hint: instructions are ready, no payment yet
        };
    }

    /**
     * Compute the deterministic memo for an investor (utility).
     * @param {number} investorId 
     * @returns {string} The memo string
     */
    static computeMemo(investorId) {
        const hash = crypto.createHash('sha256').update(`investor-${investorId}`).digest('hex');
        return `${this.MEMO_PREFIX}${hash.substring(0, 4).toUpperCase()}`;
    }

    /**
     * Process a received payment matching a deposit memo.
     * Creates the deposit record on first payment — no pre-creation needed.
     * @param {string} memoText 
     * @param {string} amount 
     * @param {string} txHash 
     * @param {string} assetCode - 'XLM' or 'USDC'
     */
    static async handleIncomingPayment(memoText, amount, txHash, assetCode = 'USDC') {
        log.info(`Processing incoming payment: ${amount} ${assetCode}, memo: ${memoText}, tx: ${txHash}`);

        // Find existing deposit by memo, or determine the investor from the memo
        let deposit = await prisma.deposit.findUnique({
            where: { memo: memoText },
            include: { investor: true }
        });

        if (deposit && deposit.status === 'completed') {
            log.warn(`Deposit ${deposit.id} is already completed, skipping duplicate payment.`);
            return;
        }

        // No deposit record exists yet — this is the first payment. Create it.
        if (!deposit) {
            // Reverse-lookup: find investor whose deterministic memo matches
            const investors = await prisma.investor.findMany();
            const matchingInvestor = investors.find(inv => {
                const expectedMemo = this.computeMemo(inv.id);
                return expectedMemo === memoText;
            });

            if (!matchingInvestor) {
                log.warn(`No investor found for memo ${memoText} — ignoring payment.`);
                return;
            }

            deposit = await prisma.deposit.create({
                data: {
                    investorId: matchingInvestor.id,
                    memo: memoText,
                    status: 'received',
                    actualAmount: amount,
                    incomingTxHash: txHash,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
                },
                include: { investor: true }
            });

            log.info(`Created deposit record ${deposit.id} for investor ${matchingInvestor.id}`);
        } else {
            // Existing deposit — update with new payment
            if (deposit.status !== 'pending' && deposit.status !== 'received') {
                log.info(`Deposit ${deposit.id} was in '${deposit.status}' — new payment received, resetting to 'received'.`);
            }

            await prisma.deposit.update({
                where: { id: deposit.id },
                data: {
                    status: 'received',
                    actualAmount: amount,
                    incomingTxHash: txHash,
                    updatedAt: new Date()
                }
            });
        }

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
            log.info(`Forwarding ${deposit.actualAmount} ${assetCode} to ${destination}`);

            // Use withdrawFromTreasury since the funds were deposited to Treasury
            // This method handles both XLM (native) and USDC correctly
            const investor = deposit.investor;
            const txResult = await StellarService.withdrawFromTreasury(
                destination,
                deposit.actualAmount,
                assetCode,
                `Deposit relay: ${investor?.name || 'Investor'} — ${deposit.actualAmount} ${assetCode} (${deposit.memo})`,
                {
                    subtype: 'deposit_relay',
                    depositId: deposit.id,
                    depositMemo: deposit.memo,
                    investorName: investor?.name,
                    investorEmail: investor?.email,
                    investorId: investor?.id,
                },
                'deposit_relay' // Bypass multisig — auto-forward with single Treasury signature
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
                log.info(`Deposit ${depositId} requires multisig approval.`);
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

            log.info(`Deposit ${depositId} completed successfully. Hash: ${txResult.hash}`);

        } catch (error) {
            log.error(`Failed to forward ${assetCode} for deposit ${depositId}:`, error);

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
