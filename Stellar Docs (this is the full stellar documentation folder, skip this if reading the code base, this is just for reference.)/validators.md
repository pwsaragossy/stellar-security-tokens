# Validators Introduction

Stellar is a peer-to-peer network made up of nodes, which are computers that keep a common distributed [ledger](/docs/learn/fundamentals/stellar-data-structures/ledgers.md), and that communicate to validate and add [transactions](/docs/learn/fundamentals/transactions/operations-and-transactions.md) to it. Nodes use a program called Stellar Core  an implementation of the [Stellar Consensus Protocol](/docs/learn/fundamentals/stellar-consensus-protocol.md)  to stay in sync as they work to agree on the validity of transaction sets and to apply them to the ledger. Generally, nodes reach consensus, apply a transaction set, and update the ledger every 3-5 seconds.

This section of the docs explains how to run a validator node, which participates in consensus to validate transactions and determine network settings. A validator node *should not* be used for network data access and transaction submission. There are two varieties of *non-validating* nodes that can be used for those purposes, each of which has its own process for set up, interaction, maintenance, and monitoring. They are:

1. [**Stellar RPC Nodes**](/docs/data/apis/rpc.md) can be used for simulating and/or submitting transactions, as well as exposing an RPC service to query and retrieve current network state. This is the best choice for real-time use-cases.
2. [**Galexie Nodes**](/docs/data/indexers/build-your-own/galexie.md) can be used for retrieving and storing network data en masse for further processing. Notably, it does *not* support transaction submission so is more suitable for indexers or analytics use-cases.

If you are interested in running a validator node  because you issue an asset that you would like to help secure through transaction validation, because you want to help increase network health and decentralization, or because you want to participate in network governance  then this section of the docs is for you. It explains the technical and operational aspects of installing, configuring, and maintaining a Stellar Core validator node, and should help you figure out the best way to set up your Stellar integration.

## Node Setup Process[](#node-setup-process "Direct link to Node Setup Process")

The basic flow, which you can navigate through using the "Admin Guide" on the left, goes (roughly) like this:

### Initial Setup[](#initial-setup "Direct link to Initial Setup")

1. Use the information on this *Introduction* page to determine which [type of node](#types-of-nodes) you want to run.
2. [Prerequisite](/docs/validators/admin-guide/prerequisites.md) software must be installed (and configured according to your needs).
3. [Install](/docs/validators/admin-guide/installation.md) the Stellar Core software on your instance.
4. [Configure](/docs/validators/admin-guide/configuring.md) the Stellar Core software to suit your needs and environment.
5. [Prepare](/docs/validators/admin-guide/environment-preparation.md) your node instance and environment. This includes the optional step of setting your node up to [publish history archives](/docs/validators/admin-guide/publishing-history-archives.md) of the ledger.
6. [Start your node](/docs/validators/admin-guide/running-node.md) and join the network.
7. [Logging](/docs/validators/admin-guide/logging.md) and [monitoring](/docs/validators/admin-guide/monitoring.md) should be appropriately set up and used to meet your needs.

### Ongoing Requirements[](#ongoing-requirements "Direct link to Ongoing Requirements")

8. [Maintenance](/docs/validators/admin-guide/maintenance.md) is required from time to time to keep your node up-to-date and participating in the network.
9. [Network upgrades](/docs/validators/admin-guide/network-upgrades.md) require validator consensus, and you will need to consider casting a vote in the event of a protocol upgrade.
10. [Soroban settings](/docs/validators/admin-guide/soroban-settings.md) are network-wide, configurable, and changes can be proposed by anyone. Similar to protocol upgrades, changes to these settings will require validator consensus, so you should be prepared to participate.

### Other Information[](#other-information "Direct link to Other Information")

* Stellar Core uses a robust [command line](/docs/validators/admin-guide/commands.md) tool to control and operate a node. We've gathered information on some of the most-used commands, and linked to further, more comprehensive CLI documentation.
* We've collected some miscellaneous helpful and [advanced](/docs/validators/admin-guide/advanced.md) information that could be useful as you understand and implement your core node.

## Types of validator nodes[](#types-of-nodes "Direct link to Types of validator nodes")

There are two types of validator nodes, and they perform the same basic functions: they run Stellar Core, connect to peers, submit transactions, and store the state of the ledger. The difference is this: a **Basic Validator** does not publish a history archive; a **Full Validator** does.

> **Info:** Non-validating nodes, like Stellar RPC or Galexie, bundle an optimized "Captive" Core to serve their operational needs.

### Basic Validator[](#basic-validator "Direct link to Basic Validator")

#### Validating, no public archive[](#validating-no-public-archive "Direct link to Validating, no public archive")

A Basic Validator keeps track of the ledger and submits transactions for possible inclusion, but it is *not* configured to publish history archives. It does require a secret key, and is [configured to participate in consensus](/docs/validators/admin-guide/configuring.md) by voting on  and signing off on  changes to the ledger, meaning it supports the network and increases decentralization.

The advantage: signatures can serve as official endorsements of specific ledgers in real time. Thats important if, for instance, you issue an asset on Stellar that represents a real-world asset: you can let your customers know that you will only honor transactions and redeem assets from ledgers signed by your validator, and in the unlikely scenario that something happens to the network, you can use your node as the final arbiter of truth. Setting up your node as a validator allows you to resolve any questions *up front and in writing* about how you plan to deal with disasters and disputes.

### Full Validator[](#full-validator "Direct link to Full Validator")

#### Validating, offers public archive[](#validating-offers-public-archive "Direct link to Validating, offers public archive")

A Full Validator is the same as a Basic Validator except that it also publishes a [History Archive](/docs/validators/admin-guide/environment-preparation.md) containing snapshots of the ledger, including all transactions and their results. A Full Validator writes to an internet-facing blob store  such as AWS or Azure  so it's a bit more expensive and complex to run, but it also does the most to support the networks resilience and decentralization.

When other nodes join the network  or experience difficulty and temporarily fall out of sync  they can consult archives offered by Full Validators to catch up on the history of the network. Redundant archives prevent a single point of failure, and allow network participants to verify the veracity of a given history.

Generally, organizations that run Full Validators are also part of  or on track to join  [Tier 1](/docs/validators/tier-1-orgs.md), which is a core group of network participants who run three Full Validators to contribute maximum redundancy.