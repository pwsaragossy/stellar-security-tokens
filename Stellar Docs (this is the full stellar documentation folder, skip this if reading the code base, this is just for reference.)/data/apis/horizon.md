# Horizon Introduction

> **Info:** On August 1, 2024, the publicly accessible SDF-hosted Horizon had its historical data truncated to one year. That update optimized the performance of the publicly accessible Horizon and ensured a streamlined experience for all users. Consider third-party ecosystem providers of Horizon, which may provide a longer history retention window as well as other features.

Horizon provides an HTTP API to data in the Stellar network. It ingests and re-serves the data produced by the Stellar network in a form that is easier to consume by the average application relative to the performance-oriented data representations used by Stellar Core. This API serves the bridge between apps and [Stellar Core](/docs/validators.md). Projects like wallets, decentralized exchanges, and asset issuers use Horizon to submit transactions, query an account balance, or stream events like transactions to an account.

Horizon can be accessed via cURL, a browser, or one of the [Stellar SDKs](/docs/tools/sdks.md). To reduce the complexity of your project, we recommend you use an SDK instead of making direct API calls.

This guide describes how to administer a production Horizon instance (refer to the [Developers' Blog](https://www.stellar.org/developers-blog/a-new-sun-on-the-horizon) for some background on the performance and architectural improvements of this major version bump). For information about developing on the Horizon codebase, check out the [Development Guide](https://github.com/stellar/stellar-horizon/blob/main/DEVELOPING.md).

Before we begin, it's worth reiterating the sentiment echoed in the [Core Node](/docs/validators.md) documentation: **we do not endorse running Horizon backed by a standalone Stellar Core instance**, and especially not by a *validating* Stellar Core. These are two separate concerns, and decoupling them is important for both reliability and performance. Horizon instead manages its own, pared-down version of Stellar Core optimized for its own subset of needs (we'll refer to this as a "Captive Core" instance).

## Why Run Horizon?[](#why-run-horizon "Direct link to Why Run Horizon?")

Running Horizon within your own infrastructure provides a number of benefits. You can:

* Have full operational control without dependency on the Stellar Development Foundation for network data and transaction submission to networks;
* Run multiple instances for redundancy and scalability.

The Stellar Development Foundation (SDF) runs two instances of Horizon:

* [horizon-testnet.stellar.org](https://horizon-testnet.stellar.org/) for interacting with the [testnet](/docs/networks.md)
* [horizon-futurenet.stellar.org](https://horizon-futurenet.stellar.org/) for interacting with the [futurenet](/docs)

## In These Docs[](#in-these-docs "Direct link to In These Docs")

* [Admin Guide](/docs/data/apis/horizon/admin-guide.md): how to set up your own Horizon instance.
* [Structure](/docs/data/apis/horizon/api-reference/structure.md): how Horizon is structured.
* [Resources](/docs/data/apis/horizon/api-reference/resources.md): descriptions of resources and their endpoints.
* [Aggregations](/docs/data/apis/horizon/api-reference/aggregations.md): descriptions of specialized endpoints.
* [Errors](/docs/data/apis/horizon/api-reference/errors.md): potential errors and what they mean.