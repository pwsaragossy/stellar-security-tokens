# CLI Manual

## Root Command[](#root-command "Direct link to Root Command")

The `stellar-disbursement-platform` is the main entry point for the application. It provides various subcommands to manage the service, database, and other utilities.

### Usage[](#usage "Direct link to Usage")

```
stellar-disbursement-platform [command] [flags]
```

> **Tip:** For all the following commands, you can use the `--help` flag to get more information about the command and its options. For example:

```
stellar-disbursement-platform serve --help
```

## Global Flags[](#global-flags "Direct link to Global Flags")

The following flags are available for all commands:

| Flag | Description |
| --- | --- |
| `--base-url` | The SDP backend server's base URL. Defaults to `http://localhost:8000`. |
| `--database-url` | Postgres DB URL. Defaults to `postgres://localhost:5432/sdp?sslmode=disable`. |
| `--environment` | The environment where the application is running. Example: `development`, `staging`, `production`. Defaults to `development`. |
| `--log-level` | The log level used in this project. Options: `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`, or `PANIC`. Defaults to `TRACE`. |
| `--network-passphrase` | The Stellar network passphrase. Defaults to `Test SDF Network ; September 2015`. |
| `--sdp-ui-base-url` | The SDP UI server's base URL. Defaults to `http://localhost:3000`. |
| `--sentry-dsn` | The DSN (client key) of the Sentry project. If not provided, Sentry will not be used. |

## Serve Command[](#serve-command "Direct link to Serve Command")

The `serve` command starts the Stellar Disbursement Platform backend server. This server handles API requests, processes disbursements, and manages tenant operations.

### Usage[](#usage-1 "Direct link to Usage")

```
stellar-disbursement-platform serve [flags]
```

