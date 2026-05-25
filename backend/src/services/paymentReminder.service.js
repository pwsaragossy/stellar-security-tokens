/**
 * Payment Reminder Service
 * Handles automated payment reminders via email and notifications
 * 
 * Schedule:
 * - 30 days before: Initial reminder
 * - 21 days before: Weekly reminder
 * - 14 days before: Weekly reminder  
 * - 7 days before: Last week warning
 * - 6-2 days before: Daily reminders
 * - 1 day before: Final warning
 * - Due day: Day-of reminder
 * - Overdue: Escalating warnings
 */
import cron from 'node-cron';
import prisma from '../config/prisma.js';
import { CompanyPaymentService } from './companyPayment.service.js';
import { EmailService } from './email.service.js';
import { NotificationService } from './notification.service.js';
import logger from '../utils/logger.js';
const log = logger.scope('PaymentReminder');

// Reminder schedule configuration (days before due date)
const REMINDER_SCHEDULE = [
    { daysBeforeDue: 30, type: '30_day', sendEmail: true, sendNotification: false },
    { daysBeforeDue: 21, type: '21_day', sendEmail: true, sendNotification: true },
    { daysBeforeDue: 14, type: '14_day', sendEmail: true, sendNotification: true },
    { daysBeforeDue: 7, type: '7_day', sendEmail: true, sendNotification: true },
    { daysBeforeDue: 6, type: '6_day', sendEmail: true, sendNotification: true },
    { daysBeforeDue: 5, type: '5_day', sendEmail: true, sendNotification: true },
    { daysBeforeDue: 4, type: '4_day', sendEmail: true, sendNotification: true },
    { daysBeforeDue: 3, type: '3_day', sendEmail: true, sendNotification: true },
    { daysBeforeDue: 2, type: '2_day', sendEmail: true, sendNotification: true },
    { daysBeforeDue: 1, type: '1_day', sendEmail: true, sendNotification: true },
    { daysBeforeDue: 0, type: 'due_day', sendEmail: true, sendNotification: true },
];

let reminderJob = null;

export class PaymentReminderService {

    /**
     * Start the payment reminder scheduler
     * Runs daily at 09:00 UTC to check for upcoming payments
     */
    static startReminderScheduler() {
        if (reminderJob) {
            log.info('[PaymentReminder] Scheduler already running');
            return reminderJob;
        }

        // Run daily at 09:00 UTC
        reminderJob = cron.schedule('0 9 * * *', async () => {
            log.info('[PaymentReminder] Running daily reminder check');
            try {
                await this.processReminders();
            } catch (error) {
                log.error('[PaymentReminder] Error processing reminders', error);
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        });

        log.info('[PaymentReminder] Reminder scheduler started (daily at 09:00 UTC)');
        return reminderJob;
    }

    /**
     * Stop the reminder scheduler
     */
    static stopReminderScheduler() {
        if (reminderJob) {
            reminderJob.stop();
            reminderJob = null;
            log.info('[PaymentReminder] Reminder scheduler stopped');
        }
    }

    /**
     * Process all pending reminders
     * Called by the scheduler daily
     */
    static async processReminders() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get all active offers with upcoming payments
        // Includes 'matured' so bullet offers past maturity still get reminded.
        const offers = await prisma.offer.findMany({
            where: {
                status: { in: ['active', 'matured'] },
                nextPaymentDue: { not: null },
                paymentDueStatus: { notIn: ['defaulted'] }
            },
            include: {
                company: true,
                investments: {
                    where: { status: 'distributed' }
                }
            }
        });

        let remindersSent = 0;

        for (const offer of offers) {
            if (!offer.nextPaymentDue || offer.investments.length === 0) {
                continue;
            }

            // ─── MATURITY GUARD: skip offers that completed all payments ─── SB-3
            if (offer.paymentType !== 'bullet') {
                const totalExpected = CompanyPaymentService.computeTotalExpectedPayments(offer);
                if (totalExpected !== null && offer.periodicPaymentsCompleted >= totalExpected) {
                    log.info(`[PaymentReminder] Skipping maturity-completed offer ${offer.id} (${offer.periodicPaymentsCompleted}/${totalExpected} payments done)`);
                    continue;
                }
            }

            const dueDate = new Date(offer.nextPaymentDue);
            dueDate.setHours(0, 0, 0, 0);

            const daysUntilDue = Math.ceil((dueDate - today) / (24 * 60 * 60 * 1000));

            // Check which reminder to send
            for (const schedule of REMINDER_SCHEDULE) {
                if (daysUntilDue === schedule.daysBeforeDue) {
                    const sent = await this.sendReminder(offer, schedule.type, dueDate);
                    if (sent) remindersSent++;
                    break;
                }
            }

            // Check for overdue reminders (past due date)
            if (daysUntilDue < 0) {
                const daysOverdue = Math.abs(daysUntilDue);
                await this.sendOverdueReminder(offer, daysOverdue, dueDate);
                remindersSent++;
            }

            // Update payment due status
            await this.updatePaymentDueStatus(offer, daysUntilDue);
        }

        log.info(`[PaymentReminder] Processed ${offers.length} offers, sent ${remindersSent} reminders`);
        return { offersChecked: offers.length, remindersSent };
    }

