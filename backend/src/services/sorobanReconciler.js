/**
 * SorobanReconciler — Fixes orphaned Soroban investments.
 *
 * Scenarios handled:
 *   1. TX succeeded on-chain but DB update failed → fix to 'distributed' / 'payment_received'
 *   2. TX failed on-chain but investment stuck in 'trade_submitted' → fix to 'failed'
 *   3. Investment in 'trade_submitted' with no TX hash → stale, mark 'failed' after timeout
 *   4. Investment in 'pending_payment' for > 30 min → auto-cancel (never signed)
 *
 * Runs every 5 minutes via setInterval. Non-blocking — errors are logged, not thrown.
 */
import { rpc } from '@stellar/stellar-sdk';
import { getSorobanRpcUrl } from '../config/stellar.js';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

const log = logger.scope('SorobanReconciler');

// Investments stuck in trade_submitted longer than this are considered orphaned
const ORPHAN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const PENDING_TTL_MS = 30 * 60 * 1000;    // 30 minutes — pending_payment expiry
const POLL_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes

export class SorobanReconciler {

    /**
     * Find and fix all orphaned investments.
     * @returns {Promise<{fixed: number, failed: number, stale: number}>}
     */
    static async reconcile() {
        const stats = { fixed: 0, failed: 0, stale: 0 };

        try {
            // Find investments stuck in trade_submitted
            const orphans = await prisma.investment.findMany({
                where: {
                    status: 'trade_submitted',
                },
                include: {
                    offer: { select: { sorobanContractId: true, assetCode: true } },
                },
                orderBy: { updatedAt: 'asc' },
                take: 50,
            });

            if (orphans.length === 0) return stats;
            log.info(`[reconcile] Found ${orphans.length} investments in trade_submitted`);

            const rpcServer = new rpc.Server(getSorobanRpcUrl());

            for (const inv of orphans) {
                try {
                    // Case 3: No TX hash — stale pending, timed out
                    if (!inv.usdcPaymentHash) {
                        const age = Date.now() - new Date(inv.updatedAt).getTime();
                        if (age > ORPHAN_TIMEOUT_MS) {
                            log.warn(`[reconcile] Investment #${inv.id} has no TX hash after ${Math.round(age / 60000)}min — marking failed`);
                            await prisma.investment.update({
                                where: { id: inv.id },
                                data: {
                                    status: 'failed',
                                    errorMessage: 'Transaction was never submitted (orphan timeout)',
                                },
                            });
                            stats.stale++;
                        }
                        continue;
                    }

                    // Cases 1 & 2: Has TX hash — check on-chain status
                    const txResult = await rpcServer.getTransaction(inv.usdcPaymentHash);

                    if (txResult.status === 'SUCCESS') {
                        // TX succeeded on-chain — DB is behind
                        const isContractTrade = !!inv.offer?.sorobanContractId;
                        const newStatus = isContractTrade ? 'distributed' : 'payment_received';

                        log.info(`[reconcile] Investment #${inv.id} TX ${inv.usdcPaymentHash} succeeded on-chain → ${newStatus}`);
                        await prisma.investment.update({
                            where: { id: inv.id },
                            data: {
                                status: newStatus,
                                ...(isContractTrade ? { distributionTxHash: inv.usdcPaymentHash } : {}),
                            },
                        });
                        stats.fixed++;

                    } else if (txResult.status === 'FAILED') {
                        // TX failed on-chain
                        log.warn(`[reconcile] Investment #${inv.id} TX ${inv.usdcPaymentHash} FAILED on-chain`);
                        await prisma.investment.update({
                            where: { id: inv.id },
                            data: {
                                status: 'failed',
                                errorMessage: `On-chain TX failed (reconciled). Hash: ${inv.usdcPaymentHash}`,
                            },
                        });
                        stats.failed++;

                    } else if (txResult.status === 'NOT_FOUND') {
                        // TX not found — might be too old (pruned) or never submitted
                        const age = Date.now() - new Date(inv.updatedAt).getTime();
                        if (age > ORPHAN_TIMEOUT_MS) {
                            log.warn(`[reconcile] Investment #${inv.id} TX not found after ${Math.round(age / 60000)}min — marking failed`);
                            await prisma.investment.update({
                                where: { id: inv.id },
                                data: {
                                    status: 'failed',
                                    errorMessage: `Transaction not found on-chain after timeout. Hash: ${inv.usdcPaymentHash}`,
                                },
                            });
                            stats.stale++;
                        }
                        // If still young, leave it — TX might still be processing
                    }
                } catch (invErr) {
                    log.error(`[reconcile] Error processing investment #${inv.id}:`, invErr.message);
                }
            }

            if (stats.fixed + stats.failed + stats.stale > 0) {
                log.info(`[reconcile] Done: ${stats.fixed} fixed, ${stats.failed} failed, ${stats.stale} stale`);

                // ─── MONITORING ALERT ───
                // Alert admins if too many orphans in one cycle → something is systematically wrong
                const total = stats.fixed + stats.failed + stats.stale;
                if (total >= 5) {
                    try {
                        const { AlertRouter } = await import('./alertRouter.service.js');
                        await AlertRouter.send({
                            title: 'Soroban Reconciler: High Orphan Count',
                            message: `Reconciler fixed ${total} orphaned investments in one cycle (${stats.fixed} fixed, ${stats.failed} failed, ${stats.stale} stale). Investigate possible systemic issue.`,
                            severity: 'high',
                            source: 'reconciler',
                        });
                    } catch (alertErr) {
                        log.error('[reconcile] Failed to send alert:', alertErr.message);
                    }
                }
            }
        } catch (err) {
            log.error('[reconcile] Fatal error:', err.message);
        }

        return stats;
    }

    /**
     * Expire stale pending_payment investments that were never signed.
     * @returns {Promise<number>} Number of cancelled investments
     */
    static async expirePending() {
        try {
            const cutoff = new Date(Date.now() - PENDING_TTL_MS);
            // Only cancel pending investments for Soroban-enabled offers.
            // Legacy offers may legitimately take longer to sign (hardware wallets, KYC steps).
            const expired = await prisma.investment.updateMany({
                where: {
                    status: 'pending_payment',
                    updatedAt: { lt: cutoff },
                    offer: { sorobanContractId: { not: null } },
                },
                data: {
                    status: 'cancelled',
                },
            });

            if (expired.count > 0) {
                log.info(`[expirePending] Cancelled ${expired.count} stale pending_payment investments (> 30 min old)`);
            }
            return expired.count;
        } catch (err) {
            log.error('[expirePending] Error:', err.message);
            return 0;
        }
    }

    /**
     * Start the reconciliation loop. Call once during server startup.
     */
    static start() {
        if (this._task) {
            log.warn('[start] Reconciler already running');
            return;
        }

        log.info('[start] Starting Soroban reconciler (every 5 min)');
        this._task = setInterval(() => {
            this.reconcile().catch(err => log.error('[cron] Reconcile error:', err.message));
            this.expirePending().catch(err => log.error('[cron] Expire error:', err.message));
        }, POLL_INTERVAL_MS);

        // Run after 30s delay on startup (let other services initialize first)
        setTimeout(() => {
            this.reconcile().catch(err => log.error('[start] Initial reconcile failed:', err.message));
        }, 30_000);
    }

    static stop() {
        if (this._task) {
            clearInterval(this._task);
            this._task = null;
            log.info('[stop] Reconciler stopped');
        }
    }
}
