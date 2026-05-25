/**
 * SorobanEventIndexer — Polls Soroban RPC getEvents() for token_sale contract events.
 *
 * Runs as a cron job (every 30s). For each tracked contract:
 *   1. Fetches new events since the last processed ledger
 *   2. Parses and logs each event (trade, wdrw, drain, status, price, padmin, aadmin, freeze)
 *   3. Triggers alerts for security-critical events (wdrw, drain, padmin, aadmin)
 *
 * Architecture:
 *   - Zero external dependencies (uses Soroban RPC only)
 *   - Cursor (lastLedger) persisted in SystemConfig table
 *   - Non-blocking: errors are logged, not thrown
 */
import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { getSorobanRpcUrl } from '../config/stellar.js';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

const log = logger.scope('SorobanEventIndexer');

// How many ledgers back to look on first run (no cursor) — ~5 min at 5s/ledger
const INITIAL_LOOKBACK_LEDGERS = 60;
// Max events per getEvents call
const MAX_EVENTS = 100;
// SystemConfig key prefix for cursor persistence
// key column is varchar(50); contract IDs are 56 chars → use prefix + last 44 chars
const CURSOR_PREFIX = 'eidx_';
const cursorKey = (contractId) => `${CURSOR_PREFIX}${contractId.slice(-44)}`;

// ─── Event Severity Classification ───
const EVENT_CONFIG = {
    trade: { severity: 'info', alert: false, description: 'Token trade executed' },
    status: { severity: 'warning', alert: true, description: 'Sale paused/resumed' },
    price: { severity: 'warning', alert: true, description: 'Price updated' },
    wdrw: { severity: 'critical', alert: true, description: '🚨 Token withdrawal' },
    drain: { severity: 'critical', alert: true, description: '🚨 Emergency drain executed' },
    padmin: { severity: 'critical', alert: true, description: '🚨 Admin transfer proposed' },
    aadmin: { severity: 'critical', alert: true, description: '🚨 Admin transfer accepted' },
    freeze: { severity: 'warning', alert: true, description: 'Buyer frozen/unfrozen' },
};

export class SorobanEventIndexer {

    /**
     * Get all active contracts to monitor (offers with sorobanContractId).
     * @returns {Promise<Array<{contractId: string, offerId: number, assetCode: string}>>}
     */
    static async getTrackedContracts() {
        const offers = await prisma.offer.findMany({
            where: {
                sorobanContractId: { not: null },
                status: { in: ['active', 'closed', 'matured', 'defaulted'] },
            },
            select: {
                id: true,
                sorobanContractId: true,
                assetCode: true,
            },
        });
        return offers.map(o => ({
            contractId: o.sorobanContractId,
            offerId: o.id,
            assetCode: o.assetCode,
        }));
    }

    /**
     * Get the last processed ledger for a contract from SystemConfig.
     * @param {string} contractId
     * @returns {Promise<number|null>}
     */
    static async getCursor(contractId) {
        const key = cursorKey(contractId);
        const config = await prisma.systemConfig.findUnique({ where: { key } });
        return config ? parseInt(config.value, 10) : null;
    }

    /**
     * Persist the last processed ledger for a contract.
     * @param {string} contractId
     * @param {number} ledger
     */
    static async setCursor(contractId, ledger) {
        const key = cursorKey(contractId);
        await prisma.systemConfig.upsert({
            where: { key },
            create: { key, value: ledger.toString(), description: `Event cursor: …${contractId.slice(-12)}` },
            update: { value: ledger.toString() },
        });
    }

    /**
     * Poll events for a single contract.
     * @param {Object} contract - { contractId, offerId, assetCode }
     * @returns {Promise<number>} Number of events processed
     */
    static async pollContract(contract) {
        const { contractId, offerId, assetCode } = contract;
        const rpcServer = new rpc.Server(getSorobanRpcUrl());

        // Determine start ledger
        let startLedger = await this.getCursor(contractId);
        if (!startLedger) {
            // First run — look back a few minutes
            const latestLedger = await rpcServer.getLatestLedger();
            startLedger = Math.max(1, latestLedger.sequence - INITIAL_LOOKBACK_LEDGERS);
            log.info(`[pollContract] First run for ${contractId}, starting from ledger ${startLedger}`);
        } else {
            // Move past the last processed ledger
            startLedger += 1;
        }

        let events;
        try {
            events = await rpcServer.getEvents({
                startLedger,
                filters: [{
                    type: 'contract',
                    contractIds: [contractId],
                }],
                limit: MAX_EVENTS,
            });
        } catch (err) {
            // getEvents might fail if startLedger is too old (pruned)
            if (err.message?.includes('start is before oldest ledger') || err.message?.includes('startLedger must be within the ledger range')) {
                const latestLedger = await rpcServer.getLatestLedger();
                const newStart = Math.max(1, latestLedger.sequence - INITIAL_LOOKBACK_LEDGERS);
                log.warn(`[pollContract] Cursor too old for ${contractId}, resetting to ${newStart}`);
                await this.setCursor(contractId, newStart);
                return 0;
            }
            throw err;
        }

        if (!events?.events?.length) {
            // Persist cursor even with zero events so next poll isn't a "first run"
            await this.setCursor(contractId, startLedger);
            return 0;
        }

        let maxLedger = startLedger;
        let processed = 0;

        for (const event of events.events) {
            try {
                const parsed = this.parseEvent(event);
                if (!parsed) continue;

                // Log the event
                log.info(`[${contractId.substring(0, 8)}] ${parsed.topic}: ${JSON.stringify(parsed.data)}`);

                // Track max ledger for cursor update
                if (event.ledger > maxLedger) {
                    maxLedger = event.ledger;
                }

                // Handle alerts for security-critical events
                const config = EVENT_CONFIG[parsed.topic];
                if (config?.alert) {
                    await this.handleAlert(parsed, contract, config);
                }

                processed++;
            } catch (parseErr) {
                log.warn(`[pollContract] Failed to parse event: ${parseErr.message}`);
            }
        }

        // Update cursor
        if (maxLedger > startLedger) {
            await this.setCursor(contractId, maxLedger);
        }

        if (processed > 0) {
            log.info(`[pollContract] Processed ${processed} events for offer #${offerId} (${assetCode}), cursor → ${maxLedger}`);
        }

        return processed;
    }

