// Retry script for stuck investments (payment_received but not distributed)
import { StellarService } from '../src/services/stellar.service.js';
import { Investor } from '../src/models/Investor.js';
import { Token } from '../src/models/Token.js';
import prisma from '../src/config/prisma.js';

async function retryStuckInvestments() {
    const stuck = await prisma.investment.findMany({
        where: { status: 'payment_received' },
        orderBy: { id: 'desc' }
    });

    console.log(`Found ${stuck.length} stuck investments`);
    if (stuck.length === 0) {
        console.log('Nothing to retry.');
        return;
    }

    // Debug: log first record field names
    if (stuck[0]) {
        console.log('Field names:', Object.keys(stuck[0]));
    }

    for (const inv of stuck) {
        try {
            const investorId = inv.investorId || inv.investor_id;
            const assetCode = inv.assetCode || inv.asset_code;
            const tokenAmount = inv.tokenAmount || inv.token_amount;
            const usdcPaymentHash = inv.usdcPaymentHash || inv.usdc_payment_hash;
            const offerId = inv.offerId || inv.offer_id;

            const investor = await prisma.investor.findUnique({ where: { id: investorId } });
            const targetWallet = investor.stellarContractId || investor.stellarPublicKey;
            console.log(`\nRetrying investment ${inv.id}: ${tokenAmount} ${assetCode} -> ${targetWallet}`);

            // JIT Auth
            try {
                await StellarService.authorizeInvestor(targetWallet, assetCode);
                console.log('  JIT auth OK');
            } catch (e) { console.log('  JIT auth warn:', e.message); }

            // Distribute (ensureSACDeployed is called inside distributeTokens)
            const result = await StellarService.distributeTokens(
                targetWallet,
                tokenAmount.toString(),
                assetCode,
                {}
            );
            console.log('  Distribution OK:', result.transactionHash);

            // Create distribution record
            await Token.createDistribution({
                investorId: investorId,
                assetCode: assetCode,
                amount: tokenAmount,
                transactionHash: result.transactionHash,
                usdcPaymentHash: usdcPaymentHash,
                offerId: offerId,
                memo: `RETRY-${inv.id}`,
            });

            // Update investment status
            await prisma.investment.update({
                where: { id: inv.id },
                data: { status: 'distributed', distributionTxHash: result.transactionHash }
            });
            console.log(`  Investment ${inv.id} -> distributed ✅`);

        } catch (err) {
            console.error(`  Investment ${inv.id} FAILED:`, err.message);
        }
    }
}

retryStuckInvestments()
    .then(() => {
        console.log('\nDone.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
