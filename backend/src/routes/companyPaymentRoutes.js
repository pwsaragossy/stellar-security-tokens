/**
 * Company Payment Routes
 * API endpoints for company-initiated investor payments
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireCompanyUser } from '../middleware/authorize.js';
import { CompanyPaymentService } from '../services/companyPayment.service.js';
import logger from '../utils/logger.js';
const log = logger.scope('CompanyPayRoutes');

const router = express.Router();

/**
 * GET /api/company/payments
 * Get all upcoming payments for the company
 */
router.get('/', authenticateToken, requireCompanyUser, async (req, res) => {
    const { companyId } = req.user;
    const payments = await CompanyPaymentService.getUpcomingPayments(companyId);

    res.json({
        success: true,
        data: payments
    });
});

/**
 * GET /api/company/payments/:offerId
 * Get payment details for a specific offer
 */
router.get('/:offerId', authenticateToken, requireCompanyUser, async (req, res) => {
    const { offerId } = req.params;
    const { companyId } = req.user;

    // Verify offer belongs to company
    const offer = await prisma.offer.findFirst({
        where: { id: parseInt(offerId), companyId }
    });

    if (!offer) {
        return res.status(404).json({
            success: false,
            error: 'Offer not found'
        });
    }

    let paymentDetails;
    if (offer.paymentType === 'bullet') {
        paymentDetails = await CompanyPaymentService.calculateBulletPayment(parseInt(offerId));
    } else {
        paymentDetails = await CompanyPaymentService.calculateOwedAmount(parseInt(offerId));
    }

    res.json({
        success: true,
        data: paymentDetails
    });
});

/**
 * POST /api/company/payments/:offerId/prepare
 * Prepare a payment transaction for company signature
 * Returns unsigned XDR for the company to sign
 */
router.post('/:offerId/prepare', authenticateToken, requireCompanyUser, async (req, res) => {
    const { offerId } = req.params;
    const { companyId, id: userId } = req.user;

    // Verify offer belongs to company
    const offer = await prisma.offer.findFirst({
        where: { id: parseInt(offerId), companyId }
    });

    if (!offer) {
        return res.status(404).json({
            success: false,
            error: 'Offer not found'
        });
    }

    const transaction = await CompanyPaymentService.createPaymentTransaction(
        parseInt(offerId),
        userId
    );

    res.json({
        success: true,
        data: transaction,
        message: 'Transaction prepared. Sign with your passkey to complete payment.'
    });
});

/**
 * GET /api/company/payments/:offerId/yield-status
 * Check if there's an active yield payment job for this offer.
 * Used by frontend to recover state on page refresh.
 */
