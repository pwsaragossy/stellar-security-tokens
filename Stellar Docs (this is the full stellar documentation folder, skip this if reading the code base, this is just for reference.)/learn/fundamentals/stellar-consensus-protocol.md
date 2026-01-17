# Stellar Consensus Protocol

Consensus is hugely important in a decentralized payment system. It distributes the monitoring and approval of transactions across many individual nodes (computers) instead of relying on one closed, central system. Nodes are run by organizations or individuals, and the goal is for all nodes to update the ledger in the same way, ensuring each ledger reaches the same state. Consensus is vital for the security of the blockchain, allowing nodes to agree on something safely and preventing double-spend attacks.

The Stellar network reaches consensus using the Stellar Consensus Protocol (SCP), which is a construction of the Federated Byzantine Agreement (FBA). FBA differs from other well-known consensus mechanisms like Proof of Work (which relies on a nodes computational power) and Proof of Stake (which relies on a nodes staking power) by instead relying on the agreement of trusted nodes.

In SCP, each participating Stellar Core node (also called a validator or validator node) decides what set of other nodes they want to trust. The flexibility of user-defined trust allows for open network membership (meaning anyone can become a Core node) and decentralized control (meaning no central authority dictates whose vote is required for consensus).

There are no monetary rewards for being a validator on the Stellar network. Instead, users are encouraged to become a validator because they are then contributing to the security and resiliency of the network, which benefits the products and services built on Stellar.

There are three desired properties of consensus mechanisms: fault tolerance, safety, and liveness.

* Fault tolerance - the system can continue operating despite node failures or malfunctions
* Safety - no two nodes ever agree on different values, guarantees nodes will produce the same block
* Liveness - a node can output a value without the participation of any misbehaving nodes

Consensus mechanisms can typically only prioritize two out of three of these properties. SCP prioritizes fault tolerance and safety over liveness. Because of prioritizing safety, blocks can sometimes get stuck while waiting for nodes to agree.

## SCP components[](#scp-components "Direct link to SCP components")

### Quorum set[](#quorum-set "Direct link to Quorum set")

As mentioned above, each Core node decides on which other nodes it would like to trust to reach agreement. A nodes trusted set of nodes is called a **quorum set**. Validators might add each other to their quorum sets due to innate trust associated with real-world identities.

### Thresholds and quorum slices[](#thresholds-and-quorum-slices "Direct link to Thresholds and quorum slices")

In addition to choosing a quorum set, Core nodes must also choose a **threshold**. A threshold is the minimum number of nodes in a quorum set that must agree to reach consensus. For example, lets say node B has nodes [A, C, D] in its quorum set and sets the threshold to 2. This means that any combination of 2 nodes in the quorum set agreeing is valid: either [A,C], [C,D], or [A,D] must agree for the node to proceed. The combination of agreeing nodes within the quorum set are called **quorum slices**.

### Node blocking sets[](#node-blocking-sets "Direct link to Node blocking sets")

Nodes can be blocked from reaching consensus by **node blocking sets**. Node blocking sets are any set of nodes in a quorum set that prevent a node from reaching agreement. For example, if a node requires 3 out of 4 of the nodes in its quorum set to agree, any combination of two nodes is considered a node blocking set.

### Quorum[](#quorum "Direct link to Quorum")

A **quorum** is a set of nodes sufficient to reach an agreement wherein each node is part of a quorum slice.

### Statement[](#statement "Direct link to Statement")

Valid **statements** on Stellar express the different opinions of nodes regarding transaction sets to agree on for a given ledger. For example: I propose this transaction set for ledger number 800.

A nodes opinion on a statement depends on the opinions of its quorum set.

## Federated voting[](#federated-voting "Direct link to Federated voting")

In the SCP, agreement is achieved using federated voting. A node reasons about the state of the network based on what it learns from its quorum set- before a statement is 100% agreed upon by every honest node in the network, it goes through three steps of federated voting: (1) Vote, (2) Accept, and (3) Confirm.

A node can have four opinions on a statement (lets call the statement A)

* I dont know anything about A and have no opinion
* I vote for A, its valid, but I dont know if its safe to act on it yet
* I accept A, because enough nodes supported this statement, but I dont know if its safe to act on it yet
* I confirm A, it is safe to act on it. Even if every node in my quorum has not confirmed A, they will not be able to confirm anything else but A.

To transition between the states above, federated voting has the following rules:

* Vote for A if it is consistent with my previous votes
* Accept A if either:

  + Every node in my quorum slice voted for or accepted A

    OR
  + My blocking set accepted A (even if I voted for something that contradicts A in the past, I forget about that vote, and proceed with accepting A)
* Confirm A if every node in a quorum slice accepted A

## Consensus rounds[](#consensus-rounds "Direct link to Consensus rounds")

Each consensus round is separated into two stages:

### Nomination protocol[](#nomination-protocol "Direct link to Nomination protocol")

In the nomination protocol, candidate transaction sets are selected to be included in a ledger. Once a node confirms its first candidate, it stops voting to nominate any new transaction sets. It may still accept or confirm previously nominated statements. This guarantees that at some point, all nodes will converge on a candidate set. If every node on the network stops introducing new values but continues to confirm what other nodes confirmed, eventually, everyone will end up with the same list of candidates.

A node may start the ballot protocol as soon as it confirms a candidate. After it confirms its first candidate and starts the ballot protocol, nomination continues running in the background.

### Ballot protocol[](#ballot-protocol "Direct link to Ballot protocol")

The ballot protocol ensures that the network can unanimously confirm and apply nominated transaction sets. It consists of two steps:

1. Prepare - verifies that a nodes quorum slice has the right value and is willing to commit it
2. Commit - ensures that a nodes quorum slice actually commits the value

## White paper[](#white-paper "Direct link to White paper")

Access the SCP white paper [here](https://stellar.org/learn/stellar-consensus-protocol).