    /**
     * Send a payment reminder
     * @param {Object} offer - Offer with company and investments
     * @param {string} reminderType - Type of reminder (30_day, 7_day, etc.)
     * @param {Date} dueDate - Payment due date
     * @returns {Promise<boolean>} True if reminder was sent
     */
    static async sendReminder(offer, reminderType, dueDate) {
        // Check if reminder already sent
        const existingReminder = await prisma.paymentReminder.findUnique({
            where: {
                offerId_reminderType_dueDate: {
                    offerId: offer.id,
                    reminderType,
                    dueDate
                }
            }
        });

        if (existingReminder) {
            return false; // Already sent
        }

        // Calculate amount due
        const totalInvested = offer.investments.reduce(
            (sum, inv) => sum + parseFloat(inv.usdcAmount),
            0
        );
        const annualRate = parseFloat(offer.annualInterestRate || 0);
        const periodsPerYear = this.getPeriodsPerYear(offer.paymentType);
        const amountDue = totalInvested * (annualRate / 100 / periodsPerYear);

        // Get company users to notify
        const companyUsers = await prisma.companyUser.findMany({
            where: { companyId: offer.companyId, isActive: true }
        });

        const schedule = REMINDER_SCHEDULE.find(s => s.type === reminderType);

        // Send email if configured
        if (schedule?.sendEmail) {
            for (const user of companyUsers) {
                try {
                    await EmailService.sendPaymentReminder({
                        to: user.email,
                        userName: user.name,
                        companyName: offer.company.name,
                        offerName: offer.offerName,
                        assetCode: offer.assetCode,
                        dueDate,
                        amountDue,
                        daysRemaining: schedule.daysBeforeDue,
                        reminderType,
                        payInvestorsUrl: `${process.env.FRONTEND_URL}/company/payments/${offer.id}`
                    });
                } catch (error) {
                    log.error(`[PaymentReminder] Email failed for ${user.email}`, error);
                }
            }
        }

        // Send dashboard notification if configured
        // (NotificationService.createNotification is positional, not object-style — was a silent bug)
        if (schedule?.sendNotification) {
            for (const user of companyUsers) {
                try {
                    await NotificationService.createNotification(
                        user.id,
                        'company_user',
                        schedule.daysBeforeDue <= 3 ? 'warning' : 'info',
                        this.getReminderTitle(reminderType, offer.offerName),
                        this.getReminderMessage(reminderType, amountDue, dueDate),
                        `/company/payments/${offer.id}`,
                    );
                } catch (error) {
                    log.error(`[PaymentReminder] Notification failed for user ${user.id}`, error);
                }
            }
        }

        // Record the reminder
        await prisma.paymentReminder.create({
            data: {
                offerId: offer.id,
                companyId: offer.companyId,
                reminderType,
                dueDate,
                amountDue,
                sentVia: schedule?.sendEmail && schedule?.sendNotification ? 'both' :
                    schedule?.sendEmail ? 'email' : 'notification'
            }
        });

        log.info(`[PaymentReminder] Sent ${reminderType} reminder for offer ${offer.id}`);
        return true;
    }

    /**
     * Send overdue payment reminder with escalating urgency.
     *
     * Handles three flavors:
     *   1. Periodic offer with a missed installment (interest payment).
     *   2. Bullet offer past maturity (principal + interest due).
     *   3. Periodic offer past maturity (principal-only return due).
     *
     * Cooldown: send max one reminder per day (existing dedup), AND stop entirely
     * after 30 cumulative overdue reminders (escalate to admin instead).
     */
    static async sendOverdueReminder(offer, daysOverdue, dueDate) {
        const GRACE_PERIOD = 10;
        const COOLDOWN_LIMIT = 30; // after 30 daily reminders, stop nagging — escalate to admin
        const daysUntilDefault = Math.max(0, GRACE_PERIOD - daysOverdue);

        const isBullet = offer.paymentType === 'bullet';
        const isCollateralAtMaturity = offer.offerType === 'collateral'
            && offer.maturityDate
            && new Date(offer.maturityDate) < new Date();

        // Compute amount due correctly for each scenario.
        const totalInvested = offer.investments.reduce(
            (sum, inv) => sum + parseFloat(inv.usdcAmount), 0
        );
        const annualRate = parseFloat(offer.annualInterestRate || 0);
        const investorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);

