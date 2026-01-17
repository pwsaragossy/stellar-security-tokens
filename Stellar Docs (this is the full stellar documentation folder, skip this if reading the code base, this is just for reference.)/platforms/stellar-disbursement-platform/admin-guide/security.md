# Security

This manual outlines the security measures implemented in the Stellar Disbursement Platform (SDP) to protect the integrity of the platform and its users. By adhering to these guidelines, you can ensure that your use of the SDP is as secure as possible.

Security is a critical aspect of the SDP. The measures outlined in this document are designed to mitigate risks and enhance the security of the platform. Users are strongly encouraged to follow these guidelines to protect their accounts and operations.

### Implementation of reCAPTCHA[](#implementation-of-recaptcha "Direct link to Implementation of reCAPTCHA")

Google's reCAPTCHA has been integrated into the SDP to prevent automated attacks and ensure that interactions are performed by humans, not bots.

ReCAPTCHA is enabled by default and can be disabled by setting the `DISABLE_RECAPTCHA` environment variable to `true`.

Configuration is available at two levels:

1. **Environment default**  Set `DISABLE_RECAPTCHA=true` to apply the setting globally across all tenants.
2. **Tenant override**  Each organization can enable or disable reCAPTCHA via its own settings (UI or API). When present, the tenant-level choice overrides the environment default.

Use the following environment variables to control how reCAPTCHA behaves:

* `CAPTCHA_TYPE`  `GOOGLE_RECAPTCHA_V2` (default) or `GOOGLE_RECAPTCHA_V3`.
* `RECAPTCHA_SITE_KEY`  Google site key issued for the chosen CAPTCHA type.
* `RECAPTCHA_SITE_SECRET_KEY`  Google secret key paired with the site key.
* `RECAPTCHA_V3_MIN_SCORE`  Minimum allowed score (0.01.0, default 0.5) when `CAPTCHA_TYPE=GOOGLE_RECAPTCHA_V3`.

**Note:** Disabling reCAPTCHA in production (pubnet) deployments substantially reduces protection against automated abuse. This configuration should be used only when equivalent compensating controls are in place.

### Enforcement of Multi-Factor Authentication[](#enforcement-of-multi-factor-authentication "Direct link to Enforcement of Multi-Factor Authentication")

Multi-Factor Authentication (MFA) provides an additional layer of security to user accounts. It is enforced by default on the SDP and it relies on OTPs sent to the account's email.

MFA is enabled by default and can be disabled in the development environment by setting the `DISABLE_MFA` environment variable to `true`.

**Note:** MFA cannot be disabled in production (pubnet) environments due to security risk.

### Request Rate Limiting and Network Protections[](#request-rate-limiting-and-network-protections "Direct link to Request Rate Limiting and Network Protections")

SDP enforces rate limiting at the HTTP layer to curb scripted abuse. Each unique `<IP, endpoint>` pair is limited to 40 requests within 20 seconds (rolling window). Requests that exceed this threshold receive throttled responses until the window resets.

### Authentication and Authorization Models[](#authentication-and-authorization-models "Direct link to Authentication and Authorization Models")

All authenticated API routes require clients to present either an SDP-issued API key or a JWT derived from the SEP10/SEP24 flows. These two mechanisms run in parallel: JWTs are for interactive users, while API keys enable programmatic integrations with their own scoping model.

#### JWT Roles[](#jwt-roles "Direct link to JWT Roles")

JWTs represent human users that sign in through the UI. After authentication, the platform authorizes them based on the roles assigned to their user account. The primary roles are:

* **Owner**  Full control, including creating users, assigning roles, and editing organization configuration. Owner is the only role that can grant or revoke access for others.
* **Financial Controller**  Can perform every operational task (wallets, assets, disbursements, statistics) except user management. This role is ideal for finance staff executing payouts.
* **Developer**  Manages technical configuration such as wallets, assets, and API keys, and can view statistics; it cannot modify users or financial workflows.
* **Business**  Read-only across business data (disbursements, recipients, statistics) but cannot access user management details.
* **Initiator**  Creates and saves disbursements but cannot submit them. Mutually exclusive with the Approver role to enforce separation of duties.
* **Approver**  Reviews and submits disbursements but cannot create new ones; mutually exclusive with Initiator.

Each API endpoint specifies which JWT roles may access itfor example, API key management routes (`/api-keys`) require Owner or Developer, while disbursement creation requires Initiator or Financial Controller and submission requires Approver or Financial Controller.

#### API Key Permissions[](#api-key-permissions "Direct link to API Key Permissions")

API keys bypass JWT roles and instead embed their own permission scopes. When a request includes an API key, the middleware validates the key, confirms the callers IP address is allowed (if restricted), checks the expiration, and finally ensures the key contains the scopes required by the endpoint. API keys are typically used for automation and service-to-service integrations where precise read/write access is needed; creating or rotating them still requires a user with the appropriate JWT role (Owner or Developer) to hit the `/api-keys` endpoints.

Available scopes map directly to the major SDP resources:

* `read:all`, `write:all`
* `read:disbursements`, `write:disbursements`
* `read:receivers`, `write:receivers`
* `read:payments`, `write:payments`
* `read:organization`, `write:organization`
* `read:users`, `write:users`
* `read:wallets`, `write:wallets`
* `read:statistics`
* `read:exports`

#### Recommended Configuration[](#recommended-configuration "Direct link to Recommended Configuration")

To enhance security, disbursement responsibilities should be distributed among multiple financial controller users.

1. **Approval Flow**: Enable the approval flow on the organization page to require two users for the disbursement process. The owner can do that at *Profile > Organization > ... > Edit details > Approval flow > Confirm*.
2. **Financial Controller Role**: Create two users with the *Financial Controller* role on the organization page to enforce separation of duties. The owner can do that at *Settings > Team Members*.
3. **Owner Account Management**: Use the Owner account solely for user management and organization configuration. Avoid using the Owner account for financial controller tasks to minimize the exposure of that account.

### Best Practices for Wallet Management[](#best-practices-for-wallet-management "Direct link to Best Practices for Wallet Management")

The SDP wallet should be used primarily as a hot wallet with a limited amount of funds to minimize potential losses.

#### Hot and Cold Wallets[](#hot-and-cold-wallets "Direct link to Hot and Cold Wallets")

* A hot wallet is connected to the internet and allows for quick transactions.
* A cold wallet is offline and used for storing funds securely.
* Learn more about these concepts at [Investopedia](https://www.investopedia.com/hot-wallet-vs-cold-wallet-7098461).