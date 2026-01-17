# Transaction Simulation

## Footprint[](#footprint "Direct link to Footprint")

As mentioned in the [persisting data](/docs/learn/fundamentals/contract-development/storage/persisting-data.md) section, a contract can only load or store `CONTRACT_DATA` entries that are declared in a *footprint* associated with its invocation.

A footprint is a set of ledger keys, each marked as either read-only or read-write. Read-only keys are available to the transaction for reading; read-write keys are available for reading, writing, or both.

Any Soroban transaction submitted by a user has to be accompanied by this footprint. A single footprint encompasses *all* the data read and written by *all* contracts transitively invoked by the transaction: not just the initial contract that the transaction calls, but also all contracts it calls, and so on.

Since it can be difficult for a user to know which ledger entries a given contract call will attempt to read or write (especially entries that are caused by other contracts deep within a transaction), the host provides an auxiliary `simulateTransaction` mechanism that executes a transaction against a temporary, possibly out-of-date *snapshot* of the ledger. The `simulateTransaction` mechanism is *not* constrained to only read or write the contents of a footprint; rather it *records* a footprint describing the transaction's execution, discards the execution's effects, and then returns the recorded footprint to its caller.

This simulation-provided footprint can then be used to accompany a "real" submission of the same transaction to the network for real execution. If the state of the ledger has changed too much between the time of the simulated and the real submission, the footprint may be too stale and no longer accurately identify the *keys* the transaction needs to read and/or write, at which point the simulation must be retried to refresh the footprint.

In any event (whether successful or failing), the real transaction will execute atomically, deterministically, and with serializable consistency semantics. An inaccurate footprint simply causes deterministic transaction failure, not a stale-read anomaly. All effects of such a failed transaction are discarded, as they would be in the presence of any other error.

## Authorization[](#authorization "Direct link to Authorization")

Please refer to the [authorization overview](/docs/learn/fundamentals/contract-development/authorization.md) and transaction authorization [section](/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction.md) for general information on Soroban authorization: this section pertains specifically to how simulation works alongside authorization requirements.

Soroban's transaction [simulation mechanism](/docs/data/apis/rpc/api-reference/methods/simulateTransaction.md) can be used to precompute the [`SorobanAuthorizedInvocation`](https://github.com/stellar/stellar-xdr/blob/v22.0/Stellar-transaction.x#L558) trees that must be authorized by the `Address`es for all the `require_auth` checks to pass. It can be invoked in two different ways:

### Recording Mode[](#recording-mode "Direct link to Recording Mode")

The Soroban host environment provides a simulation mode that records the entire context (address, contract ID, function, arguments, etc.) involved in calls to `require_auth`.

