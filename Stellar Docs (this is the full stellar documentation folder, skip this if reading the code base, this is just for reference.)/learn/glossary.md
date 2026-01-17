# Glossary

### Account[](#account "Direct link to Account")

A central Stellar data structure to hold balances, sign transactions, and issue assets.

See the [Accounts section](/docs/learn/fundamentals/stellar-data-structures/accounts.md) to learn more.

### Account ID[](#account-id "Direct link to Account ID")

The public key used to create an account. This key persists across different key assignments. It is [represented](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0023.md) in base32.

### Anchor[](#anchor "Direct link to Anchor")

The on and off-ramps on the Stellar network that facilitate one-to-one conversion of off-chain representations to and from tokenized assets, for example, digital tokens representing bank deposits.

Read more in the [Anchor Encyclopedia entry](/docs/learn/fundamentals/anchors.md)

### Application (app)[](#application-app "Direct link to Application (app)")

A software program designed for users to carry out a specific task (other than operating the computer itself).

### Asset[](#asset "Direct link to Asset")

Fiat, physical, or other tokens of value that are tracked, held, or transferred by the Stellar distributed network.

See the [Assets section](/docs/learn/fundamentals/stellar-data-structures/assets.md) to learn more.

### Balance[](#balance "Direct link to Balance")

The amount of a given asset an account holds. Each asset has its own balance and these balances are stored in trustlines for every asset except XLM, which is held directly by the account.

### BalanceID[](#balanceid "Direct link to BalanceID")

Parameter required when claiming a newly created entry via the Claim claimable balance operation. See [ClaimableBalanceID](#claimablebalanceid).

### Base fee[](#base-fee "Direct link to Base fee")

The fee youre willing to pay per operation in a transaction.

This differs from the Effective Base Fee which is the actual fee paid per operation for a transaction to make it to the ledger. When the network is in surge pricing mode, the effective base fee varies based on an auction mechanism. When it's not, the effective base fee defaults to the network minimum currently at 100 stroops per operation.

Learn more in our [Fees section](/docs/learn/fundamentals/fees-resource-limits-metering.md).

### Base reserve[](#base-reserve "Direct link to Base reserve")

A unit of measurement used to calculate an accounts minimum balance. One base reserve is currently 0.5 XLM.

Learn more in our [Lumens section](/docs/learn/fundamentals/lumens.md).

### Burn[](#burn "Direct link to Burn")

Remove an asset from circulation, which can happen in two ways: 1) a holder sends the asset back to the issuing account 2) an issuer claws back a clawback-enabled asset from a holder's account.

### CAPs (Core Advancement Proposals)[](#caps-core-advancement-proposals "Direct link to CAPs (Core Advancement Proposals)")

Proposals of standards to improve the Stellar protocol. CAPs deal with changes to the core protocol of the Stellar network.

