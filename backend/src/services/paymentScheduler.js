import { PaymentService } from './payment.service.js';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
const log = logger.scope('PaymentScheduler');

let bulletJob = null; // Single unified scheduler for all payment types

/**
 * Gets all active offer asset codes from the database
 * @returns {Promise<string[]>} Array of asset codes
 */
async function getActiveOfferAssetCodes() {
  const offers = await prisma.offer.findMany({
    where: { status: 'active' },
    select: { assetCode: true },
  });
  return offers.map(o => o.assetCode);
}

/**
 * Starts payment schedulers for all payment types
 * Each scheduler iterates all active offers with matching payment type
 */
export const startPaymentScheduler = () => {
  log.info('Starting payment schedulers (offer-based)...');

  // Start bullet payment scheduler (runs daily to check for expired offers)
  // This handles both bullet payments at maturity AND monthly interest
  if (!bulletJob) {
    bulletJob = PaymentService.scheduleBulletPayments();
    log.info('Bullet/Monthly payment scheduler started (daily check for all active offers)');
  }

  // Note: Quarterly, Semi-Annual, and Annual payments are also handled by
  // the daily bullet job which checks offer.paymentType and pays accordingly.
  // We don't need separate schedulers - they would just create duplicate processing.

  log.info('Payment schedulers started. Active offers will be processed automatically.');
  log.info('NOTE: Schedulers check all active offers and pay based on each offer\'s paymentType.');

  return {
    bullet: bulletJob,
  };
};

export const stopPaymentScheduler = () => {
  if (bulletJob) {
    bulletJob.stop();
    bulletJob = null;
    log.info('Payment scheduler stopped');
  }
};

export const getSchedulerStatus = () => {
  return {
    isRunning: bulletJob !== null,
    schedulers: {
      unified: {
        running: bulletJob !== null,
        schedule: 'Daily at 01:00 UTC',
        description: 'Checks all active offers and processes payments based on each offer\'s paymentType',
        supportedPaymentTypes: ['monthly', 'bullet', 'quarterly', 'semi_annual', 'annual'],
      },
    },
  };
};
