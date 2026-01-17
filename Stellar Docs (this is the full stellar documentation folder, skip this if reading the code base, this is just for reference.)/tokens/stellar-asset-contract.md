# Stellar Asset Contract (SAC)

> **Info:** The term "custom token" has been deprecated in favor of "contract token". View the conversation in the [Stellar Developer Discord](https://discord.com/channels/897514728459468821/966788672164855829/1359276952971640953).

# Stellar Asset Contract (SAC)

The Stellar Asset Contract (SAC) is an implementation of [CAP-46-6 Smart Contract Standardized Asset](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-06.md) and [SEP-41 Token Interface](/docs/tokens/token-interface.md) for Stellar [assets](/docs/learn/fundamentals/stellar-data-structures/assets.md).

See examples of how to use the SAC in the [Tokens How-To Guides](/docs/build/guides/tokens.md).

## Overview[](#overview "Direct link to Overview")

> **Note:** Stellar assets are issued by Stellar accounts. Issue an asset on Stellar by following the [Issue an Asset Tutorial](/docs/tokens/how-to-issue-an-asset.md).

The Stellar Asset Contract allows users and contracts to make payments with, and interact with, assets. The SAC can interact with assets held by Stellar accounts or contracts.

The SAC is a special built-in contract that has access to functionality of the Stellar network that allows it to use Stellar assets directly.

Each Stellar asset has an instance of the SAC reserved on the network. To use the SAC reserved for an asset, the instance just needs to be deployed.

When the SAC transfers assets between accounts, the same debit and credits occur as they do when a Stellar payment operation is used, because the SAC interacts directly with Stellar account trust lines. When the SAC transfers assets between contracts, it uses Contract Data ledger entries to store the balances for contracts.

Stellar account balances for the native asset are always stored on the account, and Stellar contract balances for the native asset are always stored in a contract data entry.

Stellar account balances for issued assets are always stored in trust lines, and Stellar contract balances for issued assets are always stored in a contract data entry.

For example, when transferring from a Stellar account to a Stellar contract, the Stellar account's trust line entry is debited, and a contract data entry is credited.

And for example, when transferring from a Stellar contract to a Stellar account, a contract data entry is debited, and the account's trust line entry is credited.

In both those examples it is a single asset that is transferring from the account to the contract and back again. No bridging is required and no intermediary tokens are needed. An asset on Stellar and its Stellar Asset Contract represent the same asset. The SAC for an asset is simply an API for interacting with the asset.

The SAC implements the [SEP-41 Token Interface](/docs/tokens/token-interface.md), which is similar to the widely used ERC-20 token standard. Contracts that depend on only the SEP-41 portion of the SAC's interface, are also compatible with any contract token that implements SEP-41.

Some functionality available on the Stellar network in transaction operations, such as the order book, do not have any functions exposed on the Stellar Asset Contract in the current protocol.

## Deployment[](#deployment "Direct link to Deployment")

Every Stellar asset on Stellar has reserved a contract address that the Stellar Asset Contract can be deployed to. Anyone can initiate the deploy and the Stellar asset issuer does not need to be involved.

It can be deployed using the [Stellar CLI](/docs/tools/cli/stellar-cli.md) as shown [here](/docs/tools/cli/cookbook/deploy-stellar-asset-contract.md).

Or the [Stellar SDK](/docs/tools/sdks.md) can be used as shown [here](/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction.md) by calling `InvokeHostFunctionOp` with `HOST_FUNCTION_TYPE_CREATE_CONTRACT` and `CONTRACT_ID_FROM_ASSET`. The resulting token will have a deterministic identifier, which will be the sha256 hash of `HashIDPreimage::ENVELOPE_TYPE_CONTRACT_ID_FROM_ASSET` xdr specified [here](https://github.com/stellar/stellar-xdr/blob/dc23adf60e095a6ce626b2b09128e58a5eae0cd0/Stellar-transaction.x#L661).

Anyone can deploy the instances of Stellar Asset Contract. Note, that the initialization of the Stellar Asset Contracts happens automatically during the deployment. Asset Issuer will have the administrative permissions after the contract has been deployed.

## Interacting with classic Stellar assets[](#interacting-with-classic-stellar-assets "Direct link to Interacting with classic Stellar assets")

The Stellar Asset Contract is the only way for contracts to interact with Stellar assets, either the native XLM asset, or those issued by Stellar accounts.

The issuer of the asset will be the administrator of the deployed contract. Because the Native Stellar token doesn't have an issuer, it will not have an administrator either. It also cannot be burned.

After the contract has been deployed, users can use their classic account (for lumens) or trustline (for other assets) balance. There are some differences depending on if you are using a classic account `Address` vs a contract `Address` (corresponding either to a regular contract or to a custom account contract). The following section references some issuer and trustline flags from Stellar classic, which you can learn more about [here](/docs/tokens/control-asset-access.md).

* Using `Address::Account`
  + The balance must exist in a trustline (or an account for the native balance). This means the contract will not store the balance in ContractData. If the trustline or account is missing, any function that tries to interact with that balance will fail.
  + Classic trustline semantics will be followed.
    - Transfers will only succeed if the corresponding trustline(s) have the `AUTHORIZED_FLAG` set.
    - A trustline balance can only be clawed back using the `clawback` contract function if the trustline has `TRUSTLINE_CLAWBACK_ENABLED_FLAG` set.
    - Transfers to the issuer account will burn the token, while transfers from the issuer account will mint.
    - Trustline balances are stored in a 64-bit signed integer even though the interface accepts 128-bit signed integers. Any operation that attempts to send or receive an amount more than the maximum amount that can be represented by a 64-bit signed integer will fail.
* Using `Address::Contract`
  + The balance and authorization state will be stored in contract storage, as opposed to a trustline.
  + Balances are stored in a 128-bit signed integer.
  + A balance can only be clawed back if the issuer account had the `AUTH_CLAWBACK_ENABLED_FLAG` set when the balance was created. A balance is created when either an `Address::Contract` is on the receiving end of a successful transfer, or if the admin sets the authorization state. Read more about `AUTH_CLAWBACK_ENABLED_FLAG` [here](/docs/tokens/control-asset-access.md).

### Balance Authorization Required[](#balance-authorization-required "Direct link to Balance Authorization Required")

In the `Address::Contract` case, if the issuer has `AUTH_REQUIRED_FLAG` set, then the specified `Address::Contract` will need to be explicitly authorized with `set_auth` before it can receive a balance. This logic lines up with how trustlines interact with the `AUTH_REQUIRED_FLAG` issuer flag, allowing asset issuers to have the same control in Soroban as they do in Stellar classic. Read more about `AUTH_REQUIRED_FLAG` [here](/docs/tokens/control-asset-access.md).

### Revoking Authorization[](#revoking-authorization "Direct link to Revoking Authorization")

The admin can only revoke authorization from an `Address`, if the issuer of the asset has `AUTH_REVOCABLE_FLAG` set. The deauthorization will fail if the issuer is missing. This requirement is true for both the trustline balances of `Address::Account` and contract balances of `Address:Contract`. Note that when a trustline is deauthorized from Soroban, `AUTHORIZED_FLAG` is cleared and `AUTHORIZED_TO_MAINTAIN_LIABILITIES_FLAG` is set to avoid having to pull offers and redeeming pool shares.

## Authorization semantics[](#authorization-semantics "Direct link to Authorization semantics")

See the [authorization overview](/docs/learn/fundamentals/contract-development/authorization.md) and [auth example](/docs/build/smart-contracts/example-contracts/auth.md) for general information about authorization in Soroban.

The token contract contains three kinds of operations that follow the token [interface](/docs/tokens/token-interface.md):

* getters, such as `balance`, which do not change the state of the contract
* unprivileged mutators, such as `incr_allow` and `xfer`, which change the state of the contract but do not require special privileges
* privileged mutators, such as `clawback` and `set_admin`, which change the state of the contract but require special privileges

Getters require no authorization because they do not change the state of the contract and all contract data is public. For example, `balance` simply returns the balance of the specified `Address` without changing it.

Unprivileged mutators require authorization from the `Address` that spends or allows spending their balance. The exceptions are `xfer_from` and `burn_from` operations where the `Address` that require authorization from the 'spender' entity that has got an allowance from another `Address` beforehand.

Priviliged mutators require authorization from a specific privileged identity, known as the "administrator". For example, only the administrator can `mint` more of the token. Similarly, only the administrator can appoint a new administrator.

## Contract Interface[](#contract-interface "Direct link to Contract Interface")

The [`token` module](https://docs.rs/soroban-sdk/latest/soroban_sdk/token/index.html) of the Rust SDK contains two traits, and corresponding client structs, for interacting with SACs.

1. The [`TokenInterface` trait](https://docs.rs/soroban-sdk/latest/soroban_sdk/token/trait.TokenInterface.html) and [`TokenClient` struct](https://docs.rs/soroban-sdk/latest/soroban_sdk/token/struct.TokenClient.html) can be used to invoke the "basic subset" of the SAC functionality. They implement the common [SEP-41 Token Interface](/docs/tokens/token-interface.md), and include functions like `transfer`, `burn`, `allowance`, etc.
2. The [`StellarAssetInterface` trait](https://docs.rs/soroban-sdk/latest/soroban_sdk/token/trait.StellarAssetInterface.html) and [`StellarAssetClient` struct](https://docs.rs/soroban-sdk/latest/soroban_sdk/token/struct.StellarAssetClient.html) can be used to invoke the "extended subset" of SAC functionality. They *extend* the common SEP-41 token interface with administrative functionality. In addition to all the `TokenInterface` functions, these traits contain admin functions like `set_admin`, `clawback`, `set_authorized`, etc.

```
pub trait StellarAssetInterface {  
    // All this is available in any SEP-41-compliant contract  
    fn allowance(env: Env, from: Address, spender: Address) -> i128;  
    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32);  
    fn balance(env: Env, id: Address) -> i128;  
    fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128);  
    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128);  
    fn burn(env: Env, from: Address, amount: i128);  
    fn burn_from(env: Env, spender: Address, from: Address, amount: i128);  
    fn decimals(env: Env) -> u32;  
    fn name(env: Env) -> String;  
    fn symbol(env: Env) -> String;  
  
    //! Everything below is specifically available to SAC instances  
  
    /// Sets the administrator to the specified address `new_admin`.  
    ///  
    /// # Arguments  
    ///  
    /// * `new_admin` - The address which will henceforth be the administrator  
    ///   of this token contract.  
    ///  
    /// # Events  
    ///  
    /// Emits an event with topics `["set_admin", admin: Address], data =  
    /// [new_admin: Address]`  
    fn set_admin(env: Env, new_admin: Address);  
  
    /// Returns the admin of the contract.  
    ///  
    /// # Panics  
    ///  
    /// If the admin is not set.  
    fn admin(env: Env) -> Address;  
  
    /// Sets whether the account is authorized to use its balance. If  
    /// `authorized` is true, `id` should be able to use its balance.  
    ///  
    /// # Arguments  
    ///  
    /// * `id` - The address being (de-)authorized.  
    /// * `authorize` - Whether or not `id` can use its balance.  
    ///  
    /// # Events  
    ///  
    /// Emits an event with topics `["set_authorized", id: Address], data =  
    /// [authorize: bool]`  
    fn set_authorized(env: Env, id: Address, authorize: bool);  
  
    /// Returns true if `id` is authorized to use its balance.  
    ///  
    /// # Arguments  
    ///  
    /// * `id` - The address for which token authorization is being checked.  
    fn authorized(env: Env, id: Address) -> bool;  
  
    /// Mints `amount` to `to`.  
    ///  
    /// # Arguments  
    ///  
    /// * `to` - The address which will receive the minted tokens.  
    /// * `amount` - The amount of tokens to be minted.  
    ///  
    /// # Events  
    ///  
    /// Emits an event with topics `["mint", to: Address], data  
    /// = amount: i128`  
    fn mint(env: Env, to: Address, amount: i128);  
  
    /// Clawback `amount` from `from` account. `amount` is burned in the  
    /// clawback process.  
    ///  
    /// # Arguments  
    ///  
    /// * `from` - The address holding the balance from which the clawback will  
    ///   take tokens.  
    /// * `amount` - The amount of tokens to be clawed back.  
    ///  
    /// # Events  
    ///  
    /// Emits an event with topics `["clawback", admin: Address, to: Address],  
    /// data = amount: i128`  
    fn clawback(env: Env, from: Address, amount: i128);  
}
```

## Contract Errors[](#contract-errors "Direct link to Contract Errors")

All built-in smart contracts on the Stellar network share the same error types, outlined below.

```
#[derive(Debug, FromPrimitive, PartialEq, Eq)]  
pub(crate) enum ContractError {  
    // Indicates an internal error in protocol implementation, such as invalid  
    // ledger state. This may not happen in the real networks, but might appear  
    // when using malformed test data (such as malformed ledger snapshots).  
    InternalError = 1,  
    // Indicates an impossible function has been invoked, such as clawback for  
    // an asset that does not have clawback enabled. Or, an operation has been  
    // called affecting the issuer's trustline.  
    OperationNotSupportedError = 2,  
    // Indicates the SAC has already been initialized. This error may only occur  
    // during initialization of an asset's SAC instance.  
    AlreadyInitializedError = 3,  
    // Unused = 4, - this error code is not used by SAC  
    // Unused = 5, - this error code is not used by SAC  
    // An account that would be modified by this transaction does not exist on  
    // the network.  
    AccountMissingError = 6,  
    // Unused = 7, - this error code is not used by SAC  
    // Indicates an amount less than zero was provided for a transfer amount.  
    NegativeAmountError = 8,  
    // Indicates an insufficient spender's available allowance amount. Also used  
    // to indicate a problem with expiration ledger when creating an allowance.  
    AllowanceError = 9,  
    // Indicates too low of a balance to spend the requested amount, or a  
    // balance as a result of this transaction would be too low or high, or a  
    // problem with attempting a clawback on a non-clawback-enabled trustline.  
    BalanceError = 10,  
    // Indicates an address has had its balance authorization revoked by the  
    // asset issuer.  
    BalanceDeauthorizedError = 11,  
    // Indicates this transaction would result in a spender's allowance  
    // overflowing.  
    OverflowError = 12,  
    // Indicates a trustline entry does not exist for this address to hold this  
    // asset.  
    TrustlineMissingError = 13,  
}
```

Source: <https://github.com/stellar/rs-soroban-env/blob/main/soroban-env-host/src/builtin_contracts/contract_error.rs>