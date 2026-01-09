/**
 * Collateral Distribution Service
 * Handles collateral token distribution to investors on company default
 */
import prisma from '../config/prisma.js';
import { StellarService } from './stellar.service.js';
import { NotificationService } from './notification.service.js';
import { EmailService } from './email.service.js';
import { Asset, Operation, Keypair } from '@stellar/stellar-sdk';

/**
 * Collateral Distribution Service
 * Used by admins to distribute collateral tokens to investors when a company defaults
 */
export class CollateralDistributionService {

    /**
     * Get all defaulted offers awaiting admin action
     * @returns {Promise<Array>} List of defaulted offers with details
     */
    static async getDefaultedOffers() {
        const offers = await prisma.offer.findMany({
            where: {
                paymentDueStatus: 'defaulted',
                status: 'active'
            },
            include: {
                company: true,
                investments: {
                    where: { status: 'distributed' },
                    include: { investor: true }
                },
                tokens: true
            },
            orderBy: { updatedAt: 'desc' }
        });

        return offers.map(offer => ({
            offerId: offer.id,
            assetCode: offer.assetCode,
            offerName: offer.offerName,
            companyId: offer.companyId,
            companyName: offer.company.name,
            defaultedAt: offer.updatedAt,
            totalInvested: offer.investments.reduce((sum, inv) => sum + parseFloat(inv.usdcAmount), 0),
            investorCount: offer.investments.length,
            collateralType: offer.collateralType,
            collateralDescription: offer.collateralDescription,
            collateralValue: parseFloat(offer.collateralValue || 0),
            // Calculate pro-rata distribution
            distributions: offer.investments.map(inv => {
                const investedAmount = parseFloat(inv.usdcAmount);
                const totalInvested = offer.investments.reduce((s, i) => s + parseFloat(i.usdcAmount), 0);
                const proportion = totalInvested > 0 ? investedAmount / totalInvested : 0;

                return {
                    investorId: inv.investorId,
                    investorName: inv.investor.name,
                    investorEmail: inv.investor.email,
                    investorWallet: inv.investor.stellarPublicKey,
                    investedAmount,
                    proportion,
                    collateralShare: parseFloat(offer.collateralValue || 0) * proportion,
                    // Token amount to receive
                    tokenAmount: parseFloat(inv.tokenAmount),
                };
            })
        }));
    }

    /**
     * Get single defaulted offer details
     * @param {number} offerId - Offer ID
     */
    static async getDefaultedOfferDetails(offerId) {
        const offers = await this.getDefaultedOffers();
        return offers.find(o => o.offerId === offerId);
    }

    /**
     * Prepare collateral distribution transaction for admin signing
     * Transfers collateral tokens (security tokens) from issuer/distributor to investors
     * @param {number} offerId - Defaulted offer ID
     * @returns {Promise<Object>} Unsigned transaction XDR
     */
    static async prepareCollateralDistribution(offerId) {
        const offerDetails = await this.getDefaultedOfferDetails(offerId);

        if (!offerDetails) {
            throw new Error(`Offer ${offerId} not found or not in defaulted state`);
        }

        const offer = await prisma.offer.findUnique({
            where: { id: offerId },
            include: { tokens: true }
        });

        if (!offer.tokens || offer.tokens.length === 0) {
            throw new Error('No token associated with this offer');
        }

        const token = offer.tokens[0];
        const issuerPublicKey = process.env.STELLAR_ISSUER_PUBLIC_KEY;
        const distributorPublicKey = process.env.DISTRIBUTOR_PUBLIC_KEY || process.env.TREASURY_PUBLIC_KEY;

        if (!distributorPublicKey) {
            throw new Error('Distributor/Treasury public key not configured');
        }

        // Create payment operations to each investor
        // Collateral tokens are the security tokens representing ownership rights
        const collateralAsset = new Asset(offer.assetCode, issuerPublicKey);

        const operations = offerDetails.distributions
            .filter(d => d.investorWallet && d.tokenAmount > 0)
            .map(d => Operation.payment({
                destination: d.investorWallet,
                asset: collateralAsset,
                amount: d.tokenAmount.toFixed(7),
                source: distributorPublicKey
            }));

        if (operations.length === 0) {
            throw new Error('No valid investor wallets to distribute to');
        }

        // Build unsigned transaction from distributor account
        const transaction = await StellarService.buildUnsignedTransaction(
            distributorPublicKey,
            operations,
            `Collateral distribution for defaulted offer ${offer.assetCode}`
        );

        return {
            transactionXDR: transaction.toXDR(),
            offerId,
            assetCode: offer.assetCode,
            offerName: offer.offerName,
            investorCount: operations.length,
            totalTokens: offerDetails.distributions.reduce((sum, d) => sum + d.tokenAmount, 0),
            distributions: offerDetails.distributions,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 min expiry
        };
    }

