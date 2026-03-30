/**
 * Company Payment Service
 * Handles company-to-investor payment calculations and processing
 */
import prisma from '../config/prisma.js';
import { StellarService } from './stellar.service.js';
import { PaymentService } from './payment.service.js';
import { EmailService } from './email.service.js';
import { AlertService } from './alert.service.js';

import { MultiSigTransactionService } from './multiSigTransaction.service.js';
import { Keypair, Asset, Operation, TransactionBuilder, Networks } from '@stellar/stellar-sdk';
import { getUsdcIssuer } from '../config/stellar.js';
import { keyManager } from './KeyManager.js';
import logger from '../utils/logger.js';

// Scoped logger for this service
const log = logger.scope('CompanyPayment');
// Configuration
// Platform fee is handled on-chain in the Soroban trade() contract (fixed_fee field, v5+)
// Yield spread: company pays annualInterestRate, investor receives investorRate.
// Spread (company rate - investor rate) → platform treasury revenue.
// When investorRate is null: no spread, investor gets full company rate.
const LATE_FEE_PERCENT_PER_DAY = 0;    // Disabled for MVP — no legal framework yet
const GRACE_PERIOD_DAYS = 10;
const DEFAULT_FEE_PERCENT = 0;         // Disabled for MVP — no legal framework yet

const USDC_ASSET_CODE = 'USDC';
const USDC_ISSUER = getUsdcIssuer();

/**
 * Company Payment Service
 * Responsible for:
 * - Calculating owed amounts for offers
 * - Processing token sale fee distribution
 * - Creating payment transactions for company signature
 * - Tracking payment status and reminders
 */
export class CompanyPaymentService {

    /**
     * Calculate the current payment owed for an offer
     * @param {number} offerId - Offer ID
     * @returns {Promise<Object>} Payment details
     */
    static async calculateOwedAmount(offerId) {
        const offer = await prisma.offer.findUnique({
            where: { id: offerId },
            include: {
                investments: {
                    where: { status: 'distributed' },
                    include: { investor: true }
                },
                interestPayments: {
                    orderBy: { paymentDate: 'desc' },
                    take: 1
                }
            }
        });

        if (!offer) {
            throw new Error(`Offer ${offerId} not found`);
        }

        // For unlocked tokens, use on-chain balances instead of DB investment records
        // This ensures accurate interest calculations when tokens have been traded on DEXes
        if (offer.isTokenLocked === false) {
            return this._calculateOwedAmountOnChain(offer);
        }

        // Calculate total tokens distributed (USDC invested)
        const totalInvested = offer.investments.reduce(
            (sum, inv) => sum + parseFloat(inv.usdcAmount),
            0
        );

        if (totalInvested === 0) {
            return {
                offerId,
                totalOwed: 0,
                investorCount: 0,
                paymentType: offer.paymentType,
                nextPaymentDue: offer.nextPaymentDue,
                breakdown: [],
                balanceSource: 'database'
            };
        }

        const annualRate = parseFloat(offer.annualInterestRate || 0);
        // Use investorRate for payouts; fall back to annualRate if null (no spread)
        const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
        const periodsPerYear = this.getPeriodsPerYear(offer.paymentType);
        const periodRate = effectiveInvestorRate / 100 / periodsPerYear;

        // Calculate per-investor owed amounts
        const breakdown = offer.investments.map(inv => {
            const investedAmount = parseFloat(inv.usdcAmount);
            const interestOwed = investedAmount * periodRate;

            return {
                investorId: inv.investorId,
                investorName: inv.investor.name,
                investorWallet: inv.investor.stellarContractId || inv.investor.stellarPublicKey,
                tokenBalance: investedAmount, // For locked tokens, invested = balance
                interestOwed: Math.round(interestOwed * 100) / 100, // Round to cents
            };
        });

        const totalOwed = breakdown.reduce((sum, b) => sum + b.interestOwed, 0);

        return {
            offerId,
            assetCode: offer.assetCode,
            offerName: offer.offerName,
            totalInvested,
            totalOwed: Math.round(totalOwed * 100) / 100,
            investorCount: breakdown.length,
            paymentType: offer.paymentType,
            annualInterestRate: annualRate,
            periodRate: periodRate * 100, // As percentage
            nextPaymentDue: offer.nextPaymentDue,
            lastPaymentDate: offer.lastPaymentDate,
            paymentDueStatus: offer.paymentDueStatus,
            balanceSource: 'database',
            breakdown
        };
    }