        let amountDue;
        let reminderContext;
        if (isBullet && isCollateralAtMaturity) {
            // Bullet at maturity: principal + accrued interest at investor rate
            const yearsToMaturity = (new Date(offer.maturityDate) - new Date(offer.createdAt)) / (365 * 24 * 60 * 60 * 1000);
            const interest = totalInvested * (investorRate / 100) * yearsToMaturity;
            amountDue = totalInvested + interest;
            reminderContext = 'principal_plus_interest';
        } else if (!isBullet && isCollateralAtMaturity) {
            // Periodic at maturity: principal only (interest already paid via dividends)
            amountDue = totalInvested;
            reminderContext = 'principal_only';
        } else {
            // Periodic missed installment (interest only)
            const periodsPerYear = this.getPeriodsPerYear(offer.paymentType);
            amountDue = totalInvested * (investorRate / 100 / periodsPerYear);
            reminderContext = 'periodic_interest';
        }

        // Only send one overdue reminder per day
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [existingOverdueToday, totalOverdueReminders] = await Promise.all([
            prisma.paymentReminder.findFirst({
                where: { offerId: offer.id, reminderType: 'overdue', sentAt: { gte: todayStart } }
            }),
            prisma.paymentReminder.count({
                where: { offerId: offer.id, reminderType: 'overdue' }
            })
        ]);

        if (existingOverdueToday) return;

        // Cooldown: after COOLDOWN_LIMIT cumulative overdue reminders, stop spamming
        // the company and escalate to admin instead (one-time notification).
        if (totalOverdueReminders >= COOLDOWN_LIMIT) {
            const escalationKey = `escalation:${offer.id}`;
            const alreadyEscalated = await prisma.paymentReminder.findFirst({
                where: { offerId: offer.id, reminderType: escalationKey }
            });
            if (!alreadyEscalated) {
                log.warn(`[PaymentReminder] Cooldown reached for offer ${offer.id} (${totalOverdueReminders} reminders) — escalating to admin`);
                try {
                    const admins = await prisma.platformAdmin.findMany({
                        where: { isActive: true }, select: { id: true, email: true, name: true }
                    });
                    for (const admin of admins) {
                        await NotificationService.createNotification(
                            admin.id, 'platform_admin', 'error',
                            `⚠ Company abandoned offer: ${offer.assetCode}`,
                            `Company "${offer.company.name}" has ignored ${totalOverdueReminders} reminders for offer "${offer.offerName}" (${offer.assetCode}). Consider declaring default via the admin panel.`,
                            `/admin?tab=offers&id=${offer.id}`,
                        );
                    }
                    await prisma.paymentReminder.create({
                        data: {
                            offerId: offer.id, companyId: offer.companyId,
                            reminderType: escalationKey, dueDate, amountDue, sentVia: 'notification'
                        }
                    });
                } catch (escErr) {
                    log.error(`[PaymentReminder] Admin escalation failed for offer ${offer.id}`, escErr);
                }
            }
            return;
        }

        const companyUsers = await prisma.companyUser.findMany({
            where: { companyId: offer.companyId, isActive: true }
        });

        // Send urgent email (NO late_fee — late fees are disabled until legal framework is in place)
        for (const user of companyUsers) {
            try {
                await EmailService.sendOverduePaymentWarning({
                    to: user.email,
                    userName: user.name,
                    companyName: offer.company.name,
                    offerName: offer.offerName,
                    assetCode: offer.assetCode,
                    daysOverdue,
                    daysUntilDefault,
                    baseAmount: amountDue,
                    lateFee: 0,        // explicit zero — see companyPayment.service.js LATE_FEE_PERCENT_PER_DAY
                    totalDue: amountDue,
                    collateralAtRisk: daysUntilDefault <= 3,
                    reminderContext,
                    payInvestorsUrl: `${process.env.FRONTEND_URL}/company/payments/${offer.id}`
                });
            } catch (error) {
                log.error(`[PaymentReminder] Overdue email failed for ${user.email}`, error);
            }
        }