### Flags[](#flags "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--admin-account` | ID of the admin account. To use, add to the request header as 'Authorization', formatted as Base64-encoded 'ADMIN\_ACCOUNT:ADMIN\_API\_KEY'. |
| `--admin-api-key` | API key for the admin account. To use, add to the request header as 'Authorization', formatted as Base64-encoded 'ADMIN\_ACCOUNT:ADMIN\_API\_KEY'. |
| `--admin-port` | Port where the admin tenant server will be listening on. Defaults to `8003`. |
| `--aws-access-key-id` | The AWS access key ID. |
| `--aws-region` | The AWS region. |
| `--aws-secret-access-key` | The AWS secret access key. |
| `--aws-ses-sender-id` | The email address that AWS will use to send emails. Uses AWS SES. |
| `--aws-sns-sender-id` | The sender ID of the AWS account sending the SMS message. Uses AWS SNS. |
| `--bridge-api-key` | Bridge API key. This needs to be configured only if the Bridge integration is enabled. |
| `--bridge-base-url` | Bridge Base URL. This needs to be configured only if the Bridge integration is enabled. Defaults to `https://api.bridge.xyz`. |
| `--captcha-type` | The type of CAPTCHA to use. Options: `GOOGLE_RECAPTCHA_V2`, `GOOGLE_RECAPTCHA_V3`. Defaults to `GOOGLE_RECAPTCHA_V2`. |
| `--channel-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt/decrypt the channel accounts' private keys. When not set, it will default to the value of the `distribution-seed` option. |
| `--circle-api-type` | The Circle API type. Options: `TRANSFERS`, `PAYOUTS`. Defaults to `TRANSFERS`. |
| `--cors-allowed-origins` | Cors URLs that are allowed to access the endpoints, separated by ",". |
| `--crash-tracker-type` | Crash tracker type. Options: `SENTRY`, `DRY_RUN`. Defaults to `DRY_RUN`. |
| `--db-conn-max-idle-time-seconds` | Maximum idle time in seconds before a connection is closed. Defaults to `10`. |
| `--db-conn-max-lifetime-seconds` | Maximum lifetime in seconds for a single connection. Defaults to `300`. |
| `--db-max-idle-conns` | Maximum number of idle DB connections retained per pool. Defaults to `2`. |
| `--db-max-open-conns` | Maximum number of open DB connections per pool. Defaults to `20`. |
| `--disable-mfa` | Disables the email Multi-Factor Authentication (MFA). |
| `--disable-recaptcha` | Disables ReCAPTCHA for login and forgot password. |
| `--distribution-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt and decrypt the private keys of tenants' distribution accounts. |
| `--distribution-public-key` | The public key of the HOST's Stellar distribution account, used to create channel accounts. |
| `--distribution-seed` | The private key of the HOST's Stellar distribution account, used to create channel accounts. |
| `--ec256-private-key` | The EC256 Private Key used to sign the authentication token. This EC key needs to be at least as strong as prime256v1 (P-256). |
| `--email-sender-type` | Email Sender Type. Options: `DRY_RUN`, `TWILIO_EMAIL`, `AWS_EMAIL`. Defaults to `DRY_RUN`. |
| `--enable-bridge-integration` | Enable Bridge integration for Liquidity Sourcing. |
| `--horizon-url` | The URL of the Stellar Horizon server where this application will communicate with. Defaults to `https://horizon-testnet.stellar.org/`. |
| `--instance-name` | Name of the SDP instance. Example: `SDP Testnet`. |
| `--max-base-fee` | The max base fee for submitting a Stellar transaction. Defaults to `10000`. |
| `--max-invitation-resend-attempts` | The maximum number of attempts to resend the invitation to the Receiver Wallets. Defaults to `3`. |
| `--metrics-port` | Port where the metrics server will be listening on. Defaults to `8002`. |
| `--metrics-type` | Metric monitor type. Options: `PROMETHEUS`. Defaults to `PROMETHEUS`. |
| `--port` | Port where the server will be listening on. Defaults to `8000`. |
| `--recaptcha-site-key` | The Google 'reCAPTCHA v2 - I'm not a robot' site key. |
| `--recaptcha-site-secret-key` | The Google 'reCAPTCHA v2 - I'm not a robot' site SECRET key. |
| `--recaptcha-v3-min-score` | The minimum score threshold for reCAPTCHA v3 (0.0 to 1.0, where 1.0 is very likely a good interaction). Only used when captcha-type is GOOGLE\_RECAPTCHA\_V3. Defaults to `0.5`. |
| `--reset-token-expiration-hours` | The expiration time in hours of the Reset Token. Defaults to `24`. |
| `--scheduler-payment-job-seconds` | The interval in seconds for the payment jobs that synchronize transactions between SDP and TSS. Must be greater than 5 seconds. Defaults to `30`. |
| `--scheduler-receiver-invitation-job-seconds` | The interval in seconds for the receiver invitation job that sends invitations to new receivers. Must be greater than 5 seconds. Defaults to `30`. |
| `--sep10-client-attribution-required` | If true, SEP-10 authentication requires client\_domain to be provided and validated. If false, client\_domain is optional. Defaults to `true`. |
| `--sep10-signing-private-key` | The private key of the Stellar account that signs the SEP-10 transactions. It's also used to sign URLs. |
| `--sep10-signing-public-key` | The public key of the Stellar account that signs the SEP-10 transactions. It's also used to sign URLs. |
| `--sep24-jwt-secret` | The JWT secret that's used to sign the SEP-24 JWT token. |
| `--single-tenant-mode` | This option enables the Single Tenant Mode feature. In the case where multi-tenancy is not required, this options bypasses the tenant resolution by always resolving to the default tenant configured in the database. |
| `--sms-sender-type` | SMS Sender Type. Options: `DRY_RUN`, `TWILIO_SMS`, `TWILIO_WHATSAPP`, `AWS_SMS`. Defaults to `DRY_RUN`. |
| `--tenant-xlm-bootstrap-amount` | The amount of the native asset that will be sent to the tenant distribution account from the host distribution account when it's created if applicable. Defaults to `5`. |
| `--twilio-account-sid` | The SID of the Twilio account. |
| `--twilio-auth-token` | The Auth Token of the Twilio account. |
| `--twilio-sendgrid-api-key` | The API key of the Twilio SendGrid account. |
| `--twilio-sendgrid-sender-address` | The email address that Twilio SendGrid will use to send emails. |
| `--twilio-service-sid` | The service ID used within Twilio to send messages. |
| `--twilio-whatsapp-from-number` | The WhatsApp Business number used to send messages (with whatsapp: prefix). |
| `--twilio-whatsapp-receiver-invitation-template-sid` | The Twilio Content SID for WhatsApp receiver invitation template (starts with HX). |
| `--twilio-whatsapp-receiver-otp-template-sid` | The Twilio Content SID for WhatsApp receiver OTP template (starts with HX). |

