/**
 * Script to fund a Soroban smart wallet contract with XLM
 * Run with: node scripts/fundWallet.js <CONTRACT_ADDRESS> <AMOUNT_XLM>
 * Example: node scripts/fundWallet.js CA2BDJJCZFJBBY2P4CBMM5DRNZSHVHTVDPX3BUNDZ3LYEDYJ5DRJTJYF 1000
 */

import {
    Horizon,
    Networks,
    Keypair,
    Asset,
    Operation,
    TransactionBuilder,
    BASE_FEE,
} from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from project root (stellar-security-tokens/.env), not backend/.env
dotenv.config({ path: path.join(__dirname, '../../.env') });

const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const server = new Horizon.Server(horizonUrl);
const networkPassphrase = process.env.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

async function fundWallet(destinationAddress, amount) {
    console.log(`\n🚀 Funding Soroban wallet contract`);
    console.log(`   Destination: ${destinationAddress}`);
    console.log(`   Amount: ${amount} XLM`);
    console.log(`   Network: ${networkPassphrase === Networks.TESTNET ? 'Testnet' : 'Mainnet'}`);

    // Get Treasury keypair (the account that will send the XLM)
    const treasurySecret = process.env.TREASURY_SECRET_KEY;
    if (!treasurySecret) {
        console.error('❌ TREASURY_SECRET_KEY not found in .env');
        console.log('\nAvailable options:');
        console.log('  - ISSUER_SECRET_KEY:', process.env.ISSUER_SECRET_KEY ? '✓ Set' : '✗ Not set');
        console.log('  - DISTRIBUTOR_SECRET_KEY:', process.env.DISTRIBUTOR_SECRET_KEY ? '✓ Set' : '✗ Not set');
        console.log('  - DISTRIBUTION_SECRET_KEY:', process.env.DISTRIBUTION_SECRET_KEY ? '✓ Set' : '✗ Not set');
        console.log('  - TREASURY_SECRET_KEY:', process.env.TREASURY_SECRET_KEY ? '✓ Set' : '✗ Not set');
        throw new Error('No treasury secret key configured');
    }

    const treasuryKeypair = Keypair.fromSecret(treasurySecret);
    console.log(`   Source: ${treasuryKeypair.publicKey()}`);

    // Load treasury account
    console.log('\n📡 Loading source account...');
    const treasuryAccount = await server.loadAccount(treasuryKeypair.publicKey());
    console.log(`   Sequence: ${treasuryAccount.sequenceNumber()}`);

    // Check balance
    const xlmBalance = treasuryAccount.balances.find(b => b.asset_type === 'native');
    console.log(`   XLM Balance: ${xlmBalance?.balance || '0'} XLM`);

    if (parseFloat(xlmBalance?.balance || '0') < parseFloat(amount)) {
        throw new Error(`Insufficient XLM balance. Need ${amount}, have ${xlmBalance?.balance}`);
    }

    // Build transaction to send XLM to the contract
    console.log('\n🔨 Building transaction...');
    const transaction = new TransactionBuilder(treasuryAccount, {
        fee: BASE_FEE,
        networkPassphrase,
    })
        .addOperation(
            Operation.payment({
                destination: destinationAddress,
                asset: Asset.native(),
                amount: amount.toString(),
            })
        )
        .setTimeout(30)
        .build();

    // Sign and submit
    console.log('✍️  Signing transaction...');
    transaction.sign(treasuryKeypair);

    console.log('📤 Submitting transaction...');
    try {
        const result = await server.submitTransaction(transaction);
        console.log('\n✅ Transaction successful!');
        console.log(`   Hash: ${result.hash}`);
        console.log(`   Ledger: ${result.ledger}`);
        console.log(`   Explorer: https://stellar.expert/explorer/testnet/tx/${result.hash}`);
        return result;
    } catch (error) {
        console.error('\n❌ Transaction failed!');
        if (error.response?.data?.extras?.result_codes) {
            console.error('   Result codes:', error.response.data.extras.result_codes);
        }
        throw error;
    }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const destination = args[0] || 'CA2BDJJCZFJBBY2P4CBMM5DRNZSHVHTVDPX3BUNDZ3LYEDYJ5DRJTJYF';
const amount = args[1] || '1000';

fundWallet(destination, amount)
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err.message);
        process.exit(1);
    });