router.get('/:offerId/yield-status', authenticateToken, requireCompanyUser, async (req, res) => {
    const { offerId } = req.params;
    const { companyId } = req.user;

    // Verify offer belongs to company
    const offer = await prisma.offer.findFirst({
        where: { id: parseInt(offerId), companyId }
    });

    if (!offer) {
        return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    // Find the most recent non-terminal job
    const activeJob = await prisma.yieldPaymentJob.findFirst({
        where: {
            offerId: parseInt(offerId),
            status: { in: ['prepared', 'submitting'] },
        },
        orderBy: { createdAt: 'desc' },
    });

    if (!activeJob) {
        // Also check for recent completed/partial jobs (within last 30 min)
        const recentJob = await prisma.yieldPaymentJob.findFirst({
            where: {
                offerId: parseInt(offerId),
                status: { in: ['confirmed', 'partial_failure', 'failed'] },
                completedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
            },
            orderBy: { completedAt: 'desc' },
        });

        if (recentJob) {
            return res.json({
                success: true,
                data: {
                    jobId: recentJob.id,
                    status: recentJob.status,
                    batchProgress: {
                        completed: recentJob.status === 'confirmed' ? recentJob.batchCount : 0,
                        total: recentJob.batchCount,
                    },
                    txHashes: recentJob.txHashes ? recentJob.txHashes.split(',') : [],
                },
            });
        }

        return res.json({ success: true, data: null });
    }

    res.json({
        success: true,
        data: {
            jobId: activeJob.id,
            status: activeJob.status,
            batchProgress: {
                completed: 0, // Can't know exact progress without Redis
                total: activeJob.batchCount,
            },
            txHashes: [],
        },
    });
});

/**
 * POST /api/company/payments/:offerId/submit
 * Submit a signed payment transaction
 */
router.post('/:offerId/submit', authenticateToken, requireCompanyUser, async (req, res) => {
    const { offerId } = req.params;
    const { signedXDR, signedXDRs } = req.body;
    const { companyId } = req.user;

    if (!signedXDR && (!signedXDRs || signedXDRs.length === 0)) {
        return res.status(400).json({
            success: false,
            error: 'Signed transaction XDR is required'
        });
    }

    // Verify offer belongs to company
    const offer = await prisma.offer.findFirst({
        where: { id: parseInt(offerId), companyId }
    });

    if (!offer) {
        return res.status(404).json({
            success: false,
            error: 'Offer not found'
        });
    }

    let result;
    if (signedXDRs && signedXDRs.length > 0) {
        // Multi-batch YieldDistributor path
        result = await CompanyPaymentService.processSignedBatches(
            signedXDRs,
            parseInt(offerId)
        );
    } else {
        // Single XDR — check if this is a Soroban YieldDistributor TX
        // (smart wallet investors use C... addresses → Soroban path)
        const investments = await prisma.investment.findMany({
            where: { offerId: parseInt(offerId), status: 'distributed' },
            include: { investor: { select: { stellarContractId: true, stellarPublicKey: true } } },
        });
        const hasSmartWallet = investments.some(inv =>
            (inv.investor.stellarContractId || inv.investor.stellarPublicKey)?.startsWith('C')
        );

        if (hasSmartWallet) {
            // Route through batch path (wrapping single XDR in array)
            result = await CompanyPaymentService.processSignedBatches(
                [signedXDR],
                parseInt(offerId)
            );
        } else {
            // Classic G... wallet path
            result = await CompanyPaymentService.processSignedPayment(
                signedXDR,
                parseInt(offerId)
            );
        }
    }

    res.json({
        success: true,
        data: result,
        message: 'Payment submitted successfully'
    });
});

/**
 * GET /api/company/payments/:offerId/history
 * Get payment history for an offer
 */
router.get('/:offerId/history', authenticateToken, requireCompanyUser, async (req, res) => {
    const { offerId } = req.params;
    const { companyId } = req.user;

    // Verify offer belongs to company
    const offer = await prisma.offer.findFirst({
        where: { id: parseInt(offerId), companyId }
    });

    if (!offer) {
        return res.status(404).json({
            success: false,
            error: 'Offer not found'
        });
    }

    const payments = await prisma.interestPayment.findMany({
        where: { offerId: parseInt(offerId) },
        orderBy: { paymentDate: 'desc' },
        include: {
            investor: {
                select: { id: true, name: true, email: true }
            }
        }
    });

    res.json({
        success: true,
        data: payments
    });
});

/**
 * GET /api/company/payments/penalties
 * Get all penalties for the company
 */
router.get('/penalties/all', authenticateToken, requireCompanyUser, async (req, res) => {
    const { companyId } = req.user;

    const penalties = await prisma.companyPenalty.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' }
    });

    res.json({
        success: true,
        data: penalties
    });
});

// ═══════════════════════════════════════════════════════════════
// SETTLEMENT DEPOSIT (Company → Soroban Contract)
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/company/payments/:offerId/prepare-deposit
 * Calculate deposit amount server-side and build Soroban deposit TX.
 * Returns XDR for company signature + full breakdown of what they're paying.
 */