## TSS Command[](#tss-command "Direct link to TSS Command")

The `tss` command runs the Transaction Submission Service, which is responsible for submitting transactions to the Stellar network.

### Usage[](#usage-2 "Direct link to Usage")

```
stellar-disbursement-platform tss [flags]
```

### Flags[](#flags-1 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--channel-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt/decrypt the channel accounts' private keys. When not set, it will default to the value of the `distribution-seed` option. |
| `--crash-tracker-type` | Crash tracker type. Options: `SENTRY`, `DRY_RUN`. Defaults to `DRY_RUN`. |
| `--db-conn-max-idle-time-seconds` | Maximum idle time in seconds before a connection is closed. Defaults to `10`. |
| `--db-conn-max-lifetime-seconds` | Maximum lifetime in seconds for a single connection. Defaults to `300`. |
| `--db-max-idle-conns` | Maximum number of idle DB connections retained per pool. Defaults to `2`. |
| `--db-max-open-conns` | Maximum number of open DB connections per pool. Defaults to `20`. |
| `--distribution-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt and decrypt the private keys of tenants' distribution accounts. |
| `--distribution-public-key` | The public key of the HOST's Stellar distribution account, used to create channel accounts. |
| `--distribution-seed` | The private key of the HOST's Stellar distribution account, used to create channel accounts. |
| `--horizon-url` | The URL of the Stellar Horizon server where this application will communicate with. Defaults to `https://horizon-testnet.stellar.org/`. |
| `--max-base-fee` | The max base fee for submitting a Stellar transaction. Defaults to `10000`. |
| `--num-channel-accounts` | Number of channel accounts to utilize for transaction submission. Defaults to `2`. |
| `--queue-polling-interval` | Polling interval (seconds) to query the database for pending transactions to process. Defaults to `6`. |
| `--tss-metrics-port` | Port where the metrics server will be listening on. Defaults to `9002`. |
| `--tss-metrics-type` | Metric monitor type. Options: `TSS_PROMETHEUS`. Defaults to `TSS_PROMETHEUS`. |

## DB Command[](#db-command "Direct link to DB Command")

The `db` command provides utilities for database management and migrations. It performs two main functions:

1. Running database migrations for various schemas (admin, auth, sdp, tss).
2. Setting up assets and wallets based on the network passphrase.

### Usage[](#usage-3 "Direct link to Usage")

```
stellar-disbursement-platform db [command] [flags]
```

### Subcommands[](#subcommands "Direct link to Subcommands")

| Command | Description |
| --- | --- |
| `admin` | Admin migrations for multi-tenant module. |
| `auth` | Authentication schema migrations. |
| `sdp` | SDP schema migrations. |
| `setup-for-network` | Set up assets and wallets based on network passphrase. |
| `tss` | TSS schema migrations. |

---

### DB Admin[](#db-admin "Direct link to DB Admin")

The `db admin` command manages the migrations for the admin schema, which handles multi-tenancy configuration.

#### Usage[](#usage-4 "Direct link to Usage")

```
stellar-disbursement-platform db admin [command] [flags]
```

#### Subcommands[](#subcommands-1 "Direct link to Subcommands")

| Command | Description |
| --- | --- |
| `migrate` | Schema migration helpers. |

#### DB Admin Migrate[](#db-admin-migrate "Direct link to DB Admin Migrate")

The `migrate` command allows you to run migrations up or down.

**Usage**

```
stellar-disbursement-platform db admin migrate [command] [flags]
```

**Subcommands**

