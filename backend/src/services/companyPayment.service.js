/**
 * Company Payment Service
 * Handles company-to-investor payment calculations and processing
 */
import prisma from '../config/prisma.js';
import { StellarService } from './stellar.service.js';
import { YieldDistributorService } from './yieldDistributor.service.js';
import { PaymentService } from './payment.service.js';
import { AlertService } from './alert.service.js';

import { Asset, Operation } from '@stellar/stellar-sdk';
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

/** Round to Stellar USDC precision (7 decimal places = 1 stroop = 0.0000001) */
const round7 = (v) => Math.round(v * 10_000_000) / 10_000_000;

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
            }
        });

        if (!offer) {
            throw new Error(`Offer ${offerId} not found`);
        }

        // ─── MATURITY METADATA (computed BEFORE routing) ─── F-10, F-14
        const totalExpectedPayments = this.computeTotalExpectedPayments(offer);
        const paymentsMade = offer.periodicPaymentsCompleted;  // F-14: atomic counter
        const maturityReached = totalExpectedPayments !== null && paymentsMade >= totalExpectedPayments;
        const isLastPeriod = totalExpectedPayments !== null
            && !maturityReached
            && paymentsMade >= totalExpectedPayments - 1;

        const scheduleMetadata = {
            totalExpectedPayments,
            paymentsMade,
            maturityReached,
            isLastPeriod,
            maturityDate: offer.maturityDate,
            offerCreatedAt: offer.createdAt,
        };



        // For unlocked tokens, use on-chain balances instead of DB investment records
        // This ensures accurate interest calculations when tokens have been traded on DEXes
        // F-10: On-chain path gets schedule metadata
        if (offer.isTokenLocked === false) {
            return { ...await this._calculateOwedAmountOnChain(offer), ...scheduleMetadata };
        }

        // Calculate total tokens distributed (USDC invested)
        const totalInvested = offer.investments.reduce(
            (sum, inv) => sum + parseFloat(inv.usdcAmount),
            0
        );

        // F-15: Zero-investment early return includes metadata
        if (totalInvested === 0) {
            return {
                offerId,
                totalOwed: 0,
                investorCount: 0,
                paymentType: offer.paymentType,
                nextPaymentDue: offer.nextPaymentDue,
                breakdown: [],
                balanceSource: 'database',
                ...scheduleMetadata,
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
                investorWallet: inv.investor.stellarContractId,
                tokenBalance: investedAmount, // For locked tokens, invested = balance
                interestOwed: round7(interestOwed),
            };
        });

        const totalOwed = breakdown.reduce((sum, b) => sum + b.interestOwed, 0);

        return {
            offerId,
            assetCode: offer.assetCode,
            offerName: offer.offerName,
            totalInvested,
            totalOwed: round7(totalOwed),
            investorCount: breakdown.length,
            paymentType: offer.paymentType,
            annualInterestRate: annualRate,
            investorRate: effectiveInvestorRate,
            periodRate: periodRate * 100, // As percentage
            nextPaymentDue: offer.nextPaymentDue,
            lastPaymentDate: offer.lastPaymentDate,
            paymentDueStatus: offer.paymentDueStatus,
            balanceSource: 'database',
            breakdown,
            ...scheduleMetadata,
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

            // Use investorRate for payouts; fall back to annualRate if null (no spread)
            const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
            const periodsPerYear = this.getPeriodsPerYear(offer.paymentType);
            const periodRate = effectiveInvestorRate / 100 / periodsPerYear;

            // Calculate per-investor owed amounts based on current on-chain holdings
            const breakdown = investorsWithBalances.map(inv => {
                const tokenBalance = parseFloat(inv.token_balance || 0);
                const interestOwed = tokenBalance * periodRate;

                return {
                    investorId: inv.id,
                    investorName: inv.name,
                    investorWallet: inv.stellarContractId,
                    tokenBalance,
                    interestOwed: round7(interestOwed),
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
                totalOwed: round7(totalOwed),
                investorCount: breakdown.length,
                paymentType: offer.paymentType,
                annualInterestRate: parseFloat(offer.annualInterestRate || 0),
                investorRate: effectiveInvestorRate,
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
                investorWallet: inv.investor.stellarContractId,
                principal: principalReturn,
                interest: round7(interestEarned),
                totalPayout: round7(principalReturn + interestEarned),
            };
        });

        const totalPrincipal = totalInvested;
        const totalInterestOwed = round7(totalInterest);
        const totalPayout = totalPrincipal + totalInterestOwed;

        return {
            offerId,
            assetCode: offer.assetCode,
            offerName: offer.offerName,
            maturityDate,
            daysUntilMaturity: Math.ceil((maturityDate - new Date()) / (24 * 60 * 60 * 1000)),
            totalPrincipal,
            totalInterest: totalInterestOwed,
            companyTotalInterest: round7(companyTotalInterest),
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

            // Use investorRate for payouts; fall back to annualRate if null (no spread)
            const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
            const offerStartDate = offer.createdAt;
            const maturityDate = new Date(offer.maturityDate);
            const yearsToMaturity = (maturityDate - offerStartDate) / (365 * 24 * 60 * 60 * 1000);
            const totalInterest = totalTokensHeld * (effectiveInvestorRate / 100) * yearsToMaturity;

            const breakdown = investorsWithBalances.map(inv => {
                const tokenBalance = parseFloat(inv.token_balance || 0);
                const proportion = totalTokensHeld > 0 ? tokenBalance / totalTokensHeld : 0;
                const principalReturn = tokenBalance; // Principal = current token holdings
                const interestEarned = totalInterest * proportion;

                return {
                    investorId: inv.id,
                    investorName: inv.name,
                    investorWallet: inv.stellarContractId,
                    principal: principalReturn,
                    interest: round7(interestEarned),
                    totalPayout: round7(principalReturn + interestEarned),
                };
            }).filter(b => b.principal > 0);

            const totalInterestOwed = round7(totalInterest);
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
     * PERIODIC YIELD ONLY. Bullet maturity payments use SorobanSettlementService.
     *
     * @param {number} offerId - Offer ID
     * @param {number} companyUserId - Company user initiating payment
     * @param {Object} [options] - Reserved for future use
     * @returns {Promise<Object>} Transaction XDR for signing
     */
    static async createPaymentTransaction(offerId, companyUserId, _options = {}) {
        const offer = await prisma.offer.findUnique({
            where: { id: offerId },
            include: {
                company: true,
                requester: true
            }
        });

        const companyWalletAddress = offer.company.stellarPublicKey || offer.company.stellarContractId;
        if (!companyWalletAddress) {
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
        // Bullet payments MUST use Soroban Settlement (deposit → settle_batch → burn)
        if (offer.paymentType === 'bullet') {
            throw new Error('Bullet maturity payments must use the Soroban Settlement flow (prepare-deposit → submit-deposit). This classic payment pipeline is for periodic yield only.');
        }

        let totalAmount, feeBase, breakdown;

        const paymentDetails = await this.calculateOwedAmount(offerId);
        if (paymentDetails.totalOwed === 0) {
            throw new Error('No payment owed for this offer');
        }

        // ─── MATURITY GUARD (prepare-time) ─── F-02, F-13
        if (paymentDetails.maturityReached) {
            const err = new Error('PAYMENT_SCHEDULE_COMPLETE');
            err.code = 'E_MATURITY_REACHED';
            err.httpStatus = 409;
            throw err;
        }

        totalAmount = paymentDetails.totalOwed;
        feeBase = paymentDetails.totalOwed;      // periodic totalOwed IS interest
        breakdown = paymentDetails.breakdown;

        // Yield spread: platform keeps (annualInterestRate - investorRate) × invested × time
        // When investorRate = annualInterestRate (or null), spread = 0
        let platformFee;
        {
            const annualRate = parseFloat(offer.annualInterestRate || 0);
            const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
            const spreadPct = Math.max(0, annualRate - effectiveInvestorRate);
            platformFee = effectiveInvestorRate > 0
                ? round7(totalAmount * (spreadPct / effectiveInvestorRate))
                : 0;
            totalAmount = totalAmount + platformFee;
        }
        let netToInvestors = round7(totalAmount - platformFee);

        // Smart wallets (C...) require Soroban SAC transfers (1 invokeHostFunction per TX)
        // Classic wallets (G...) can be batched up to 49 per TX
        const hasSmartWalletInvestors = breakdown.some(b => b.investorWallet?.startsWith('C'));

        // ─── BUILD PAYMENT TRANSACTION ──────────────────────────────────
        // Two paths: classic (G... wallets) vs Soroban SAC (C... smart wallets)
        const usdcAsset = new Asset(USDC_ASSET_CODE, USDC_ISSUER);
        let transaction;
        let investorOps = [];

        if (hasSmartWalletInvestors) {
            // ─── SOROBAN PATH: YieldDistributor multi-batch ─────────────────
            // Uses YieldDistributor contract to batch SAC.transfer() calls.
            // One distribute() call = one passkey signature = up to 30 investors.
            // >30 investors → multiple batches, each signed separately.
            const annualRate = parseFloat(offer.annualInterestRate || 0);
            const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
            const spreadPct = Math.max(0, annualRate - effectiveInvestorRate);
            const spreadRatio = effectiveInvestorRate > 0 ? spreadPct / effectiveInvestorRate : 0;

            const { batchXDRs, batchDetails } = await YieldDistributorService.buildMultiBatchXdrs(
                companyWalletAddress,
                breakdown,
                spreadRatio,
            );

            const validInvestorCount = breakdown.filter(b => b.investorWallet && b.interestOwed > 0).length;

            log.info('YieldDistributor multi-batch XDRs prepared', {
                offerId,
                batchCount: batchXDRs.length,
                investorCount: validInvestorCount,
                totalAmount,
                platformFee,
            });

            // Persist job to DB (write-through: Redis = hot path, DB = cold persistence)
            const jobId = crypto.randomUUID();
            try {
                await prisma.yieldPaymentJob.create({
                    data: {
                        id: jobId,
                        offerId,
                        companyId: offer.companyId,
                        status: 'prepared',
                        batchCount: batchXDRs.length,
                        totalInvestors: validInvestorCount,
                        totalAmount,
                        totalFee: platformFee,
                        metadata: { batches: batchDetails },
                    },
                });
            } catch (dbErr) {
                // Non-fatal: Redis lock is the primary guard. Log and continue.
                log.warn('Failed to persist YieldPaymentJob (non-fatal)', { offerId, error: dbErr.message });
            }

            return {
                transactionXDR: batchXDRs[0],        // backward compat: first/only XDR
                batchXDRs,                            // all batch XDRs
                batchCount: batchXDRs.length,
                batchDetails,
                jobId,                                // flows to frontend → submit
                offerId,
                isBullet: false,
                totalAmount,
                platformFee,
                netToInvestors,
                investorCount: validInvestorCount,
                breakdown,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            };
        } else {
            // ─── CLASSIC PATH: Operation.payment for G... addresses ────────
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
            investorOps = breakdown
                .filter(b => b.investorWallet && b.interestOwed > 0)
                .map(b => Operation.payment({
                    destination: b.investorWallet,
                    asset: usdcAsset,
                    amount: Math.max(b.interestOwed, 0.0000001).toFixed(7),
                }));

            operations.push(...investorOps);

            if (investorOps.length === 0) {
                throw new Error('No valid investor wallets to pay');
            }

            // Create unsigned classic transaction
            transaction = await StellarService.buildUnsignedTransaction(
                companyWalletAddress,
                operations,
                `Yield payment for ${offer.assetCode}`
            );
        }

        log.info('Periodic payment transaction prepared', {
            offerId,
            paymentType: offer.paymentType,
            totalAmount,
            feeBase,
            platformFee,
            netToInvestors,
            investorCount: investorOps.length,
            txType: hasSmartWalletInvestors ? 'soroban_yield_distributor' : 'classic',
        });

        return {
            transactionXDR: transaction.toXDR(),
            offerId,
            isBullet: false,
            totalAmount,
            platformFee,
            netToInvestors,
            investorCount: investorOps.length,
            breakdown,
            batchInfo: null,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        };
    }

    /**
     * Process a signed payment transaction
     *
     * PERIODIC YIELD ONLY. Direct submit to Stellar → record payments inline.
     * Bullet maturity payments use SorobanSettlementService.
     *
     * @param {string} signedXDR - Signed transaction XDR
     * @param {number} offerId - Offer ID
     * @returns {Promise<Object>} Transaction result
     */
    static async processSignedPayment(signedXDR, offerId) {
        try {
            const offer = await prisma.offer.findUnique({ where: { id: offerId } });

            // Bullet payments MUST use Soroban Settlement
            if (offer.paymentType === 'bullet') {
                throw new Error('Bullet maturity payments must use the Soroban Settlement flow. This classic payment pipeline is for periodic yield only.');
            }

            // Compute spread-based fee
            const annualRate = parseFloat(offer.annualInterestRate || 0);
            const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
            const spreadPct = Math.max(0, annualRate - effectiveInvestorRate);

            // ─── MATURITY GUARD (submit-time re-check) ─── F-02
            const preCheckDetails = await this.calculateOwedAmount(offerId);
            if (preCheckDetails.maturityReached) {
                const err = new Error('PAYMENT_SCHEDULE_COMPLETE');
                err.code = 'E_MATURITY_REACHED';
                err.httpStatus = 409;
                throw err;
            }

            // ─── PERIODIC: direct submit to Stellar ─────────────
            const result = await StellarService.submitTransaction(signedXDR);

            if (result.success) {
                const nowDate = new Date();
                // F-24: Use FRESH lastPaymentDate so nextPaymentDue points to the
                // NEXT upcoming payment, not the one we just completed
                const updatedOffer = { ...offer, lastPaymentDate: nowDate };

                // Update offer payment status — F-14: ATOMIC counter increment
                const dbOffer = await prisma.offer.update({
                    where: { id: offerId },
                    data: {
                        lastPaymentDate: nowDate,
                        paymentDueStatus: 'current',
                        nextPaymentDue: this.calculateNextPaymentDate(updatedOffer),  // F-24
                        periodicPaymentsCompleted: { increment: 1 },  // F-14: ATOMIC
                    }
                });

                // Change 12: Structured logging — production observability
                log.info('PAYMENT_COUNTER_INCREMENT', {
                    offerId,
                    newCount: dbOffer.periodicPaymentsCompleted,
                    totalExpected: this.computeTotalExpectedPayments(offer),
                    maturityReached: dbOffer.periodicPaymentsCompleted >= this.computeTotalExpectedPayments(offer),
                    txHash: result.transactionHash,
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
     * Process signed multi-batch payment XDRs (YieldDistributor path).
     *
     * Submits each batch sequentially with retry. Tracks partial failures.
     * On R1 (DB failure after on-chain success), creates CRITICAL alert.
     *
     * @param {string[]} signedXDRs - Signed batch transaction XDRs
     * @param {number} offerId - Offer ID
     * @param {Array} batchDetails - Batch metadata from createPaymentTransaction
     * @returns {Promise<Object>} Submission results
     */
    static async processSignedBatches(signedXDRs, offerId, batchDetails = null) {
        const offer = await prisma.offer.findUnique({ where: { id: offerId } });

        if (offer.paymentType === 'bullet') {
            throw new Error('Bullet maturity payments must use the Soroban Settlement flow.');
        }

        if (!signedXDRs || signedXDRs.length === 0) {
            throw new Error('No signed XDRs provided');
        }

        // ─── MATURITY GUARD (batch submit-time) ─── F-02
        const preCheckDetails = await this.calculateOwedAmount(offerId);
        if (preCheckDetails.maturityReached) {
            const err = new Error('PAYMENT_SCHEDULE_COMPLETE');
            err.code = 'E_MATURITY_REACHED';
            err.httpStatus = 409;
            throw err;
        }

        // Build dummy batchDetails if not provided (route path — details were at prepare time)
        const effectiveBatchDetails = batchDetails || signedXDRs.map((_, i) => ({
            batchIndex: i,
            investorCount: 0,
            totalAmount: 0,
            fee: 0,
            investorIds: [],
            status: 'pending',
        }));

        // Submit all batches with retry
        const submitResult = await YieldDistributorService.submitBatches(signedXDRs, effectiveBatchDetails);

        // Record payments for confirmed batches
        if (submitResult.completedBatches > 0) {
            const annualRate = parseFloat(offer.annualInterestRate || 0);
            const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
            const spreadPct = Math.max(0, annualRate - effectiveInvestorRate);

            // ─── F-33: Counter increment is the CRITICAL safety state ───
            // Do it FIRST, in its own try/catch, so a _recordPayments failure
            // cannot skip the maturity guard update and allow overpayment.
            const nowDate = new Date();
            const updatedOffer = { ...offer, lastPaymentDate: nowDate };  // F-24

            try {
                const dbOffer = await prisma.offer.update({
                    where: { id: offerId },
                    data: {
                        lastPaymentDate: nowDate,
                        paymentDueStatus: submitResult.success ? 'current' : 'overdue',
                        nextPaymentDue: submitResult.success
                            ? this.calculateNextPaymentDate(updatedOffer)   // F-24: fresh offer
                            : undefined,
                        // F-25: ONLY increment counter if ALL batches succeeded
                        ...(submitResult.success && { periodicPaymentsCompleted: { increment: 1 } }),
                    }
                });

                if (submitResult.success) {
                    log.info('PAYMENT_COUNTER_INCREMENT', {
                        offerId,
                        newCount: dbOffer.periodicPaymentsCompleted,
                        totalExpected: this.computeTotalExpectedPayments(offer),
                        maturityReached: dbOffer.periodicPaymentsCompleted >= this.computeTotalExpectedPayments(offer),
                        txHashes: submitResult.txHashes,
                    });
                }
            } catch (counterErr) {
                // Counter increment failed after on-chain success — CRITICAL
                log.error('CRITICAL: Counter increment failed after on-chain success', {
                    offerId, txHashes: submitResult.txHashes, error: counterErr.message,
                });
                AlertService.critical('COUNTER_INCREMENT_FAILURE', {
                    type: 'COUNTER_INCREMENT_FAILURE',
                    offerId,
                    txHashes: submitResult.txHashes,
                    message: 'Yield payments confirmed on-chain but counter increment failed. Manual reconciliation required.',
                    error: counterErr.message,
                }).catch(() => {});
            }

            // ─── F-30: Record payments for CONFIRMED batch investors only ───
            // On partial failure, only create InterestPayment records for investors
            // whose batches actually succeeded on-chain, preventing phantom records.
            try {
                const paymentDetails = await this.calculateOwedAmount(offerId);

                let recordBreakdown = paymentDetails.breakdown;
                if (!submitResult.success && submitResult.results) {
                    // Partial failure — filter to confirmed-batch investors
                    const confirmedInvestorIds = new Set(
                        submitResult.results
                            .filter(r => r.status === 'confirmed')
                            .flatMap(r => r.investorIds || [])
                    );
                    if (confirmedInvestorIds.size > 0) {
                        recordBreakdown = paymentDetails.breakdown.filter(
                            b => confirmedInvestorIds.has(b.investorId)
                        );
                    } else {
                        // No investorId tracking available — skip to prevent phantom records
                        log.warn('Partial failure with no investorId tracking — skipping _recordPayments', { offerId });
                        recordBreakdown = [];
                    }
                }

                if (recordBreakdown.length > 0) {
                    await this._recordPayments(
                        offer,
                        recordBreakdown,
                        submitResult.txHashes.join(','),
                        spreadPct,
                        false
                    );
                }

                log.info('Multi-batch payment recorded', {
                    offerId,
                    investorsPaid: recordBreakdown.length,
                    totalPaid: submitResult.totalPaid,
                    txHashes: submitResult.txHashes,
                });
            } catch (dbError) {
                // R1: DB failure after on-chain success — CRITICAL
                // Counter was already incremented above, so maturity guard is safe.
                log.error('CRITICAL: Payment confirmed on-chain but DB record failed', {
                    offerId,
                    txHashes: submitResult.txHashes,
                    investorsPaid: submitResult.investorsPaid,
                    error: dbError.message,
                });
                AlertService.critical('PAYMENT_RECORD_FAILURE', {
                    type: 'PAYMENT_RECORD_FAILURE',
                    offerId,
                    txHashes: submitResult.txHashes,
                    investorCount: submitResult.investorsPaid,
                    message: 'Yield payments confirmed on-chain but database record failed. Manual reconciliation required.',
                    error: dbError.message,
                }).catch(() => {});

                return {
                    ...submitResult,
                    warning: 'PAYMENT_RECORD_FAILURE',
                    warningMessage: 'Payments confirmed on-chain but database record failed. Admin will reconcile.',
                };
            }
        }

        // Release concurrency lock
        await YieldDistributorService.releaseLock(offerId);

        // Write-through: update job status in DB
        try {
            // Find the most recent prepared/submitting job for this offer
            const activeJob = await prisma.yieldPaymentJob.findFirst({
                where: { offerId, status: { in: ['prepared', 'submitting'] } },
                orderBy: { createdAt: 'desc' },
            });
            if (activeJob) {
                const finalStatus = submitResult.success ? 'confirmed'
                    : submitResult.partial ? 'partial_failure'
                    : 'failed';
                await prisma.yieldPaymentJob.update({
                    where: { id: activeJob.id },
                    data: {
                        status: finalStatus,
                        txHashes: submitResult.txHashes?.join(',') || null,
                        error: submitResult.partial
                            ? JSON.stringify(submitResult.results?.filter(r => r.status === 'failed'))
                            : null,
                        completedAt: new Date(),
                        metadata: { batches: submitResult.results || [] },
                    },
                });
            }
        } catch (jobUpdateErr) {
            log.warn('Failed to update YieldPaymentJob (non-fatal)', { offerId, error: jobUpdateErr.message });
        }

        return submitResult;
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
                fee = round7(base * spreadRatio);
                net = payment.principal + (base - fee);
                tokenBalance = payment.principal;
            } else {
                // Periodic: totalOwed IS interest, spread applies
                gross = payment.interestOwed;
                base = payment.interestOwed;
                fee = round7(gross * spreadRatio);
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

        // F-20: Filter out offers that have completed all periodic payments
        // These are awaiting principal return, NOT a missed periodic yield
        const activeOverdueOffers = overdueOffers.filter(offer => {
            const totalExpected = this.computeTotalExpectedPayments(offer);
            if (totalExpected !== null && offer.periodicPaymentsCompleted >= totalExpected) {
                return false; // All yields paid — skip overdue escalation
            }
            return true;
        });

        for (const offer of activeOverdueOffers) {
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

        // 3. Detect completed periodic offers awaiting principal return (F-06, F-19)
        const completedPeriodicOffers = await prisma.offer.findMany({
            where: {
                status: 'active',
                paymentType: { not: 'bullet' },
                maturityDate: { lt: now },
                nextPaymentDue: null,  // all periodic payments done
                paymentDueStatus: { not: 'due' },  // F-26: skip already-flagged (idempotency)
            },
            include: { company: true }
        });

        for (const offer of completedPeriodicOffers) {
            const totalExpected = this.computeTotalExpectedPayments(offer);
            if (totalExpected !== null && offer.periodicPaymentsCompleted >= totalExpected) {
                // F-19: DON'T set status='matured'
                // F-20: DON'T set nextPaymentDue (would trigger false default)
                await prisma.offer.update({
                    where: { id: offer.id },
                    data: {
                        paymentDueStatus: 'due',  // Non-punitive, admin visibility
                        // nextPaymentDue stays null — Section 1 won't pick this up
                    }
                });
                log.info(`PERIODIC SETTLEMENT DUE: Offer ${offer.id} — all ${totalExpected} yields paid. Principal return needed.`);
            }
        }

        results.periodicMaturities = completedPeriodicOffers.length;

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

    // ─── F-12, F-16: Safe date arithmetic for period advancement ───
    static _advanceByPeriod(date, paymentType, paymentDay) {
        const next = new Date(date);
        next.setUTCDate(1);                    // F-12: prevent month overflow
        switch (paymentType) {
            case 'monthly':     next.setUTCMonth(next.getUTCMonth() + 1); break;
            case 'quarterly':   next.setUTCMonth(next.getUTCMonth() + 3); break;
            case 'semi_annual': next.setUTCMonth(next.getUTCMonth() + 6); break;
            case 'annual':      next.setUTCFullYear(next.getUTCFullYear() + 1); break;
            default: throw new Error(`Unknown paymentType: ${paymentType}`); // F-22
        }
        next.setUTCDate(Math.min(paymentDay || 1, 28));
        next.setUTCHours(0, 0, 0, 0);         // F-16: eliminate time-of-day sensitivity
        return next;
    }

    // ─── F-08, F-04, F-05, F-16: Deterministic date-walking for total expected payments ───
    static computeTotalExpectedPayments(offer) {
        if (!offer.maturityDate) return null;           // perpetual — no limit
        if (offer.paymentType === 'bullet') return 0;   // bullet uses settlement, not periodic

        const maturity = new Date(offer.maturityDate);
        maturity.setUTCHours(23, 59, 59, 999);          // F-16: end of maturity day

        const startDate = new Date(offer.createdAt);
        startDate.setUTCHours(0, 0, 0, 0);              // F-16: normalize

        if (maturity <= startDate) return 0;             // F-05: invalid state guard

        let count = 0;
        let date = new Date(startDate);
        while (count < 1200) {                           // F-04: iteration cap (100yrs monthly)
            date = this._advanceByPeriod(date, offer.paymentType, offer.paymentDay);
            if (date > maturity) break;                  // F-08: STRICT > (not >=)
            count++;
        }

        // Change 12: Structured logging for computed values
        log.debug('TOTAL_PAYMENTS_COMPUTED', {
            offerId: offer.id,
            paymentType: offer.paymentType,
            createdAt: offer.createdAt,
            maturityDate: offer.maturityDate,
            result: count,
        });

        return count;                                    // F-08: NO +1
    }

    static calculateNextPaymentDate(offer) {
        if (offer.paymentType === 'bullet') {
            return offer.maturityDate;
        }

        const lastPayment = offer.lastPaymentDate || offer.createdAt;
        // F-17+F-18: reuse _advanceByPeriod (UTC-normalized, no code duplication)
        const nextDate = this._advanceByPeriod(lastPayment, offer.paymentType, offer.paymentDay);

        if (offer.maturityDate) {
            const maturityEnd = new Date(offer.maturityDate);
            maturityEnd.setUTCHours(23, 59, 59, 999);  // F-17: same normalization as computeTotal
            if (nextDate > maturityEnd) {
                // Change 12: Structured logging for maturity boundary hits
                log.info('MATURITY_BOUNDARY_HIT', {
                    offerId: offer.id,
                    lastPaymentDate: offer.lastPaymentDate,
                    maturityDate: offer.maturityDate,
                    nextComputedDate: nextDate?.toISOString(),
                });
                return null;    // F-08: STRICT >
            }
        }
        return nextDate;
    }
}

export default CompanyPaymentService;