router.post('/:offerId/prepare-deposit', authenticateToken, requireCompanyUser, async (req, res) => {
    try {
        const { offerId } = req.params;
        const { companyId } = req.user;

        // Verify offer belongs to company
        const offer = await prisma.offer.findFirst({
            where: { id: parseInt(offerId), companyId }
        });
        if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });
        if (offer.paymentType !== 'bullet') {
            return res.status(400).json({ success: false, error: 'Settlement deposit is only for bullet (maturity) offers' });
        }
        if (!offer.sorobanSettlementContractId) {
            return res.status(400).json({ success: false, error: 'No settlement contract deployed. Contact admin.' });
        }

        // Calculate bullet payment server-side (source of truth)
        const bulletDetails = await CompanyPaymentService.calculateBulletPayment(parseInt(offerId));

        // Company pays: totalPayout (investor principal + investorRate interest) + spread (company fee)
        const round7 = v => Math.round(v * 10_000_000) / 10_000_000;
        const investorPayout = bulletDetails.totalPayout;
        const companyInterest = bulletDetails.companyTotalInterest || bulletDetails.totalInterest;
        const investorInterest = bulletDetails.totalInterest;
        const platformFee = round7(Math.max(0, companyInterest - investorInterest));
        const depositAmount = round7(investorPayout + platformFee);

        // Build Soroban deposit TX
        const { SorobanSettlementService } = await import('../services/sorobanSettlement.service.js');
        const depositTx = await SorobanSettlementService.buildDepositXdr(parseInt(offerId), depositAmount);

        res.json({
            success: true,
            data: {
                // TX for signing
                xdr: depositTx.xdr,
                networkPassphrase: depositTx.networkPassphrase,
                contractId: depositTx.contractId,
                // Breakdown for the company UI (shows what they're paying & why)
                depositAmount,
                breakdown: {
                    investorPrincipal: bulletDetails.totalPrincipal,
                    investorInterest: round7(investorInterest),
                    platformFee,
                    totalOwed: depositAmount,
                },
                investorCount: bulletDetails.investorCount,
                maturityDate: bulletDetails.maturityDate,
            },
        });
    } catch (error) {
        log.error('[prepare-deposit] Failed', { error: error.message });
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/company/payments/:offerId/submit-deposit
 * Submit company-signed Soroban deposit TX directly to Soroban RPC.
 * No admin multisig needed — company is just transferring their own USDC.
 */
router.post('/:offerId/submit-deposit', authenticateToken, requireCompanyUser, async (req, res) => {
    try {
        const { offerId } = req.params;
        const { signedXDR } = req.body;
        const { companyId } = req.user;

        if (!signedXDR) {
            return res.status(400).json({ success: false, error: 'Signed transaction XDR is required' });
        }

        // Verify offer belongs to company
        const offer = await prisma.offer.findFirst({
            where: { id: parseInt(offerId), companyId }
        });
        if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });

        // Submit directly to Soroban RPC — no admin queue
        const { StellarService: StellarSvc } = await import('../services/stellar.service.js');
        const result = await StellarSvc.submitTransaction(signedXDR);

        if (result.success) {
            log.info(`[submit-deposit] Offer ${offerId}: deposit TX submitted`, {
                hash: result.hash || result.transactionHash,
            });

            // Notify all platform admins that a company deposited for maturity settlement
            try {
                const admins = await prisma.platformAdmin.findMany({
                    where: { isActive: true },
                    select: { id: true, email: true, name: true },
                });
                const { NotificationService } = await import('../services/notification.service.js');
                const { EmailService } = await import('../services/email.service.js');
                const companyName = req.user.companyName || 'Company';
                const notifTitle = `💰 Maturity Deposit — ${offer.offerName || offer.assetCode}`;
                const notifMessage = `${companyName} deposited USDC to the settlement contract for "${offer.offerName}". Review the offer and execute settlement when ready.`;
                const actionLink = `/admin?tab=offers&id=${offer.id}`;

                for (const admin of admins) {
                    // Bell notification
                    await NotificationService.createNotification(
                        admin.id,
                        'platform_admin',
                        'warning',
                        notifTitle,
                        notifMessage,
                        actionLink,
                    );
                    // Email alert
                    await EmailService.sendAdminAlert(admin.email, admin.name, {
                        title: `Maturity Deposit — ${offer.offerName || offer.assetCode}`,
                        message: notifMessage,
                        actionUrl: actionLink,
                        actionLabel: 'Review Settlement',
                        severity: 'warning',
                    });
                }
                log.info(`[submit-deposit] Notified ${admins.length} admins (bell + email) about deposit for offer ${offerId}`);
            } catch (notifErr) {
                log.warn('[submit-deposit] Failed to send admin notifications:', notifErr.message);
            }

            res.json({
                success: true,
                data: {
                    status: 'deposited',
                    transactionHash: result.hash || result.transactionHash,
                },
                message: 'USDC deposited to settlement contract. Admin will trigger settlement.',
            });
        } else {
            throw new Error(result.error || 'Soroban TX submission failed');
        }
    } catch (error) {
        log.error('[submit-deposit] Failed', { error: error.message });
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/company/payments/:offerId/settlement-status
 * Company-facing: check if settlement contract exists and its balance.
 * Used by PayInvestors to show deposit state (already deposited, awaiting settlement, etc).
 */
router.get('/:offerId/settlement-status', authenticateToken, requireCompanyUser, async (req, res) => {
    try {
        const { offerId } = req.params;
        const { companyId } = req.user;

        const offer = await prisma.offer.findFirst({
            where: { id: parseInt(offerId), companyId }
        });
        if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });

        let contractBalance = null;
        if (offer.sorobanSettlementContractId) {
            try {
                const { SorobanSettlementService } = await import('../services/sorobanSettlement.service.js');
                contractBalance = await SorobanSettlementService.getContractBalance(parseInt(offerId));
            } catch { /* silent — contract may not be deployed yet */ }
        }

        res.json({
            success: true,
            data: {
                offerId: parseInt(offerId),
                offerType: offer.offerType,
                offerStatus: offer.status,
                settlementContractId: offer.sorobanSettlementContractId || null,
                contractBalance,
                maturityDate: offer.maturityDate,
                hasSettlementContract: !!offer.sorobanSettlementContractId,
            },
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

export default router;

