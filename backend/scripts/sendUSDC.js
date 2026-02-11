/**
 * Send USDC to a Soroban smart wallet contract via SAC transfer.
 * Usage: node scripts/sendUSDC.js <CONTRACT_ADDRESS> <AMOUNT>
 * Example: node scripts/sendUSDC.js CDDKGLB2N2TGZHOH3O4DO76AYUPEPTLLIKTNS2A7Z65ATP35YKVDJ4UP 20
 */
import {
    Keypair,
    Networks,
    TransactionBuilder,
    Contract,
    nativeToScVal,
    rpc,
    BASE_FEE,
} from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const networkPassphrase = process.env.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
const usdcSacContractId = process.env.USDC_SAC_CONTRACT_ID;

async function sendUSDC(destination, amount) {
    console.log(`\n💸 Sending USDC via SAC transfer`);
    console.log(`   Destination: ${destination}`);
    console.log(`   Amount: ${amount} USDC`);
    console.log(`   USDC SAC: ${usdcSacContractId}`);

    if (!usdcSacContractId) throw new Error('USDC_SAC_CONTRACT_ID not set in .env');

    const secretKey = process.env.OPERATIONS_SECRET_KEY;
    if (!secretKey) throw new Error('OPERATIONS_SECRET_KEY not set in .env');

    const keypair = Keypair.fromSecret(secretKey);
    console.log(`   Source: ${keypair.publicKey()}`);

    const sorobanServer = new rpc.Server(rpcUrl);
    const sourceAccount = await sorobanServer.getAccount(keypair.publicKey());

    // Amount in stroops (7 decimals)
    const amountStroops = BigInt(Math.floor(parseFloat(amount) * 10_000_000));
    console.log(`   Stroops: ${amountStroops}`);

    const contract = new Contract(usdcSacContractId);
    const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase,
    })
        .addOperation(
            contract.call(
                'transfer',
                nativeToScVal(keypair.publicKey(), { type: 'address' }),
                nativeToScVal(destination, { type: 'address' }),
                nativeToScVal(amountStroops, { type: 'i128' }),
            )
        )
        .setTimeout(30)
        .build();

    // Simulate
    console.log('\n📡 Simulating transaction...');
    const simulated = await sorobanServer.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated)) {
        console.error('❌ Simulation failed:', simulated.error);
        throw new Error(`Simulation failed: ${simulated.error}`);
    }

    const prepared = rpc.assembleTransaction(tx, simulated).build();
    prepared.sign(keypair);

    console.log('📤 Submitting transaction...');
    const sendResponse = await sorobanServer.sendTransaction(prepared);
    console.log(`   Status: ${sendResponse.status}`);

    if (sendResponse.status === 'ERROR') {
        throw new Error(`Send failed: ${JSON.stringify(sendResponse)}`);
    }

    // Poll for result
    let result;
    let attempts = 0;
    while (attempts < 30) {
        result = await sorobanServer.getTransaction(sendResponse.hash);
        if (result.status !== 'NOT_FOUND') break;
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
    }

    if (result.status === 'SUCCESS') {
        console.log('\n✅ USDC sent successfully!');
        console.log(`   Hash: ${sendResponse.hash}`);
        console.log(`   Explorer: https://stellar.expert/explorer/testnet/tx/${sendResponse.hash}`);
    } else {
        console.error('❌ Transaction failed:', result.status);
        throw new Error(`Transaction failed: ${result.status}`);
    }
}

const args = process.argv.slice(2);
const destination = args[0];
const amount = args[1] || '20';

if (!destination) {
    console.error('Usage: node scripts/sendUSDC.js <CONTRACT_ADDRESS> <AMOUNT>');
    process.exit(1);
}

sendUSDC(destination, amount)
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err.message);
        process.exit(1);
    });
