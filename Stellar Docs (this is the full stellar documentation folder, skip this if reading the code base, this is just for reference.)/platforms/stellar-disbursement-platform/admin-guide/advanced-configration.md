# Advanced Configuration

In this guide, you will learn about advanced configuration options for the Stellar Disbursement Platform (SDP). These configurations allow you to tailor the SDP to meet specific requirements, such as multi-tenancy, network selection, and performance tuning.

## Testnet to Mainnet Configuration[](#testnet-to-mainnet-configuration "Direct link to Testnet to Mainnet Configuration")

Upon provisioning a new SDP instance, it is configured to operate either in Mainnet or Testnet mode based on the environment variables set during setup. Most users will start with Testnet for development and testing purposes before transitioning to Mainnet for production use.

> **Caution:** An SDP instance is designed to operate on either Testnet or Mainnet. Switching between these networks on an existing instance is not supported and may lead to unexpected behavior. If you need to change the network, it is recommended to set up a new SDP instance with the desired configuration.

Once you validated your setup on Testnet, you can deploy a new instance configured for Mainnet by setting the appropriate environment variables during the provisioning process.

### Environment Variables[](#environment-variables "Direct link to Environment Variables")

When switching from Testnet to Mainnet, you need to update the following environment variables for each service to point to the public network resources.

#### SDP Core Service[](#sdp-core-service "Direct link to SDP Core Service")

| Variable | Testnet Value | Mainnet Value | Description |
| --- | --- | --- | --- |
| `NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` | The passphrase for the Stellar network. |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` | The URL of the Horizon server. |
| `DISABLE_MFA` | x | `false` | Disables Multi-Factor Authentication. **Must be `false` for Mainnet.** |

#### Transaction Submission Service (TSS)[](#transaction-submission-service-tss "Direct link to Transaction Submission Service (TSS)")

| Variable | Testnet Value | Mainnet Value | Description |
| --- | --- | --- | --- |
| `NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` | The passphrase for the Stellar network. |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` | The URL of the Horizon server. |

#### Dashboard[](#dashboard "Direct link to Dashboard")

| Variable | Testnet Value | Mainnet Value | Description |
| --- | --- | --- | --- |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` | The URL of the Horizon server used by the frontend. |
| `STELLAR_EXPERT_URL` | `https://stellar.expert/explorer/testnet` | `https://stellar.expert/explorer/public` | The URL for the Stellar Expert explorer. |

### Critical Considerations[](#critical-considerations "Direct link to Critical Considerations")

Before deploying to Mainnet, you must address the following critical requirements to ensure your instance operates correctly.

You **must** generate a new, secure keypair for your Mainnet Distribution Account. Do not reuse Testnet keys.

* **Generate Keys**: Create a new keypair and set `DISTRIBUTION_PUBLIC_KEY` and `DISTRIBUTION_SEED`.
* **Generate Encryption Passphrase**: You should generate new encryption passphrases for your tenant distribution accounts and channel accounts by setting `DISTRIBUTION_ACCOUNT_ENCRYPTION_PASSPHRASE` and `CHANNEL_ACCOUNTS_ENCRYPTION_PASSPHRASE`.
* **Fund the Account**: The Distribution Account requires an initial balance of XLM to function. It is responsible for:
  1. **Creating Channel Accounts**: The system will automatically create `NUM_CHANNEL_ACCOUNTS` (default: 2).
  2. **Bootstrapping Tenants**: When a new tenant is provisioned, the system transfers a bootstrap amount of XLM from the Distribution Account to the Tenant's Distribution Account. This is controlled by `TENANT_XLM_BOOTSTRAP_AMOUNT` (default: 5 XLM).

### Configuration Methods[](#configuration-methods "Direct link to Configuration Methods")

You can configure the SDP for Mainnet using either Helm Charts (for Kubernetes deployments) or Docker Compose (for local or simple deployments).

#### Helm Charts[](#helm-charts "Direct link to Helm Charts")

If you are deploying via Helm, the chart provides a global setting that automatically configures the necessary network parameters.

In your `values.yaml` file, set `global.isPubnet` to `true`. This will automatically set the correct `NETWORK_PASSPHRASE`, `HORIZON_URL` and `STELLAR_EXPERT_URL` for all services.

```
global:  
  # Set to true for Mainnet  
  isPubnet: true
```

#### Docker Compose[](#docker-compose "Direct link to Docker Compose")

Update your `.env` file with the following values:

```
# Network Configuration  
NETWORK_TYPE="pubnet"  
NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"  
HORIZON_URL="https://horizon.stellar.org"  
  
# Security  
DISABLE_MFA=false  
  
# Distribution Account (Mainnet Keys)  
DISTRIBUTION_PUBLIC_KEY="G..."  
DISTRIBUTION_SEED="S..."  
  
# Encryption Passphrases  
DISTRIBUTION_ACCOUNT_ENCRYPTION_PASSPHRASE="S..."  
CHANNEL_ACCOUNTS_ENCRYPTION_PASSPHRASE="S..."
```

## Single Tenant to Multi-Tenant Configuration[](#single-tenant-to-multi-tenant-configuration "Direct link to Single Tenant to Multi-Tenant Configuration")

The Stellar Disbursement Platform (SDP) supports multi-tenancy, allowing a single instance to serve multiple organizations (tenants). Each tenant has its own isolated data, users, and distribution account (source of funds).

### Configuration[](#configuration "Direct link to Configuration")

To enable multi-tenancy, you must update your configuration to disable single-tenant mode and ensure the Admin API is accessible.

