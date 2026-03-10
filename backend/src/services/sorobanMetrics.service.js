/**
 * sorobanMetrics.service.js — Latency tracking for Soroban vs Legacy paths.
 *
 * Tracks trade() latencies, success rates, and fee costs.
 * Stored in-memory with periodic DB flush for lightweight operation.
 *
 * Usage:
 *   SorobanMetrics.recordTrade({ durationMs, success, gasUsed, investmentId });
 *   SorobanMetrics.getStats(); // { trade: {...} }
 */
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

const log = logger.scope('SorobanMetrics');

class SorobanMetrics {
    static _tradeLatencies = [];
    static _tradeErrors = 0;
    static _flushInterval = null;

    /**
     * Record a Soroban trade() execution
     */
    static recordTrade({ durationMs, success = true, gasUsed = 0, investmentId = null }) {
        this._tradeLatencies.push({ durationMs, success, gasUsed, ts: Date.now(), investmentId });
        if (!success) this._tradeErrors++;
        log.info(`[trade] ${success ? '✅' : '❌'} ${durationMs}ms (gas: ${gasUsed}, inv: ${investmentId})`);
    }

    /**
     * Get comparison stats
     */
    static getStats() {
        const calcStats = (latencies, errors) => {
            if (latencies.length === 0) return { count: 0, avgMs: 0, p95Ms: 0, errorRate: 0 };

            const durations = latencies.map(l => l.durationMs).sort((a, b) => a - b);
            const total = latencies.length;
            const p95Idx = Math.floor(total * 0.95);

            return {
                count: total,
                avgMs: Math.round(durations.reduce((a, b) => a + b, 0) / total),
                p95Ms: durations[p95Idx] || durations[total - 1],
                minMs: durations[0],
                maxMs: durations[total - 1],
                errorRate: total > 0 ? (errors / total * 100).toFixed(1) + '%' : '0%',
                successCount: latencies.filter(l => l.success).length,
                errorCount: errors,
            };
        };

        return {
            trade: calcStats(this._tradeLatencies, this._tradeErrors),
            since: this._tradeLatencies.length > 0
                ? new Date(Math.min(...this._tradeLatencies.map(l => l.ts))).toISOString()
                : null,
        };
    }

    /**
     * Flush metrics to SystemConfig for persistence
     */
    static async flush() {
        try {
            const stats = this.getStats();
            await prisma.systemConfig.upsert({
                where: { key: 'soroban_metrics' },
                update: { value: JSON.stringify(stats), updatedAt: new Date() },
                create: { key: 'soroban_metrics', value: JSON.stringify(stats) },
            });
        } catch (err) {
            log.error('[flush] Failed:', err.message);
        }
    }

    /**
     * Start periodic flush (every 10 min)
     */
    static start() {
        if (this._flushInterval) return;
        this._flushInterval = setInterval(() => this.flush(), 10 * 60 * 1000);
        log.info('Metrics collection started (flush every 10 min)');
    }

    static stop() {
        if (this._flushInterval) {
            clearInterval(this._flushInterval);
            this._flushInterval = null;
            this.flush(); // Final flush
        }
    }

    /**
     * Reset in-memory metrics
     */
    static reset() {
        this._tradeLatencies = [];
        this._tradeErrors = 0;
    }
}

export { SorobanMetrics };