| Command | Description |
| --- | --- |
| `up` | Migrates database up [count] migrations |
| `down` | Migrates database down [count] migrations |

**Examples**

```
# Apply all pending migrations  
stellar-disbursement-platform db admin migrate up  
  
# Apply the next 2 migrations  
stellar-disbursement-platform db admin migrate up 2  
  
# Revert the last migration  
stellar-disbursement-platform db admin migrate down 1
```

---

### DB Auth[](#db-auth "Direct link to DB Auth")

The `db auth` command manages the migrations for the authentication schema.

#### Usage[](#usage-5 "Direct link to Usage")

```
stellar-disbursement-platform db auth [command] [flags]
```

#### Flags[](#flags-2 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--all` | Apply the command to all tenants. Either `--tenant-id` or `--all` must be set, but the `--all` option will be ignored if `--tenant-id` is set. |
| `--tenant-id` | The tenant ID where the command will be applied. |

#### Subcommands[](#subcommands-2 "Direct link to Subcommands")

| Command | Description |
| --- | --- |
| `migrate` | Schema migration helpers. |

#### DB Auth Migrate[](#db-auth-migrate "Direct link to DB Auth Migrate")

Similar to `admin migrate`, this command accepts `up` and `down` subcommands.

**Examples**

```
# Apply migrations for a specific tenant  
stellar-disbursement-platform db auth migrate up --tenant-id <tenant-id>  
  
# Apply migrations for all tenants  
stellar-disbursement-platform db auth migrate up --all
```

---

### DB SDP[](#db-sdp "Direct link to DB SDP")

The `db sdp` command manages the migrations for the SDP (Stellar Disbursement Platform) schema, which contains the core business logic tables.

#### Usage[](#usage-6 "Direct link to Usage")

```
stellar-disbursement-platform db sdp [command] [flags]
```

#### Flags[](#flags-3 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--all` | Apply the command to all tenants. Either `--tenant-id` or `--all` must be set, but the `--all` option will be ignored if `--tenant-id` is set. |
| `--tenant-id` | The tenant ID where the command will be applied. |

#### Subcommands[](#subcommands-3 "Direct link to Subcommands")

| Command | Description |
| --- | --- |
| `migrate` | Schema migration helpers. |

#### DB SDP Migrate[](#db-sdp-migrate "Direct link to DB SDP Migrate")

Similar to `admin migrate`, this command accepts `up` and `down` subcommands.

**Examples**

```
# Apply migrations for a specific tenant  
stellar-disbursement-platform db sdp migrate up --tenant-id <tenant-id>  
  
# Apply migrations for all tenants  
stellar-disbursement-platform db sdp migrate up --all
```

---

### DB TSS[](#db-tss "Direct link to DB TSS")

The `db tss` command manages the migrations for the TSS (Transaction Submission Service) schema.

#### Usage[](#usage-7 "Direct link to Usage")

```
stellar-disbursement-platform db tss [command] [flags]
```

#### Subcommands[](#subcommands-4 "Direct link to Subcommands")

| Command | Description |
| --- | --- |
| `migrate` | Schema migration helpers. |

#### DB TSS Migrate[](#db-tss-migrate "Direct link to DB TSS Migrate")

Similar to `admin migrate`, this command accepts `up` and `down` subcommands.

**Examples**

```
# Apply all pending migrations  
stellar-disbursement-platform db tss migrate up
```

---

### DB Setup For Network[](#db-setup-for-network "Direct link to DB Setup For Network")

The `db setup-for-network` command sets up the assets and wallets registered in the database based on the network passphrase. It inserts or updates the entries of these tables according to the configured Network Passphrase.

#### Usage[](#usage-8 "Direct link to Usage")

```
stellar-disbursement-platform db setup-for-network [flags]
```

#### Flags[](#flags-4 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--all` | Apply the command to all tenants. Either `--tenant-id` or `--all` must be set, but the `--all` option will be ignored if `--tenant-id` is set. |
| `--tenant-id` | The tenant ID where the command will be applied. |

#### Example[](#example "Direct link to Example")

