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
import { EmailService } from './email.service.js';
import { NotificationService } from './notification.service.js';

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
            console.log('[PaymentReminder] Scheduler already running');
            return reminderJob;
        }

        // Run daily at 09:00 UTC
        reminderJob = cron.schedule('0 9 * * *', async () => {
            console.log('[PaymentReminder] Running daily reminder check');
            try {
                await this.processReminders();
            } catch (error) {
                console.error('[PaymentReminder] Error processing reminders', error);
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        });

        console.log('[PaymentReminder] Reminder scheduler started (daily at 09:00 UTC)');
        return reminderJob;
    }

    /**
     * Stop the reminder scheduler
     */
    static stopReminderScheduler() {
        if (reminderJob) {
            reminderJob.stop();
            reminderJob = null;
            console.log('[PaymentReminder] Reminder scheduler stopped');
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
        const offers = await prisma.offer.findMany({
            where: {
                status: 'active',
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

        console.log(`[PaymentReminder] Processed ${offers.length} offers, sent ${remindersSent} reminders`);
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
                    console.error(`[PaymentReminder] Email failed for ${user.email}`, error);
                }
            }
        }

        // Send dashboard notification if configured
        if (schedule?.sendNotification) {
            for (const user of companyUsers) {
                try {
                    await NotificationService.createNotification({
                        userId: user.id,
                        userType: 'company_user',
                        type: schedule.daysBeforeDue <= 3 ? 'warning' : 'info',
                        title: this.getReminderTitle(reminderType, offer.offerName),
                        message: this.getReminderMessage(reminderType, amountDue, dueDate),
                        actionLink: `/company/payments/${offer.id}`
                    });
                } catch (error) {
                    console.error(`[PaymentReminder] Notification failed for user ${user.id}`, error);
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

        console.log(`[PaymentReminder] Sent ${reminderType} reminder for offer ${offer.id}`);
        return true;
    }

    /**
     * Send overdue payment reminder with escalating urgency
     */
    static async sendOverdueReminder(offer, daysOverdue, dueDate) {
        const GRACE_PERIOD = 10;
        const daysUntilDefault = GRACE_PERIOD - daysOverdue;

        const totalInvested = offer.investments.reduce(
            (sum, inv) => sum + parseFloat(inv.usdcAmount),
            0
        );
        const annualRate = parseFloat(offer.annualInterestRate || 0);
        const periodsPerYear = this.getPeriodsPerYear(offer.paymentType);
        const baseAmount = totalInvested * (annualRate / 100 / periodsPerYear);
        const lateFee = baseAmount * 0.001 * daysOverdue; // 0.1% per day
        const totalDue = baseAmount + lateFee;

        const companyUsers = await prisma.companyUser.findMany({
            where: { companyId: offer.companyId, isActive: true }
        });

        // Only send one overdue reminder per day
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const existingOverdue = await prisma.paymentReminder.findFirst({
            where: {
                offerId: offer.id,
                reminderType: 'overdue',
                sentAt: { gte: todayStart }
            }
        });

        if (existingOverdue) return;

        // Send urgent email
        for (const user of companyUsers) {
            try {
                await EmailService.sendOverduePaymentWarning({
                    to: user.email,
                    userName: user.name,
                    companyName: offer.company.name,
                    offerName: offer.offerName,
                    assetCode: offer.assetCode,
                    daysOverdue,
                    daysUntilDefault: Math.max(0, daysUntilDefault),
                    baseAmount,
                    lateFee,
                    totalDue,
                    collateralAtRisk: daysUntilDefault <= 3,
                    payInvestorsUrl: `${process.env.FRONTEND_URL}/company/payments/${offer.id}`
                });
            } catch (error) {
                console.error(`[PaymentReminder] Overdue email failed for ${user.email}`, error);
            }
        }

        // Send urgent notification
        for (const user of companyUsers) {
            await NotificationService.createNotification({
                userId: user.id,
                userType: 'company_user',
                type: 'error',
                title: daysUntilDefault <= 3
                    ? `⚠️ URGENT: Collateral at risk for ${offer.offerName}`
                    : `Payment overdue: ${offer.offerName}`,
                message: daysUntilDefault <= 3
                    ? `Pay immediately to prevent collateral liquidation. ${daysUntilDefault} days remaining.`
                    : `Payment ${daysOverdue} days overdue. Late fees accruing at 0.1%/day.`,
                actionLink: `/company/payments/${offer.id}`
            });
        }

        // Record overdue reminder
        await prisma.paymentReminder.create({
            data: {
                offerId: offer.id,
                companyId: offer.companyId,
                reminderType: 'overdue',
                dueDate,
                amountDue: totalDue,
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
            newStatus = 'defaulted';
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