Find a list of all draft, accepted, implemented, and rejected CAPs in [GitHub](https://github.com/stellar/stellar-protocol/tree/master/core).

### Claim Predicate[](#claim-predicate "Direct link to Claim Predicate")

A recursive data structure used to construct complex conditionals with different values of ClaimPredicateType.

### ClaimableBalanceID[](#claimablebalanceid "Direct link to ClaimableBalanceID")

A SHA-256 hash of the OperationID for claimable balances.

### Claimant[](#claimant "Direct link to Claimant")

An object that holds both the destination account that can claim the ClaimableBalanceEntry and a ClaimPredicate that must evaluate to true for the claim to succeed.

### Clawback[](#clawback "Direct link to Clawback")

An amount of asset from a trustline or claimable balance removed (clawed back) from a recipients balance sheet.

See the [Clawback Guide](/docs/build/guides/transactions/clawbacks.md) for more information.

### Contract account[](#contract-account "Direct link to Contract account")

An account that is implemented as a smart contract, allowing the contract to define custom authorization logic and on-chain policy enforcement before authorization succeeds instead of relying on built-in protocol features.

### Contract token[](#contract-token "Direct link to Contract token")

Tokens created and managed through smart contracts. These assets are programmable and governed by on-chain logic instead of built-in protocol features.

> **Note:** Contract tokens used to be referred to as "custom tokens", which has been deprecated.

### Create account operation[](#create-account-operation "Direct link to Create account operation")

Makes a payment to a 0-balance public key (Stellar address), thereby creating the account. You must use this operation to initialize an account rather than a standard payment operation.

### Cross-asset payments[](#cross-asset-payments "Direct link to Cross-asset payments")

A payment that automatically handles the conversion of dissimilar assets.

### Custom token[](#custom-token "Direct link to Custom token")

This term has been deprecated in favor of [contract tokens](#contract-token).

### Decentralized exchange[](#decentralized-exchange "Direct link to Decentralized exchange")

A distributed exchange that allows the trading and conversion of assets on the network.

Learn more in our [Liquidity on Stellar](/docs/learn/fundamentals/liquidity-on-stellar-sdex-liquidity-pools.md) section.

### External Data Representation (XDR)[](#external-data-representation-xdr "Direct link to External Data Representation (XDR)")

The type of encoding used for operations and data running on stellar-core.

### Federation[](#federation "Direct link to Federation")

The Stellar federation protocol maps Stellar addresses to an email-like identifier that provides more information about a given user. Its a way for Stellar client software to resolve email-like addresses such as name\*yourdomain.com into `G...` account IDs. Federated addresses provide an easy way for users to share payment details by using a syntax that interoperates across different domains and providers.

Read more in [GitHub](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0002.md).

### Flags[](#flags "Direct link to Flags")

Flags control access to an asset on the account level. Learn more about flags in our [Controlling Access to an Asset section](/docs/tokens/control-asset-access.md).

### Fuzzing[](#fuzzing "Direct link to Fuzzing")

An automated test that rapidly stuffs massive amounts of randomized, malformed data into a system to reveal adverse or unexpected results that indicate vulnerabilities.

Read more in the [Fuzz Testing Tutorial](/docs/build/smart-contracts/example-contracts/fuzzing.md).

### GitHub[](#github "Direct link to GitHub")

An online repository for documents that can be accessed and shared among multiple users; host for the Stellar platforms source code, documentation, and other open-source repos.

### Home domain[](#home-domain "Direct link to Home domain")

A fully qualified domain name (FQDN) linked to a Stellar account, used to generate an on-chain link to a Stellar Info File, which holds off-chain metadata. See the Set Options operation. Can be up to 32 characters.

### Stellar RPC[](#stellar-rpc "Direct link to Stellar RPC")

A node that provides an interface for submitting transactions and reading data from the Stellar network.

### Inflation[](#inflation "Direct link to Inflation")

The inflation operation is deprecated because it wasnt working as intended. Most users either ignored it or used it for personal gain, and the costs kept rising, so the network voted to disable it in Protocol 12 through [CAP-26: Disable Inflation Mechanism](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0026.md).

Read about the implementation [here](https://github.com/stellar/stellar-core/releases/tag/v12.0.0).

Read the related blog [here](https://stellar.org/blog/foundation-news/our-proposal-to-disable-inflation).

### JSON[](#json "Direct link to JSON")

A standardized human-readable and machine-readable format for the exchange of structured data.

### Keypair[](#keypair "Direct link to Keypair")

A combined public and private key used to secure transactions. You can use any Stellar wallet, SDK, or the Stellar Lab to generate a valid keypair.

### Keystore[](#keystore "Direct link to Keystore")

An encrypted store or file that serves as a repository of private keys, certificates, and public keys.

### Ledger[](#ledger "Direct link to Ledger")

A representation of the state of the Stellar universe at a given point in time, shared across all network nodes.

Learn more in the [Ledgers section](/docs/learn/fundamentals/stellar-data-structures/ledgers.md).

### LedgerKey[](#ledgerkey "Direct link to LedgerKey")

LedgerKey holds information to identify a specific ledgerEntry. It is a union that can be any one of the LedgerEntryTypes (ACCOUNT, TRUSTLINE, OFFER, DATA, CLAIMABLE\_BALANCE, Liquidity Pool, Contract Data, Contract Code, Config Setting or TTL).

### Liability[](#liability "Direct link to Liability")

A buying or selling obligation, required to satisfy (selling) or accommodate (buying) transactions.

### Lumen (XLM)[](#lumen-xlm "Direct link to Lumen (XLM)")

The native, built-in token on the Stellar network.

Learn more about lumens in our [Lumens section](/docs/learn/fundamentals/lumens.md).

### Master key[](#master-key "Direct link to Master key")

The private key used in initial account creation.

### Minimum balance[](#minimum-balance "Direct link to Minimum balance")

The smallest permissible balance in lumens for a Stellar account, currently 1 lumen.

Learn more in our [Lumens section](/docs/learn/fundamentals/lumens.md).

### Network capacity[](#network-capacity "Direct link to Network capacity")

The maximum number of operations per ledger, as determined by validator vote. Currently 1,000 operations for the mainnet and 100 operations for the testnet.

### Number of subentries[](#number-of-subentries "Direct link to Number of subentries")

The number of entries owned by an account, used to calculate the accounts minimum balance.

### Operation[](#operation "Direct link to Operation")

An individual command that modifies the ledger.

Learn more in our [Operations and Transactions](/docs/learn/fundamentals/transactions/operations-and-transactions.md) section.

### OperationID[](#operationid "Direct link to OperationID")

Contains the transaction source account, sequence number, and the operation index of the CreateClaimableBalance operation in a transaction.

### Order[](#order "Direct link to Order")

An offer to buy or sell an asset.

Learn more in our [Liquidity on Stellar: SDEX and Liquidity Pools section](/docs/learn/fundamentals/liquidity-on-stellar-sdex-liquidity-pools.md).

### Orderbook[](#orderbook "Direct link to Orderbook")

A record of outstanding orders on the Stellar network.

Learn more in our [Liquidity on Stellar: SDEX and Liquidity Pools section](/docs/learn/fundamentals/liquidity-on-stellar-sdex-liquidity-pools.md).

### Passive order[](#passive-order "Direct link to Passive order")

An order that does not execute against a marketable counter order with the same price; filled only if the prices are not equal.

### Passphrase[](#passphrase "Direct link to Passphrase")

The Mainnet and Testnet each have their own unique passphrase, which are used to validate signatures on a given transaction.

Learn more about network passphrases in the [Networks section](/docs/networks.md).

### Pathfinding[](#pathfinding "Direct link to Pathfinding")

The process of determining the best path of a payment, evaluating the current orderbooks, and finding the series of conversions to achieve the best rate.

### Payment channel[](#payment-channel "Direct link to Payment channel")

Allows two parties who frequently transact with one another to move the bulk of their activity off-chain, while still recording opening balances and final settlement on-chain.

### Precondition[](#precondition "Direct link to Precondition")

Optional requirements you can add to control a transactions validity.

See the [Operation and Transaction Validity section](/docs/learn/fundamentals/transactions/operations-and-transactions.md) for more information.

### Price[](#price "Direct link to Price")

The ratio of the quote asset and the base asset in an order.

### Public key[](#public-key "Direct link to Public key")

The public part of a keypair that identifies a Stellar account. The public key is public- it is visible on the ledger, anyone can look it up, and it is used when sending payments to the account, identifying the issuer of an asset, and verifying that a transaction is authorized.

### Mainnet or Pubnet[](#mainnet-or-pubnet "Direct link to Mainnet or Pubnet")

The Stellar Public Network, aka mainnet, the main network used by applications in production.

Read more in our [Networks section](/docs/networks.md).

### Sequence number[](#sequence-number "Direct link to Sequence number")

Used to identify and verify the order of transactions with the source account.

A transactions sequence number must always increase by one (unless minimum sequence number preconditions are set, or a bump sequence operation is used). SDKs and the Stellar Lab automatically increment the accounts sequence number by one when you build a transaction.

### Secret (private) key[](#secret-private-key "Direct link to Secret (private) key")

The private key is part of a keypair, which is associated with an account. Do not share your secret key with anyone.

### SEPs (Stellar Ecosystem Proposals)[](#seps-stellar-ecosystem-proposals "Direct link to SEPs (Stellar Ecosystem Proposals)")

Standards and protocols to allow the Stellar ecosystem to interoperate.

Learn more in our [SEPs section](/docs/learn/fundamentals/stellar-ecosystem-proposals.md).

### Signer[](#signer "Direct link to Signer")

Refers to the master key or to any other signing keys added later. A signer is defined as the pair: public key + weight. Signers can be set with the Set Options operation.

See our [Signature and Multisignature Encyclopedia Entry](/docs/learn/fundamentals/transactions/signatures-multisig.md) for more information.

### Smart contract[](#smart-contract "Direct link to Smart contract")

Self-executing contracts with the terms of the agreement directly written into code, automatically enforceable without the need for intermediaries.

### Soroban[](#soroban "Direct link to Soroban")

The smart contract platform on the Stellar network. The name "Soroban" comes from the Japanese abacus, which is a traditional counting tool used for mathematical calculations. The Soroban abacus is a lightweight instrument known for its efficiency and accuracy in performing arithmetic operations.

### Source account[](#source-account "Direct link to Source account")

The account that originates a transaction. This account also provides the fee and sequence number for the transaction.

### Starlight[](#starlight "Direct link to Starlight")

Stellars layer 2 protocol that allows for bi-directional payment channels.

### Stellar[](#stellar "Direct link to Stellar")

A decentralized, federated peer-to-peer network that allows people to send payments in any asset anywhere in the world instantaneously, and with minimal fees.

### Stellar Consensus Protocol (SCP)[](#stellar-consensus-protocol-scp "Direct link to Stellar Consensus Protocol (SCP)")

Provides a way to reach consensus without relying on a closed system to accurately record financial transactions.

See our [SCP section](/docs/learn/fundamentals/stellar-consensus-protocol.md) to learn more.

### Stellar Core[](#stellar-core "Direct link to Stellar Core")

A replicated state machine that maintains a local copy of a cryptographic ledger and processes transactions against it, in consensus with a set of peers; also, the reference implementation for the peer-to-peer agent that manages the Stellar network.

### Stellar Development Foundation (SDF)[](#stellar-development-foundation-sdf "Direct link to Stellar Development Foundation (SDF)")

A non-profit organization founded to support the development and growth of the Stellar network.

### Stellar.toml[](#stellartoml "Direct link to Stellar.toml")

A formatted configuration file containing published information about a node and an organization. For more, see the [Stellar Info File spec (SEP-0001)](https://stellar.org/protocol/sep-1)

### Stroop[](#stroop "Direct link to Stroop")

As cents are to dollars, stroops are to assets: the smallest unit of an asset, one ten-millionth.

### Testnet[](#testnet "Direct link to Testnet")

The Stellar Test Network is maintained by the Stellar Development Foundation, which developers can use to test applications. Testnet is free to use and provides the same functionality as the main (public) network.

Read more in our [Networks](/docs/networks.md).

### Threshold[](#threshold "Direct link to Threshold")

The level of access for an operation.

Also used to describe the ratio of validator nodes in a quorum set that must agree in order to reach consensus as part of the Stellar Consensus Protocol.

Read more about operation thresholds in the [Operations and Transactions section](/docs/learn/fundamentals/transactions/operations-and-transactions.md).

Learn more about quorum set validators in our [Stellar Consensus Protocol section](/docs/learn/fundamentals/stellar-consensus-protocol.md).

### Time bounds[](#time-bounds "Direct link to Time bounds")

An optional feature you can apply to a transaction to enforce a time limit on the transaction; either the transaction makes it to the ledger or times out (fails) depending on your time parameters.

Read more about time bounds in our [Operation and Transaction Validity section](/docs/learn/fundamentals/transactions/operations-and-transactions.md).

### Transaction[](#transaction "Direct link to Transaction")

A group of 1 to 100 operations that modify the ledger state.

Read more in the [Operations and Transactions section](/docs/learn/fundamentals/transactions/operations-and-transactions.md).

### Transaction envelope[](#transaction-envelope "Direct link to Transaction envelope")

A wrapper for a transaction that carries signatures.

### Transaction fee[](#transaction-fee "Direct link to Transaction fee")

Stellar requires a small fee for all transactions to prevent ledger spam and prioritize transactions during surge pricing.

Learn more in our [Lumens section](/docs/learn/fundamentals/lumens.md).

### Trustline[](#trustline "Direct link to Trustline")

An explicit opt-in for an account to hold a particular asset that tracks liabilities, the balance of the asset, and can also limit the amount of an asset that an account can hold.

Learn more in our [Accounts section](/docs/learn/fundamentals/stellar-data-structures/accounts.md).

### TTL (Time To Live)[](#ttl-time-to-live "Direct link to TTL (Time To Live)")

A smart contract's TTL is how many ledgers remain until the data entry is no longer live.

Read more in the [State Archival section](/docs/learn/fundamentals/contract-development/storage/state-archival.md).

### Type[](#type "Direct link to Type")

The classification of data that dictates the kind of data that can be stored and how it can be manipulated within a smart contract.

### UNIX timestamp[](#unix-timestamp "Direct link to UNIX timestamp")

An integer representing a given date and time, as used on UNIX and Linux computers.

### Validator[](#validator "Direct link to Validator")

A basic validator keeps track of the ledger and submits transactions for possible inclusion. It ensures reliable access to the network and sign-off on transactions. A full validator performs the functions of a basic validator, but also publishes a history archive containing snapshots of the ledger, including all network transactions and their results.

### XLM (lumens)[](#xlm-lumens "Direct link to XLM (lumens)")

The native currency of the Stellar network.

### Wallet[](#wallet "Direct link to Wallet")

An interface that gives a user access to an account stored on the ledger; that access is controlled by the accounts secret key. The wallet allows users to store and manage their assets.