    /**
     * Calculate owed amount using on-chain token balances (for unlocked tokens)
     * @param {Object} offer - Offer object with investments included
     * @returns {Promise<Object>} Payment details based on on-chain holdings
     * @private
     */
    static async _calculateOwedAmountOnChain(offer) {
        try {
            // Use PaymentService to get on-chain balances via Soroban RPC
            const investorsWithBalances = await PaymentService.getInvestorsWithBalancesByOffer(offer.id);

            if (!investorsWithBalances || investorsWithBalances.length === 0) {
                return {
                    offerId: offer.id,
                    totalOwed: 0,
                    investorCount: 0,
                    paymentType: offer.paymentType,
                    nextPaymentDue: offer.nextPaymentDue,
                    breakdown: [],
                    balanceSource: 'on_chain'
                };
            }

            const annualRate = parseFloat(offer.annualInterestRate || 0);
            const periodsPerYear = this.getPeriodsPerYear(offer.paymentType);
            const periodRate = annualRate / 100 / periodsPerYear;

            // Calculate per-investor owed amounts based on current on-chain holdings
            const breakdown = investorsWithBalances.map(inv => {
                const tokenBalance = parseFloat(inv.token_balance || 0);
                const interestOwed = tokenBalance * periodRate;

                return {
                    investorId: inv.id,
                    investorName: inv.name,
                    investorWallet: inv.stellarContractId || inv.stellarPublicKey,
                    tokenBalance,
                    interestOwed: Math.round(interestOwed * 100) / 100,
                };
            }).filter(b => b.interestOwed > 0); // Only include holders with non-zero interest

            const totalTokensHeld = breakdown.reduce((sum, b) => sum + b.tokenBalance, 0);
            const totalOwed = breakdown.reduce((sum, b) => sum + b.interestOwed, 0);

            log.debug(`On-chain calculation for offer ${offer.id}:`, {
                investorCount: breakdown.length,
                totalTokensHeld,
                totalOwed,
                balanceSource: 'on_chain'
            });

            return {
                offerId: offer.id,
                assetCode: offer.assetCode,
                offerName: offer.offerName,
                totalInvested: totalTokensHeld, // Current token holdings, not original investment
                totalOwed: Math.round(totalOwed * 100) / 100,
                investorCount: breakdown.length,
                paymentType: offer.paymentType,
                annualInterestRate: annualRate,
                periodRate: periodRate * 100,
                nextPaymentDue: offer.nextPaymentDue,
                lastPaymentDate: offer.lastPaymentDate,
                paymentDueStatus: offer.paymentDueStatus,
                balanceSource: 'on_chain',
                breakdown
            };
        } catch (error) {
            log.error(`Error calculating on-chain owed amount for offer ${offer.id}:`, error);
            throw new Error(`Failed to calculate on-chain balances: ${error.message}`);
        }
    }

    /**
     * Calculate bullet payment (principal + all accrued interest)
     * @param {number} offerId - Offer ID
     * @returns {Promise<Object>} Bullet payment details
     */
    static async calculateBulletPayment(offerId) {
        const offer = await prisma.offer.findUnique({
            where: { id: offerId },
            include: {
                investments: {
                    where: { status: 'distributed' },
                    include: { investor: true }
                }
            }
        });

        if (!offer) {
            throw new Error(`Offer ${offerId} not found`);
        }

        if (offer.paymentType !== 'bullet') {
            throw new Error(`Offer ${offerId} is not a bullet payment offer`);
        }

        if (!offer.maturityDate) {
            throw new Error('Bullet offer has no maturity date set');
        }

        // For unlocked tokens, use on-chain balances for principal calculation
        if (offer.isTokenLocked === false) {
            return this._calculateBulletPaymentOnChain(offer);
        }

        const totalInvested = offer.investments.reduce(
            (sum, inv) => sum + parseFloat(inv.usdcAmount),
            0
        );

        const annualRate = parseFloat(offer.annualInterestRate || 0);
        // Use investorRate for payouts; fall back to annualRate if null (no spread)
        const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
        const offerStartDate = offer.createdAt;
        const maturityDate = new Date(offer.maturityDate);
        const yearsToMaturity = (maturityDate - offerStartDate) / (365 * 24 * 60 * 60 * 1000);
        const totalInterest = totalInvested * (effectiveInvestorRate / 100) * yearsToMaturity;

        // Company-side interest (for spread calculation)
        const companyTotalInterest = totalInvested * (annualRate / 100) * yearsToMaturity;

        const breakdown = offer.investments.map(inv => {
            const investedAmount = parseFloat(inv.usdcAmount);
            const proportion = investedAmount / totalInvested;
            const principalReturn = investedAmount;
            const interestEarned = totalInterest * proportion;

            return {
                investorId: inv.investorId,
                investorName: inv.investor.name,
                investorWallet: inv.investor.stellarContractId || inv.investor.stellarPublicKey,
                principal: principalReturn,
                interest: Math.round(interestEarned * 100) / 100,
                totalPayout: Math.round((principalReturn + interestEarned) * 100) / 100,
            };
        });

        const totalPrincipal = totalInvested;
        const totalInterestOwed = Math.round(totalInterest * 100) / 100;
        const totalPayout = totalPrincipal + totalInterestOwed;

        return {
            offerId,
            assetCode: offer.assetCode,
            offerName: offer.offerName,
            maturityDate,
            daysUntilMaturity: Math.ceil((maturityDate - new Date()) / (24 * 60 * 60 * 1000)),
            totalPrincipal,
            totalInterest: totalInterestOwed,
            companyTotalInterest: Math.round(companyTotalInterest * 100) / 100,
            totalPayout,
            investorCount: breakdown.length,
            balanceSource: 'database',
            breakdown
        };
    }

