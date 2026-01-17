# Admin Guide

[## ðï¸ Overview

The entire SDP step-by-step process usually looks something like the following after the SDP is deployed and organizational users have been set up:](/docs/platforms/stellar-disbursement-platform/admin-guide/overview.md)

[## ðï¸ Getting Started

This guide covers running the Stellar Disbursement Platform locally, sending a sample disbursement, and claiming it through the demo wallet on Testnet. Treat this walkthrough as a learning environment rather than the path for production deployments.](/docs/platforms/stellar-disbursement-platform/admin-guide/getting-started.md)

[## ðï¸ Architecture

The Stellar Disbursement Platform consists of three services deployed together:](/docs/platforms/stellar-disbursement-platform/admin-guide/design-and-architecture.md)

[## ðï¸ Deployment

Deployment via Helm Charts](/docs/platforms/stellar-disbursement-platform/admin-guide/deploy-the-sdp.md)

[## ðï¸ Configuration

Understand the configuration options available for the Stellar Disbursement Platform (SDP)](/docs/platforms/stellar-disbursement-platform/admin-guide/configuring-sdp.md)

[## ðï¸ Advanced Configuration

Understand how to configuration the SDP for various scenarios. This includes multi-tenancy, testnet vs. mainnet, etc.](/docs/platforms/stellar-disbursement-platform/admin-guide/advanced-configration.md)

[## ðï¸ CLI Manual

Guide to using the Stellar Disbursement Platform CLI](/docs/platforms/stellar-disbursement-platform/admin-guide/cli-manual.md)

[## ðï¸ Security

This manual outlines the security measures implemented in the Stellar Disbursement Platform (SDP) to protect the integrity of the platform and its users. By adhering to these guidelines, you can ensure that your use of the SDP is as secure as possible.](/docs/platforms/stellar-disbursement-platform/admin-guide/security.md)

[## ðï¸ Monitoring

Guide to using the Stellar Disbursement Platform CLI](/docs/platforms/stellar-disbursement-platform/admin-guide/monitoring.md)

[## ðï¸ Making Your Wallet SDP-Ready

Remember that any SDP instance will need an agreement with a wallet provider before sending disbursements into that wallet. This ensures the wallets are comfortable receiving funds from your organization and governs any commercial arrangement between the organizations. The wallet will need to allowlist the SDP domain before the SDP can send disbursements to that wallet. When the wallet domain is added to a SDP, it's effectively being allowlisted by the SDP. Both sides listing the other allows them to retrieve the stellar.toml file and check the signing key needed for the [SEP-10] handshake.](/docs/platforms/stellar-disbursement-platform/admin-guide/making-your-wallet-sdp-ready.md)

[## ðï¸ Troubleshooting

This guide helps you diagnose and resolve common issues with the Stellar Disbursement Platform (SDP).](/docs/platforms/stellar-disbursement-platform/admin-guide/troubleshooting.md)

[## ðï¸ User Interface

7 items](/docs/platforms/stellar-disbursement-platform/admin-guide/user-interface.md)