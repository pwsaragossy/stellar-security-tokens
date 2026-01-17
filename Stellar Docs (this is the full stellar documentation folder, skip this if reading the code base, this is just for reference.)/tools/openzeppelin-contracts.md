# OpenZeppelin Contracts and Toolings

To bring battle-tested smart contracts to the Stellar developer community, OpenZeppelin is actively contributing towards a library of smart contracts and extensions, as well as developer tooling (including products such as [Contract Wizard](https://wizard.openzeppelin.com/stellar), [Relayer](https://github.com/OpenZeppelin/openzeppelin-relayer), [Monitor](https://github.com/OpenZeppelin/openzeppelin-monitor), and [UI Builder](https://builder.openzeppelin.com/)). For latest docs on OpenZeppelin products, please visit: [https://docs.openzeppelin.com/stellar-contracts](https://docs.openzeppelin.com/stellar-contracts/.).

## Getting started with Contract Wizard[](#getting-started-with-contract-wizard "Direct link to Getting started with Contract Wizard")

[OpenZeppelin's Contract Wizard](https://wizard.openzeppelin.com/stellar) includes support for Stellars Rust-based smart contracts, making it easier for developers to generate and deploy secure, audited contracts. After you have selected your desired template and options you can download it as a single file, a Rust development package, or a [Scaffold Stellar Package](/docs/tools/scaffold-stellar.md). Try it out below or visit the wizard [here](https://wizard.openzeppelin.com/stellar).

For a walkthrough on using these contracts check out the video linked below!

## OpenZeppelin Stellar Contracts and Utilities[](#openzeppelin-stellar-contracts-and-utilities "Direct link to OpenZeppelin Stellar Contracts and Utilities")

OpenZeppelin Stellar Contracts is a collection of audited contracts and utilities for Stellar. The contracts are developed by OpenZeppelin in collaboration with the Stellar community and the Stellar Development Foundation (SDF), in an effort to bring a library of high-quality and audited contracts that can be used to build applications on the Stellar network.

### Audited Modules Available[](#audited-modules-available "Direct link to Audited Modules Available")

**Fungible Token**

* Extensions:
  + **Burnable**: Allow token holders to destroy their tokens
  + **Capped**: Set maximum supply limits
  + **Allowlist**: Restrict transfers to approved addresses
  + **Blocklist**: Prevent transfers from/to blocked addresses

**Non-Fungible Token**

* Extensions:
  + **Burnable**: Allow token holders to destroy their NFTs
  + **Enumerable**: Enable iteration over all tokens and owner tokens
  + **Consecutive**: Efficiently mint multiple tokens in batches
  + **Royalties**: Support for creator royalties on secondary sales

**Stablecoin Token**

* Extensions:
  + **Burnable**: Allow token holders to destroy their tokens
  + **Capped**: Set maximum supply limits
  + **Allowlist**: Restrict transfers to approved addresses
  + **Blocklist**: Prevent transfers from/to blocked addresses

**RWA (ERC-3643) Token** The RWA token extends the standard fungible token functionality with regulatory features required for security tokens, including:

* Features:
  + **Identity Management**: Integration with identity registries for KYC/AML compliance
  + **Compliance Framework**: Modular compliance rules and validation for transfers and minting
  + **Transfer Controls**: Sophisticated transfer restrictions and validations
  + **Freezing Mechanisms**: Address-level and partial token freezing capabilities
  + **Recovery System**: Lost/old account recovery for verified investors
  + **Pausable Operations**: Emergency pause functionality for the entire token
  + **Role-Based Access Control (RBAC)**: Flexible privilege management for administrative functions

**Token Vault** The Fungible Token Vault extends the Fungible Token and implents [SEP-56 Tokenized Vault Standard](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0056.md), enabling fungible tokens to represent shares in an underlying asset pool. The tokenized vault standard is the formalized interface for yield-bearing vaults that hold underlying assets. Vault shares enable hyperfungible collaterals in DeFi and remain fully compatible with standard fungible token operations.

**Smart Accounts**

Smart Accounts are contract based wallets made for flexible and programmable authorization. This framework takes a context-centric approach, separating three distinct concerns: who is allowed to sign (signers), what they are allowed to do (scope/context rules), and how those permissions are enforced (policies). The initial release includes policies for multisig and spending limits.

* Components:
  + **Context rules**: Routing table for authorization
  + **Signers**: List of authorized signers (delegated address, or external signers)
  + **Policies**: Enforcement module attached to context rules
  + **Verifiers**: Trust contracts that validate signatures on behalf of smart accounts

**Utilities**

* **Pausable and Upgradeable Utilities**
* **Role-based and Ownable Access Control**
* **Merkle Distributor**

**Coming Soon**

* Fixed point math
* Governor

All contracts and extensions are audited by OpenZeppelin's security team, enhancing security and reliability of the contracts and extensions. Additional formal verification is being completed by Certora. To use the library, please visit: <https://github.com/OpenZeppelin/stellar-contracts>.

```
Repository Structure  
 audits/                    # Audit reports  
 docs/                      # Documentation  
 examples/                  # Example contracts  
 packages/  
    access/                # Access control, ownable, and role transfer utilities  
    accounts/              # Smart account framework  
    contract-utils/        # Utilities for token types (pausable, upgradable, etc.)  
    fee-abstraction/       # Utilities for implementing fee abstraction  
    governance/            # Utilities like timelock  
    macros/                # Macros for Stellar contractk  
    test-utils/            # Utilities for tests  
    tokens/                # Various token types (fungible, non-fungible, RWA, vault, etc.)
```

To provide feedback on these contracts and utilties, please open issues at: <https://github.com/OpenZeppelin/stellar-contracts/issues>

### OpenZeppelin Tools[](#openzeppelin-tools "Direct link to OpenZeppelin Tools")

* [Relayer](https://github.com/OpenZeppelin/openzeppelin-relayer): Infrastructure for relaying transactions on Stellar.
* [Monitor](https://github.com/OpenZeppelin/openzeppelin-monitor): Infrastructure tool for monitoring blockchain events and transactions.
* [UI Builder](https://builder.openzeppelin.com/): Open source tool for creating UI forms for contracts.
* [MCP Server](https://mcp.openzeppelin.com/): Generate secure Stellar smart contracts based on OpenZeppelin templates.