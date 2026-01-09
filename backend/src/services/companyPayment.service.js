/**
 * Company Payment Service
 * Handles company-to-investor payment calculations and processing
 */
import prisma from '../config/prisma.js';
import { StellarService } from './stellar.service.js';
import { EmailService } from './email.service.js';
import { Keypair, Asset, Operation, TransactionBuilder, Networks } from '@stellar/stellar-sdk';

// Configuration
const PLATFORM_FEE_PERCENT = 0.01; // 1% MVP
const LATE_FEE_PERCENT_PER_DAY = 0.001; // 0.1% per day
const GRACE_PERIOD_DAYS = 10;
const DEFAULT_FEE_PERCENT = 0.05; // 5% of owed amount

const USDC_ASSET_CODE = 'USDC';
const USDC_ISSUER = process.env.USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

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
                breakdown: []
            };
        }

        const annualRate = parseFloat(offer.annualInterestRate || 0);
        const periodsPerYear = this.getPeriodsPerYear(offer.paymentType);
        const periodRate = annualRate / 100 / periodsPerYear;

        // Calculate per-investor owed amounts
        const breakdown = offer.investments.map(inv => {
            const investedAmount = parseFloat(inv.usdcAmount);
            const interestOwed = investedAmount * periodRate;

            return {
                investorId: inv.investorId,
                investorName: inv.investor.name,
                investorWallet: inv.investor.stellarPublicKey,
                investedAmount,
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
            breakdown
        };
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

        const totalInvested = offer.investments.reduce(
            (sum, inv) => sum + parseFloat(inv.usdcAmount),
            0
        );

        if (!offer.maturityDate) {
            throw new Error('Bullet offer has no maturity date set');
        }

        const annualRate = parseFloat(offer.annualInterestRate || 0);
        const offerStartDate = offer.createdAt;
        const maturityDate = new Date(offer.maturityDate);
        const yearsToMaturity = (maturityDate - offerStartDate) / (365 * 24 * 60 * 60 * 1000);
        const totalInterest = totalInvested * (annualRate / 100) * yearsToMaturity;

        const breakdown = offer.investments.map(inv => {
            const investedAmount = parseFloat(inv.usdcAmount);
            const proportion = investedAmount / totalInvested;
            const principalReturn = investedAmount;
            const interestEarned = totalInterest * proportion;

            return {
                investorId: inv.investorId,
                investorName: inv.investor.name,
                investorWallet: inv.investor.stellarPublicKey,
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
            totalPayout,
            investorCount: breakdown.length,
            breakdown
        };
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
     * Process token sale - distribute fees
     * @param {number} investorId - Investor ID
     * @param {number} offerId - Offer ID
     * @param {number} usdcAmount - Total USDC paid by investor
     * @returns {Promise<Object>} Fee distribution result
     */
    static async processTokenSaleFees(investorId, offerId, usdcAmount) {
        const platformFee = usdcAmount * PLATFORM_FEE_PERCENT;
        const companyProceeds = usdcAmount - platformFee;

        const offer = await prisma.offer.findUnique({
            where: { id: offerId },
            include: { company: true }
        });

        if (!offer) {
            throw new Error(`Offer ${offerId} not found`);
        }

        // Record the fee distribution
        // In a full implementation, this would also trigger USDC transfers
        // Platform fee goes to platform wallet
        // Company proceeds go to company wallet

        console.log(`[CompanyPayment] Token sale processed:`, {
            investorId,
            offerId,
            totalPaid: usdcAmount,
            platformFee,
            companyProceeds,
            companyId: offer.companyId
        });

        return {
            totalPaid: usdcAmount,
            platformFee,
            platformFeePercent: PLATFORM_FEE_PERCENT * 100,
            companyProceeds,
            companyId: offer.companyId
        };
    }

    /**
     * Create a payment transaction for company to sign
     * @param {number} offerId - Offer ID
     * @param {number} companyUserId - Company user initiating payment
     * @returns {Promise<Object>} Transaction XDR for signing
     */
    static async createPaymentTransaction(offerId, companyUserId) {
        const paymentDetails = await this.calculateOwedAmount(offerId);

        if (paymentDetails.totalOwed === 0) {
            throw new Error('No payment owed for this offer');
        }

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

        // Build transaction with payment operations to each investor
        const companyKeypair = Keypair.fromPublicKey(offer.company.stellarPublicKey);
        const usdcAsset = new Asset(USDC_ASSET_CODE, USDC_ISSUER);

        const operations = paymentDetails.breakdown
            .filter(b => b.investorWallet && b.interestOwed > 0)
            .map(b => Operation.payment({
                destination: b.investorWallet,
                asset: usdcAsset,
                amount: b.interestOwed.toFixed(7),
            }));

        if (operations.length === 0) {
            throw new Error('No valid investor wallets to pay');
        }

        // Create unsigned transaction
        // Company will sign this with their passkey
        const transaction = await StellarService.buildUnsignedTransaction(
            offer.company.stellarPublicKey,
            operations,
            `Yield payment for ${offer.assetCode}`
        );

        return {
            transactionXDR: transaction.toXDR(),
            offerId,
            totalAmount: paymentDetails.totalOwed,
            investorCount: operations.length,
            breakdown: paymentDetails.breakdown,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min expiry
        };
    }

    /**
     * Process a signed payment transaction
     * @param {string} signedXDR - Signed transaction XDR
     * @param {number} offerId - Offer ID
     * @returns {Promise<Object>} Transaction result
     */
    static async processSignedPayment(signedXDR, offerId) {
        try {
            // Submit the signed transaction
            const result = await StellarService.submitTransaction(signedXDR);

            if (result.success) {
                // Update offer payment status
                await prisma.offer.update({
                    where: { id: offerId },
                    data: {
                        lastPaymentDate: new Date(),
                        paymentDueStatus: 'current',
                        nextPaymentDue: this.calculateNextPaymentDate(
                            await prisma.offer.findUnique({ where: { id: offerId } })
                        ),
                    }
                });

                // Record interest payments
                const paymentDetails = await this.calculateOwedAmount(offerId);
                const offer = await prisma.offer.findUnique({ where: { id: offerId } });

                for (const payment of paymentDetails.breakdown) {
                    await prisma.interestPayment.create({
                        data: {
                            investorId: payment.investorId,
                            assetCode: offer.assetCode,
                            tokenBalance: payment.investedAmount,
                            interestRate: offer.annualInterestRate,
                            interestAmount: payment.interestOwed,
                            usdcAmount: payment.interestOwed,
                            transactionHash: result.transactionHash,
                            paymentDate: new Date(),
                            paymentType: offer.paymentType,
                            offerId: offer.id,
                            status: 'completed',
                        }
                    });
                }

                console.log(`[CompanyPayment] Payment processed successfully`, {
                    offerId,
                    transactionHash: result.transactionHash,
                    investorsPaid: paymentDetails.breakdown.length,
                    totalPaid: paymentDetails.totalOwed
                });

                return {
                    success: true,
                    transactionHash: result.transactionHash,
                    investorsPaid: paymentDetails.breakdown.length,
                    totalPaid: paymentDetails.totalOwed,
                };
            } else {
                throw new Error(result.error || 'Transaction failed');
            }
        } catch (error) {
            console.error(`[CompanyPayment] Payment failed`, { offerId, error: error.message });
            throw error;
        }
    }

    /**
     * Check for overdue payments and apply penalties
     * @returns {Promise<Array>} List of overdue offers with penalties applied
     */
    static async checkOverduePayments() {
        const now = new Date();

        const overdueOffers = await prisma.offer.findMany({
            where: {
                status: 'active',
                nextPaymentDue: { lt: now },
                paymentDueStatus: { notIn: ['defaulted'] }
            },
            include: { company: true }
        });

        const results = [];

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

                // TODO: Trigger collateral liquidation process
                console.log(`[CompanyPayment] DEFAULT: Offer ${offer.id} defaulted after ${daysOverdue} days`);

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

            results.push({
                offerId: offer.id,
                offerName: offer.offerName,
                companyId: offer.companyId,
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
