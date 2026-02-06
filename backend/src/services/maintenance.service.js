import prisma from '../config/prisma.js';
import { StellarService } from './stellar.service.js';
import cron from 'node-cron';
import logger from '../utils/logger.js';

// Scoped logger for this service
const log = logger.scope('Maintenance');
export class MaintenanceService {
    static TTL_THRESHOLD = 50000; // ~3.5 days at 6s ledgers
    static EXTEND_AMOUNT = 500000; // ~1 month

    /**
     * Initializes the maintenance cron jobs
     */
    static init() {
        log.info('Initializing maintenance schedules...');

        // Run daily at 3 AM
        cron.schedule('0 3 * * *', async () => {
            log.info('Running daily TTL maintenance check...');
            try {
                await this.checkAndExtendAllTTLs();
            } catch (error) {
                log.error('Daily maintenance failed:', error);
            }
        });

        // Run once on startup after 30 seconds delay to not interfere with boot
        setTimeout(() => {
            this.checkAndExtendAllTTLs().catch(err =>
                log.error('Startup maintenance failed:', err)
            );
        }, 30000);
    }

    /**
     * Iterates through all project-related Soroban entries and extends TTL if needed
     */
    static async checkAndExtendAllTTLs() {
        log.info('Starting TTL extension sweep...');

        const contractsToCheck = [];

        // 1. Get all Tokens with SACs
        const tokens = await prisma.token.findMany({
            where: { sacContractId: { not: null } },
            select: { assetCode: true, sacContractId: true }
        });

        for (const token of tokens) {
            contractsToCheck.push({
                id: token.sacContractId,
                name: `SAC (${token.assetCode})`,
                type: 'token'
            });
        }

        // 2. Get all Investors with Smart Wallets
        const investors = await prisma.investor.findMany({
            where: { stellarContractId: { startsWith: 'C' } },
            select: { name: true, stellarContractId: true }
        });

        for (const investor of investors) {
            contractsToCheck.push({
                id: investor.stellarContractId,
                name: `Wallet (${investor.name})`,
                type: 'investor'
            });
        }

        log.info(`Found ${contractsToCheck.length} contracts to audit.`);

        let successCount = 0;
        let extendedCount = 0;
        let failCount = 0;

        for (const contract of contractsToCheck) {
            try {
                const ttlInfo = await StellarService.getContractTTL(contract.id);

                if (!ttlInfo.exists) {
                    log.warn(`Contract ${contract.name} (${contract.id}) not found on-chain.`);
                    failCount++;
                    continue;
                }

                if (ttlInfo.ttlRemaining < this.TTL_THRESHOLD) {
                    log.info(`LOW TTL for ${contract.name}: ${ttlInfo.ttlRemaining}. Extending...`);
                    await StellarService.extendContractTTL(contract.id, this.EXTEND_AMOUNT);
                    extendedCount++;
                }

                successCount++;
            } catch (error) {
                log.error(`Error processing ${contract.name}: ${error.message}`);
                failCount++;
            }
        }

        log.info(`Sweep completed. Audited: ${successCount}, Extended: ${extendedCount}, Errors: ${failCount}`);
    }
}
