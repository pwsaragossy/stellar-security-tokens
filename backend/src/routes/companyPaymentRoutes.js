/**
 * Company Payment Routes
 * API endpoints for company-initiated investor payments
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { authenticateToken, requireCompanyUser } from '../middleware/auth.js';
import { CompanyPaymentService } from '../services/companyPayment.service.js';
import logger from '../utils/logger.js';
const log = logger.scope('CompanyPayRoutes');

const router = express.Router();

/**
 * GET /api/company/payments
 * Get all upcoming payments for the company
 */
router.get('/', authenticateToken, requireCompanyUser, async (req, res) => {
    try {
        const { companyId } = req.user;
        const payments = await CompanyPaymentService.getUpcomingPayments(companyId);

        res.json({
            success: true,
            data: payments
        });
    } catch (error) {
        log.error('[CompanyPayments] Error getting payments:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/company/payments/:offerId
 * Get payment details for a specific offer
 */
router.get('/:offerId', authenticateToken, requireCompanyUser, async (req, res) => {
    try {
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
    } catch (error) {
        log.error('[CompanyPayments] Error getting payment details:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/company/payments/:offerId/prepare
 * Prepare a payment transaction for company signature
 * Returns unsigned XDR for the company to sign
 */
router.post('/:offerId/prepare', authenticateToken, requireCompanyUser, async (req, res) => {
    try {
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
            userId,
            { batchGroupId: req.body.batchGroupId }
        );

        res.json({
            success: true,
            data: transaction,
            message: transaction.isBullet
                ? `Batch prepared (${transaction.investorCount} investors). Sign to continue.`
                : 'Transaction prepared. Sign with your passkey to complete payment.'
        });
    } catch (error) {
        log.error('[CompanyPayments] Error preparing payment:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/company/payments/:offerId/submit
 * Submit a signed payment transaction
 */
router.post('/:offerId/submit', authenticateToken, requireCompanyUser, async (req, res) => {
    try {
        const { offerId } = req.params;
        const { signedXDR } = req.body;
        const { companyId } = req.user;

        if (!signedXDR) {
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

        const result = await CompanyPaymentService.processSignedPayment(
            signedXDR,
            parseInt(offerId),
            {
                batchGroupId: req.body.batchGroupId,
                batchInfo: req.body.batchInfo,
            }
        );

        // Dynamic message based on status
        const messages = {
            completed: 'Payment submitted successfully',
            batch_queued: 'Batch signed. Continue to next batch.',
            pending_admin_approval: 'All batches submitted. Awaiting platform admin approval.',
        };

        res.json({
            success: true,
            data: result,
            message: messages[result.status] || 'Payment processed'
        });
    } catch (error) {
        log.error('[CompanyPayments] Error submitting payment:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/company/payments/:offerId/history
 * Get payment history for an offer
 */
router.get('/:offerId/history', authenticateToken, requireCompanyUser, async (req, res) => {
    try {
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
    } catch (error) {
        log.error('[CompanyPayments] Error getting payment history:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/company/payments/penalties
 * Get all penalties for the company
 */
router.get('/penalties/all', authenticateToken, requireCompanyUser, async (req, res) => {
    try {
        const { companyId } = req.user;

        const penalties = await prisma.companyPenalty.findMany({
            where: { companyId },
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            success: true,
            data: penalties
        });
    } catch (error) {
        log.error('[CompanyPayments] Error getting penalties:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
