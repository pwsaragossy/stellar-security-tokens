# Accounts

Accounts are the central data structure in Stellarthey hold balances, sign transactions, and issue assets. Accounts can only exist with a valid keypair and the required minimum balance of XLM.

To learn about minimum balance requirements, [see our section on Lumens](/docs/learn/fundamentals/lumens.md).

> **Note:** There are two types of accounts on Stellar: Stellar accounts (`G...` addresses) and contract accounts (`C...` addresses). For a minimal contract account walkthrough, start with the [Simple Account example](/docs/build/smart-contracts/example-contracts/simple-account.md). This section focuses on Stellar `G...` accounts.

`G...` accounts are made up of the below fields. Click on the field to learn more about it.

* [Account ID](/docs/learn/glossary.md)
* [Balances](/docs/learn/glossary.md)
* [Flags](/docs/learn/glossary.md)
* [Home domain (up to 32 characters)](/docs/learn/glossary.md)
* [Liabilities](/docs/learn/glossary.md)
* [Number of entries sponsored by this account](/docs/build/guides/transactions/sponsored-reserves.md)
* [Number of sponsored reserves](/docs/build/guides/transactions/sponsored-reserves.md)
* [Number of subentries](/docs/learn/fundamentals/stellar-data-structures/accounts.md)
* [Sequence number](/docs/learn/glossary.md)
* [Signers](/docs/learn/fundamentals/transactions/signatures-multisig.md)
* [Thresholds](/docs/learn/fundamentals/transactions/signatures-multisig.md)

## Base reserves and subentries[](#base-reserves-and-subentries "Direct link to Base reserves and subentries")

Accounts store data in subentries, and each subentry increases the accounts required minimum balance.

### Base reserves[](#base-reserves "Direct link to Base reserves")

A base reserve is a unit of measurement used to calculate an accounts minimum balance. One base reserve is currently 0.5 XLM.

### Subentries[](#subentries "Direct link to Subentries")

Account data is stored in subentries, each of which increases an accounts minimum balance by one base reserve (0.5 XLM). An account cannot have more than 1,000 subentries. Possible subentries are:

* Trustlines (includes traditional assets and pool shares)
* Offers
* Additional signers
* Data entries (includes data made with the `manageData` operation, not smart contract ledger entries)

## Trustlines[](#trustlines "Direct link to Trustlines")

Trustlines are an explicit opt-in for an account to hold a particular asset. To hold a specific asset, an account must establish a trustline with the issuing account using the [`change_trust` operation](/docs/learn/fundamentals/transactions/list-of-operations.md). Trustlines track the balance of an asset and can also limit the amount of an asset that an account can hold.

A trustline must be established for an account to receive any asset except lumens (XLM). You can create a claimable balance to send assets to an account without a trustline, but the recipient has to create a trustline to claim that balance. Learn more here: [Claimable Balances Encyclopedia Entry](/docs/build/guides/transactions/claimable-balances.md)

A trustline also tracks liabilities. Buying liabilities equal the total amount of the asset offered to buy aggregated over all offers owned by an account, and selling liabilities equal the total amount of the asset offered to sell aggregated over all offers owned by an account. A trustline must always have a balance sufficiently large to satisfy its selling liabilities and a balance sufficiently below its limit to accommodate its buying liabilities.