    /**
     * Calculate bullet payment using on-chain token balances (for unlocked tokens)
     * @param {Object} offer - Offer object with maturityDate
     * @returns {Promise<Object>} Bullet payment details based on on-chain holdings
     * @private
     */
    static async _calculateBulletPaymentOnChain(offer) {
        try {
            const investorsWithBalances = await PaymentService.getInvestorsWithBalancesByOffer(offer.id);

            if (!investorsWithBalances || investorsWithBalances.length === 0) {
                return {
                    offerId: offer.id,
                    totalPrincipal: 0,
                    totalInterest: 0,
                    totalPayout: 0,
                    investorCount: 0,
                    balanceSource: 'on_chain',
                    breakdown: []
                };
            }

            // Calculate total tokens held on-chain
            const totalTokensHeld = investorsWithBalances.reduce(
                (sum, inv) => sum + parseFloat(inv.token_balance || 0),
                0
            );

            const annualRate = parseFloat(offer.annualInterestRate || 0);
            const offerStartDate = offer.createdAt;
            const maturityDate = new Date(offer.maturityDate);
            const yearsToMaturity = (maturityDate - offerStartDate) / (365 * 24 * 60 * 60 * 1000);
            const totalInterest = totalTokensHeld * (annualRate / 100) * yearsToMaturity;

            const breakdown = investorsWithBalances.map(inv => {
                const tokenBalance = parseFloat(inv.token_balance || 0);
                const proportion = totalTokensHeld > 0 ? tokenBalance / totalTokensHeld : 0;
                const principalReturn = tokenBalance; // Principal = current token holdings
                const interestEarned = totalInterest * proportion;

                return {
                    investorId: inv.id,
                    investorName: inv.name,
                    investorWallet: inv.stellarContractId || inv.stellarPublicKey,
                    principal: principalReturn,
                    interest: Math.round(interestEarned * 100) / 100,
                    totalPayout: Math.round((principalReturn + interestEarned) * 100) / 100,
                };
            }).filter(b => b.principal > 0);

            const totalInterestOwed = Math.round(totalInterest * 100) / 100;
            const totalPayout = totalTokensHeld + totalInterestOwed;

            log.debug(`On-chain bullet calculation for offer ${offer.id}:`, {
                investorCount: breakdown.length,
                totalTokensHeld,
                totalInterest: totalInterestOwed,
                totalPayout,
                balanceSource: 'on_chain'
            });

            return {
                offerId: offer.id,
                assetCode: offer.assetCode,
                offerName: offer.offerName,
                maturityDate,
                daysUntilMaturity: Math.ceil((maturityDate - new Date()) / (24 * 60 * 60 * 1000)),
                totalPrincipal: totalTokensHeld,
                totalInterest: totalInterestOwed,
                totalPayout,
                investorCount: breakdown.length,
                balanceSource: 'on_chain',
                breakdown
            };
        } catch (error) {
            log.error(`Error calculating on-chain bullet payment for offer ${offer.id}:`, error);
            throw new Error(`Failed to calculate on-chain bullet payment: ${error.message}`);
        }
    }

    /**
     * Get all upcoming payments for a company
     * @param {number} companyId - Company ID
     * @returns {Promise<Array>} List of upcoming payments
     */
    static async getUpcomingPayments(companyId) {
        const offers = await prisma.offer.findMany({
            where: {
                companyId,
                status: 'active',
            },
            include: {
                investments: {
                    where: { status: 'distributed' }
                }
            }
        });

        const payments = await Promise.all(
            offers.map(async offer => {
                if (offer.paymentType === 'bullet') {
                    return this.calculateBulletPayment(offer.id);
                } else {
                    return this.calculateOwedAmount(offer.id);
                }
            })
        );

        return payments.filter(p => p.totalOwed > 0 || p.totalPayout > 0);
    }