        // Send in-app notification — messaging is honest about what's at stake
        // (collateral execution upon admin default declaration) without claiming
        // late fees that the system does not actually charge.
        for (const user of companyUsers) {
            const isPrincipalReturn = reminderContext === 'principal_only' || reminderContext === 'principal_plus_interest';
            await NotificationService.createNotification(
                user.id,
                'company_user',
                'error',
                daysUntilDefault <= 3
                    ? `⚠ URGENT: Collateral at risk for ${offer.offerName}`
                    : `Payment overdue: ${offer.offerName}`,
                daysUntilDefault <= 3
                    ? `Pay immediately to prevent admin from declaring default. ${daysUntilDefault} day(s) remaining before declaration is possible.`
                    : (isPrincipalReturn
                        ? `Principal return overdue by ${daysOverdue} day(s). Admin may formally declare default after grace period (10 days).`
                        : `Periodic payment overdue by ${daysOverdue} day(s). Pay to avoid escalation.`),
                `/company/payments/${offer.id}`,
            );
        }

        // Record overdue reminder
        await prisma.paymentReminder.create({
            data: {
                offerId: offer.id,
                companyId: offer.companyId,
                reminderType: 'overdue',
                dueDate,
                amountDue,
                sentVia: 'both'
            }
        });
    }

    /**
     * Update the payment due status of an offer
     */
    static async updatePaymentDueStatus(offer, daysUntilDue) {
        let newStatus;

        if (daysUntilDue < -10) {
            // Past grace period. For any COLLATERAL (debt) offer past maturity,
            // never auto-escalate to 'defaulted' — admin must declare default
            // explicitly via /admin/offers/:id/mark-defaulted (regulatory:
            // execução de garantia requires formal admin act, not a cron flip).
            // This covers bullet (single payout at maturity) AND periodic
            // (interest paid during, principal return at maturity).
            const isCollateralAtMaturity = offer.offerType === 'collateral'
                && offer.maturityDate
                && new Date(offer.maturityDate) < new Date();
            newStatus = isCollateralAtMaturity ? 'overdue' : 'defaulted';
        } else if (daysUntilDue < 0) {
            newStatus = 'overdue';
        } else if (daysUntilDue === 0) {
            newStatus = 'due';
        } else if (daysUntilDue <= 30) {
            newStatus = 'upcoming';
        } else {
            newStatus = 'current';
        }

        if (newStatus !== offer.paymentDueStatus) {
            await prisma.offer.update({
                where: { id: offer.id },
                data: { paymentDueStatus: newStatus }
            });
        }
    }

    // ============ Helper Methods ============

    static getPeriodsPerYear(paymentType) {
        switch (paymentType) {
            case 'monthly': return 12;
            case 'quarterly': return 4;
            case 'semi_annual': return 2;
            case 'annual': return 1;
            default: return 12;
        }
    }

    static getReminderTitle(reminderType, offerName) {
        switch (reminderType) {
            case '30_day': return `Payment due in 30 days: ${offerName}`;
            case '21_day': return `Payment reminder: ${offerName}`;
            case '14_day': return `2 weeks until payment: ${offerName}`;
            case '7_day': return `1 week until payment: ${offerName}`;
            case '3_day': return `⚠️ 3 days until payment: ${offerName}`;
            case '2_day': return `⚠️ 2 days until payment: ${offerName}`;
            case '1_day': return `⚠️ Payment due tomorrow: ${offerName}`;
            case 'due_day': return `🔴 Payment due today: ${offerName}`;
            default: return `Payment reminder: ${offerName}`;
        }
    }

    static getReminderMessage(reminderType, amountDue, dueDate) {
        const formattedAmount = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amountDue);

        const formattedDate = dueDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        switch (reminderType) {
            case '30_day':
                return `Your next investor payment of ${formattedAmount} is due on ${formattedDate}.`;
            case '7_day':
                return `Reminder: ${formattedAmount} due to investors on ${formattedDate}. Click to pay now.`;
            case '1_day':
                return `FINAL REMINDER: ${formattedAmount} due tomorrow. Pay now to avoid late fees.`;
            case 'due_day':
                return `Payment of ${formattedAmount} is due TODAY. Pay immediately to avoid penalties.`;
            default:
                return `${formattedAmount} due on ${formattedDate}. Click to pay investors.`;
        }
    }
}

export default PaymentReminderService;
