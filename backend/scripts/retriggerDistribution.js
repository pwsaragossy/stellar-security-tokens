/**
 * Retrigger token distribution for a stuck investment.
 * This script acts as a PRODUCER ONLY — it adds a job to the Bull queue
 * and exits. The main backend worker (which has the processor registered)
 * will pick up and process the job.
 *
 * Usage: node retriggerDistribution.js <investmentId>
 */
import Bull from 'bull';
import { Investment } from '../src/models/Investment.js';

const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || null;

const investmentId = parseInt(process.argv[2]);

if (!investmentId || isNaN(investmentId)) {
    console.error('Usage: node retriggerDistribution.js <investmentId>');
    process.exit(1);
}

async function main() {
    // Create a producer-only queue (no .process() registered)
    const queue = new Bull('token-distribution', {
        redis: {
            host: REDIS_HOST,
            port: REDIS_PORT,
            ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
            maxRetriesPerRequest: 3,
        },
    });

    const inv = await Investment.findById(investmentId);
    if (!inv) {
        console.error(`Investment #${investmentId} not found`);
        process.exit(1);
    }

    console.log(`Investment #${investmentId}:`, JSON.stringify({
        status: inv.status,
        assetCode: inv.assetCode,
        tokenAmount: inv.tokenAmount,
        memo: inv.memo,
        investorId: inv.investorId,
    }, null, 2));

    if (inv.status !== 'payment_received') {
        console.log(`Status is "${inv.status}", not "payment_received". Skipping.`);
        await queue.close();
        process.exit(0);
    }

    console.log('Adding distribution job to queue...');
    const job = await queue.add('distribute-tokens', {
        investmentId: investmentId,
        investorPublicKey: inv.investorId?.toString(),
        assetCode: inv.assetCode,
        amount: inv.tokenAmount?.toString(),
        memo: inv.memo,
    }, {
        priority: 1,
        delay: 0,
    });

    console.log(`Job ${job.id} added. The main backend worker will process it.`);
    console.log('Closing producer connection...');
    await queue.close();
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