    /**
     * Create a payment transaction for company to sign
     *
     * ATOMIC BULLET MATURITY FLOW:
     *   For bullet offers, bundles USDC payments + token clawback ops in one TX.
     *   Clawback ops use source: issuerPublicKey (needs admin Freighter sig).
     *   TX capped at 49 investors per batch (Stellar 100-op limit).
     *
     *   Company signs all batches in a loop → all go to admin queue together.
     *
     * @param {number} offerId - Offer ID
     * @param {number} companyUserId - Company user initiating payment
     * @param {Object} [options] - Batch options
     * @param {string} [options.batchGroupId] - UUID grouping batches for this maturity
     * @returns {Promise<Object>} Transaction XDR for signing + batchInfo
     */
    static async createPaymentTransaction(offerId, companyUserId, options = {}) {
        const { batchGroupId } = options;
        const offer = await prisma.offer.findUnique({
            where: { id: offerId },
            include: {
                company: true,
                requester: true
            }
        });

        if (!offer.company.stellarPublicKey) {
            throw new Error('Company does not have a Stellar wallet linked');
        }

        // Yield spread model by payment type:
        //
        //  PERIODIC (monthly/quarterly/annual):
        //    Company pays: interest at annualInterestRate
        //    Investor gets: interest at investorRate
        //    Spread = (annualRate - investorRate) × principal × time → treasury
        //
        //  BULLET (maturity payout):
        //    Company pays: PRINCIPAL + interest at annualInterestRate
        //    Investor gets: PRINCIPAL + interest at investorRate
        //    Spread = companyInterest - investorInterest → treasury
        //
        //  Example: $10K invested, company 12% APY, investor 10% APY, 1 year
        //    Periodic: investor gets $1000, treasury $200 spread
        //    Bullet:   investor gets $11,000, treasury $200 spread
        //
        const isBullet = offer.paymentType === 'bullet';
        let totalAmount, feeBase, breakdown, bulletDetails;

        if (isBullet) {
            bulletDetails = await this.calculateBulletPayment(offerId);
            if (bulletDetails.totalPayout === 0) {
                throw new Error('No payment owed for this offer');
            }
            totalAmount = bulletDetails.totalPayout;
            feeBase = bulletDetails.totalInterest;  // Fee on YIELD only
            breakdown = bulletDetails.breakdown;
        } else {
            const paymentDetails = await this.calculateOwedAmount(offerId);
            if (paymentDetails.totalOwed === 0) {
                throw new Error('No payment owed for this offer');
            }
            totalAmount = paymentDetails.totalOwed;
            feeBase = paymentDetails.totalOwed;      // periodic totalOwed IS interest
            breakdown = paymentDetails.breakdown;
        }

        // Yield spread: platform keeps (annualInterestRate - investorRate) × invested × time
        // When investorRate = annualInterestRate (or null), spread = 0
        //
        // MONEY FLOW:
        //   Company pays:      totalAmount = principal + companyInterest
        //   Platform keeps:    platformFee = companyInterest - investorInterest (the spread)
        //   Investor receives: netToInvestors = principal + investorInterest
        //
        let platformFee;
        if (isBullet) {
            // Spread = company interest - investor interest
            platformFee = Math.round(
                Math.max(0, (bulletDetails.companyTotalInterest || bulletDetails.totalInterest) - bulletDetails.totalInterest) * 100
            ) / 100;
            // totalAmount = what company pays (investor payout + spread)
            totalAmount = bulletDetails.totalPayout + platformFee;
        } else {
            // Periodic: calculate company-side interest for this period
            const offer = await prisma.offer.findUnique({ where: { id: offerId } });
            const annualRate = parseFloat(offer.annualInterestRate || 0);
            const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
            const spreadPct = Math.max(0, annualRate - effectiveInvestorRate);
            // Scale the spread relative to the investor interest
            platformFee = effectiveInvestorRate > 0
                ? Math.round(totalAmount * (spreadPct / effectiveInvestorRate) * 100) / 100
                : 0;
            // totalAmount = what company pays (investor interest + spread)
            totalAmount = totalAmount + platformFee;
        }
        let netToInvestors = Math.round((totalAmount - platformFee) * 100) / 100;

        // ─── BULLET: batch guard + clawback ops ──────────────────────────
        //
        //  BATCH FLOW (company signs all batches before admin sees any):
        //
        //  createPaymentTransaction(batch 1)         ← you are here
        //       │
        //  Company signs → processSignedPayment      → batch_pending
        //       │
        //  createPaymentTransaction(batch 2)          ← auto-looped by frontend
        //       │
        //  Company signs → processSignedPayment      → batch_pending → flip all to 'pending'
        //       │
        //  Admin signs all via Freighter              → processEffects per batch
        //       │
        //  Last batch → offer 'closed'
        //
        const MAX_INVESTORS_PER_BATCH = 49; // Stellar limit: 1 fee + 49 pay + 49 clawback = 99 ops

        if (isBullet) {
            // Guard: block if batches already submitted to admin
            const adminVisible = await prisma.multiSigTransaction.findFirst({
                where: {
                    operationType: 'maturity_clawback',
                    status: { in: ['pending', 'partially_signed', 'ready'] },
                    metadata: { path: ['offerId'], equals: offerId },
                },
            });
            if (adminVisible) {
                throw new Error('Maturity batches already queued for admin approval. Wait for signing or rejection before re-initiating.');
            }

            // Exclude investors already covered in batch_pending TXs for this batch group
            if (batchGroupId) {
                const pendingBatches = await prisma.multiSigTransaction.findMany({
                    where: {
                        operationType: 'maturity_clawback',
                        status: 'batch_pending',
                        metadata: { path: ['batchGroupId'], equals: batchGroupId },
                    },
                });
                const coveredWallets = new Set();
                for (const batch of pendingBatches) {
                    for (const inv of (batch.metadata?.breakdown || [])) {
                        coveredWallets.add(inv.investorWallet);
                    }
                }
                breakdown = breakdown.filter(b => !coveredWallets.has(b.investorWallet));
            }

            // Cap at 49 investors per batch
            if (breakdown.length > MAX_INVESTORS_PER_BATCH) {
                breakdown = breakdown.slice(0, MAX_INVESTORS_PER_BATCH);
            }

            if (breakdown.length === 0) {
                throw new Error('No remaining investors to pay in this batch');
            }

            // Recalculate spread fee for this batch's subset
            const batchInvestorInterest = breakdown.reduce((sum, b) => sum + b.interest, 0);
            const batchInvestorPayout = breakdown.reduce((sum, b) => sum + b.totalPayout, 0);
            // Spread ratio: if full set had companyInterest=X and investorInterest=Y, batch uses same ratio
            const spreadRatio = bulletDetails.totalInterest > 0
                ? (bulletDetails.companyTotalInterest - bulletDetails.totalInterest) / bulletDetails.totalInterest
                : 0;
            platformFee = Math.round(Math.max(0, batchInvestorInterest * spreadRatio) * 100) / 100;
            // totalAmount = what company pays (investor payout + spread)
            totalAmount = batchInvestorPayout + platformFee;
            netToInvestors = batchInvestorPayout;
        }

        // Build transaction with payment operations
        const companyKeypair = Keypair.fromPublicKey(offer.company.stellarPublicKey);
        const usdcAsset = new Asset(USDC_ASSET_CODE, USDC_ISSUER);
        const operations = [];

        // Op 1: Platform fee to treasury (skip if fee is zero)
        if (platformFee > 0) {
            const treasuryAddress = keyManager.getTreasuryPublicKey();
            operations.push(Operation.payment({
                destination: treasuryAddress,
                asset: usdcAsset,
                amount: platformFee.toFixed(7),
            }));
        }

        // Ops 2+: Investor payments
        let investorOps;
        if (isBullet) {
            // Bullet: investors get full investorRate payout (spread already sent to treasury above)
            investorOps = breakdown
                .filter(b => b.investorWallet && b.totalPayout > 0)
                .map(b => {
                    return Operation.payment({
                        destination: b.investorWallet,
                        asset: usdcAsset,
                        amount: Math.max(b.totalPayout, 0.0000001).toFixed(7),
                    });
                });
        } else {
            // Periodic: investors get full investorRate interest (spread already sent to treasury above)
            investorOps = breakdown
                .filter(b => b.investorWallet && b.interestOwed > 0)
                .map(b => {
                    return Operation.payment({
                        destination: b.investorWallet,
                        asset: usdcAsset,
                        amount: Math.max(b.interestOwed, 0.0000001).toFixed(7),
                    });
                });
        }

        operations.push(...investorOps);

        if (investorOps.length === 0) {
            throw new Error('No valid investor wallets to pay');
        }

        // ─── BULLET: append clawback ops (source: issuer, needs admin sig) ──
        let clawbackOps = [];
        if (isBullet) {
            const issuerPublicKey = keyManager.getIssuerPublicKey();
            const tokenAsset = new Asset(offer.assetCode, issuerPublicKey);
            const holders = await StellarService.listAssetHolders(offer.assetCode);

            // Match only investors in THIS batch
            const batchWallets = new Set(breakdown.map(b => b.investorWallet));
            clawbackOps = holders
                .filter(h => parseFloat(h.balance) > 0 && batchWallets.has(h.publicKey))
                .map(h => Operation.clawback({
                    asset: tokenAsset,
                    from: h.publicKey,
                    amount: h.balance,
                    source: issuerPublicKey,
                }));

            operations.push(...clawbackOps);
        }

        log.info('Payment transaction prepared', {
            offerId,
            paymentType: offer.paymentType,
            totalAmount,
            feeBase,
            platformFee,
            netToInvestors,
            investorCount: investorOps.length,
            clawbackCount: clawbackOps.length,
        });

        // Create unsigned transaction
        // Company will sign this with their passkey
        const transaction = await StellarService.buildUnsignedTransaction(
            offer.company.stellarPublicKey,
            operations,
            `${isBullet ? 'Maturity' : 'Yield'} payment for ${offer.assetCode}`
        );

        // Calculate remaining investors for batch info
        const totalInvestors = isBullet
            ? (await this.calculateBulletPayment(offerId)).breakdown.length
            : investorOps.length;

        return {
            transactionXDR: transaction.toXDR(),
            offerId,
            isBullet,
            totalAmount,
            platformFee,
            netToInvestors,
            investorCount: investorOps.length,
            breakdown,
            batchInfo: isBullet ? {
                batchGroupId: batchGroupId || null,
                thisCount: investorOps.length,
                remaining: Math.max(0, totalInvestors - investorOps.length),
            } : null,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min frontend display expiry
        };
    }

