import { TransactionBuilder, Contract, Networks, nativeToScVal, scValToNative, BASE_FEE, rpc, Account } from '@stellar/stellar-sdk';

const XLM_SAC_CONTRACT_ID = process.env.XLM_SAC_CONTRACT_ID || 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET;
const TARGET_WALLET = 'CA2BDJJCZFJBBY2P4CBMM5DRNZSHVHTVDPX3BUNDZ3LYEDYJ5DRJTJYF';
// Use a valid G-address for transaction source (Treasury or random)
const SIMULATION_SOURCE = 'GCTXC3AUC27VSMHYTAYRBYUPP5DKF6W6WKMZFPRTGY75MDZ457TQDVK7';

async function main() {
    console.log('--- Debug Balance Script (Fixed Source) ---');
    console.log('RPC:', RPC_URL);
    console.log('SAC ID:', XLM_SAC_CONTRACT_ID);
    console.log('Target Wallet:', TARGET_WALLET);
    console.log('Simulation Source:', SIMULATION_SOURCE);

    const server = new rpc.Server(RPC_URL);

    try {
        const contract = new Contract(XLM_SAC_CONTRACT_ID);
        const walletScVal = nativeToScVal(TARGET_WALLET, { type: 'address' });

        console.log('Building balance call operation...');
        const balanceOp = contract.call('balance', walletScVal);

        console.log('Simulating transaction...');
        // Use valid G-address as source
        const source = new Account(SIMULATION_SOURCE, '0');

        const tx = new TransactionBuilder(source, {
            fee: BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE,
        })
            .addOperation(balanceOp)
            .setTimeout(30)
            .build();

        const simResult = await server.simulateTransaction(tx);

        console.log('Simulation Result Status:', simResult.status);

        if (simResult.error) {
            console.error('Simulation Error:', simResult.error);
        }

        if (simResult.result) {
            console.log('Simulation retval:', simResult.result.retval);
            const balanceScVal = simResult.result.retval;
            const balanceRaw = scValToNative(balanceScVal);
            console.log('Raw Balance (stroops):', balanceRaw);

            const balance = (Number(balanceRaw) / 10_000_000).toFixed(7);
            console.log('Formatted Balance (XLM):', balance);
        } else {
            console.log('No result in simulation response.');
            console.log(JSON.stringify(simResult, null, 2));
        }

    } catch (error) {
        console.error('Fatal Error:', error);
    }
}

main();