```
# Setup for a specific tenant  
stellar-disbursement-platform db setup-for-network --tenant-id <tenant-id>  
  
# Setup for all tenants  
stellar-disbursement-platform db setup-for-network --all
```

## Auth Command[](#auth-command "Direct link to Auth Command")

The `auth` command provides helpers for authentication management, specifically for adding users to the system.

### Usage[](#usage-9 "Direct link to Usage")

```
stellar-disbursement-platform auth [command] [flags]
```

### Subcommands[](#subcommands-5 "Direct link to Subcommands")

| Command | Description |
| --- | --- |
| `add-user` | Add user to the system. |

---

### Auth Add User[](#auth-add-user "Direct link to Auth Add User")

The `auth add-user` command adds a new user to the system. The email must be unique, and the password must be at least 12 characters long.

#### Usage[](#usage-10 "Direct link to Usage")

```
stellar-disbursement-platform auth add-user <email> <first name> <last name> [flags]
```

#### Flags[](#flags-5 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--owner` | Set the user as Owner (superuser). Defaults to "false". |
| `--password` | Sets the user password. It should be at least 12 characters long. If omitted, the command will generate a random one. |
| `--roles` | Set the user roles. It should be comma-separated. Example: `role1, role2`. Available roles: `owner`, `financial_controller`, `developer`, `business`, `initiator`, `approver`. |
| `--tenant-id` | The tenant ID to which the user will be added. |

#### Example[](#example-1 "Direct link to Example")

To add a new user with specific roles and a password:

```
stellar-disbursement-platform auth add-user [email protected] Mary Jane \  
--roles approver,initiator --password \  
--tenant-id 'f347e6b0-249c-4960-b0d2-aebcf4c6a60d'
```

## Channel Accounts Command[](#channel-accounts-command "Direct link to Channel Accounts Command")

The `channel-accounts` command manages channel accounts used for transaction submission.

### Usage[](#usage-11 "Direct link to Usage")

```
stellar-disbursement-platform channel-accounts [command] [flags]
```

### Flags[](#flags-6 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--crash-tracker-type` | Crash tracker type. Options: `SENTRY`, `DRY_RUN`. Defaults to `DRY_RUN`. |
| `--distribution-public-key` | The public key of the HOST's Stellar distribution account, used to create channel accounts. |
| `--tss-metrics-port` | Port where the metrics server will be listening on. Defaults to `9002`. |
| `--tss-metrics-type` | Metric monitor type. Options: `TSS_PROMETHEUS`. Defaults to `TSS_PROMETHEUS`. |

### Subcommands[](#subcommands-6 "Direct link to Subcommands")

| Command | Description |
| --- | --- |
| `create` | Create channel accounts. |
| `delete` | Delete a specified channel account. |
| `ensure` | Ensure a specific number of channel accounts exist. |
| `verify` | Verify channel accounts exist on the network. |
| `view` | List public keys of all channel accounts. |

---

### Channel Accounts Create[](#channel-accounts-create "Direct link to Channel Accounts Create")

The `create` command creates channel accounts.

#### Usage[](#usage-12 "Direct link to Usage")

```
stellar-disbursement-platform channel-accounts create [count] [flags]
```

#### Flags[](#flags-7 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--channel-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt/decrypt the channel accounts' private keys. When not set, it will default to the value of the `distribution-seed` option. |
| `--distribution-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt and decrypt the private keys of tenants' distribution accounts. |
| `--distribution-seed` | The private key of the HOST's Stellar distribution account, used to create channel accounts. |
| `--horizon-url` | The URL of the Stellar Horizon server where this application will communicate with. Defaults to `https://horizon-testnet.stellar.org/`. |
| `--max-base-fee` | The max base fee for submitting a Stellar transaction. Defaults to `10000`. |

---

### Channel Accounts Delete[](#channel-accounts-delete "Direct link to Channel Accounts Delete")

The `delete` command deletes a specified channel account from storage and on the network.

#### Usage[](#usage-13 "Direct link to Usage")

```
stellar-disbursement-platform channel-accounts delete [flags]
```