    /**
     * Process a signed payment transaction
     *
     * PERIODIC: direct submit to Stellar → record payments inline.
     * BULLET:   store company-signed XDR in multisig queue → admin signs later.
     *           Payments recorded in processEffects('maturity_clawback') after on-chain success.
     *
     * @param {string} signedXDR - Signed transaction XDR
     * @param {number} offerId - Offer ID
     * @param {Object} [options] - Batch options
     * @param {string} [options.batchGroupId] - UUID grouping batches for this maturity
     * @param {Object} [options.batchInfo] - Batch info from createPaymentTransaction
     * @returns {Promise<Object>} Transaction result
     */
    static async processSignedPayment(signedXDR, offerId, options = {}) {
        const { batchGroupId, batchInfo } = options;

        try {
            const offer = await prisma.offer.findUnique({ where: { id: offerId } });
            const isBullet = offer.paymentType === 'bullet';

            // Compute spread-based fee
            const annualRate = parseFloat(offer.annualInterestRate || 0);
            const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
            const spreadPct = Math.max(0, annualRate - effectiveInvestorRate);

            // ─── BULLET: queue for admin multisig (DO NOT submit to Stellar) ───
            //
            //  Company-signed XDR → MultiSigTx(batch_pending) → later: admin signs → submit
            //                                                         │
            //                                                         ▼
            //                                                    processEffects
            //                                                    records payments
            //                                                    closes offer
            //
            if (isBullet) {
                const bulletDetails = await this.calculateBulletPayment(offerId);
                const issuerPublicKey = keyManager.getIssuerPublicKey();

                // Calculate fee breakdown for metadata — use spread
                const totalFee = Math.round(
                    Math.max(0, (bulletDetails.companyTotalInterest || bulletDetails.totalInterest) - bulletDetails.totalInterest) * 100
                ) / 100;

                const txData = {
                    operationType: 'maturity_clawback',
                    xdr: signedXDR,
                    requiredSigners: [issuerPublicKey],
                    thresholdRequired: 1,
                    metadata: {
                        batchGroupId: batchGroupId || null,
                        offerId,
                        assetCode: offer.assetCode,
                        breakdown: batchInfo?.breakdown || bulletDetails.breakdown,
                        spreadPct,
                        totalFee,
                        totalPaid: bulletDetails.totalPayout,
                    },
                    description: `Maturity batch: pay + burn ${offer.assetCode}`,
                };

                const hasMore = batchInfo?.remaining > 0;

                if (!hasMore) {
                    // LAST BATCH: create TX + flip all batches to 'pending' atomically
                    await prisma.$transaction(async (tx) => {
                        await tx.multiSigTransaction.create({ data: {
                            ...txData,
                            status: 'batch_pending',
                            networkPassphrase: (await import('../config/stellar.js')).getNetworkPassphrase(),
                            expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8h
                            collectedSignatures: {},
                        }});

                        // Flip ALL batch_pending → pending (admin can now see them)
                        if (batchGroupId) {
                            await tx.multiSigTransaction.updateMany({
                                where: {
                                    operationType: 'maturity_clawback',
                                    status: 'batch_pending',
                                    metadata: { path: ['batchGroupId'], equals: batchGroupId },
                                },
                                data: { status: 'pending' },
                            });
                        }
                    });

                    // Notify admin via Pusher (outside transaction)
                    try {
                        const { broadcast } = await import('../config/pusher.js');
                        const batchCount = batchGroupId
                            ? await prisma.multiSigTransaction.count({
                                where: { metadata: { path: ['batchGroupId'], equals: batchGroupId } },
                            })
                            : 1;
                        broadcast('admin-governance', 'new-proposal', {
                            type: 'maturity_clawback',
                            offerId,
                            batchCount,
                            description: `${batchCount} maturity batch(es) ready for ${offer.assetCode}`,
                        });
                    } catch (pusherErr) {
                        log.warn('Pusher broadcast failed (non-critical)', { error: pusherErr.message });
                    }

                    return {
                        success: true,
                        status: 'pending_admin_approval',
                        hasMore: false,
                        investorsPaid: (batchInfo?.breakdown || bulletDetails.breakdown).length,
                        totalPaid: bulletDetails.totalPayout,
                    };
                } else {
                    // NOT LAST BATCH: create as batch_pending (hidden from admin)
                    const pendingTx = await MultiSigTransactionService.create(txData);

                    return {
                        success: true,
                        status: 'batch_queued',
                        hasMore: true,
                        multiSigTransactionId: pendingTx.id,
                        investorsPaid: (batchInfo?.breakdown || bulletDetails.breakdown).length,
                    };
                }
            }

            // ─── PERIODIC: direct submit to Stellar (unchanged) ─────────────
            const result = await StellarService.submitTransaction(signedXDR);

            if (result.success) {
                // Update offer payment status
                await prisma.offer.update({
                    where: { id: offerId },
                    data: {
                        lastPaymentDate: new Date(),
                        paymentDueStatus: 'current',
                        nextPaymentDue: this.calculateNextPaymentDate(offer),
                    }
                });

                // Record payments via shared helper
                const paymentDetails = await this.calculateOwedAmount(offerId);
                await this._recordPayments(
                    offer,
                    paymentDetails.breakdown,
                    result.transactionHash,
                    spreadPct,
                    false // isPeriodic
                );

                log.info(`Periodic payment processed successfully`, {
                    offerId,
                    transactionHash: result.transactionHash,
                    investorsPaid: paymentDetails.breakdown.length,
                    totalPaid: paymentDetails.totalOwed,
                });

                return {
                    success: true,
                    status: 'completed',
                    transactionHash: result.transactionHash,
                    investorsPaid: paymentDetails.breakdown.length,
                    totalPaid: paymentDetails.totalOwed,
                };
            } else {
                throw new Error(result.error || 'Transaction failed');
            }
        } catch (error) {
            log.error(`Payment failed`, { offerId, error: error.message });
            AlertService.error('Payment submission failed', { offerId, error: error.message }).catch(() => {});
            throw error;
        }
    }

