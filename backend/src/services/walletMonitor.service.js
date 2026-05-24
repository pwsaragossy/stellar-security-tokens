/**
 * WalletMonitorService — Proactive Operations Wallet Balance Monitor
 *
 * Polls the Operations hot wallet balance every 5 minutes via Horizon.
 * Sends debounced email alerts when balance crosses warning/critical thresholds.
 *
 * Thresholds (configurable via ENV):
 *   OPERATIONS_WALLET_WARNING_XLM  — default 20 XLM  (email + log.warn)
 *   OPERATIONS_WALLET_CRITICAL_XLM — default  5 XLM  (email urgente + log.error)
 *
 * Debounce: only re-alerts if severity level worsens (ok→warn→critical).
 * Resets debounce when balance recovers above warn threshold.
 *
 * IMPORTANT: uses stellarServer.loadAccount() (Horizon) — returns balances[].
 * Do NOT use getAccountRPC() (Soroban RPC) — returns sequence number only.
 */

import { stellarServer } from '../config/stellar.js';
import { keyManager } from './KeyManager.js';
import { EmailService } from './email.service.js';
import logger from '../utils/logger.js';

const log = logger.scope('WalletMonitor');

const WARN_XLM = parseFloat(process.env.OPERATIONS_WALLET_WARNING_XLM  || '20');
const CRIT_XLM = parseFloat(process.env.OPERATIONS_WALLET_CRITICAL_XLM || '5');
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const STARTUP_DELAY_MS  = 10_000;         // t+10s — wait for Horizon + KeyManager ready

let _started       = false;
let _lastAlertLevel = null; // null | 'warning' | 'critical'
let _intervalId    = null;  // A-02: stored so stop() can clearInterval

/**
 * Core balance check. Non-fatal: all errors are caught and logged.
 */
async function checkOperationsBalance() {
    try {
        const opsPublicKey = keyManager.getOperationsPublicKey();
        const account = await stellarServer.loadAccount(opsPublicKey);
        const native = account.balances.find(b => b.asset_type === 'native');
        const xlm = parseFloat(native?.balance || '0');

        if (xlm < CRIT_XLM) {
            log.error(`[WalletMonitor] 🚨 CRITICAL: Operations wallet = ${xlm.toFixed(2)} XLM (threshold: ${CRIT_XLM} XLM)`);
            if (_lastAlertLevel !== 'critical') {
                _lastAlertLevel = 'critical';
                await _sendAlert('critical', xlm);
            }
        } else if (xlm < WARN_XLM) {
            log.warn(`[WalletMonitor] ⚠️  WARNING: Operations wallet = ${xlm.toFixed(2)} XLM (threshold: ${WARN_XLM} XLM)`);
            // Only alert on first entry into warning (not if already at critical)
            if (!_lastAlertLevel) {
                _lastAlertLevel = 'warning';
                await _sendAlert('warning', xlm);
            }
        } else {
            // Recovered above warning threshold — reset debounce
            if (_lastAlertLevel) {
                log.info(`[WalletMonitor] ✅ Recovered: ${xlm.toFixed(2)} XLM — alertas resetados`);
                _lastAlertLevel = null;
            }
        }
    } catch (err) {
        // HTTP 404 means wallet is unfunded — more critical than low balance
        if (err.response?.status === 404 || err.message?.includes('Not Found')) {
            log.error('[WalletMonitor] 🚨 CRITICAL: Operations wallet não encontrada na ledger (não financiada)');
            if (_lastAlertLevel !== 'critical') {
                _lastAlertLevel = 'critical';
                await _sendAlert('critical', 0);
            }
            return;
        }
        // Other errors (Horizon down, network timeout) — non-fatal, next check in 5min
        log.error(`[WalletMonitor] Balance check falhou: ${err.message}`);
    }
}

/**
 * Send admin alert email. Non-blocking: errors are logged, never thrown.
 */
async function _sendAlert(level, xlm) {
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    if (!adminEmail) return; // already warned at startup

    try {
        const isCritical = level === 'critical';
        await EmailService.sendAdminAlert(adminEmail, 'Radox Admin', {
            title: isCritical
                ? '🚨 Operations Wallet Critically Low'
                : '⚠️ Operations Wallet Low Balance',
            message: isCritical
                ? xlm === 0
                    ? 'A carteira Operations não foi encontrada na rede Stellar. Ela precisa ser financiada imediatamente para que compras funcionem.'
                    : `Saldo atual: ${xlm.toFixed(2)} XLM. Compras estão em risco de falhar. Recarregue a carteira imediatamente.`
                : `Saldo atual: ${xlm.toFixed(2)} XLM (mínimo recomendado: ${WARN_XLM} XLM). Monitore de perto e recarregue antes do próximo ciclo de compras.`,
            actionUrl: '/admin/wallets',
            actionLabel: 'Ver Wallets',
            severity: isCritical ? 'error' : 'warning',
        });
    } catch (e) {
        log.error(`[WalletMonitor] Falha ao enviar email de alerta: ${e.message}`);
    }
}

export const WalletMonitorService = {
    /**
     * Start the wallet monitor. Idempotent — safe to call multiple times.
     * Schedules an immediate check at t+10s and recurring checks every 5min.
     */
    start() {
        if (_started) return; // guard: prevents double-start on hot reload

        // without ops key the monitor cannot read the balance
        const hasOpsKey = process.env.OPERATIONS_PUBLIC_KEY ||
                          process.env.OPERATIONS_SECRET_KEY;
        if (!hasOpsKey) {
            log.warn('[WalletMonitor] OPERATIONS_PUBLIC_KEY não configurada — monitor não iniciado. Configure no .env');
            return;
        }

        _started = true;

        if (!process.env.ADMIN_ALERT_EMAIL) {
            log.warn('[WalletMonitor] ADMIN_ALERT_EMAIL não configurada — alertas por email desativados (logs ativos)');
        }

        // Immediate check: small delay to let Horizon connection and KeyManager settle
        // Note: setTimeout handle not stored — fires once, harmless after SIGTERM
        setTimeout(() => { checkOperationsBalance(); }, STARTUP_DELAY_MS);

        // Recurring check — A-02: store handle so stop() can cancel it
        _intervalId = setInterval(() => { checkOperationsBalance(); }, CHECK_INTERVAL_MS);

        log.info(
            `[WalletMonitor] Iniciado — warn<${WARN_XLM} XLM · critical<${CRIT_XLM} XLM · check a cada ${CHECK_INTERVAL_MS / 60_000}min`
        );
    },

    /**
     * Stop the wallet monitor. Cancels the recurring interval.
     * Called by gracefulShutdown in index.js on SIGTERM/SIGINT.
     * Safe to call even if start() was never called or if already stopped.
     */
    stop() {
        if (_intervalId) {
            clearInterval(_intervalId);
            _intervalId = null;
        }
        _started = false;
        log.info('[WalletMonitor] Stopped.');
    },
};
