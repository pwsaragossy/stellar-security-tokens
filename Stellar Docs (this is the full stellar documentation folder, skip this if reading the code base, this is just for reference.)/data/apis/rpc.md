# RPC Introduction

> **Info:** Stellar-RPC was renamed from Soroban-RPC in Nov 2024. Additional context on this decision can be found on our [developer blog](https://stellar.org/blog/foundation-news/stellar-rpc-has-arrived).

Stellar RPC is a lightweight tool that provides real-time access to Stellar network data. Much like RPC nodes in other blockchain ecosystems, it allows developers to query the network efficiently. Whether youre building a non-custodial wallet, issuing assets, or monitoring network activity, Stellar RPC is designed to provide trusted, stable infrastructure that anyone can run.

For any new builders coming to Stellar, Stellar RPC should be your starting pointits built to align with the growing needs of the ecosystem. RPC can be accessed via cURL or one of the [Stellar SDKs](/docs/tools/sdks.md).

## Why Run RPC?[](#why-run-rpc "Direct link to Why Run RPC?")

Running RPC within your own infrastructure provides a number of benefits. You can:

* Have full operational control without dependency on any third party provider for network data and transaction submission. The only way to harness the true power of a decentralized blockchain!
* Avoid the added overhead of directly interacting with [Stellar Core](/docs/validators.md), whose primary focus is performance and therefore provides a very limited API
* Avoid the added overhead of storing way more data than your application actually needs, as would be the case when running [Horizon](/docs/data/apis/horizon.md)

What Stellar RPC is not:

* An indexer for historical data. RPC retains at maximum 7 days of historical data.
* A primary backend service for your application. Use RPC as your gateway to the blockchain, but ingest and index only the data you care about.
* A drop-in replacement for Horizon. Horizon provides several indexing features not commonly supported by RPC nodes. We believe these business opportunities should be passed back to third party applications (indexers, analytics providers, etc) and away from the SDF.

## In These Docs[](#in-these-docs "Direct link to In These Docs")

* [Admin Guide](/docs/data/apis/rpc/admin-guide.md): how to set up and operate your own RPC instance.
* [RPC Methods](/docs/data/apis/rpc/api-reference/methods.md): descriptions of RPC methods, including their expected inputs and outputs.
* [Structure](/docs/data/apis/rpc/api-reference/structure.md): how the RPC API is structured.
* [Ecosystem Providers](/docs/data/apis/rpc/providers.md): third party providers that provide RPC instances as a service.