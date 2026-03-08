/**
 * alertRouter.service.js — Routes critical alerts to external channels.
 *
 * Supports:
 *   - Slack (via incoming webhook)
 *   - PagerDuty (via Events API v2)
 *   - Database notifications (existing)
 *
 * Configured via env vars:
 *   ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
 *   ALERT_PAGERDUTY_ROUTING_KEY=...
 *
 * Usage:
 *   AlertRouter.send({ title, message, severity, source });
 */
import logger from '../utils/logger.js';

const log = logger.scope('AlertRouter');

const SEVERITY_MAP = {
    low: { emoji: 'ℹ️', color: '#36a64f', pd: 'info' },
    medium: { emoji: '⚠️', color: '#daa520', pd: 'warning' },
    high: { emoji: '🔴', color: '#ff0000', pd: 'error' },
    critical: { emoji: '🚨', color: '#8b0000', pd: 'critical' },
};

export class AlertRouter {

    /**
     * Send alert to all configured channels.
     * Never throws — logs errors instead.
     */
    static async send({ title, message, severity = 'medium', source = 'system' }) {
        const config = SEVERITY_MAP[severity] || SEVERITY_MAP.medium;

        const promises = [];

        // 1. Slack
        if (process.env.ALERT_SLACK_WEBHOOK_URL) {
            promises.push(this._sendSlack({ title, message, severity, config, source }));
        }

        // 2. PagerDuty
        if (process.env.ALERT_PAGERDUTY_ROUTING_KEY) {
            promises.push(this._sendPagerDuty({ title, message, severity, config, source }));
        }

        // 3. DB notification (always)
        promises.push(this._sendDbNotification({ title, message, severity }));

        const results = await Promise.allSettled(promises);
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            log.error(`[send] ${failures.length} channel(s) failed:`, failures.map(f => f.reason?.message));
        }
    }

    /**
     * Slack via incoming webhook
     */
    static async _sendSlack({ title, message, severity, config, source }) {
        try {
            const body = {
                text: `${config.emoji} *${title}*`,
                attachments: [{
                    color: config.color,
                    text: message,
                    fields: [
                        { title: 'Severity', value: severity.toUpperCase(), short: true },
                        { title: 'Source', value: source, short: true },
                        { title: 'Time', value: new Date().toISOString(), short: true },
                    ],
                }],
            };

            const response = await fetch(process.env.ALERT_SLACK_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) throw new Error(`Slack webhook returned ${response.status}`);
            log.info(`[Slack] Alert sent: ${title}`);
        } catch (err) {
            log.error(`[Slack] Failed: ${err.message}`);
        }
    }

    /**
     * PagerDuty via Events API v2
     */
    static async _sendPagerDuty({ title, message, severity, config, source }) {
        try {
            const body = {
                routing_key: process.env.ALERT_PAGERDUTY_ROUTING_KEY,
                event_action: severity === 'critical' ? 'trigger' : 'trigger',
                payload: {
                    summary: `[${source}] ${title}`,
                    source: `soroban-${source}`,
                    severity: config.pd,
                    custom_details: { message, timestamp: new Date().toISOString() },
                },
            };

            const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) throw new Error(`PagerDuty returned ${response.status}`);
            log.info(`[PagerDuty] Alert sent: ${title}`);
        } catch (err) {
            log.error(`[PagerDuty] Failed: ${err.message}`);
        }
    }

    /**
     * DB notification (existing system)
     */
    static async _sendDbNotification({ title, message, severity }) {
        try {
            const { NotificationService } = await import('./notification.service.js');
            await NotificationService.createNotification({
                userId: null, // all admins
                type: 'system_alert',
                title,
                message,
                severity,
            });
        } catch (err) {
            log.error(`[DB] Notification failed: ${err.message}`);
        }
    }
}