1. **Disable Single Tenant Mode**: Set the `SINGLE_TENANT_MODE` environment variable to `false`.
2. **Expose Admin Port**: Ensure the Admin API port (default `8003`) is exposed in the sdp backend service.

### Routing and Ingress[](#routing-and-ingress "Direct link to Routing and Ingress")

The SDP identifies the tenant for each request using one of the following methods, in order of precedence:

1. **HTTP Header**: The `SDP-Tenant-Name` header.
2. **Subdomain**: The prefix of the hostname (e.g., `tenant1` in `tenant1.sdp.stellar.org`).

#### HTTP Header[](#http-header "Direct link to HTTP Header")

You can explicitly specify the tenant by setting the `SDP-Tenant-Name` header in your HTTP requests.

```
curl -H "SDP-Tenant-Name: tenant1" https://sdp.stellar.org/ ...
```

#### Subdomain Routing[](#subdomain-routing "Direct link to Subdomain Routing")

In a production environment, it is common to use subdomain routing. For example, `tenant1.sdp.stellar.org` and `tenant2.sdp.stellar.org` will both point to the same SDP instance.

#### Helm Charts[](#helm-charts-1 "Direct link to Helm Charts")

When deploying via Helm, you configure the wildcard domain using the `sdp.route.mtnDomain` value. This creates an Ingress rule that matches all subdomains.

In your `values.yaml`:

```
sdp:  
  route:  
    # The wildcard domain for multi-tenancy  
    mtnDomain: "*.sdp.stellar.org"
```

> **Note:** Ensure your DNS provider has a wildcard A record (e.g., `*.sdp.stellar.org`) pointing to your Ingress Controller's Load Balancer IP.

#### Docker Compose (Local Development)[](#docker-compose-local-development "Direct link to Docker Compose (Local Development)")

For local development with Docker Compose you must map specific tenant subdomains to `127.0.0.1` in your machine's `/etc/hosts` file (For Windows users, the file is located at `C:\Windows\System32\drivers\etc\hosts`).

**Example `/etc/hosts`:**

```
127.0.0.1   localhost  
127.0.0.1   sdp.local           # Default/Admin domain  
127.0.0.1   tenant1.sdp.local   # First tenant  
127.0.0.1   tenant2.sdp.local   # Second tenant
```

### Provisioning Tenants[](#provisioning-tenants "Direct link to Provisioning Tenants")

In multi-tenant mode, you provision new tenants using the Admin API (port `8003` by default). Each tenant will have its own isolated data.

**Endpoint**: [POST /tenants](/docs/platforms/stellar-disbursement-platform/api-reference/create-tenant.md) **Example Request:**

```
curl --location 'http://localhost:8003/tenants' \  
--header 'Content-Type: application/json' \  
--header 'Authorization: Basic <Base64 Admin Credentials>' \  
--data '{  
    "name": "tenant1",  
    "organization_name": "Tenant One Organization",  
    "base_url": "https://tenant1.sdp-api.stellar.org",  
    "sdp_ui_base_url": "https://tenant1.sdp-dashboard.stellar.org",  
    "owner_email": "[email protected]",  
    "owner_first_name": "Jane",  
    "owner_last_name": "Doe",  
    "distribution_account_type": "DISTRIBUTION_ACCOUNT.STELLAR.DB_VAULT"  
}'
```

#### Multi-tenant Distribution Accounts[](#multi-tenant-distribution-accounts "Direct link to Multi-tenant Distribution Accounts")

This is by far the most important field, as it determines the source of funds (distribution account) for the tenant, as well as how the secret for this distribution account is stored.

This is determined by the field `distribution_account_type` in the API call above. The possible values are described below:

* `DISTRIBUTION_ACCOUNT.STELLAR.DB_VAULT`
* **Platform**: Stellar
* **Secret Storage Location**: Database, encrypted with `DISTRIBUTION_ACCOUNT_ENCRYPTION_PASSPHRASE`
* **Assets Supported**: Any Stellar asset
* **Key/Secret Isolation**: Segregated per tenant
* **Appropriate for**: Multi-tenant and single-tenant
* **How is it configured?**: The distribution account is randomly generated and funded during the provisioning process, and the secret is encrypted and safely stored in the database. The account is funded from the HOST distribution account by an amount defined in `TENANT_XLM_BOOTSTRAP_AMOUNT`.
* `DISTRIBUTION_ACCOUNT.CIRCLE.DB_VAULT`
* **Platform**: [Circle](https://www.circle.com)
* **Secret Storage Location**: Database, encrypted with `DISTRIBUTION_ACCOUNT_ENCRYPTION_PASSPHRASE`
* **Assets Supported**: [USDC](https://www.circle.com/en/usdc)/[EURC](https://www.circle.com/en/eurc)
* **Key/Secret Isolation**: Segregated per tenant
* **Appropriate for**: Multi-tenant and single-tenant
* **How is it configured?**: The Circle API key is provided by the tenant themselves once they have access to the dashboard. The secret is encrypted and safely stored in the database.
* ð´ `DISTRIBUTION_ACCOUNT.STELLAR.ENV`
* **Platform**: Stellar
* **Secret Storage Location**: Environment variable `DISTRIBUTION_SEED`
* **Assets Supported**: Any Stellar asset
* **Key/Secret Isolation**: ð¨ Same distribution account as the HOST
* **Appropriate for**: Single-tenant only
* **How is it configured?**: The tenant will use the HOST account **as is**. The host is responsible for creating the account and configuring it with the `DISTRIBUTION_SEED` secret.

> **Warning:** Once a tenant is created, the `distribution_account_type` cannot be changed. If you wish to use a different distribution account type, you will need to create a new tenant.