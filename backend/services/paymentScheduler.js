import { PaymentService } from './payment.service.js';

let monthlyJob = null;
let bulletJob = null;
let quarterlyJob = null;
let semiAnnualJob = null;

export const startPaymentScheduler = (assetCode = 'SIN01') => {
  console.log('Starting payment schedulers...');

  // Start monthly payment scheduler
  if (!monthlyJob) {
    monthlyJob = PaymentService.scheduleMonthlyPayments(assetCode);
    console.log('Monthly payment scheduler started');
  }

  // Start bullet payment scheduler (runs daily to check for expired offers)
  if (!bulletJob) {
    bulletJob = PaymentService.scheduleBulletPayments();
    console.log('Bullet payment scheduler started');
  }

  // Start quarterly payment scheduler
  if (!quarterlyJob) {
    quarterlyJob = PaymentService.scheduleQuarterlyPayments(assetCode);
    console.log('Quarterly payment scheduler started');
  }

  // Start semi-annual payment scheduler
  if (!semiAnnualJob) {
    semiAnnualJob = PaymentService.scheduleSemiAnnualPayments(assetCode);
    console.log('Semi-annual payment scheduler started');
  }

  console.log('All payment schedulers started successfully');

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

