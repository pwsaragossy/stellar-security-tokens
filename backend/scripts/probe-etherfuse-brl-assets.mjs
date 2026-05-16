/**
 * One-off probe: validate that EtherFuse will quote a real BRL → USDC on-ramp.
 *
 * Two-phase:
 *   1. /ramp/assets  — does USDC show up in the BRL catalog? (already verified)
 *   2. /ramp/quote   — does a real BRL → USDC quote succeed end-to-end?
 *
 * Read-only-ish: creates a quote object on EtherFuse side that expires in 2 min
 * and does NOT move money. No order is created.
 *
 * Run from repo root:
 *   cd backend && npx dotenv -e ../.env -- node scripts/probe-etherfuse-brl-assets.mjs [investorId]
 *
 * If investorId is omitted, picks the first investor with both a RampCustomer
 * row and a non-null stellarContractId.
 */
import { randomUUID } from 'crypto';
import EtherFuseClient from '../src/services/etherfuse.service.js';
import prisma from '../src/config/prisma.js';

const SANDBOX_USDC = 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const SANDBOX_TESOURO = process.env.ETHERFUSE_TESOURO_ASSET_IDENTIFIER
    || 'TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
const QUOTE_AMOUNT_BRL = '100';
const QUOTE_AMOUNT_USDC = '20';
const QUOTE_AMOUNT_TESOURO = '50';

async function pickInvestor() {
    const cliArg = process.argv[2];
    if (cliArg) {
        const investor = await prisma.investor.findUnique({
            where: { id: Number(cliArg) },
            include: { rampCustomer: true },
        });
        if (!investor) throw new Error(`No investor with id=${cliArg}`);
        if (!investor.rampCustomer) throw new Error(`Investor ${investor.id} has no RampCustomer (KYC not done)`);
        if (!investor.stellarContractId) throw new Error(`Investor ${investor.id} has no stellarContractId`);
        return investor;
    }
    const customers = await prisma.rampCustomer.findMany({
        include: { investor: true },
        orderBy: { id: 'desc' },
        take: 20,
    });
    const match = customers.find((c) => c.investor?.stellarContractId);
    if (!match) throw new Error('No RampCustomer with an associated investor stellarContractId — pass investorId as arg');
    return { ...match.investor, rampCustomer: { etherfuseCustomerId: match.etherfuseCustomerId, kycStatus: match.kycStatus } };
}

async function probeAssets(wallet) {
    console.log('\n────────────────────────────────────────────────────────');
    console.log('PHASE 1 — Catalog check (read-only)');
    console.log('────────────────────────────────────────────────────────');
    try {
        const res = await EtherFuseClient.Assets.list({ blockchain: 'stellar', currency: 'brl', wallet });
        const arr = Array.isArray(res) ? res : (res?.assets ?? res?.data ?? res);
        const usdc = Array.isArray(arr) ? arr.find((a) => (a.symbol ?? a.code) === 'USDC') : null;
        if (usdc) {
            console.log(`✅ USDC is in the BRL catalog: ${usdc.identifier}`);
        } else {
            console.log('❌ USDC NOT in the BRL catalog. Assets returned:');
            console.log(JSON.stringify(arr, null, 2));
        }
    } catch (err) {
        console.error('  Catalog probe failed:', err.message);
        if (err.body) console.error('  body:', JSON.stringify(err.body, null, 2));
    }
}

async function probeQuote(customerId, wallet) {
    console.log('\n────────────────────────────────────────────────────────');
    console.log('PHASE 2 — Real BRL → USDC quote (creates a 2-min quote object)');
    console.log('────────────────────────────────────────────────────────');
    const quoteId = randomUUID();
    const payload = {
        quoteId,
        customerId,
        blockchain: 'stellar',
        quoteAssets: {
            type: 'onramp',
            sourceAsset: 'BRL',
            targetAsset: SANDBOX_USDC,
        },
        sourceAmount: QUOTE_AMOUNT_BRL,
        walletAddress: wallet,
    };
    console.log('Request:', JSON.stringify(payload, null, 2));
    try {
        const res = await EtherFuseClient.Quotes.create(payload);
        console.log('\n✅ QUOTE ACCEPTED. EtherFuse returned:');
        console.log(JSON.stringify(res, null, 2));
        console.log('\nKey fields:');
        console.log(`  destinationAmount: ${res.destinationAmount ?? res.targetAmount ?? '(none)'}`);
        console.log(`  exchangeRate:      ${res.exchangeRate ?? '(none)'}`);
        console.log(`  feeBps:            ${res.feeBps ?? '(none)'}`);
        console.log(`  feeAmount:         ${res.feeAmount ?? '(none)'}`);
        console.log(`  expiresAt:         ${res.expiresAt ?? '(none)'}`);
        console.log('\n→ BRL → USDC direct on-ramp is VIABLE on EtherFuse sandbox.');
    } catch (err) {
        console.error('\n❌ QUOTE REJECTED.');
        console.error(`  ${err.name}: ${err.message}`);
        if (err.status) console.error(`  HTTP: ${err.status}`);
        if (err.body) console.error('  body:', JSON.stringify(err.body, null, 2));
        console.error('\n→ EtherFuse does NOT actually support BRL → USDC for this org/customer.');
    }
}

