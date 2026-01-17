# Circle Configuration

If the tenant was created with a [Circle](https://www.circle.com) distribution account, then the tenant owner will need to manually configure that account from within the SDP dashboard.

Once a user with owner privileges logs in, they will see a banner at the top of the page saying that the Circle account is pending configuration:

![Circle Configuration Banner](/assets/images/SDP30-44811efccb8ef00d47a138cdb46f5bce.png)

Clicking on the banner will take the user to the Distribution Account section, where they can enter the Circle API key and the Circle Wallet ID.

![Circle Configuration](/assets/images/SDP31-6fc8a8d588af0d56421a703080ee9894.png)

> **Info:** The API key will get stored in the database encrypted by the key `DISTRIBUTION_ACCOUNT_ENCRYPTION_PASSPHRASE`, while the Wallet ID is stored in plain text.

The Wallet ID is used to identify the Circle (internal) account when making disbursements. It's useful because a Circle account can have multiple wallets, each one with different currencies and balances.