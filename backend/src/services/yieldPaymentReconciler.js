/**
 * YieldPaymentReconciler — Fixes orphaned yield payment jobs.
 *
 * Runs on a 5-minute cron. Finds YieldPaymentJob records stuck in 'submitting'
 * status for >10 minutes. Checks TX hashes on-chain to determine real status.
 *
 * Same pattern as SorobanReconciler.
 */
import prisma from '../config/prisma.js';
import { StellarService } from './stellar.service.js';
import { AlertService } from './alert.service.js';
import logger from '../utils/logger.js';

const log = logger.scope('YieldReconciler');

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL_MS = 5 * 60 * 1000;    // 5 minutes
const MAX_AGE_MS = 60 * 60 * 1000;         // 1 hour — mark as failed after this

export class YieldPaymentReconciler {
    static intervalId = null;
    static isRunning = false;

    /**
     * Single reconciliation pass.
     */
    static async reconcile() {
        try {
            // Find jobs stuck in 'submitting' for >10 min
            const staleJobs = await prisma.yieldPaymentJob.findMany({
                where: {
                    status: { in: ['submitting', 'prepared'] },
                    createdAt: { lt: new Date(Date.now() - STALE_THRESHOLD_MS) },
                },
            });

            if (staleJobs.length === 0) return;

            log.info(`[reconcile] Found ${staleJobs.length} stale yield payment jobs`);

            let fixed = 0;
            let failed = 0;

            for (const job of staleJobs) {
                try {
                    const age = Date.now() - new Date(job.createdAt).getTime();

                    // If job has TX hashes, check if they succeeded on-chain
                    if (job.txHashes) {
                        const hashes = job.txHashes.split(',').filter(Boolean);
                        let confirmedCount = 0;

                        for (const hash of hashes) {
                            try {
                                const txStatus = await StellarService.getTransactionStatus(hash);
                                if (txStatus?.successful) confirmedCount++;
                            } catch {
                                // TX not found or error — continue
                            }
                        }

                        if (confirmedCount > 0) {
                            // At least some batches confirmed
                            const allConfirmed = confirmedCount === hashes.length;
                            await prisma.yieldPaymentJob.update({
                                where: { id: job.id },
                                data: {
                                    status: allConfirmed ? 'confirmed' : 'partial_failure',
                                    completedAt: new Date(),
                                },
                            });
                            log.info(`[reconcile] Job ${job.id}: ${confirmedCount}/${hashes.length} TXs confirmed on-chain → ${allConfirmed ? 'confirmed' : 'partial_failure'}`);
                            fixed++;
                            continue;
                        }
                    }

                    // No TX hashes or all failed — check age
                    if (age > MAX_AGE_MS) {
                        await prisma.yieldPaymentJob.update({
                            where: { id: job.id },
                            data: {
                                status: 'failed',
                                error: `Stale job (${Math.round(age / 60000)} min old). Marked failed by reconciler.`,
                                completedAt: new Date(),
                            },
                        });
                        log.warn(`[reconcile] Job ${job.id}: stale for ${Math.round(age / 60000)}min → marked failed`);
                        failed++;
                    }
                } catch (err) {
                    log.error(`[reconcile] Error processing job ${job.id}:`, err.message);
                }
            }

            if (fixed + failed > 0) {
                log.info(`[reconcile] Done: ${fixed} fixed, ${failed} marked failed`);
            }

            // Alert if high count
            if (staleJobs.length >= 3) {
                try {
                    await AlertService.critical('YIELD_RECONCILER_ALERT', {
                        title: 'Yield Reconciler: Multiple Stale Jobs',
                        message: `Found ${staleJobs.length} stale yield payment jobs. ${fixed} fixed, ${failed} failed.`,
                        source: 'yield_reconciler',
                    });
                } catch {}
            }
        } catch (err) {
            // P2021 = table doesn't exist yet (pre-migration). Skip silently.
            if (err.code === 'P2021') {
                log.info('[reconcile] yield_payment_jobs table not found — skipping (migration pending)');
                return;
            }
            log.error('[reconcile] Fatal error:', err.message);
        }
    }

    /**
     * Start the reconciliation loop. Call once during server startup.
     */
    static start() {
        if (this.intervalId) {
            log.warn('[start] Reconciler already running');
            return;
        }

        log.info(`[start] Starting yield payment reconciler (every ${POLL_INTERVAL_MS / 60000} min)`);
        this.intervalId = setInterval(() => {
            this.reconcile().catch(err => log.error('[cron] Reconcile error:', err.message));
        }, POLL_INTERVAL_MS);

        // Run once immediately (delayed 60s to not interfere with boot)
        setTimeout(() => {
            this.reconcile().catch(err => log.error('[start] Initial reconcile failed:', err.message));
        }, 60000);
    }

    /**
     * Stop the reconciler.
     */
    static stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            log.info('[stop] Reconciler stopped');
        }
    }
}
