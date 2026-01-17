# Ledgers

A ledger represents the state of the Stellar network at a point in time. It is shared across all Core nodes in the network and contains the list of accounts and balances, orders on the distributed exchange, smart contract data, and any other persisting data.

> **Note:** Blockchains typically refer to the **ledger** as the entire record of all transactions on the blockchain and **blocks** as individual units of data that contain a collection of transactions. In Stellar, "ledger" can refer to both.

In every Stellar Consensus Protocol round, the network reaches consensus on which transaction set to apply to the last closed ledger, and when the new set is applied, a new last closed ledger is defined. Each ledger is cryptographically linked to the unique previous ledger, creating a historical chain that goes back to the genesis ledger.

Data is stored on the ledger as ledger entries. Possible ledger entries include:

* [Accounts](/docs/learn/fundamentals/stellar-data-structures/accounts.md)
* [Claimable balances](/docs/build/guides/transactions/claimable-balances.md)
* [Liquidity pools](/docs/learn/fundamentals/liquidity-on-stellar-sdex-liquidity-pools.md)
* [Contract data](/docs/learn/fundamentals/contract-development/storage/persisting-data.md)

## Ledger headers[](#ledger-headers "Direct link to Ledger headers")

Every ledger has a header that references the data in that ledger and the previous ledger. These references are cryptographic hashes of the content which behave like pointers in typical data structures but with added security guarantees. Think of a historical ledger chain as a linked list of ledger headers. Time flows forward from left to right, hashes point backwards in time, from right to left. Each hash in the chain links a ledger to its previous ledger, which authenticates the entire history of ledgers in its past:

The genesis ledger has a sequence number of 1. The ledger directly following a ledger with sequence number `N` has a sequence number of `N+1`. Ledger `N+1` contains a hash of ledger `N` in its previous ledger field.

## Ledger header fields[](#ledger-header-fields "Direct link to Ledger header fields")

### Version[](#version "Direct link to Version")

The protocol version of this ledger.

### Previous ledger hash[](#previous-ledger-hash "Direct link to Previous ledger hash")

Hash of the previous ledger.

### SCP value[](#scp-value "Direct link to SCP value")

During consensus, all the validating nodes in the network run SCP and agree on a particular value, which is a transaction set they will apply to a ledger. This value is stored here and in the following three fields (transaction set hash, close time, and upgrades).

### Transaction set hash[](#transaction-set-hash "Direct link to Transaction set hash")

Hash of the transaction set applied to the previous ledger.

### Close time[](#close-time "Direct link to Close time")

The close time is a UNIX timestamp indicating when the ledger closes. Its accuracy depends on the system clock of the validator proposing the block. Consequently, SCP may confirm a close time that lags a few seconds behind or up to 60 seconds ahead. It's strictly monotonic  guaranteed to be greater than the close time of an earlier ledger.

### Upgrades[](#upgrades "Direct link to Upgrades")

How the network adjusts overall values (like the base fee) and agrees to network-wide changes (like switching to a new protocol version). This field is usually empty. When there is a network-wide upgrade, the SDF will inform and help coordinate participants using the #validators channel on the Dev Discord and the Stellar Validators Google Group.

### Transaction set result hash[](#transaction-set-result-hash "Direct link to Transaction set result hash")

Hash of the results of applying the transaction set. This data is not necessary for validating the results of the transactions. However, it makes it easier for entities to validate the result of a given transaction without having to apply the transaction set to the previous ledger.

### Bucket list hash[](#bucket-list-hash "Direct link to Bucket list hash")

Hash of all the objects in this ledger. The data structure that contains all the objects is called the bucket list.

### Ledger sequence[](#ledger-sequence "Direct link to Ledger sequence")

The sequence number of this ledger.

### Total coins[](#total-coins "Direct link to Total coins")

Total number of lumens in existence.

### Fee pool[](#fee-pool "Direct link to Fee pool")

Number of lumens that have been paid in fees. Note this is denominated in lumens, even though a transactions fee field is in stroops.

### Inflation sequence[](#inflation-sequence "Direct link to Inflation sequence")

Number of times inflation has been run. Note: the inflation operation was deprecated when validators voted to upgrade the network to Protocol 12 on 10/28/2019. Therefore, inflation no longer runs, so this sequence number no longer changes.

### ID pool[](#id-pool "Direct link to ID pool")

The last used global ID. These IDs are used for generating objects.

### Maximum number of transactions[](#maximum-number-of-transactions "Direct link to Maximum number of transactions")

The maximum number of operations validators have agreed to process in a given ledger. If more transactions are submitted than this number, the network will enter into surge pricing mode. For more about surge pricing and fee strategies, see our [Fees section](/docs/learn/fundamentals/fees-resource-limits-metering.md).

### Base fee[](#base-fee "Direct link to Base fee")

The fee the network charges per operation in a transaction. Calculated in stroops. See the [Fees section](/docs/learn/fundamentals/fees-resource-limits-metering.md) for more information.

### Base reserve[](#base-reserve "Direct link to Base reserve")

The reserve the network uses when calculating an accounts minimum balance.

### Skip list[](#skip-list "Direct link to Skip list")

Hashes of ledgers in the past. Intended to accelerate access to past ledgers without walking back ledger by ledger. Currently unused.