import { PasskeyWalletService } from '../src/services/passkeyWallet.service.js';
import { TransactionBuilder, Keypair, Networks, Operation, BASE_FEE, Account, hash } from '@stellar/stellar-sdk';
import { getNetworkPassphrase } from '../src/config/stellar.js';

async function testSponsorship() {
    console.log('--- Testing Self-Sponsorship Fallback ---');

    try {
        // 1. Create a dummy transaction that requires sponsorship
        // Use the same dummy key as passkey-kit
        const seed = hash(Buffer.from('kalepail'));
        const dummyKey = Keypair.fromRawEd25519Seed(seed);
        console.log('Dummy Account (kalepail):', dummyKey.publicKey());

        // Load the actual account to get its current sequence number
        const { stellarServer } = await import('../src/config/stellar.js');
        const account = await stellarServer.loadAccount(dummyKey.publicKey());

        // Build a simple op
        const tx = new TransactionBuilder(
            account,
            {
                fee: BASE_FEE,
                networkPassphrase: getNetworkPassphrase()
            }
        )
            .addOperation(Operation.setOptions({})) // Noop
            .setTimeout(30)
            .build();

        tx.sign(dummyKey);
        const xdr = tx.toXDR();

        console.log('Inner XDR built and signed by dummy.');

        // 2. Attempt submission via PasskeyWalletService (which should now fallback to self-sponsor)
        console.log('Submitting via PasskeyWalletService.sendTransaction...');
        const result = await PasskeyWalletService.sendTransaction(xdr);

        console.log('Result:', JSON.stringify(result, null, 2));

        if (result.success && result.sponsored) {
            console.log('SUCCESS: Transaction was successfully sponsored and submitted!');
        } else {
            console.log('FAILURE: Transaction succeeded but was not sponsored? Or failed.');
        }

    } catch (error) {
        console.error('Test failed with error:', error.message);
        if (error.message.includes('Sponsorship failed')) {
            console.log('Error context:', error.stack);
        }
    }
}

testSponsorship();