#### Flags[](#flags-8 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--channel-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt/decrypt the channel accounts' private keys. When not set, it will default to the value of the `distribution-seed` option. |
| `--channel-account-id` | The ID of the channel account to delete. |
| `--delete-all-accounts` | Delete all managed channel accounts in the database and on the network. |
| `--distribution-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt and decrypt the private keys of tenants' distribution accounts. |
| `--distribution-seed` | The private key of the HOST's Stellar distribution account, used to create channel accounts. |
| `--horizon-url` | The URL of the Stellar Horizon server where this application will communicate with. Defaults to `https://horizon-testnet.stellar.org/`. |
| `--max-base-fee` | The max base fee for submitting a Stellar transaction. Defaults to `10000`. |

---

### Channel Accounts Ensure[](#channel-accounts-ensure "Direct link to Channel Accounts Ensure")

The `ensure` command ensures that the specified number of channel accounts exist. If they do not exist, it will create them. If more channel accounts exist than specified, it will delete the excess accounts.

#### Usage[](#usage-14 "Direct link to Usage")

```
stellar-disbursement-platform channel-accounts ensure <count> [flags]
```

#### Flags[](#flags-9 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--channel-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt/decrypt the channel accounts' private keys. When not set, it will default to the value of the `distribution-seed` option. |
| `--distribution-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt and decrypt the private keys of tenants' distribution accounts. |
| `--distribution-seed` | The private key of the HOST's Stellar distribution account, used to create channel accounts. |
| `--horizon-url` | The URL of the Stellar Horizon server where this application will communicate with. Defaults to `https://horizon-testnet.stellar.org/`. |
| `--max-base-fee` | The max base fee for submitting a Stellar transaction. Defaults to `10000`. |

#### Example[](#example-2 "Direct link to Example")

```
stellar-disbursement-platform channel-accounts ensure 5
```

---

### Channel Accounts Verify[](#channel-accounts-verify "Direct link to Channel Accounts Verify")

The `verify` command verifies that all the channel accounts in the database exist on the Stellar network.

#### Usage[](#usage-15 "Direct link to Usage")

```
stellar-disbursement-platform channel-accounts verify [flags]
```

#### Flags[](#flags-10 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--channel-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt/decrypt the channel accounts' private keys. When not set, it will default to the value of the `distribution-seed` option. |
| `--delete-invalid-accounts` | Delete channel accounts from storage that are verified to be invalid on the network. |
| `--distribution-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt and decrypt the private keys of tenants' distribution accounts. |
| `--distribution-seed` | The private key of the HOST's Stellar distribution account, used to create channel accounts. |
| `--horizon-url` | The URL of the Stellar Horizon server where this application will communicate with. Defaults to `https://horizon-testnet.stellar.org/`. |
| `--max-base-fee` | The max base fee for submitting a Stellar transaction. Defaults to `10000`. |

---

### Channel Accounts View[](#channel-accounts-view "Direct link to Channel Accounts View")

The `view` command lists public keys of all channel accounts currently stored in the database.

#### Usage[](#usage-16 "Direct link to Usage")

```
stellar-disbursement-platform channel-accounts view [flags]
```

## Distribution Account Command[](#distribution-account-command "Direct link to Distribution Account Command")

The `distribution-account` command manages the distribution account.

### Usage[](#usage-17 "Direct link to Usage")

```
stellar-disbursement-platform distribution-account [command] [flags]
```

### Flags[](#flags-11 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--crash-tracker-type` | Crash tracker type. Options: `SENTRY`, `DRY_RUN`. Defaults to `DRY_RUN`. |
| `--distribution-public-key` | The public key of the HOST's Stellar distribution account, used to create channel accounts. |

### Subcommands[](#subcommands-7 "Direct link to Subcommands")

| Command | Description |
| --- | --- |
| `rotate` | Rotate the distribution account for a tenant. |

---

### Distribution Account Rotate[](#distribution-account-rotate "Direct link to Distribution Account Rotate")

The `rotate` command rotates the distribution account for a tenant.

#### Usage[](#usage-18 "Direct link to Usage")

