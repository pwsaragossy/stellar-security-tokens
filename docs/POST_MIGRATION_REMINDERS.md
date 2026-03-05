# Post-Migration Reminders & Roadmap

This document tracks items that need to be addressed **after** the initial Mainnet launch and validation.

> **See also:** [MAINNET_CHECKLIST.md](MAINNET_CHECKLIST.md) for pre-launch tasks. [STELLAR_MULTISIG_REFERENCE.md](STELLAR_MULTISIG_REFERENCE.md) for multisig setup details.

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
- [ ] **Operations Secret Key → Vault**: The Operations hot wallet (`OPERATIONS_SECRET_KEY`) is the **only** secret key in `.env`. Before mainnet, migrate it to **Google Secret Manager** (or equivalent vault) so it's never stored in plaintext. Issuer/Treasury/Distributor are already cold (Freighter/multisig only).

### 🌐 Frontend & Marketing
- [ ] **Landing Page**: Develop a professional landing page for the main domain.
- [ ] **Redirect**: The current "Functional App" should be a subdomain (e.g., `app.radox.net`).
- [ ] **Separate Login Pages**: Make `/login` investor-only (no Company tab). Create `/company/login` as a separate route shared only with vetted partners.
- [ ] **Company Invite System**: Replace self-service company registration with an invite flow. Landing page has a "For Companies → Request Access" form. Admin reviews and sends invite link (`/company/register?invite=<token>`). Prevents confused investors from landing in the company flow.

### 📦 Infrastructure
- [ ] **Target: Google Cloud Platform** (Cloud Run or GCE for backend, Cloud SQL for Postgres, Memorystore for Redis).
- [ ] **GCP Secret Manager**: Migrate Operations secret key from `.env` to Secret Manager (~$0.06/10k accesses). Use `@google-cloud/secret-manager` SDK in `KeyManager.js`.
- [ ] **Operations Hot Wallet**: Only the Operations account keeps a secret key for automated tasks (wallet sponsorship, trustline auth). Fund with ~500 XLM buffer. Issuer/Treasury/Distributor stay cold (Freighter/multisig only).
- [x] ~~**Pinata / IPFS**: Configured for production (`PINATA_JWT` in prod `.env`). Dev intentionally uses **MOCK MODE** via `docker-compose.dev.yml`.~~
- [x] ~~**Pinata Routes**: Routing works in production. Dev "broken links" are expected (mock hashes).~~

## 1. Business Logic & Fees

> ✅ **Completed:** Fee recovery uses CAP-33 sponsorship (XLM locked, not spent). Stellar base fee uses adequate buffers.

## 2. Infrastructure & Monitoring
- [ ] **Treasury Monitoring**: Add cron job or external monitor (UptimeRobot, Grafana) to alert when Treasury balance < 100 XLM.

> ✅ **Completed:** Redis-backed multi-tier rate limiting in `middleware/rateLimit.js`.

## 3. Features to Build
- [ ] **Fiat On-Ramp**: PIX deposit flow to transition from sponsor-only to deposit-based activation.

> ✅ **Completed:** No custom Soroban contracts needed — using SDF `passkey-kit` Smart Wallet (pre-verified) + SAC (protocol-native).

## 3.1 Company Features
- [ ] **Full Company KYC** *(Low Priority — companies onboard offline for now)*: If needed later, implement in-app KYC to collect:
    - Tax ID (CNPJ/EIN) with validation
    - Legal representative identity verification
    - Articles of incorporation / business registration documents
    - Proof of address
    - Beneficial ownership disclosure
- [ ] **Company Multisig Wallets** (Optional): Allow companies to add multiple signers to their smart wallet for enhanced security (e.g., 2-of-3 passkeys required for transactions). The Stellar Smart Wallet architecture already supports this natively.
- [ ] **Company User Management**: Currently using auto-provisioning for direct company logins to satisfy DB constraints. Post-MVP: Implement proper User Management for companies (Add/Remove users) and consider refining DB schema to support direct entity actions.
- [ ] **Company Registration Emails** *(Low Priority — onboarding done offline)*: Send "registration pending" confirmation to company + notify admins about new registrations. Templates needed in `EmailService`. See [companyController.js L202-203](file:///Users/pedrosaragossy/Workspace/Tokenizadora/stellar-security-tokens/backend/src/controllers/companyController.js#L202).
- [ ] **AlertService External Integrations** *(Low Priority)*: Add Slack/Discord webhooks, Email, SMS for CRITICAL/ERROR alerts. Currently just logs. See [alert.service.js L44](file:///Users/pedrosaragossy/Workspace/Tokenizadora/stellar-security-tokens/backend/src/services/alert.service.js#L44).

## 4. Housekeeping
- [ ] **Rename Git Repository**: Rename `stellar-security-tokens` → `radox` (or `radox-platform`) on GitHub. Update remotes and CI/CD.

> ✅ **Completed:** `.env` is dev config, `.env.production` for mainnet. Tests use isolated `stellar_tokens_test` database.

## 5. Security Hardening
- [ ] **CORS Configuration**: Set `FRONTEND_URL` to production domain (e.g., `https://app.radox.net`). Restrict origins in `backend/src/app.js`.
- [ ] **Short-Lived Access Tokens**: Reduce access token expiry from 24h to 15 minutes. Refresh tokens (7-day, httpOnly cookie, rotation) are already implemented. *(Previously failed because of a cookie priority bug — `rt_inv` shadowed `rt_adm` — fixed Mar 2026 via Referer-based detection in `authRoutes.js`. Safe to retry.)*
- [ ] **Security Audit Logging**: Dedicated audit log for logins, failed auth, admin actions. Consider winston/pino with separate transport.
- [ ] **Cold Issuer Wallet** (Phased):
    - Phase 1 (MVP): Admin Passkeys as 2nd signer.
    - Phase 2: Ledger hardware wallet via Freighter.
- [ ] **HttpOnly Cookies**: Migrate JWT from `localStorage` to `HttpOnly Secure` cookies.

> ✅ **Completed:** Admin seeding scripts have `NODE_ENV=production` guard. Body limit `100kb` in `app.js`. Redis-backed token blocklist with `POST /api/auth/logout`.

## Scalability & Reliability
- [ ] **Channel Accounts (Worker Pool)**: Implement for Distributor wallet to prevent `Bad Sequence Number` errors during high-volume distributions.

> ✅ **Completed:** USDC deposit safety warnings in UI. Unique memo validation for all deposits (supports exchanges).

## 6. Key Management (Pre-Mainnet Critical)

> ⚠️ **Current State**: Keys stored in `.env` file - OK for testing, NOT for production.

### The Problem
- Single point of failure (if `.env` is compromised, all funds at risk)
- No operational security (one person can drain treasury)
- Not suitable for production with real funds

### Recommended Solution: Stellar Native Multisig

**Phase 1 (Before Mainnet)**:
- [ ] Convert Treasury account to **2-of-2 multisig** requiring both Pedro & Gabriel signatures
- [ ] Migrate `OPERATIONS_SECRET_KEY` from `.env` to Google Secret Manager (only secret key that remains)
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
- Contract ID derivation: `PasskeyWalletService.deployWallet()` inline (L157-175 in `passkeyWallet.service.js`)
- WebAuthn verification: `WebAuthnService.verifyAuthentication()` (in `webauthn.service.js`)
- Factory contract: `FACTORY_CONTRACT_ID` env variable

### Benefit
This feature makes the system **resilient to database loss** while maintaining full user fund safety. The Stellar blockchain acts as an immutable backup of account existence.

