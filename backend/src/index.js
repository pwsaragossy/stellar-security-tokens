import app from './app.js';
import dotenv from 'dotenv';
import path from 'path';
import { startPaymentScheduler } from './services/paymentScheduler.js';
import { PaymentReminderService } from './services/paymentReminder.service.js';
// NOTE: PaymentMonitor removed — legacy manual USDC monitoring discontinued
import { initDistributionQueue } from './services/distributionQueue.service.js';
import { MaintenanceService } from './services/maintenance.service.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const PORT = process.env.PORT || 3000;

// Process-level error handlers to prevent crashes from unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  // Suppress specific Redis/Bull initialization errors that are expected
  let shouldSuppress = false;

  if (reason instanceof Error) {
    const errorMessage = reason.message || '';
    const errorCode = reason.code || '';

    // Check for AggregateError (common with Redis connection errors)
    if (reason.constructor.name === 'AggregateError' || reason.name === 'AggregateError') {
      // Check if any error in the errors array has ECONNREFUSED
      if (reason.errors && Array.isArray(reason.errors)) {
        const hasECONNREFUSED = reason.errors.some(err =>
          err && (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED'))
        );
        if (hasECONNREFUSED) {
          shouldSuppress = true;
        }
      }
      // Also check the main error code
      if (errorCode === 'ECONNREFUSED') {
        shouldSuppress = true;
      }
    }

    // These errors occur during Bull initialization when Redis isn't ready yet
    // They're handled by Bull's error handlers, so we can suppress them here
    if (errorMessage.includes('enableOfflineQueue') ||
      errorMessage.includes('Stream isn\'t writeable') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorCode === 'ECONNREFUSED') {
      shouldSuppress = true;
    }
  }

  if (shouldSuppress) {
    // These are expected during initialization and handled by Bull's error handlers
    return;
  }

  console.error('[UNHANDLED REJECTION] Unhandled Promise Rejection:', reason);
  console.error('Promise:', promise);
  // Log error details for debugging
  if (reason instanceof Error) {
    console.error('Error stack:', reason.stack);
  }
  // Don't exit - allow server to continue running
  // In production, you might want to log to an error tracking service
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION] Uncaught Exception:', error);
  console.error('Error stack:', error.stack);
  // For uncaught exceptions, we should exit gracefully
  // But log first to help with debugging
  // In production, you might want to log to an error tracking service before exiting
  process.exit(1);
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  // Iniciar agendamento automático de pagamentos
  const enableAutoPayments = process.env.ENABLE_AUTO_PAYMENTS !== 'false';
  if (enableAutoPayments) {
    try {

      startPaymentScheduler();
      console.log('Automatic payment scheduler enabled (offer-based)');
      console.log('Payments will be processed automatically for all active offers');
    } catch (error) {
      console.error('Failed to start payment scheduler:', error.message);
      console.warn('Automatic payments will not be scheduled. You can process payments manually via POST /api/payments/process');
    }
  } else {
    console.log('Automatic payment scheduler is disabled (ENABLE_AUTO_PAYMENTS=false)');
    console.log('You can process payments manually via POST /api/payments/process');
  }

  // --- AUTO-VERIFY ISSUER ACCOUNT FLAGS ---
  // This ensures the issuer account has correct flags (auth_required, auth_revocable, auth_clawback_enabled)
  // after Docker restarts or Testnet resets
  // NOTE: Skipped in multisig mode — issuer setup requires Freighter signing via Admin > Wallets
  if (process.env.KEY_MANAGEMENT_MODE === 'multisig') {
    console.log('[Startup] Multisig mode - skipping auto issuer verification (use Admin > Wallets)');
  } else {
    try {
      const { StellarService } = await import('./services/stellar.service.js');
      console.log('[Startup] Verifying issuer account flags...');
      const result = await StellarService.createIssuerAccount();
      if (result.success) {
        console.log('[Startup] Issuer account verified - flags are correct');
      }
    } catch (error) {
      console.error('[Startup] Failed to verify issuer account:', error.message);
      console.warn('[Startup] You may need to manually set up the issuer account via Admin > Wallets');
    }
  }

  // Start payment reminder scheduler (daily reminders for upcoming payments)
  try {
    PaymentReminderService.startReminderScheduler();
    console.log('Payment reminder scheduler enabled - companies will receive payment reminders');
  } catch (error) {
    console.error('Failed to start payment reminder scheduler:', error.message);
  }

  // Start overdue payment status checker (runs daily at 00:30 UTC)
  // This updates offer statuses to overdue/defaulted based on payment due dates
  try {
    const cron = await import('node-cron');
    const { CompanyPaymentService } = await import('./services/companyPayment.service.js');

    cron.default.schedule('30 0 * * *', async () => {
      console.log('[OverdueChecker] Running daily overdue/maturity check');
      try {
        const result = await CompanyPaymentService.checkOverduePayments();
        console.log('[OverdueChecker] Completed:', result);
      } catch (error) {
        console.error('[OverdueChecker] Error:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    console.log('Overdue payment checker enabled - payment statuses will be updated daily at 00:30 UTC');
  } catch (error) {
    console.error('Failed to start overdue payment checker:', error.message);
  }

  // Start MultiSig Expiry Checker (runs once daily at midnight UTC)
  try {
    const cron = await import('node-cron');
    const { MultiSigTransactionService } = await import('./services/multiSigTransaction.service.js');

    // Run daily at midnight UTC
    cron.default.schedule('0 0 * * *', async () => {
      console.log('[MultiSigExpiry] Checking for expired governance proposals');
      try {
        await MultiSigTransactionService.expireOldTransactions();
      } catch (error) {
        console.error('[MultiSigExpiry] Error:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    console.log('MultiSig governance expiry checker enabled - runs daily at midnight UTC');
  } catch (error) {
    console.error('Failed to start MultiSig expiry checker:', error.message);
  }

  // NOTE: PaymentMonitor removed — all investments now use Soroban atomic swap.
  // Legacy manual USDC payment monitoring is no longer needed.

  // Inicializar fila de distribuição de tokens (com retry automático)
  const enableDistributionQueue = process.env.ENABLE_DISTRIBUTION_QUEUE !== 'false';
  if (enableDistributionQueue) {
    try {
      const queue = initDistributionQueue();
      if (queue) {
        console.log('Distribution queue enabled - token distributions will be processed with automatic retry');
      } else {
        console.warn('Distribution queue disabled - Redis not available. Distributions will be processed synchronously.');
      }
    } catch (error) {
      console.error('Failed to initialize distribution queue:', error.message);
      console.warn('Distribution queue disabled. Distributions will be processed synchronously.');
    }
  } else {
    console.log('Distribution queue is disabled (ENABLE_DISTRIBUTION_QUEUE=false)');
  }

  // --- DAILY DATABASE BACKUP (3:00 AM UTC) ---
  try {
    const cron = await import('node-cron');
    const { BackupService } = await import('./services/backup.service.js');

    cron.default.schedule('0 3 * * *', async () => {
      console.log('[Backup] Starting daily database dump');
      try {
        const filepath = await BackupService.fullDatabaseDump();
        if (filepath) {
          console.log('[Backup] Daily dump completed:', filepath);
        }
      } catch (error) {
        console.error('[Backup] Daily dump failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    console.log('Daily database backup enabled - runs at 3:00 AM UTC');
  } catch (error) {
    console.error('Failed to start daily backup scheduler:', error.message);
  }

  // --- SOROBAN TTL MAINTENANCE ---
  try {
    MaintenanceService.init();
    console.log('Soroban TTL Maintenance enabled - contracts will be extended automatically');
  } catch (error) {
    console.error('Failed to start Soroban TTL Maintenance:', error.message);
  }

  // --- SOROBAN EVENT INDEXER ---
  if (process.env.ENABLE_SOROBAN_SALE === 'true') {
    try {
      const { SorobanEventIndexer } = await import('./services/sorobanEventIndexer.js');
      SorobanEventIndexer.start();
      console.log('Soroban event indexer enabled - monitoring contract events every 30s');
    } catch (error) {
      console.error('Failed to start Soroban event indexer:', error.message);
    }

    try {
      const { SorobanReconciler } = await import('./services/sorobanReconciler.js');
      SorobanReconciler.start();
      console.log('Soroban reconciler enabled - checking orphaned investments every 5 min');
    } catch (error) {
      console.error('Failed to start Soroban reconciler:', error.message);
    }
    try {
      const { SorobanMetrics } = await import('./services/sorobanMetrics.service.js');
      SorobanMetrics.start();
      console.log('Soroban metrics enabled - flushing to DB every 10 min');
    } catch (error) {
      console.error('Failed to start Soroban metrics:', error.message);
    }
  } else {
    console.log('Soroban event indexer disabled (ENABLE_SOROBAN_SALE != true)');
  }
});

// ─── GRACEFUL SHUTDOWN ───
// Stop background crons before exiting to prevent orphaned mid-poll investments.
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down gracefully...`);

  try {
    if (process.env.ENABLE_SOROBAN_SALE === 'true') {
      const { SorobanEventIndexer } = await import('./services/sorobanEventIndexer.js');
      const { SorobanReconciler } = await import('./services/sorobanReconciler.js');
      const { SorobanMetrics } = await import('./services/sorobanMetrics.service.js');
      SorobanEventIndexer.stop?.();
      SorobanReconciler.stop?.();
      SorobanMetrics.stop?.(); // Final flush to DB
      console.log('Soroban services stopped.');
    }
  } catch (err) {
    console.error('Error during shutdown:', err.message);
  }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