These records are added to a [`SorobanAuthorizedInvocation`](https://github.com/stellar/stellar-xdr/blob/v22.0/Stellar-transaction.x#L558) tree and marked as successful. Then, after the invocation has finished, transaction simulation returns all of the recorded trees, as well as randomly-generated nonce values for the expected signatures.

Given this information from simulation, the client only needs to provide these trees and nonces to the `Address`es involved the invocation for signing, then build the final transaction by combining simulation output with the corresponding signatures.

Note that the "recording" auth mode *never* emulates authorization failures. This is because failing authorization is always an "exceptional" situation (i.e., the `Address`es for which you don't anticipate successful authorization shouldn't be used in the first place). It is similar to how, for example, the [`simulateTransaction`](/docs/data/apis/rpc/api-reference/methods/simulateTransaction.md) mechanism doesn't emulate failures caused by the incorrect footprint.

If you'd like to validate signatures, you should use [`simulateTransaction`](/docs/data/apis/rpc/api-reference/methods/simulateTransaction.md) in authorization ["enforcement" mode](#enforcing-mode), which will verify the signatures before executing the transaction on-chain.

### Enforcing Mode[](#enforcing-mode "Direct link to Enforcing Mode")

The recording auth mode is one option for [`simulateTransaction`](/docs/data/apis/rpc/api-reference/methods/simulateTransaction.md). However, when dealing with the custom account contracts, for example, it may be necessary to simulate the custom account's `__check_auth` code (which is simply *omitted* in the recording auth mode), to get its ledger footprint.

This is called running simulation with "enforcing" auth mode. This is basically equivalent to running the transaction on-chain (with possibly a slightly stale ledger state); hence, it requires all the signatures to be valid.

From a developer's perspective, the difference between these is whether or not authorization entries are present in the [`InvokeHostFunction` operation](/docs/learn/fundamentals/transactions/list-of-operations.md) submitted to [`simulateTransaction`](/docs/data/apis/rpc/api-reference/methods/simulateTransaction.md). The [examples below](#typescript-utilities) highlight this distinction in detail, but the short story is that passing `auth` to [`Operation.invokeContractFunction`](https://stellar.github.io/js-stellar-sdk/Operation.html#.invokeContractFunction) (which is a convenience wrapper on [`invokeHostFunction`](https://stellar.github.io/js-stellar-sdk/Operation.html#.invokeHostFunction)) will imply enforcement mode.

### SDK Usage[](#sdk-usage "Direct link to SDK Usage")

Below, we'll demonstrate the various ways in which you can invoke transaction simulation as well as highlight some utilities available in the [TypeScript SDK](https://stellar.github.io/js-stellar-sdk/) for authorization.

We'll cover three types of invocations:

* A simple invocation in which the source account of the transaction is the only signer for the invocation tree.
* An invocation in which two accounts need to sign the invocation tree.
* An invocation run in enforcement mode to confirm that signatures are correct.

#### Example 1: source account authorization.[](#example-1-source-account-authorization "Direct link to Example 1: source account authorization.")

In this variant, we will leverage the "source account authorization" variant: this is when the source account on the transaction is the only one that needs to sign for the invocation (see the "source account" variant of [`SorobanCredentials`](https://github.com/stellar/stellar-xdr/blob/v22.0/Stellar-transaction.x#L586-L595)). In this scenario, the signature on the transaction itself directly implies signing the invocation.

* JavaScript

```
import {  
  Asset,  
  Keypair,  
  Networks,  
  Operation,  
  authorizeEntry,  
  TransactionBuilder,  
  xdr,  
} from "@stellar/stellar-sdk";  
import { Server, assembleTransaction } from "@stellar/stellar-sdk/rpc";  
  
const s = Server("https://soroban-testnet.stellar.org");  
  
// Pretend is is a real, funded account.  
const signer = Keypair.random();  
const xlmContract = Asset.native().contractId(Networks.TESTNET);  
  
async function main() {  
  const tx = new TransactionBuilder(await s.loadAccount(signer.publicKey()), {  
    networkPassphrase: Networks.TESTNET,  
    fee: BASE_FEE,  
  })  
    .addOperation(  
      Operation.invokeContractFunction(  
        xlmContract,  
        [  
          ["balance", "symbol"],  
          [signer.publicKey(), "address"],  
        ].map((val, type) => nativeToScVal(val, { type })),  
      ),  
    )  
    .build();  
  
  const preppedTx = s.prepareTransaction(tx);  
  preppedTx.sign(signer);  
  
  const sendTx = await s.sendTransaction(preppedTx);  
  return s.pollTransaction(sendTx.hash);  
}  
  
main().catch((e) => console.error(e));
```

Notice that, in contrast to the following example, we didn't need to do simulation separately. This is because we can sign the transaction as-is rather than needing to inspect its authorization entries.

#### Example 2: multi-party authentication.[](#example-2-multi-party-authentication "Direct link to Example 2: multi-party authentication.")

In this variant, we'll extend the required signatures to more than one party, so the source account is no longer enough. We'll leverage the [`authorizeEntry` helper](https://stellar.github.io/js-stellar-sdk/global.html#authorizeEntry), which is designed specifically for making it easy to sign the entries returned by transaction simulation.

* TypeScript

```
import {  
  Asset,  
  Keypair,  
  Networks,  
  Operation,  
  authorizeEntry,  
  TransactionBuilder,  
  xdr,  
} from "@stellar/stellar-sdk";  
import { Server, assembleTransaction } from "@stellar/stellar-sdk/rpc";  
  
const s = Server("https://soroban-testnet.stellar.org");  
  
// Pretend these are real, funded accounts.  
const signers = [Keypair.random(), Keypair.random()];  
const xlmContract = Asset.native().contractId(Networks.TESTNET);  
  
async function main() {  
  // Notice that the source account is the first keypair, but the transfer  
  // occurs *from* the second keypair, which means the second keypair will  
  // need to sign for an authorization entry to approve the transfer.  
  const tx = new TransactionBuilder(  
    await s.loadAccount(signers[0].publicKey()),  
    {  
      networkPassphrase: Networks.TESTNET,  
      fee: BASE_FEE,  
    },  
  )  
    .addOperation(  
      Operation.invokeContractFunction(  
        xlmContract,  
        [  
          ["transfer", "symbol"],  
          [signers[1].publicKey(), "address"], // from  
          [signers[0].publicKey(), "address"], // to  
          [1000, "i128"], // amount  
        ].map((val, type) => nativeToScVal(val, { type })),  
      ),  
    )  
    .build();  
  
  const simResult = s.simulateTransaction(tx);  
  
  // For every auth entry that needs signing, sign it with the correct keypair.  
  //  
  // Inject the auths back into the simulation result so they  
  // get assembled into our transaction.  
  simResult.result.auth = simResult.result.auth.map((entry) =>  
    authorizeEntry(  
      entry,  
      // Ignore source account entries, which is handled as a no-op.  
      entry.credentials().switch() !==  
        xdr.SorobanCredentialsType.sorobanCredentialsSourceAccount()  
        ? signers.find(  
            // Find the keypair that matches the entry's address.  
            (signer) =>  
              Address.fromScAddress(  
                entry.credentials().address().address(),  
              ).toString() === signer.publicKey(),  
          )  
        : null,  
      response.latestLedger + 12, // signature is valid for ~1m  
      Networks.TESTNET,  
    ),  
  );  
  
  const preppedTx = assembleTransaction(tx, simResult);  
  preppedTx.sign(signers[0]);  
  
  const sendTx = await s.sendTransaction(preppedTx);  
  return s.pollTransaction(sendTx.hash);  
}  
  
main().catch((e) => console.error(e));
```

Alternatively, we could go a step lower in the stack and build the authorization entries ourselves using [`authorizeInvocation`](https://stellar.github.io/js-stellar-sdk/global.html#authorizeInvocation), giving us full control over the actual "call stack" that is being invoked. This can be useful if you want to authorize specific invocations, build the invocations yourself, or lower the network bandwidth you use when sharing entries for other parties to sign.

#### Example 3: enforcement mode.[](#example-3-enforcement-mode "Direct link to Example 3: enforcement mode.")

In this example, we'll leverage transaction [simulation](/docs/data/apis/rpc/api-reference/methods/simulateTransaction.md)'s auth ["enforcement" mode](#enforcing-mode), which, when given signed authorization entries, will ensure that they are the necessary and sufficient signatures for the transaction's execution.

To keep things really simple, we won't do much coding. Instead, we'll just show the difference from the previous example: all we need to do is run simulation once more.

```
-  preppedTx.sign(signers[0]);  
-  
-  const sendTx = await s.sendTransaction(preppedTx);  
+  const resimTx = await s.prepareTransaction(preppedTx);  
+  resimTx.sign(signers[0]);  
+  const sendTx = await s.sendTransaction(resimTx);
```