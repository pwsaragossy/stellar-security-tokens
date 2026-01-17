# Admin Guide

All you need to know about setting up, running, and using Stellar RPC.

[## ðï¸ Prerequisites

The RPC service can be installed on bare metal or a virtual machine. It is natively supported on both Linux and Windows operating systems.](/docs/data/apis/rpc/admin-guide/prerequisites.md)

[## ðï¸ Installing

We offer three alternatives to deploy your own RPC instance:](/docs/data/apis/rpc/admin-guide/installing.md)

[## ðï¸ Configuring

For production, we recommend running Stellar RPC with a TOML configuration file rather than CLI flags. This is similar to creating a configuration file for Stellar-Core as we did previously. For example, using our docker image:](/docs/data/apis/rpc/admin-guide/configuring.md)

[## ðï¸ Running

You can run the stellar/stellar-rpc container with the following command:](/docs/data/apis/rpc/admin-guide/running.md)

[## ðï¸ Development

For local development, we recommend downloading and running a local instance via Docker Quickstart and running a local network or communicating with a live development [Testnet].](/docs/data/apis/rpc/admin-guide/development.md)

[## ðï¸ Monitoring

If you run Stellar RPC with the --admin-endpoint configured and expose the port, you'll have access to the Prometheus metrics via the /metrics endpoint. For example, if the admin endpoint is 0.0.0.0](/docs/data/apis/rpc/admin-guide/monitoring.md)

[## ðï¸ Data Lake Integration

Expand your RPC node's capabilities by connecting it to a data lake for complete historical ledger access.](/docs/data/apis/rpc/admin-guide/data-lake-integration.md)