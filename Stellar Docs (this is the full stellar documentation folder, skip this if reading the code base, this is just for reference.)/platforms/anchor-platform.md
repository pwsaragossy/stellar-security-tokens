# Anchor Platform

The Anchor Platform provides a set of tools and APIs for building on and off-ramp services on the Stellar network. With standardized interfaces and full implementations of key Stellar Ecosystem Proposals (SEPs), it simplifies integration with Stellar-based wallets and exchanges, enabling you to focus on your core business logic rather than protocol implementation details.

## Supported SEPs[](#supported-seps "Direct link to Supported SEPs")

The Anchor Platform implements the following Stellar Ecosystem Proposals:

* **[SEP-1](/docs/platforms/anchor-platform/sep-guide/sep1.md)**  Stellar.toml file serving for service discovery
* **[SEP-6](/docs/platforms/anchor-platform/sep-guide/sep6.md)**  Deposit and withdrawal operations
* **[SEP-10](/docs/platforms/anchor-platform/sep-guide/sep10.md)**  Web authentication using challenge/response transactions
* **SEP-12**  Customer KYC/AML data management
* **[SEP-24](/docs/platforms/anchor-platform/sep-guide/sep24.md)**  Interactive deposit and withdrawal flows
* **[SEP-31](/docs/platforms/anchor-platform/sep-guide/sep31/integration.md)**  Cross-border payment processing (receive only)
* **SEP-38**  Price quotes and exchange rate services
* **[SEP-45](/docs/platforms/anchor-platform/sep-guide/sep45.md)**  Web authentication using challenge/responses for contract accounts

## Key Features[](#key-features "Direct link to Key Features")

* **Complete SEP implementations**  Full support for deposit, withdrawal, and payment processing workflows
* **Authentication & authorization**  SEP-10 and SEP-45 support for both traditional and smart contract accounts
* **Customer management**  SEP-12 integration for KYC/AML compliance and customer data handling
* **Transaction processing**  Comprehensive transaction lifecycle management with status tracking and webhook callbacks
* **Quote & exchange services**  SEP-38 integration for price discovery and exchange rate calculations
* **Multi-asset support**  Flexible configuration for multiple assets with various deposit and withdrawal methods
* **Smart contract support**  Native support for Stellar contract accounts (C-accounts) via SEP-45

## Documentation Links[](#documentation-links "Direct link to Documentation Links")

* **[Architecture](/docs/platforms/anchor-platform/admin-guide/architecture.md)**  System architecture and component overview
* **[Getting Started](/docs/platforms/anchor-platform/admin-guide/getting-started.md)**  Initial setup and deployment instructions
* **[Event Handling](/docs/platforms/anchor-platform/admin-guide/events.md)**  Event delivery, webhooks, and integration patterns
* **[SEP Guides](/docs/platforms/anchor-platform/sep-guide.md)**  Implementation guides for Stellar Ecosystem Proposals
* **[API Reference](/docs/platforms/anchor-platform/api-reference.md)**  Complete API documentation and reference

## Additional Resources[](#additional-resources "Direct link to Additional Resources")

The documentation for the Anchor Platform is a work in progress. Developers are welcome to dive into the code and existing documentation on the [GitHub repository](https://github.com/stellar/java-stellar-anchor-sdk).