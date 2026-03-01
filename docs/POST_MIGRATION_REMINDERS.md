# Post-Migration Reminders & Roadmap

This document tracks items that need to be addressed **after** the initial Mainnet launch and validation.

## 🚨 Pre-Launch Checklist (Critical)

### 📧 Email Infrastructure
- [ ] **Migrate SMTP**: Currently using personal email (`psaragossy@gmail.com`).
- [ ] **Action**: Switch to enterprise provider (Amazon SES, SendGrid, or Postmark) for reliability and domain reputation (`info@radox.net`).

### 🔑 Production Environment (`.env.production`)
- [ ] **Stellar Accounts**: Generate new mainnet accounts (Issuer, Distributor, Operations, Treasury). Fund with real XLM.
- [ ] **JWT_SECRET**: Generate new with `openssl rand -hex 32`. **Must be different from dev.**
- [ ] **Database**: Set up managed PostgreSQL (AWS RDS, Supabase). Update `DATABASE_URL`.
- [ ] **Redis**: Set up managed Redis. Set `REDIS_PASSWORD`.
- [ ] **API_KEY**: Generate new production API key.
- [ ] **Pinata JWT**: ✅ Same key works for both dev and prod.
- [ ] **Launchtube JWT**: ✅ Same key works for both networks.
- [ ] **Factory Contract**: Deploy smart wallet factory to mainnet. Update `FACTORY_CONTRACT_ID`.
- [ ] **SAC Contract IDs**: Look up mainnet XLM and USDC SAC IDs on Stellar Expert.
- [ ] **Pusher**: Set up Pusher account for real-time notifications.

### 🌐 Frontend & Marketing
- [ ] **Landing Page**: Develop a professional landing page for the main domain.
- [ ] **Redirect**: The current "Functional App" should be a subdomain (e.g., `app.radox.net`).

### 📦 Infrastructure
- [ ] **Target: Google Cloud Platform** (Cloud Run or GCE for backend, Cloud SQL for Postgres, Memorystore for Redis).
- [ ] **GCP Secret Manager**: Migrate Operations secret key from `.env` to Secret Manager (~$0.06/10k accesses). Use `@google-cloud/secret-manager` SDK in `KeyManager.js`.
- [ ] **Operations Hot Wallet**: Only the Operations account keeps a secret key for automated tasks (wallet sponsorship, trustline auth). Fund with ~500 XLM buffer. Issuer/Treasury/Distributor stay cold (Freighter/multisig only).
- [x] ~~**Pinata / IPFS**: Configured for production (`PINATA_JWT` in prod `.env`). Dev intentionally uses **MOCK MODE** via `docker-compose.dev.yml`.~~
- [x] ~~**Pinata Routes**: Routing works in production. Dev "broken links" are expected (mock hashes).~~

## 1. Business Logic & Fees
- [x] ~~**Fee Recovery**: Using CAP-33 sponsorship — XLM is **locked** (not spent), recoverable if accounts are merged. Platform Fees (1% on sales, issuance fees, dividend fees) offset operational costs.~~
- [x] ~~**Fee Buffer**: Stellar base fee is 100 stroops; implementation uses adequate buffers for network surges.~~

## 2. Infrastructure & Monitoring
- [ ] **Treasury Monitoring**: TODO — Add cron job or external monitor (UptimeRobot, Grafana) to alert when Treasury balance < 100 XLM. If depleted, sponsored account creation fails.
- [x] ~~**Rate Limiting**: Redis-backed multi-tier system (`strictLimiter` on investor creation, `authLimiter` on login). See `middleware/rateLimit.js`.~~

## 3. Features to Build
- [ ] **Fiat On-Ramp**: Build the prompt/flow for users to deposit Fiat (PIX), which allows switching from "Sponsored Activation" to "Deposit-based Activation" in the future if desired.
- [x] ~~**Smart Contract Verification**: N/A — Using SDF `passkey-kit` Smart Wallet (pre-verified) + SAC (protocol-native). No custom contracts.~~

## 3.1 Company Features
- [ ] **Full Company KYC**: Current registration only requires company name. Implement full KYC flow to collect and verify:
    - Tax ID (CNPJ/EIN) with validation
    - Legal representative identity verification
    - Articles of incorporation / business registration documents
    - Proof of address
    - Beneficial ownership disclosure
