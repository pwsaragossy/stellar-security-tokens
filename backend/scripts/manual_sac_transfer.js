
import { TransactionBuilder, Keypair, Networks } from '@stellar/stellar-sdk';

async function main() {
    console.log('Starting manual SAC transfer...');

    // 1. Get Environment Variables
    const treasurySecret = process.env.TREASURY_SECRET_KEY;
    const xlmSacContractId = process.env.XLM_SAC_CONTRACT_ID;
    const sorobanRpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
    const network = process.env.STELLAR_NETWORK || 'testnet';

    // Target details
    const destination = 'CA2BDJJCZFJBBY2P4CBMM5DRNZSHVHTVDPX3BUNDZ3LYEDYJ5DRJTJYF';
    const amountXLM = '100';

    if (!treasurySecret) {
        console.error('Error: TREASURY_SECRET_KEY is missing');
        process.exit(1);
    }
    if (!xlmSacContractId) {
        console.error('Error: XLM_SAC_CONTRACT_ID is missing');
        process.exit(1);
    }

    console.log(`Target: ${destination}`);
    console.log(`Amount: ${amountXLM} XLM`);
    console.log(`RPC: ${sorobanRpcUrl}`);

    try {
        // 2. Import Stellar SDK modules dynamically
        const { Contract, nativeToScVal, rpc } = await import('@stellar/stellar-sdk');

        // 3. Setup Keys and Server
        const sourceKeypair = Keypair.fromSecret(treasurySecret);
        const server = new rpc.Server(sorobanRpcUrl, { allowHttp: true });

        let networkPassphrase = Networks.TESTNET;
        if (network === 'public') networkPassphrase = Networks.PUBLIC;

        console.log(`Source Account: ${sourceKeypair.publicKey()}`);

        // 4. Load Source Account (for sequence number)
        // We need to use a horizon server for loadAccount usually, or just assume we can get it from rpc?
        // rpc.Server has getLatestLedger but loadAccount is usually on Horizon Server.
        // However, we can use getAccount on rpc server? No, Soroban RPC has getLedgerEntries.
        // Easiest is to use the standard Server import for Horizon if needed, or better:
        // The sdk exports `Horizon.Server` too.

        // Actually, let's use the standard Horizon server for loading account details
        // but wait, standard import might have issues if we mix.
        // Let's rely on standard fetch or simplified approach.
        // Actually, we can use the same pattern as controller:
        const { Horizon } = await import('@stellar/stellar-sdk');
        const horizonUrl = 'https://horizon-testnet.stellar.org'; // Default testnet
        const horizonServer = new Horizon.Server(horizonUrl);

        let sourceAccount;
        try {
            sourceAccount = await horizonServer.loadAccount(sourceKeypair.publicKey());
        } catch (e) {
            console.error('Error loading source account from Horizon:', e.message);
            // Fallback: try to construct if we knew sequence, but we don't.
            process.exit(1);
        }

        // 5. Build SAC Transfer Transaction
        const xlmSac = new Contract(xlmSacContractId);
        const amountStroops = BigInt(Math.floor(parseFloat(amountXLM) * 10_000_000));

        const transferOp = xlmSac.call(
            'transfer',
            nativeToScVal(sourceKeypair.publicKey(), { type: 'address' }),
            nativeToScVal(destination, { type: 'address' }),
            nativeToScVal(amountStroops, { type: 'i128' })
        );

        let tx = new TransactionBuilder(sourceAccount, {
            fee: '100000',
            networkPassphrase,
        })
            .addOperation(transferOp)
            .setTimeout(180)
            .build();

        // 6. Simulate
        console.log('Simulating transaction...');
        const simResult = await server.simulateTransaction(tx);

        if (rpc.Api.isSimulationError(simResult)) {
            console.error('Simulation Error:', simResult);
            console.error('Error string:', simResult.error);
            process.exit(1);
        }
        console.log('Simulation successful. assembling transaction...');

        // 7. Assemble and Sign
        tx = rpc.assembleTransaction(tx, simResult).build();
        tx.sign(sourceKeypair);

        // 8. Submit
        console.log('Submitting transaction...');
        const sendResponse = await server.sendTransaction(tx);

        if (sendResponse.status === 'ERROR') {
            console.error('Submission Error:', sendResponse.errorResultXdr);
            process.exit(1);
        }

        console.log(`Transaction submitted. Hash: ${sendResponse.hash}`);
        console.log('Waiting for confirmation...');

        // 9. Poll for status
        let getResponse;
        let attempts = 0;
        while (attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            getResponse = await server.getTransaction(sendResponse.hash);

            if (getResponse.status !== 'NOT_FOUND') {
                break;
            }
            attempts++;
            process.stdout.write('.');
        }
        console.log(''); // Newline

        if (getResponse && getResponse.status === 'SUCCESS') {
            console.log('✅ Transaction Confirmed!');
            console.log(`Explorer: https://stellar.expert/explorer/${network}/tx/${sendResponse.hash}`);
        } else {
            console.error('❌ Transaction Failed or Timed Out.');
            console.error('Status:', getResponse ? getResponse.status : 'UNKNOWN');
        }

    } catch (error) {
        console.error('Unexpected error:', error);
    }
}

main();
