# Post-Migration Reminders & Roadmap

This document tracks items that need to be addressed **after** the initial Mainnet launch and validation.

## 🚨 Pre-Launch Checklist (Critical)

### 📧 Email Infrastructure
- [ ] **Migrate SMTP**: Currently using personal email (`psaragossy@gmail.com`).
- [ ] **Action**: Switch to enterprise provider (Amazon SES, SendGrid, or Postmark) for reliability and domain reputation (`info@tokenizadora.com`).

### 🌐 Frontend & Marketing
- [ ] **Landing Page**: Develop a professional landing page for the main domain.
- [ ] **Redirect**: The current "Functional App" should be a subdomain (e.g., `app.tokenizadora.com`).

### 📦 Infrastructure
- [x] **Pinata / IPFS**: Configured for production (`PINATA_JWT` in prod `.env`). Dev intentionally uses **MOCK MODE** via `docker-compose.dev.yml`.
- [x] **Pinata Routes**: Routing works in production. Dev "broken links" are expected (mock hashes).

## 1. Business Logic & Fees
- [x] **Fee Recovery**: Using CAP-33 sponsorship — XLM is **locked** (not spent), recoverable if accounts are merged. Platform Fees (1% on sales, issuance fees, dividend fees) offset operational costs.
- [x] **Fee Buffer**: Stellar base fee is 100 stroops; implementation uses adequate buffers for network surges.

## 2. Infrastructure & Monitoring
- [ ] **Treasury Monitoring**: TODO — Add cron job or external monitor (UptimeRobot, Grafana) to alert when Treasury balance < 100 XLM. If depleted, sponsored account creation fails.
- [x] **Rate Limiting**: Redis-backed multi-tier system (`strictLimiter` on investor creation, `authLimiter` on login). See `middleware/rateLimit.js`.

## 3. Features to Build
- [ ] **Fiat On-Ramp**: Build the prompt/flow for users to deposit Fiat (PIX), which allows switching from "Sponsored Activation" to "Deposit-based Activation" in the future if desired.
- [x] **Smart Contract Verification**: N/A — Using SDF `passkey-kit` Smart Wallet (pre-verified) + SAC (protocol-native). No custom contracts.

## 3.1 Company Features
- [ ] **Full Company KYC**: Current registration only requires company name. Implement full KYC flow to collect and verify:
    - Tax ID (CNPJ/EIN) with validation
    - Legal representative identity verification
    - Articles of incorporation / business registration documents
    - Proof of address
    - Beneficial ownership disclosure
- [ ] **Company Multisig Wallets** (Optional): Allow companies to add multiple signers to their smart wallet for enhanced security (e.g., 2-of-3 passkeys required for transactions). The Stellar Smart Wallet architecture already supports this natively.
- [ ] **Company User Management**: Currently using auto-provisioning for direct company logins to satisfy DB constraints. Post-MVP: Implement proper User Management for companies (Add/Remove users) and consider refining DB schema to support direct entity actions.

## 4. Housekeeping
- [ ] **Clean `.env`**: After verifying production, remove any lingering `TESTNET` variables from the production environment to prevent confusion.

## 5. Security Hardening
- [x] **Admin Seeding Scripts**: Added `NODE_ENV=production` check to `seed.js`, `checkAndCreateAdmin.js`, and `create_admin.js` — scripts now refuse to run in production. Use `createAdmin.js` with CLI args for prod.
- [ ] **CORS Configuration**: Once domain is finalized, ensure `FRONTEND_URL` env var is set to the exact production domain (e.g., `https://app.tokenizadora.com`). Consider restricting to specific origins in `backend/src/app.js`.
- [x] **Request Body Size Limit**: Added `express.json({ limit: '100kb' })` in `app.js`. (100kb allows file uploads while preventing DoS).
- [ ] **Refresh Tokens**: Implement short-lived access tokens (15 min) + long-lived refresh tokens (7 days) to reduce exposure if a token is stolen. Currently using single 24h JWT.
- [x] **Token Blocklist**: Implemented Redis-backed blocklist in `config/redis.js`. Added `POST /api/auth/logout` endpoint + `authenticateToken` now checks blocklist. Tokens are invalidated server-side on logout.
- [ ] **Security Audit Logging**: Log security-relevant events (logins, failed auth attempts, password changes, admin actions, sensitive operations) to a dedicated audit log for compliance and incident investigation. Consider using a structured logging library (winston/pino) with a separate audit transport.
- [ ] **Cold Issuer Wallet Strategy (Phased)**: **Critical for Mainnet**. Refactor the Issuer Account to use **Multisig (2-of-2)**.
    - **Phase 1 (MVP)**: Use **Admin Passkeys** as the second signer.
        - *Benefit*: Fast to implement (uses existing infra), very secure (Secure Enclave).
        - *Trade-off*: Admin is tied to their specific device.
    - **Phase 2 (Growth)**: Migrate Admin signer to **Ledger (Hardware Wallet)** via Freighter.
        - *Benefit*: Portability, physical governance (can lock device in safe), platform independent.

- [ ] **HttpOnly Cookies**: Migrate from `localStorage` to `HttpOnly Secure` cookies for JWT storage. This mitigates XSS risks where malicious scripts could steal the token from localStorage.

## Scalability & Reliability
- [x] **USDC Deposit Safety (UX)**: Added explicit warnings in the Deposit UI: **"Send only Stellar Network USDC. Do not send ERC-20/SPL tokens directly."** to prevent user fund loss.
- [x] **Memo Validation**: Enforced unique Memo checks for all deposits. Backend now relaxes sender validation if Memo matches (supporting Exchanges).
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