- [ ] **Company Multisig Wallets** (Optional): Allow companies to add multiple signers to their smart wallet for enhanced security (e.g., 2-of-3 passkeys required for transactions). The Stellar Smart Wallet architecture already supports this natively.
- [ ] **Company User Management**: Currently using auto-provisioning for direct company logins to satisfy DB constraints. Post-MVP: Implement proper User Management for companies (Add/Remove users) and consider refining DB schema to support direct entity actions.
- [ ] **Company Registration Emails**: Send "registration pending" confirmation to company + notify admins about new registrations. Templates needed in `EmailService`. See [companyController.js L202-203](file:///Users/pedrosaragossy/Workspace/Tokenizadora/stellar-security-tokens/backend/src/controllers/companyController.js#L202).
- [ ] **AlertService External Integrations**: Add Slack/Discord webhooks, Email, SMS for CRITICAL/ERROR alerts. Currently just logs. See [alert.service.js L44](file:///Users/pedrosaragossy/Workspace/Tokenizadora/stellar-security-tokens/backend/src/services/alert.service.js#L44).

## 4. Housekeeping
- [x] ~~**Clean `.env`**: `.env` is the dev config (loaded by Docker Compose automatically), `.env.production` for mainnet. Tests use an isolated `stellar_tokens_test` database with a safety guard in `cleanDatabase()`.~~

## 5. Security Hardening
- [x] ~~**Admin Seeding Scripts**: Added `NODE_ENV=production` check to `seed.js`, `checkAndCreateAdmin.js`, and `create_admin.js` — scripts now refuse to run in production. Use `createAdmin.js` with CLI args for prod.~~
- [ ] **CORS Configuration**: Once domain is finalized, ensure `FRONTEND_URL` env var is set to the exact production domain (e.g., `https://app.tokenizadora.com`). Consider restricting to specific origins in `backend/src/app.js`.
- [x] ~~**Request Body Size Limit**: Added `express.json({ limit: '100kb' })` in `app.js`. (100kb allows file uploads while preventing DoS).~~
- [ ] **Refresh Tokens**: Implement short-lived access tokens (15 min) + long-lived refresh tokens (7 days) to reduce exposure if a token is stolen. Currently using single 24h JWT.
- [x] ~~**Token Blocklist**: Implemented Redis-backed blocklist in `config/redis.js`. Added `POST /api/auth/logout` endpoint + `authenticateToken` now checks blocklist. Tokens are invalidated server-side on logout.~~
- [ ] **Security Audit Logging**: Log security-relevant events (logins, failed auth attempts, password changes, admin actions, sensitive operations) to a dedicated audit log for compliance and incident investigation. Consider using a structured logging library (winston/pino) with a separate audit transport.
- [ ] **Cold Issuer Wallet Strategy (Phased)**: **Critical for Mainnet**. Refactor the Issuer Account to use **Multisig (2-of-2)**.
    - **Phase 1 (MVP)**: Use **Admin Passkeys** as the second signer.
        - *Benefit*: Fast to implement (uses existing infra), very secure (Secure Enclave).
        - *Trade-off*: Admin is tied to their specific device.
    - **Phase 2 (Growth)**: Migrate Admin signer to **Ledger (Hardware Wallet)** via Freighter.
        - *Benefit*: Portability, physical governance (can lock device in safe), platform independent.

- [ ] **HttpOnly Cookies**: Migrate from `localStorage` to `HttpOnly Secure` cookies for JWT storage. This mitigates XSS risks where malicious scripts could steal the token from localStorage.

## Scalability & Reliability
- [x] ~~**USDC Deposit Safety (UX)**: Added explicit warnings in the Deposit UI: **"Send only Stellar Network USDC. Do not send ERC-20/SPL tokens directly."** to prevent user fund loss.~~
- [x] ~~**Memo Validation**: Enforced unique Memo checks for all deposits. Backend now relaxes sender validation if Memo matches (supporting Exchanges).~~
- [ ] **Channel Accounts (Worker Pool)**: Implement Channel Accounts for the `Distributor` wallet to prevent `Bad Sequence Number` errors during high-volume token distributions.

## 6. Key Management (Pre-Mainnet Critical)

> ⚠️ **Current State**: Keys stored in `.env` file - OK for testing, NOT for production.

### The Problem
- Single point of failure (if `.env` is compromised, all funds at risk)
- No operational security (one person can drain treasury)
- Not suitable for production with real funds

### Recommended Solution: Stellar Native Multisig

**Phase 1 (Before Mainnet)**:
- [ ] Convert Treasury account to **2-of-2 multisig** requiring both Pedro & Gabriel signatures
- [ ] Remove `TREASURY_SECRET_KEY` from `.env` after conversion
- [ ] Queue Treasury transactions via admin UI, require second admin passkey confirmation
- [ ] Same for Issuer account if token operations need governance

**Phase 2 (Growth)**:
- [ ] Consider **Ledger hardware wallets** as signers for added security
- [ ] Evaluate **MPC solutions** (Fireblocks, Fordefi) if institutional requirements arise

### Implementation Notes
- Your codebase already has `multisig_transactions` table infrastructure
- Admin passkeys can serve as signer authorization mechanism
- No external dependencies needed - pure Stellar native feature

## 7. Passkey Recovery (Database Loss Protection)

> 💡 **Feature Priority**: Nice-to-have (resilience feature)

### The Problem
If the database is lost (Docker reinstall, migration failure, etc.), the server loses the mapping between passkey credential IDs and user accounts/smart wallets. However:
- **The passkey (private key)** remains on the user's device (browser/OS keychain)
- **The smart wallet contract** remains deployed on the Stellar blockchain
- **The contract ID is deterministic** — derived from the passkey public key

This means recovery IS possible without any data loss to the user.

### How Passkey Recovery Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PASSKEY RECOVERY FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│ 1. User clicks "Login with Passkey"                                 │
│    ↓                                                                │
│ 2. Browser prompts for passkey (FaceID/TouchID/PIN)                │
│    ↓                                                                │
│ 3. Server receives credential_id + signed challenge                 │
│    ↓                                                                │
│ 4. Server checks DB → credential_id NOT FOUND (DB was wiped)       │
│    ↓                                                                │
│ 5. Instead of failing, initiate RECOVERY:                          │
│    a) Verify the WebAuthn signature is valid                        │
│    b) Extract the public key from the assertion                     │
│    c) Derive the Stellar contract ID deterministically              │
│    d) Query Stellar RPC: does this contract exist on-chain?         │
│    ↓                                                                │
│ 6. If contract EXISTS on-chain:                                     │
│    a) Create new investor/company record in DB                      │
│    b) Link passkey_credential_id + passkey_public_key               │
│    c) Link stellar_contract_id                                      │
│    d) Log the user in (issue JWT)                                   │
│    ↓                                                                │
│ 7. User is fully recovered! No funds lost, no new wallet needed.   │
└─────────────────────────────────────────────────────────────────────┘
```

### Implementation Checklist

- [ ] **Backend: Recovery Endpoint** (`POST /api/auth/passkey/recover`)
  - Accept WebAuthn assertion (same as login)
  - If credential not found → trigger recovery flow
  - Derive contract ID from public key using Factory Contract logic
  - Query Soroban RPC to verify contract exists
  - Create DB records and issue JWT

- [ ] **Backend: Email Re-verification**
  - After recovery, prompt user to re-verify email
  - Send verification email to the address stored in the contract (if available) or prompt for new email

- [ ] **Frontend: Recovery UI**
  - If login fails with "credential not found", show "Recover Account" option
  - Explain: "Your wallet still exists. Click to recover your account."
  - After recovery, show confirmation with wallet balance

- [ ] **Fallback: Manual Recovery**
  - Admin endpoint to manually link a passkey to an existing on-chain contract
  - Useful for edge cases where automatic recovery fails

### Security Considerations
- **The blockchain is the source of truth** — if the contract exists and the user can sign with the correct passkey, they are the legitimate owner
- **No email/password required** — the passkey cryptographically proves ownership
- **Rate limit recovery attempts** — prevent enumeration attacks

### Code References
- Contract ID derivation: `StellarService.deriveSmartWalletAddress()`
- WebAuthn verification: `authController.verifyPasskeyAssertion()`
- Factory contract: `FACTORY_CONTRACT_ID` env variable

### Benefit
This feature makes the system **resilient to database loss** while maintaining full user fund safety. The Stellar blockchain acts as an immutable backup of account existence.

