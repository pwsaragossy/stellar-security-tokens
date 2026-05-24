/**
 * DormantAlertMonitor audit follow-up.
 *
 * Caroline's class: "endereço de carteira aí que fica dormindo. Criou 30
 * dias, ficou adormecida … daqui a pouco ela resolve se mexer. E quando
 * ela se mexeu, foi pra um hacking … O silêncio é um alerta também."
 *
 * Detects the dormant-then-active pattern:
 *
 *   1. Investor's lastLogin was > 30 days ago (dormant)
 *   2. Investor just logged in (lastLogin within the past 10 minutes)
 *   3. AND attempted a fund-moving action in the same window
 *
 * On a positive detection: writes an AdminAction row tagged
 * `SECURITY_ANOMALY:dormant_active` and dispatches a high-severity alert
 * via AlertRouter (Slack / PagerDuty / DB notifications, whatever's
 * configured).
 *
 * Lifecycle mirrors WalletMonitorService: idempotent start()/stop(),
 * setInterval cadence, no-op without configuration. Registered from
 * src/index.js at startup with graceful SIGTERM shutdown.
 */
import prisma from '../config/prisma.js';
import { logAdminAction } from './adminAuditLog.service.js';
import logger from '../utils/logger.js';

const log = logger.scope('DormantAlertMonitor');

const POLL_INTERVAL_MS = 60_000; // 1 minute
const DORMANT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RECENT_LOGIN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RECENT_INVESTMENT_WINDOW_MS = 10 * 60 * 1000;

let _intervalId = null;
let _started = false;
// Track which investor IDs we've already alerted on in this dormancy cycle —
// avoids re-firing every minute while the same investor is still in the
// "just-came-back-and-acting" window. Reset on process restart.
const _alertedRecently = new Map(); // Map<investorId, expireAtMs>

/**
 * Lazy-load AlertRouter — it's imported as ESM and may not exist in
 * older trees. Fall back to logger if the service isn't available.
 */
async function dispatchAlert(payload) {
    try {
        const mod = await import('./alertRouter.service.js').catch(() => null);
        if (mod?.AlertRouter?.send) {
            await mod.AlertRouter.send(payload);
            return;
        }
        if (mod?.default?.send) {
            await mod.default.send(payload);
            return;
        }
    } catch (err) {
        log.warn('AlertRouter dispatch failed:', err?.message ?? String(err));
    }
    // Fallback: structured log line
    log.warn(`[ALERT severity=${payload.severity}] ${payload.title}: ${payload.message}`);
}

async function checkOnce() {
    try {
        const now = Date.now();
        const recentLoginCutoff = new Date(now - RECENT_LOGIN_WINDOW_MS);
        const dormantThreshold = new Date(now - DORMANT_WINDOW_MS);
        const recentInvestmentCutoff = new Date(now - RECENT_INVESTMENT_WINDOW_MS);

        // Step 1: find investors whose lastLogin is recent AND whose
        // immediately-prior login (if any) was > 30 days ago. We can't
        // express "prior login" easily in Prisma without a login_history
        // table — so we use a proxy: the investor has at least one
        // investment older than 30 days but NO investments in the gap
        // window. Conservative but works for the C&M-style scenario.
        const candidates = await prisma.investor.findMany({
            where: {
                lastLogin: { gte: recentLoginCutoff },
                investments: {
                    some: { createdAt: { lt: dormantThreshold } },
                    none: {
                        createdAt: {
                            gte: dormantThreshold,
                            lt: recentLoginCutoff,
                        },
                    },
                },
            },
            select: {
                id: true,
                email: true,
                lastLogin: true,
            },
            take: 50,
        });

        if (candidates.length === 0) return;

        // Step 2: for each candidate, check whether they've initiated a
        // fund-moving action in the recent window. Use the investments
        // table as the proxy.
        for (const investor of candidates) {
            // Skip if we already alerted on this investor in this cycle.
            const expireAt = _alertedRecently.get(investor.id);
            if (expireAt && expireAt > now) continue;

            const recent = await prisma.investment.findFirst({
                where: {
                    investorId: investor.id,
                    createdAt: { gte: recentInvestmentCutoff },
                },
                select: { id: true, amountUsd: true, createdAt: true },
            });
            if (!recent) continue;

            const title = `Dormant investor reactivated — possible credential compromise`;
            const message =
                `Investor ${investor.id} (${investor.email ?? 'unknown email'}) had no activity ` +
                `for > 30 days, just logged in at ${investor.lastLogin.toISOString()}, and ` +
                `submitted investment ${recent.id} for $${recent.amountUsd ?? '?'} at ` +
                `${recent.createdAt.toISOString()}. Suggest immediate freeze pending verification.`;

            log.warn(`[DORMANT-ACTIVE] ${message}`);

            // Audit log entry (immutable in admin_actions).
            await logAdminAction({
                actorId: null,
                actorType: 'system',
                actorRole: 'dormant_monitor',
                action: 'SECURITY_ANOMALY:dormant_active',
                targetType: 'investor',
                targetId: String(investor.id),
                payloadHash: null,
                ip: null,
                userAgent: null,
                result: 'detected',
                statusCode: null,
            });

            // Outbound alert (Slack / PagerDuty / email — whatever's configured).
            await dispatchAlert({
                severity: 'high',
                source: 'dormant_alert_monitor',
                title,
                message,
                tags: { investorId: investor.id },
            });

            // Throttle re-firing on the same investor for the next hour.
            _alertedRecently.set(investor.id, now + 60 * 60 * 1000);
        }

        // Periodic cleanup of the throttle map
        if (_alertedRecently.size > 1000) {
            for (const [id, expire] of _alertedRecently) {
                if (expire <= now) _alertedRecently.delete(id);
            }
        }
    } catch (err) {
        log.error('checkOnce failed:', err?.message ?? String(err));
    }
}

export const DormantAlertMonitor = {
    /**
     * Start the monitor. Idempotent. Off-by-default via
     * `ENABLE_DORMANT_ALERTS=true` env gate.
     *
     * Reasoning for the gate: this monitor will fire on ANY user who
     * returns from > 30 days dormancy and immediately invests — which
     * IS a normal "I forgot about Radox, now I want to buy in" path.
     * Until we have enough volume to tune the detection (e.g., require
     * also a new IP / new device fingerprint before alerting), the
     * monitor should be off in production to avoid PagerDuty noise on
     * legitimate returning users. Set ENABLE_DORMANT_ALERTS=true once
     * you've validated the signal on real traffic.
     */
    start() {
        if (_started) return;

        if (process.env.ENABLE_DORMANT_ALERTS !== 'true') {
            log.info(
                '[DormantAlertMonitor] Disabled — set ENABLE_DORMANT_ALERTS=true to enable. ' +
                'Off-by-default to avoid PagerDuty noise on legitimately-returning users.',
            );
            return;
        }

        _started = true;
        // First scan after a brief delay so DB pools and prisma are ready.
        setTimeout(() => { checkOnce(); }, 15_000);
        _intervalId = setInterval(() => { checkOnce(); }, POLL_INTERVAL_MS);
        log.info(`[DormantAlertMonitor] Started — polling every ${POLL_INTERVAL_MS / 1000}s`);
    },

    /**
     * Stop the monitor. Called from gracefulShutdown.
     */
    stop() {
        if (_intervalId) {
            clearInterval(_intervalId);
            _intervalId = null;
        }
        _started = false;
        _alertedRecently.clear();
        log.info('[DormantAlertMonitor] Stopped');
    },

    // Exposed for testing.
    _checkOnce: checkOnce,
};

export default DormantAlertMonitor;
