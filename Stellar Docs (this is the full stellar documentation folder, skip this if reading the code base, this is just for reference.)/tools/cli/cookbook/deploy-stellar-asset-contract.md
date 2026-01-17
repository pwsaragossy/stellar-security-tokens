# Deploy the Stellar Asset Contract for a Stellar asset

The Stellar CLI can deploy a [Stellar Asset Contract](/docs/tokens/stellar-asset-contract.md) for a Stellar asset so that any Stellar smart contract can interact with the asset.

Every Stellar asset has reserved a contract that anyone can deploy. Once deployed any contract can interact with that asset by holding a balance of the asset, receiving the asset, or sending the asset.

Deploying the Stellar Asset Contract for a Stellar asset enables that asset for use in smart contracts.

The Stellar Asset Contract can be deployed for any possible Stellar asset, either assets already in use on Stellar or assets that have never seen any activity. This means that the issuer doesn't need to have been created, and no one needs to be yet holding the asset on Stellar.

To perform the deploy, use the following command:

```
stellar contract asset deploy \  
    --source S... \  
    --network testnet \  
    --asset USDC:GCYEIQEWOCTTSA72VPZ6LYIZIK4W4KNGJR72UADIXUXG45VDFRVCQTYE
```

The `asset` argument corresponds to the symbol and it's issuer address, which is how assets are identified on Stellar.

The same can be done for the native [Lumens](/docs/learn/fundamentals/lumens.md) asset:

```
stellar contract asset deploy \  
    --source S... \  
    --network testnet \  
    --asset native
```

> **Note:** Deploying the native asset will fail on testnet or mainnet as a Stellar Asset Contract already exists.

For any asset, the contract address can be fetched with:

```
stellar contract id asset \  
    --network testnet \  
    --asset native
```

### Guides in this category:

[## ðï¸ Asset Management

Issue a Stellar Asset, deploy it's contract, and mint, burn, freeze, and clawback.](/docs/tools/cli/cookbook/asset-management.md)

[## ðï¸ Add meta data to contract WASM on build

Include meta data in the contract WASM byte code on build](/docs/tools/cli/cookbook/contract-build-meta.md)

[## ðï¸ Contract Lifecycle

Manage the lifecycle of a Stellar smart contract using the CLI](/docs/tools/cli/cookbook/contract-lifecycle.md)

[## ðï¸ Deploy a contract from uploaded Wasm bytecode

Deploy an instance of a compiled contract that has already been uploaded on the network](/docs/tools/cli/cookbook/deploy-contract.md)

[## ðï¸ Deploy the Stellar Asset Contract for a Stellar asset

Deploy an SAC for a Stellar asset so that it can interact with smart contracts](/docs/tools/cli/cookbook/deploy-stellar-asset-contract.md)

[## ðï¸ Extend a deployed contract instance's TTL

Use the CLI to extend the time to live (TTL) of a contract instance](/docs/tools/cli/cookbook/extend-contract-instance.md)

[## ðï¸ Extend a deployed contract's storage entry TTL

Use the CLI to extend the time to live (TTL) of a contract's persistent storage entry](/docs/tools/cli/cookbook/extend-contract-storage.md)

[## ðï¸ Extend a deployed contract's Wasm code TTL

Use Stellar CLI to extend contract's Wasm bytecode TTL, with or without local binary](/docs/tools/cli/cookbook/extend-contract-wasm.md)

[## ðï¸ Payments and Assets

Send XLM, stellar classic, or a soroban asset using the Stellar CLI](/docs/tools/cli/cookbook/payments-and-assets.md)

[## ðï¸ Restore an archived contract using the Stellar CLI

Restore an archived contract instance using the Stellar CLI](/docs/tools/cli/cookbook/restore-contract-instance.md)

[## ðï¸ Restore archived contract data using the Stellar CLI

Restore archived contract storage entries using Stellar CLI](/docs/tools/cli/cookbook/restore-contract-storage.md)

[## ðï¸ Stellar Keys

Manage stellar keys](/docs/tools/cli/cookbook/stellar-keys.md)

[## ðï¸ Create Claimable Balance

Create claimable balances with various claim predicates using the Stellar CLI](/docs/tools/cli/cookbook/tx-new-create-claimable-balance.md)

[## ðï¸ tx Commands

Create stellar transactions using the Stellar CLI](/docs/tools/cli/cookbook/tx-new.md)

[## ðï¸ tx op add

Create stellar transactions using the Stellar CLI](/docs/tools/cli/cookbook/tx-op-add.md)

[## ðï¸ tx sign and tx send

Create stellar transactions using the Stellar CLI](/docs/tools/cli/cookbook/tx-sign.md)

[## ðï¸ Upload and deploy a smart contract

Combine the upload and deploy commands in the Stellar CLI to accomplish both tasks](/docs/tools/cli/cookbook/upload-deploy.md)

[## ðï¸ Upload Wasm bytecode

Use the Stellar CLI to upload a compiled smart contract on the ledger](/docs/tools/cli/cookbook/upload-wasm.md)