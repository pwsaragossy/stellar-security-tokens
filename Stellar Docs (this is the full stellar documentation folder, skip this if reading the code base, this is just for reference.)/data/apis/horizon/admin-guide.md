# Admin Guide

All you need to know about setting up, running, and using Horizon.

[## ðï¸ Overview

Horizon is a central component of the Stellar platform: it provides an HTTP API to data in the Stellar network. It ingests and re-serves the data produced by the Stellar network in a form that is easier to consume by the average application relative to the performance-oriented data representations used by Stellar Core.](/docs/data/apis/horizon/admin-guide/overview.md)

[## ðï¸ Prerequisites

The Horizon service is responsible for synchronizing with the Stellar network and processing ledger data. To understand the scope of Horizon's services, please read the configuring section before you move on to the prerequisites for computation.](/docs/data/apis/horizon/admin-guide/prerequisites.md)

[## ðï¸ Installing

To install Horizon in production or non-development environments, we recommend the following based on target infrastructure:](/docs/data/apis/horizon/admin-guide/installing.md)

[## ðï¸ Configuring

Prerequisites](/docs/data/apis/horizon/admin-guide/configuring.md)

[## ðï¸ Running

Once you have established the Horizon database and have identified the Horizon runtime config per host, you're ready to run Horizon.](/docs/data/apis/horizon/admin-guide/running.md)

[## ðï¸ Ingestion

Horizon API provides most of its utility through ingested data, and your Horizon server can be configured to listen for and ingest transaction results from the Stellar network. Ingestion enables API access to both current state (e.g. someone's balance) and historical state (e.g. someone's transaction history).](/docs/data/apis/horizon/admin-guide/ingestion.md)

[## ðï¸ Monitoring

Metrics](/docs/data/apis/horizon/admin-guide/monitoring.md)

[## ðï¸ Scaling

Horizon enables different logical tiers that can be scaled independently for increasing throughput, isolation, and availability. The following components can be independently scaled:](/docs/data/apis/horizon/admin-guide/scaling.md)

[## ðï¸ Upgrading

Here we'll describe the recommended steps for upgrading a Horizon 2.x installation.](/docs/data/apis/horizon/admin-guide/upgrading.md)

[## ðï¸ Ingestion Filtering

Overview](/docs/data/apis/horizon/admin-guide/ingestion-filtering.md)