async function probeGenericQuote(label, { type, sourceAsset, targetAsset, sourceAmount, customerId, walletAddress }) {
    console.log('\n────────────────────────────────────────────────────────');
    console.log(`PHASE — ${label}`);
    console.log('────────────────────────────────────────────────────────');
    const payload = {
        quoteId: randomUUID(),
        customerId,
        blockchain: 'stellar',
        quoteAssets: { type, sourceAsset, targetAsset },
        sourceAmount,
        walletAddress,
    };
    console.log(`Request: ${type} ${sourceAsset.slice(0, 8)}…${sourceAsset.includes(':') ? sourceAsset.slice(-4) : ''} → ${targetAsset.slice(0, 8)}…${targetAsset.includes(':') ? targetAsset.slice(-4) : ''}  amt=${sourceAmount}`);
    try {
        const res = await EtherFuseClient.Quotes.create(payload);
        console.log(`✅ ACCEPTED. dest=${res.destinationAmount ?? res.targetAmount ?? '?'}  rate=${res.exchangeRate ?? '?'}  feeBps=${res.feeBps ?? '?'}  requiresSwap=${res.requiresSwap ?? false}`);
        console.log('Full response:');
        console.log(JSON.stringify(res, null, 2));
    } catch (err) {
        console.error(`❌ REJECTED.  HTTP ${err.status ?? '?'}  ${err.message}`);
        if (err.body) console.error('  body:', JSON.stringify(err.body, null, 2));
    }
}

async function main() {
    console.log(`Base URL: ${process.env.ETHERFUSE_API_BASE_URL || 'https://api.sand.etherfuse.com (default sandbox)'}`);

    const investor = await pickInvestor();
    console.log(`Investor #${investor.id} (${investor.name ?? investor.email ?? '?'})`);
    console.log(`  customerId: ${investor.rampCustomer.etherfuseCustomerId}`);
    console.log(`  wallet:     ${investor.stellarContractId}`);
    console.log(`  KYC:        ${investor.rampCustomer.kycStatus}`);

    if (investor.rampCustomer.kycStatus !== 'approved') {
        console.warn(`\n⚠️  Customer is not KYC-approved (${investor.rampCustomer.kycStatus}). Quote may still succeed in sandbox, but worth flagging.`);
    }

    await probeAssets(investor.stellarContractId);
    await probeQuote(investor.rampCustomer.etherfuseCustomerId, investor.stellarContractId);
    await probeGenericQuote('USDC→TESOURO swap', {
        type: 'swap',
        sourceAsset: SANDBOX_USDC,
        targetAsset: SANDBOX_TESOURO,
        sourceAmount: QUOTE_AMOUNT_USDC,
        customerId: investor.rampCustomer.etherfuseCustomerId,
        walletAddress: investor.stellarContractId,
    });
    await probeGenericQuote('TESOURO→BRL off-ramp (sanity)', {
        type: 'offramp',
        sourceAsset: SANDBOX_TESOURO,
        targetAsset: 'BRL',
        sourceAmount: QUOTE_AMOUNT_TESOURO,
        customerId: investor.rampCustomer.etherfuseCustomerId,
        walletAddress: investor.stellarContractId,
    });
    await probeGenericQuote('USDC→BRL off-ramp direct (does EtherFuse auto-route?)', {
        type: 'offramp',
        sourceAsset: SANDBOX_USDC,
        targetAsset: 'BRL',
        sourceAmount: QUOTE_AMOUNT_USDC,
        customerId: investor.rampCustomer.etherfuseCustomerId,
        walletAddress: investor.stellarContractId,
    });

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
});
