import { PaymentService } from './payment.service.js';

let scheduledJob = null;

export const startPaymentScheduler = (assetCode = 'SIN01') => {
  if (scheduledJob) {
    console.log('Payment scheduler is already running');
    return scheduledJob;
  }

  console.log('Starting payment scheduler...');
  scheduledJob = PaymentService.scheduleMonthlyPayments(assetCode);
  console.log('Payment scheduler started successfully');
  
  return scheduledJob;
};

export const stopPaymentScheduler = () => {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    console.log('Payment scheduler stopped');
  }
};

export const getSchedulerStatus = () => {
  return {
    isRunning: scheduledJob !== null,
    nextRun: scheduledJob ? '1st of each month at 00:00 UTC' : 'Not scheduled',
  };
};

