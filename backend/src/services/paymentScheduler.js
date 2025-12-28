import { PaymentService } from './payment.service.js';
import prisma from '../config/prisma.js';

let monthlyJob = null;
let bulletJob = null;
let quarterlyJob = null;
let semiAnnualJob = null;

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
 * Starts payment schedulers for all active offers

 */
export const startPaymentScheduler = () => {
  console.log('Starting payment schedulers (offer-based)...');

  // Start monthly payment scheduler - processes all active offers
  if (!monthlyJob) {
    monthlyJob = PaymentService.scheduleBulletPayments(); // Bullet checks all offers internally
    console.log('Monthly payment scheduler started (will process all active offers)');
  }

  // Start bullet payment scheduler (runs daily to check for expired offers)
  if (!bulletJob) {
    bulletJob = PaymentService.scheduleBulletPayments();
    console.log('Bullet payment scheduler started');
  }

  // Note: Quarterly and semi-annual schedulers disabled until offers are created
  // They will be started dynamically when offers are created

  console.log('Payment schedulers started. Active offers will be processed automatically.');
  console.log('NOTE: assetCode is no longer hardcoded - schedulers iterate all active offers.');

  return {
    monthly: monthlyJob,
    bullet: bulletJob,
    quarterly: quarterlyJob,
    semiAnnual: semiAnnualJob,
  };
};

export const stopPaymentScheduler = () => {
  if (monthlyJob) {
    monthlyJob.stop();
    monthlyJob = null;
    console.log('Monthly payment scheduler stopped');
  }

  if (bulletJob) {
    bulletJob.stop();
    bulletJob = null;
    console.log('Bullet payment scheduler stopped');
  }

  if (quarterlyJob) {
    quarterlyJob.stop();
    quarterlyJob = null;
    console.log('Quarterly payment scheduler stopped');
  }

  if (semiAnnualJob) {
    semiAnnualJob.stop();
    semiAnnualJob = null;
    console.log('Semi-annual payment scheduler stopped');
  }
};

export const getSchedulerStatus = () => {
  return {
    isRunning: monthlyJob !== null || bulletJob !== null || quarterlyJob !== null || semiAnnualJob !== null,
    schedulers: {
      monthly: {
        running: monthlyJob !== null,
        nextRun: monthlyJob ? '1st of each month at 00:00 UTC' : 'Not scheduled',
      },
      bullet: {
        running: bulletJob !== null,
        nextRun: bulletJob ? 'Daily at 01:00 UTC' : 'Not scheduled',
      },
      quarterly: {
        running: quarterlyJob !== null,
        nextRun: quarterlyJob ? '1st of Jan, Apr, Jul, Oct at 00:00 UTC' : 'Not scheduled',
      },
      semiAnnual: {
        running: semiAnnualJob !== null,
        nextRun: semiAnnualJob ? '1st of Jan, Jul at 00:00 UTC' : 'Not scheduled',
      },
    },
  };
};