```
stellar-disbursement-platform distribution-account rotate [flags]
```

#### Flags[](#flags-12 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--channel-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt/decrypt the channel accounts' private keys. When not set, it will default to the value of the `distribution-seed` option. |
| `--distribution-account-encryption-passphrase` | A Stellar-compliant ed25519 private key used to encrypt and decrypt the private keys of tenants' distribution accounts. |
| `--distribution-seed` | The private key of the HOST's Stellar distribution account, used to create channel accounts. |
| `--horizon-url` | The URL of the Stellar Horizon server where this application will communicate with. Defaults to `https://horizon-testnet.stellar.org/`. |
| `--max-base-fee` | The max base fee for submitting a Stellar transaction. Defaults to `10000`. |
| `--tenant-id` | The tenant ID where the command will be applied. |
| `--tenant-xlm-bootstrap-amount` | The amount of the native asset that will be sent to the tenant distribution account from the host distribution account when it's created if applicable. Defaults to `5`. |

#### Example[](#example-3 "Direct link to Example")

To rotate the distribution account for a specific tenant:

```
stellar-disbursement-platform distribution-account rotate --tenant-id 'f347e6b0-249c-4960-b0d2-aebcf4c6a60d'
```

## Message Command[](#message-command "Direct link to Message Command")

The `message` command provides messenger related commands.

### Usage[](#usage-19 "Direct link to Usage")

```
stellar-disbursement-platform message [command] [flags]
```

### Flags[](#flags-13 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--aws-access-key-id` | The AWS access key ID. |
| `--aws-region` | The AWS region. |
| `--aws-secret-access-key` | The AWS secret access key. |
| `--aws-ses-sender-id` | The email address that AWS will use to send emails. Uses AWS SES. |
| `--aws-sns-sender-id` | The sender ID of the aws account sending the SMS message. Uses AWS SNS. |
| `--message-sender-type` | Message Sender Type. Options: `TWILIO_SMS`, `TWILIO_WHATSAPP`, `TWILIO_EMAIL`, `AWS_SMS`, `AWS_EMAIL`, `DRY_RUN`. |
| `--twilio-account-sid` | The SID of the Twilio account. |
| `--twilio-auth-token` | The Auth Token of the Twilio account. |
| `--twilio-sendgrid-api-key` | The API key of the Twilio SendGrid account. |
| `--twilio-sendgrid-sender-address` | The email address that Twilio SendGrid will use to send emails. |
| `--twilio-service-sid` | The service ID used within Twilio to send messages. |
| `--twilio-whatsapp-from-number` | The WhatsApp Business number used to send messages (with `whatsapp:` prefix). |
| `--twilio-whatsapp-receiver-invitation-template-sid` | The Twilio Content SID for WhatsApp receiver invitation template (starts with HX). |
| `--twilio-whatsapp-receiver-otp-template-sid` | The Twilio Content SID for WhatsApp receiver OTP template (starts with HX). |

### Subcommands[](#subcommands-8 "Direct link to Subcommands")

| Command | Description |
| --- | --- |
| `send` | Send a message. |

---

### Message Send[](#message-send "Direct link to Message Send")

The `send` command sends a message to a recipient.

#### Usage[](#usage-20 "Direct link to Usage")

```
stellar-disbursement-platform message send [flags]
```

#### Flags[](#flags-14 "Direct link to Flags")

| Flag | Description |
| --- | --- |
| `--email` | The email to send the message to. Mandatory if sending an email. |
| `--message` | The text of the message to be sent. |
| `--phone-number` | The phone number to send the message to, in E.164. Mandatory if sending an SMS. |
| `--title` | The title to be set in the email. Mandatory if sending an email. |

#### Example[](#example-4 "Direct link to Example")

```
# Send an SMS  
stellar-disbursement-platform message send --phone-number "+1234567890" --message "Hello World" --message-sender-type TWILIO_SMS  
  
# Send an Email  
stellar-disbursement-platform message send --email "[email protected]" --title "Hello" --message "Hello World" --message-sender-type AWS_EMAIL
```