    /**
     * Record InterestPayments + FeeLog for a completed payment.
     * DRY: used by processSignedPayment (periodic) AND processEffects (bullet).
     *
     * @param {Object} offer - Offer record
     * @param {Array} breakdown - Per-investor payment breakdown
     * @param {string} txHash - On-chain transaction hash
     * @param {number} spreadPct - Yield spread percentage (annualRate - investorRate)
     * @param {boolean} isBullet - true = bullet, false = periodic
     * @returns {Promise<{records: Array, totalFee: number}>}
     */
    static async _recordPayments(offer, breakdown, txHash, spreadPct, isBullet) {
        // spreadRatio: portion of investor interest that goes to platform
        // e.g. annualRate=12, investorRate=10 => spreadPct=2, investorRate=10 => ratio = 2/10 = 0.2
        const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
        const spreadRatio = effectiveInvestorRate > 0 ? spreadPct / effectiveInvestorRate : 0;
        const records = [];

        for (const payment of breakdown) {
            let gross, base, net, fee, tokenBalance;

            if (isBullet) {
                // Bullet: spread on interest only, principal untaxed
                gross = payment.totalPayout;
                base = payment.interest;
                fee = Math.round(base * spreadRatio * 100) / 100;
                net = payment.principal + (base - fee);
                tokenBalance = payment.principal;
            } else {
                // Periodic: totalOwed IS interest, spread applies
                gross = payment.interestOwed;
                base = payment.interestOwed;
                fee = Math.round(gross * spreadRatio * 100) / 100;
                net = gross - fee;
                tokenBalance = payment.tokenBalance;
            }

            await prisma.interestPayment.create({
                data: {
                    investorId: payment.investorId,
                    assetCode: offer.assetCode,
                    tokenBalance,
                    interestRate: offer.annualInterestRate,
                    interestAmount: gross,         // gross (backward compat)
                    usdcAmount: gross,             // gross (backward compat)
                    grossAmount: gross,
                    netAmount: net,
                    platformFeeAmount: fee,
                    transactionHash: txHash,
                    paymentDate: new Date(),
                    paymentType: offer.paymentType,
                    offerId: offer.id,
                    status: 'completed',
                }
            });
            records.push({ ...payment, fee });
        }

        // FeeLog: central receipt for admin fee reporting (fire-and-forget)
        const totalFee = records.reduce((sum, r) => sum + r.fee, 0);
        if (totalFee > 0) {
            try {
                await prisma.feeLog.create({
                    data: {
                        amount: totalFee,
                        assetCode: offer.assetCode,
                        category: 'DIVIDEND',
                        sourceId: offer.id,
                        description: `${isBullet ? 'Bullet maturity' : 'Periodic'} yield spread (${spreadPct}pp)`,
                        transactionHash: txHash,
                    }
                });
            } catch (feeLogErr) {
                log.warn('FeeLog write failed (non-critical)', { offerId: offer.id, error: feeLogErr.message });
            }
        }

        return { records, totalFee };
    }

