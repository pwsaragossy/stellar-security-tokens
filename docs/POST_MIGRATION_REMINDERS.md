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
- [ ] **Pinata / IPFS**: Verify IPFS integration. Currently running in **MOCK MODE** (fake uploads) if credentials are missing.
- [ ] **Pinata Routes**: Check routing and gateway configuration. The "broken links" are due to Mock Mode returning fake Hashes.

## 1. Business Logic & Fees
- [ ] **Fee Recovery**: We are currently sponsoring user account activation (~3 XLM per user). We must implement a "Withdrawal Fee" or "Deposit Fee" premium in the `PaymentService` to recover this cost over time.
- [ ] **Fee Buffer**: Ensure the calculated fee includes a buffer for Stellar network surges (though rare).

## 2. Infrastructure & Monitoring
- [ ] **Treasury Monitoring**: Set up an alert (Cron job or external monitor) to notify admins when the **Treasury Account** balance drops below 100 XLM. If it hits 0, new user signups will fail.
- [ ] **Rate Limiting**: Hardening the `createInvestorAccount` endpoint ensures malicious actors cannot drain the Treasury by creating thousands of accounts. (Currently relies on basic IP rate limiting).

## 3. Features to Build
- [ ] **Fiat On-Ramp**: Build the prompt/flow for users to deposit Fiat (PIX), which allows switching from "Sponsored Activation" to "Deposit-based Activation" in the future if desired.
- [ ] **Smart Contract Verification**: Once deployed, verify the Source Code on Stellar Expert for transparency.

## 4. Housekeeping
- [ ] **Clean `.env`**: After verifying production, remove any lingering `TESTNET` variables from the production environment to prevent confusion.

## 5. Security Hardening
- [ ] **Admin Seeding Scripts**: The files `backend/src/database/checkAndCreateAdmin.js` and `backend/src/database/create_admin.js` contain hardcoded default passwords (`admin123456` and `admin123`). Before production: either delete these scripts, require password as CLI argument, or add a `NODE_ENV=production` check to prevent accidental execution.
- [ ] **CORS Configuration**: Once domain is finalized, ensure `FRONTEND_URL` env var is set to the exact production domain (e.g., `https://app.tokenizadora.com`). Consider restricting to specific origins in `backend/src/app.js`.
- [ ] **Request Body Size Limit**: Add `express.json({ limit: '10kb' })` in `backend/src/app.js` to prevent large payload attacks.
- [ ] **Refresh Tokens**: Implement short-lived access tokens (15 min) + long-lived refresh tokens (7 days) to reduce exposure if a token is stolen. Currently using single 24h JWT.
- [ ] **Token Blocklist**: Implement Redis-backed token blocklist for proper logout. Currently, logout only clears the token client-side but the token remains valid server-side until expiry. Add `POST /api/auth/logout` endpoint that adds token to blocklist, and check blocklist in `authenticateToken` middleware.
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

