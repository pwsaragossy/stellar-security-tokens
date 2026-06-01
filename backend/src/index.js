import app from './app.js';
import dotenv from 'dotenv';
import path from 'path';
import { PaymentReminderService } from './services/paymentReminder.service.js';
import { getPaymentMonitor } from './services/paymentMonitor.service.js';
import { MaintenanceService } from './services/maintenance.service.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// ─── SECURITY GUARD: prevent test-mode bypasses in production ───
// NODE_ENV=test disables Redis blocklist checks (F2 in security review).
// Require explicit ALLOW_TEST_MODE=1 to prevent accidental misconfiguration.
if (process.env.NODE_ENV === 'test' && !process.env.ALLOW_TEST_MODE) {
    console.error('FATAL: NODE_ENV=test without ALLOW_TEST_MODE=1. Refusing to start server.');
    console.error('If this is intentional, set ALLOW_TEST_MODE=1 in your environment.');
    process.exit(1);
}

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

  // Daily payment cron (runs at 00:30 UTC)
  // 1. Notify companies about due payments (bullet maturity + periodic)
  // 2. Check/penalize overdue payments (late fees + defaults)
  try {
    const cron = await import('node-cron');
    const { CompanyPaymentService } = await import('./services/companyPayment.service.js');
    const { PaymentService } = await import('./services/payment.service.js');

    cron.default.schedule('30 0 * * *', async () => {
      console.log('[DailyPayments] Running notifications + overdue check');

      // 1. Notify companies about due payments (must run BEFORE overdue check)
      try {
        await PaymentService.processAllScheduledPayments();
        console.log('[DailyPayments] Payment notifications sent');
      } catch (error) {
        console.error('[DailyPayments] Notification error (non-blocking):', error);
      }

      // 2. Check/penalize overdue payments
      try {
        const result = await CompanyPaymentService.checkOverduePayments();
        console.log('[DailyPayments] Overdue check completed:', result);
      } catch (error) {
        console.error('[DailyPayments] Overdue check error:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    console.log('Daily payment cron enabled - notifications + overdue checks at 00:30 UTC');
  } catch (error) {
    console.error('Failed to start daily payment cron:', error.message);
  }

  // Startup reconciliation — verify counter ↔ InterestPayment consistency
  try {
    const prisma = (await import('./config/prisma.js')).default;
    const offers = await prisma.offer.findMany({
      where: { paymentType: { not: 'bullet' }, status: 'active' },
      select: { id: true, offerName: true, periodicPaymentsCompleted: true },
    });
    let mismatches = 0;
    for (const offer of offers) {
      const rounds = await prisma.interestPayment.groupBy({
        by: ['paymentDate'],
        where: { offerId: offer.id, status: 'completed' },
      });
      if (rounds.length !== offer.periodicPaymentsCompleted) {
        mismatches++;
        console.warn(`[Reconciliation] MISMATCH: Offer ${offer.id} (${offer.offerName}) — counter=${offer.periodicPaymentsCompleted}, actual=${rounds.length}`);
      }
    }
    if (mismatches === 0 && offers.length > 0) {
      console.log(`[Reconciliation] All ${offers.length} periodic offers OK — counter matches InterestPayment records`);
    } else if (mismatches > 0) {
      console.warn(`[Reconciliation] ${mismatches} offer(s) have counter mismatches — run scripts/backfill-periodic-counter.mjs`);
    }
  } catch (error) {
    console.warn('[Reconciliation] Startup check failed (non-blocking):', error.message);
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

  // Start deposit relay monitor (watches treasury for CEX → C-wallet deposits)
  const enablePaymentMonitoring = process.env.ENABLE_PAYMENT_MONITORING !== 'false';
  if (enablePaymentMonitoring) {
    try {
      const paymentMonitor = getPaymentMonitor();
      await paymentMonitor.start();
      console.log('Payment monitoring enabled - deposit relay will forward CEX deposits to smart wallets');
    } catch (error) {
      console.error('Failed to start payment monitoring:', error.message);
      console.warn('Payment monitoring disabled. CEX deposits will not be auto-forwarded.');
    }
  } else {
    console.log('Payment monitoring is disabled (ENABLE_PAYMENT_MONITORING=false)');
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
      const { YieldPaymentReconciler } = await import('./services/yieldPaymentReconciler.js');
      YieldPaymentReconciler.start();
      console.log('Yield payment reconciler enabled - checking stale yield jobs every 5 min');
    } catch (error) {
      console.error('Failed to start yield payment reconciler:', error.message);
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

  // --- OPERATIONS WALLET MONITOR ---
  // Polls Operations hot wallet balance every 5min via Horizon.
  // Sends email alerts at warn (<20 XLM) and critical (<5 XLM) thresholds.
  // Also blocks purchases inline if balance drops below critical threshold.
  try {
    const { WalletMonitorService } = await import('./services/walletMonitor.service.js');
    WalletMonitorService.start();
    console.log('Operations wallet monitor enabled — checking balance every 5min');
  } catch (error) {
    console.error('Failed to start wallet monitor:', error.message);
  }

  // --- RAMP ORDER RECONCILER ---
  // Sweeps non-terminal RampOrders > 2min old, pulls fresh state from
  // EtherFuse, applies transition. Backstop for dropped webhook deliveries.
  try {
    const { RampOrderReconciler } = await import('./services/rampOrderReconciler.js');
    RampOrderReconciler.start();
    console.log('Ramp order reconciler enabled — sweeping stale orders every 5min');
  } catch (error) {
    console.error('Failed to start ramp order reconciler:', error.message);
  }

  // --- DORMANT-ACTIVE ANOMALY MONITOR ---
  // Detects investors returning from > 30d dormancy + immediately
  // transacting. Writes an AdminAction row + dispatches a high-severity
  // alert via AlertRouter. Caroline's <30-min credential-compromise
  // containment signal.
  try {
    const { DormantAlertMonitor } = await import('./services/dormantAlertMonitor.service.js');
    DormantAlertMonitor.start();
    console.log('Dormant-active anomaly monitor enabled — polling every 60s');
  } catch (error) {
    console.error('Failed to start dormant alert monitor:', error.message);
  }

  // --- ISSUER SECURITY WATCHER (SAC mint/clawback + issuer config changes) ---
  // The security token is a raw SAC; the hot Operations key (issuer signer at
  // med_threshold=2) can mint/clawback as a side effect of investor auth.
  // Threshold can't separate authorize from mint/clawback, so we DETECT + ALERT.
  // Detector A: Soroban getEvents on each token SAC (mint/clawback/set_admin).
  // Detector B: Horizon stream of issuer classic ops (set_options/merge/clawback).
  // Alerts go to ADMIN_ALERT_EMAIL via EmailService.sendAdminAlert (same as WalletMonitor).
  try {
    const { IssuerWatcher } = await import('./services/issuerWatcher.service.js');
    IssuerWatcher.start();
    console.log('Issuer security watcher enabled — SAC events every 30s + issuer ops stream');
  } catch (error) {
    console.error('Failed to start issuer security watcher:', error.message);
  }
});

// ─── GRACEFUL SHUTDOWN ───
// Stop background crons before exiting to prevent orphaned mid-poll investments.
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down gracefully...`);

  try {
    // Stop deposit relay monitor
    const paymentMonitor = getPaymentMonitor();
    if (paymentMonitor.isActive()) {
      paymentMonitor.stop();
      console.log('Payment monitor stopped.');
    }

    // Stop wallet monitor (A-02: cancel setInterval)
    try {
      const { WalletMonitorService } = await import('./services/walletMonitor.service.js');
      WalletMonitorService.stop();
    } catch (_) { /* not started — safe to ignore */ }

    // Stop dormant-active anomaly monitor
    try {
      const { DormantAlertMonitor } = await import('./services/dormantAlertMonitor.service.js');
      DormantAlertMonitor.stop();
    } catch (_) { /* not started — safe to ignore */ }

    // Stop issuer security watcher (SAC poller + issuer ops stream)
    try {
      const { IssuerWatcher } = await import('./services/issuerWatcher.service.js');
      IssuerWatcher.stop();
    } catch (_) { /* not started — safe to ignore */ }

    if (process.env.ENABLE_SOROBAN_SALE === 'true') {
      const { SorobanEventIndexer } = await import('./services/sorobanEventIndexer.js');
      const { SorobanReconciler } = await import('./services/sorobanReconciler.js');
      const { SorobanMetrics } = await import('./services/sorobanMetrics.service.js');
      const { YieldPaymentReconciler } = await import('./services/yieldPaymentReconciler.js');
      SorobanEventIndexer.stop?.();
      SorobanReconciler.stop?.();
      SorobanMetrics.stop?.(); // Final flush to DB
      YieldPaymentReconciler.stop?.();
      console.log('Soroban services stopped.');
    }
  } catch (err) {
    console.error('Error during shutdown:', err.message);
  }

  process.exit(0);
};


process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