    /**
     * Process signed collateral distribution transaction
     * @param {string} signedXDR - Signed transaction XDR
     * @param {number} offerId - Offer ID
     * @param {number} adminId - Admin user ID
     */
    static async processCollateralDistribution(signedXDR, offerId, adminId) {
        try {
            // Submit transaction
            const result = await StellarService.submitTransaction(signedXDR);

            if (!result.success) {
                throw new Error(result.error || 'Transaction failed');
            }

            const offerDetails = await this.getDefaultedOfferDetails(offerId);

            // Update offer status
            await prisma.offer.update({
                where: { id: offerId },
                data: {
                    status: 'closed',
                    paymentDueStatus: 'defaulted'
                }
            });

            // Record the collateral distribution in penalties
            await prisma.companyPenalty.updateMany({
                where: {
                    offerId,
                    penaltyType: 'default_fee',
                    status: 'pending'
                },
                data: {
                    status: 'enforced',
                    enforcedAt: new Date()
                }
            });

            // Notify investors
            for (const distribution of offerDetails.distributions) {
                try {
                    // Create notification
                    await NotificationService.createNotification({
                        userId: distribution.investorId,
                        userType: 'investor',
                        type: 'info',
                        title: `Collateral Received: ${offerDetails.assetCode}`,
                        message: `You have received ${distribution.tokenAmount.toFixed(2)} ${offerDetails.assetCode} tokens as collateral due to company default.`,
                        actionLink: '/investor/portfolio'
                    });

                    // Send email
                    await EmailService.sendCollateralReceivedNotification({
                        to: distribution.investorEmail,
                        investorName: distribution.investorName,
                        offerName: offerDetails.offerName,
                        companyName: offerDetails.companyName,
                        tokenAmount: distribution.tokenAmount,
                        assetCode: offerDetails.assetCode,
                        collateralDescription: offerDetails.collateralDescription
                    });
                } catch (notifyError) {
                    console.error(`Failed to notify investor ${distribution.investorId}:`, notifyError);
                }
            }

            console.log(`[CollateralDistribution] Collateral distributed for offer ${offerId}`, {
                adminId,
                transactionHash: result.transactionHash,
                investorCount: offerDetails.distributions.length
            });

            return {
                success: true,
                transactionHash: result.transactionHash,
                investorCount: offerDetails.distributions.length,
                offerId
            };

        } catch (error) {
            console.error(`[CollateralDistribution] Failed for offer ${offerId}:`, error);
            throw error;
        }
    }

    /**
     * Get default statistics for admin dashboard
     */
    static async getDefaultStatistics() {
        const [pendingDefaults, resolvedDefaults, totalPenalties] = await Promise.all([
            prisma.offer.count({
                where: { paymentDueStatus: 'defaulted', status: 'active' }
            }),
            prisma.offer.count({
                where: { paymentDueStatus: 'defaulted', status: 'closed' }
            }),
            prisma.companyPenalty.aggregate({
                where: { status: 'pending' },
                _sum: { amount: true }
            })
        ]);

        return {
            pendingDefaults,
            resolvedDefaults,
            totalPendingPenalties: parseFloat(totalPenalties._sum.amount || 0)
        };
    }
}

export default CollateralDistributionService;