    /**
     * Parse a raw Soroban event into a structured object.
     * @param {Object} event - Raw event from getEvents()
     * @returns {Object|null} { topic, data, ledger, contractId }
     */
    static parseEvent(event) {
        try {
            // Extract topic from the first topic value
            const topicValues = event.topic || [];
            if (topicValues.length === 0) return null;

            // Topic is a Symbol ScVal
            const topicScVal = xdr.ScVal.fromXDR(topicValues[0], 'base64');
            const topic = scValToNative(topicScVal);

            // Parse data value
            let data = null;
            if (event.value) {
                const dataScVal = xdr.ScVal.fromXDR(event.value, 'base64');
                data = scValToNative(dataScVal);
            }

            return {
                topic: typeof topic === 'string' ? topic : String(topic),
                data,
                ledger: event.ledger,
                contractId: event.contractId,
                txHash: event.txHash,
            };
        } catch {
            return null;
        }
    }

    /**
     * Handle an alert-worthy event: create admin notifications + log.
     * @param {Object} parsed - Parsed event { topic, data, ledger }
     * @param {Object} contract - { contractId, offerId, assetCode }
     * @param {Object} config - Event config { severity, description }
     */
    static async handleAlert(parsed, contract, config) {
        const { topic, data, ledger, txHash } = parsed;
        const { contractId, offerId, assetCode } = contract;

        const title = `${config.description} — ${assetCode}`;
        const message = [
            `Contract: ${contractId}`,
            `Offer: #${offerId} (${assetCode})`,
            `Ledger: ${ledger}`,
            `TX: ${txHash || 'N/A'}`,
            `Data: ${JSON.stringify(data)}`,
        ].join('\n');

        // Severity-based logging
        if (config.severity === 'critical') {
            log.error(`🚨 CRITICAL EVENT [${topic}] on ${assetCode}: ${JSON.stringify(data)}`);
        } else {
            log.warn(`⚠️ ${config.description} [${topic}] on ${assetCode}: ${JSON.stringify(data)}`);
        }

        // Notify all platform admins
        try {
            const admins = await prisma.platformAdmin.findMany({
                where: { isActive: true },
                select: { id: true },
            });

            const { NotificationService } = await import('./notification.service.js');
            const notifType = config.severity === 'critical' ? 'error' : 'warning';

            for (const admin of admins) {
                await NotificationService.createNotification(
                    admin.id,
                    'platform_admin',
                    notifType,
                    title,
                    message,
                );
            }

            log.info(`[handleAlert] Notified ${admins.length} admins about ${topic} event`);
        } catch (notifErr) {
            log.error(`[handleAlert] Failed to send notifications: ${notifErr.message}`);
        }
    }

    /**
     * Run one full polling cycle across all tracked contracts.
     * @returns {Promise<number>} Total events processed
     */
    static async pollAll() {
        let totalEvents = 0;

        try {
            const contracts = await this.getTrackedContracts();
            if (contracts.length === 0) return 0;

            for (const contract of contracts) {
                try {
                    const count = await this.pollContract(contract);
                    totalEvents += count;
                } catch (err) {
                    log.error(`[pollAll] Error polling ${contract.contractId}: ${err.message}`);
                }
            }
        } catch (err) {
            log.error(`[pollAll] Failed to get tracked contracts: ${err.message}`);
        }

        return totalEvents;
    }

    /**
     * Start the cron job. Call once during server startup.
     * Polls every 30 seconds.
     */
    static start() {
        if (this._task) {
            log.warn('[start] Event indexer already running');
            return;
        }

        log.info('[start] Starting Soroban event indexer (every 30s)');

        // node-cron doesn't support sub-minute intervals, so we use setInterval
        this._task = setInterval(async () => {
            try {
                await this.pollAll();
            } catch (err) {
                log.error('[cron] Unhandled error in pollAll:', err.message);
            }
        }, 30_000);

        // Also run immediately on start
        this.pollAll().catch(err => log.error('[start] Initial poll failed:', err.message));
    }

    /**
     * Stop the cron job.
     */
    static stop() {
        if (this._task) {
            clearInterval(this._task);
            this._task = null;
            log.info('[stop] Event indexer stopped');
        }
    }
}
