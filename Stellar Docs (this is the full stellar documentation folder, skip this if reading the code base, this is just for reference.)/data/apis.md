# APIs Overview

Learn about the services that provide access to real-time Stellar network data

| Features | RPC | Horizon |
| --- | --- | --- |
| Real-time Data |  |  |
| Historical Data |  | \* |
| Smart Contracts |  |  |
| Transaction Simulation |  |  |
| Curated and Parsed Data |  |  |

\**Please note that Horizon can provide full historical data but is not the recommended tool for full historical data access. Please use [Hubble](/docs/data/analytics/hubble.md) or [Galexie](/docs/data/indexers/build-your-own/galexie.md) instead.*

## [RPC](/docs/data/apis/rpc.md)[](#rpc "Direct link to rpc")

The RPC provides real-time access to the current state of the Stellar network, including account balances, smart contract states, and recent transaction queries (within a seven-day retention window), while also allowing transaction submission. It is designed to be simple, minimal, and scalable, making it ideal for applications and wallets that require live data availability.

> **Note:** RPC is the recommended API for accessing and interacting with Stellar network data in real-time.

## [Horizon](/docs/data/apis/horizon.md)[](#horizon "Direct link to horizon")

> **Warning:** Horizon is considered deprecated in favor of Stellar RPC. While it will continue to receive updates to maintain compatiblity with upcoming protocol releases, it won't receive significant new feature development.

Horizon is an API for accessing and interacting with Stellar network data.