    /**
     * Check for overdue payments and apply penalties
     * Also checks bullet payment maturity dates
     * @returns {Promise<Object>} Results of overdue and maturity checks
     */
    static async checkOverduePayments() {
        const now = new Date();
        const results = {
            overduePayments: [],
            bulletMaturities: []
        };

        // 1. Check regular payment overdue offers
        const overdueOffers = await prisma.offer.findMany({
            where: {
                status: 'active',
                paymentType: { not: 'bullet' },
                nextPaymentDue: { lt: now },
                paymentDueStatus: { notIn: ['defaulted'] }
            },
            include: { company: true }
        });

        for (const offer of overdueOffers) {
            const daysOverdue = Math.floor((now - new Date(offer.nextPaymentDue)) / (24 * 60 * 60 * 1000));

            let newStatus = offer.paymentDueStatus;
            let penalty = null;

            if (daysOverdue > GRACE_PERIOD_DAYS) {
                // Default triggered
                newStatus = 'defaulted';

                // Create default penalty
                const paymentDetails = await this.calculateOwedAmount(offer.id);
                const defaultFee = paymentDetails.totalOwed * DEFAULT_FEE_PERCENT;

                penalty = await prisma.companyPenalty.create({
                    data: {
                        companyId: offer.companyId,
                        offerId: offer.id,
                        penaltyType: 'default_fee',
                        description: `Default on ${offer.offerName} - ${daysOverdue} days overdue`,
                        amount: defaultFee,
                        daysLate: daysOverdue,
                        status: 'pending'
                    }
                });

                log.warn(`DEFAULT: Offer ${offer.id} defaulted after ${daysOverdue} days`);

            } else if (daysOverdue > 0) {
                // Apply daily late fee
                newStatus = 'overdue';

                const paymentDetails = await this.calculateOwedAmount(offer.id);
                const lateFee = paymentDetails.totalOwed * LATE_FEE_PERCENT_PER_DAY * daysOverdue;

                // Check if late fee already exists for today
                const existingPenalty = await prisma.companyPenalty.findFirst({
                    where: {
                        offerId: offer.id,
                        penaltyType: 'late_fee',
                        createdAt: { gte: new Date(now.toDateString()) }
                    }
                });

                if (!existingPenalty) {
                    penalty = await prisma.companyPenalty.create({
                        data: {
                            companyId: offer.companyId,
                            offerId: offer.id,
                            penaltyType: 'late_fee',
                            description: `Late payment fee - ${daysOverdue} days overdue`,
                            amount: lateFee,
                            percentageRate: LATE_FEE_PERCENT_PER_DAY,
                            daysLate: daysOverdue,
                            status: 'pending'
                        }
                    });
                }
            }

            // Update offer status
            if (newStatus !== offer.paymentDueStatus) {
                await prisma.offer.update({
                    where: { id: offer.id },
                    data: { paymentDueStatus: newStatus }
                });
            }

            results.overduePayments.push({
                offerId: offer.id,
                offerName: offer.offerName,
                companyId: offer.companyId,
                daysOverdue,
                status: newStatus,
                penalty
            });
        }

        // 2. Check bullet payment maturity dates
        const maturingBulletOffers = await prisma.offer.findMany({
            where: {
                status: 'active',
                paymentType: 'bullet',
                maturityDate: { lt: now },
                paymentDueStatus: { notIn: ['defaulted'] }
            },
            include: { company: true }
        });

        for (const offer of maturingBulletOffers) {
            const daysOverdue = Math.floor((now - new Date(offer.maturityDate)) / (24 * 60 * 60 * 1000));

            let newStatus = offer.paymentDueStatus;
            let penalty = null;

            if (daysOverdue > GRACE_PERIOD_DAYS) {
                // Default triggered for bullet payment
                newStatus = 'defaulted';

                const bulletDetails = await this.calculateBulletPayment(offer.id);
                const defaultFee = bulletDetails.totalPayout * DEFAULT_FEE_PERCENT;

                penalty = await prisma.companyPenalty.create({
                    data: {
                        companyId: offer.companyId,
                        offerId: offer.id,
                        penaltyType: 'default_fee',
                        description: `Bullet payment default on ${offer.offerName} - ${daysOverdue} days after maturity`,
                        amount: defaultFee,
                        daysLate: daysOverdue,
                        status: 'pending'
                    }
                });

                log.warn(`BULLET DEFAULT: Offer ${offer.id} defaulted ${daysOverdue} days after maturity`);

            } else if (daysOverdue > 0) {
                // Mark as overdue (maturity passed, grace period active)
                newStatus = 'overdue';

                // Notify company about matured bullet payment
                log.info(`BULLET DUE: Offer ${offer.id} matured ${daysOverdue} days ago`);
            } else if (daysOverdue === 0) {
                // Maturity day - mark as due
                newStatus = 'due';
                log.info(`BULLET MATURED: Offer ${offer.id} reached maturity today`);
            }

            // Update offer status
            if (newStatus !== offer.paymentDueStatus) {
                await prisma.offer.update({
                    where: { id: offer.id },
                    data: {
                        paymentDueStatus: newStatus,
                        nextPaymentDue: offer.maturityDate // Ensure nextPaymentDue is set for bullet
                    }
                });
            }

            results.bulletMaturities.push({
                offerId: offer.id,
                offerName: offer.offerName,
                companyId: offer.companyId,
                maturityDate: offer.maturityDate,
                daysOverdue,
                status: newStatus,
                penalty
            });
        }

        return results;
    }

    // ============ Helper Methods ============

    static getPeriodsPerYear(paymentType) {
        switch (paymentType) {
            case 'monthly': return 12;
            case 'quarterly': return 4;
            case 'semi_annual': return 2;
            case 'annual': return 1;
            case 'bullet': return 1; // N/A for bullet
            default: return 12;
        }
    }

    static calculateNextPaymentDate(offer) {
        if (offer.paymentType === 'bullet') {
            return offer.maturityDate;
        }

        const lastPayment = offer.lastPaymentDate || offer.createdAt;
        const nextDate = new Date(lastPayment);

        switch (offer.paymentType) {
            case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + 1);
                break;
            case 'quarterly':
                nextDate.setMonth(nextDate.getMonth() + 3);
                break;
            case 'semi_annual':
                nextDate.setMonth(nextDate.getMonth() + 6);
                break;
            case 'annual':
                nextDate.setFullYear(nextDate.getFullYear() + 1);
                break;
        }

        // Set to payment day
        nextDate.setDate(Math.min(offer.paymentDay, 28));

        return nextDate;
    }
}

export default CompanyPaymentService;
