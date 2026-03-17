# Controllers Layer — Full Deep Read

> **13 files · 7,813 lines** | Read date: 2026-03-10
> Path: `backend/src/controllers/`

---

## Table of Contents
1. [File Inventory](#file-inventory)
2. [Controller Summaries](#controller-summaries)
3. [Method Inventory (all endpoints)](#method-inventory)
4. [Service Call Map](#service-call-map)
5. [Auth & Role Matrix](#auth--role-matrix)
6. [Architecture Patterns](#architecture-patterns)
7. [Dead Code & Issues](#dead-code--issues)
8. [Findings & Recommendations](#findings--recommendations)

---

## File Inventory

| # | File | Lines | Style | Methods |
|---|------|-------|-------|---------|
| 1 | `investorController.js` | 906 | Exports (named functions) | 16 |
| 2 | `investmentController.js` | 514 | Class (static) | 5 |
| 3 | `offerController.js` | 1,121 | Class (static) | 15 |
| 4 | `companyController.js` | 818 | Class (static) | 14 |
| 5 | `companyUserController.js` | 577 | Class (static) | 11 |
| 6 | `platformAdminController.js` | 463 | Class (static) | 9 |
| 7 | `tokenController.js` | 367 | Exports (named functions) | 8 |
| 8 | `walletController.js` | 447 | Object literal | 3 + 2 helpers |
| 9 | `webauthnController.js` | 425 | Class (static) | 4 |
| 10 | `contractController.js` | 454 | Class (static) | 13 + 4 helpers |
| 11 | `treasuryController.js` | 41 | Class (static) | 1 |
| 12 | `notificationController.js` | 81 | Class (static) | 3 |
| 13 | `investmentMetricsController.js` | 159 | Class (static) | 6 |

**Coding style note:** 3 different patterns are used: class-based with static methods (majority), named function exports (`investorController`, `tokenController`), and an object literal (`walletController`). No consistency enforced.

---

## Controller Summaries

### 1. `investorController.js` (906L)

**Purpose:** Complete investor lifecycle — registration, profile, portfolio, payments, wallet, deposits.

**Key Methods:**
- `getInvestors` — Paginated list with `{ limit, offset }`
- `getInvestorById` — Single investor with camelCase→snake_case mapping
- `getInvestorPayments` — Aggregates 4 payment sources: interest, purchase, deposit, distribution
- `getInvestorPortfolio` — Holdings + investment history per investor
- `getInvestorInvestments` — Investments with offer details
- `startRegistration` — **Email-first flow**: verifies email, sends 6-digit code, creates unverified investor
- `verifyRegistrationCode` — Verifies 6-digit code → issues JWT `registrationToken`
- `completeRegistration` — Consumes `registrationToken`, creates passkey smart wallet, finalizes profile
- `loginInvestor` — Email + 6-digit OTP login
- `getPortfolio` — Public portfolio endpoint (alias)
- `getPaymentHistory` — Public payment history endpoint (alias)
- `getPasskeyConfig` — Returns `PasskeyWalletService.getClientConfig()`
- `proposeWithdrawal` — Builds withdrawal TX via `PasskeyWalletService`
- `submitWithdrawal` — Submits signed withdrawal XDR
- `initiateDeposit` — Creates USDC deposit relay via `DepositRelayService`
- `getInvestorDeposits` — Lists deposit relay records

**Service dependencies:** `Investor`, `Investment`, `Token`, `EmailService`, `PasskeyWalletService`, `DepositRelayService`, `WebAuthnService`, `prisma`

---

### 2. `investmentController.js` (514L)

**Purpose:** Investment purchase flow — Soroban-only atomic swaps with fee calculation.

**Key Methods:**
- `purchase` — Core buy flow: validates supply, maturity cutoff, fee schedule → `SorobanSaleService.buildTradeXdr` → returns unsigned XDR
- `submitSignedInvestment` — Re-simulates with signed auth entries → `PasskeyWalletService.submitWithSponsorship` → creates DB record → background RPC poll
- `getInvestmentStatus` — Fetches investment with transaction hash
- `getFeeSchedule` — Returns `ConfigService` fee parameters
- `rateLimit` — In-memory `Map()` rate limiter (1 submission/30s per investor)

**Notable patterns:**
- Fee is logged to `feeLog` table at purchase time (calculated not collected on-chain)
- Background `setTimeout` polls RPC for TX confirmation after 5s
- Maturity cutoff check uses `ConfigService.getFloat('maturity_cutoff_days')`

**Service dependencies:** `SorobanSaleService`, `PasskeyWalletService`, `ConfigService`, `Investment`, `Investor`, `Offer`, `Token`

---

### 3. `offerController.js` (1,121L)

**Purpose:** Full offer lifecycle — CRUD, review workflow, token issuance, activation.

**Key Methods:**
- `createOffer` — Creates offer with IPFS document upload via `IPFSService`
- `getOfferById` / `getOffers` / `getCompanyOffers` / `getPublicOffers` — Various list/detail endpoints with `formatOfferForResponse` helper
- `updateOffer` — Updates offer fields + IPFS document re-upload
- `addDueDiligenceNote` / `getOfferReviews` — Admin review workflow
- `reviewOffer` — Admin approve/reject with notes
- `issueTokenFromOffer` — **Critical path**: checks approved status → prevents duplicate multisig proposals → `StellarService.issueSecurityToken` → handles `pending_multisig` → `OfferService.issueTokenFromOffer` → generates `stellar.toml` preview
- `activateOffer` — Admin activates approved+token-issued offer
- `activateCompanyOffer` — Company user activates own offer (requires `admin_verified` flag)
- `retrySorobanInit` — Retry failed Soroban contract deployment
- `verifyOfferIssuance` — Admin sets `admin_verified` flag in `offerRules`
- `formatOfferForResponse` — Dual camelCase + snake_case response format with IPFS gateway URLs

**Lifecycle FSM:** `pending_review` → `approved` → (token issued) → `admin_verified` → `active`

**Service dependencies:** `Offer`, `OfferService`, `Token`, `Investment`, `StellarService`, `IPFSService`, `prisma`

---

### 4. `companyController.js` (818L)

**Purpose:** Company registration, profile management, wallet operations.

**Key Methods:**
- `registerCompany` — Single-step: creates Company + ghost CompanyUser + passkey wallet + JWT in one call
- `registerCompanyStep1/2/3` — Legacy 3-step flow (email → verify → complete)
- `sendVerificationCode` / `verifyCode` — 6-digit OTP for legacy flow
- `getCompany` / `getCompanyProfile` — Profile with KYC doc formatting
- `getAllCompanies` — Admin list with pagination
- `updateCompanyStatus` — Admin approve/reject company
- `approveCompanyDebug` — Debug-only instant approval (⚠️ security concern)
- `getWalletStatus` — Checks smart wallet on-chain balance
- `proposeWithdrawal` / `submitWithdrawal` — Company withdrawal flows

**Important detail:** The "ghost CompanyUser" pattern — `registerCompany` creates both a `Company` and a `CompanyUser` record in one transaction, where the CompanyUser acts as the primary login entity.

**Service dependencies:** `Company`, `CompanyUser`, `EmailService`, `PasskeyWalletService`, `prisma`

---

### 5. `companyUserController.js` (577L)

**Purpose:** Company user management — registration, wallet, withdrawals.

**Key Methods:**
- `getCompanyUsers` — List users for a company
- `updateCompanyUser` — Update name, role, status
- `registerCompanyUser` — Single-step with passkey data
- `registerCompanyUserStep1/2/3` — Legacy 3-step flow
- `sendVerificationCode` / `verifyCode` — 6-digit OTP
- `getWalletStatus` — Smart wallet balance check
- `proposeWithdrawal` / `submitWithdrawal` — Company user withdrawal

**Pattern:** Nearly identical to `companyController.js` for registration flows — both support single-step (passkey) and legacy 3-step.

**Service dependencies:** `CompanyUser`, `Company`, `EmailService`, `PasskeyWalletService`, `prisma`

---

### 6. `platformAdminController.js` (463L)

**Purpose:** Admin CRUD, system config, fee logs, investor KYC management, TTL stats.

**Key Methods:**
- `createPlatformAdmin` — Super-admin only, creates admin with role
- `getPlatformAdmins` — Paginated admin list
- `updatePlatformAdmin` — Update name/role/active (role change = super_admin only)
- `getSystemConfig` — Reads all `SystemConfig` rows → `{ key: value }` map
- `updateSystemConfig` — Batch upsert config keys in a transaction
- `getFeeLogs` — Fee logs with revenue summary (grouped by `assetCode`)
- `getAllInvestors` — Admin investor list with KYC status filter
- `approveInvestor` — Sets `kycStatus: 'approved'` + **auto-whitelisting** (calls `StellarService.authorizeAllUserTrustlines`)
- `rejectInvestor` — Sets `kycStatus: 'rejected'` + sends rejection email
- `getTTLStats` — Counts SAC and wallet contracts for TTL maintenance overview

**Critical finding:** `approveInvestor` triggers on-chain trustline authorization automatically — if this fails, approval still succeeds (fire-and-forget pattern).

**Service dependencies:** `PlatformAdmin`, `StellarService`, `EmailService`, `prisma`

---

### 7. `tokenController.js` (367L)

**Purpose:** Token lifecycle — issuance, sync, compliance operations, SAC deployment.

**Key Methods:**
- `issueToken` — Issues security token via `StellarService.issueSecurityToken` (handles `pending_multisig`)
- `getTokens` — Paginated list (company users see only their company's tokens)
- `getTokenByAssetCode` — Single token detail
- `syncTokens` — Discovers orphan tokens from distributor wallet and creates DB records
- `freezeAccount` / `unfreezeAccount` — Trustline flag operations
- `clawbackTokens` — Regulatory clawback
- `disableClawback` — **Multisig-gated**: if `keyManager.requiresMultisigApproval`, creates multisig proposal instead of executing directly
- `listAssetHolders` — On-chain holder list via `StellarService`
- `deploySAC` — Deploys Stellar Asset Contract (handles `pending_multisig`)

**Service dependencies:** `Token`, `StellarService`, `keyManager`, `MultiSigTransactionService`

---

### 8. `walletController.js` (447L)

**Purpose:** System wallet management + multisig proposal lifecycle (the "Approval Hub" backend).

**Key Methods:**
- `getWalletStatuses` — Parallel load of 4 system wallets (Treasury, Issuer, Distributor, Operations) with comprehensive 404 detection
- `createTransactionProposal` — Builds Classic or Soroban TX from wallet → creates `multiSigTransaction` record. Supports: payment (XLM/USDC), freeze, unfreeze, clawback, disable_clawback, and Soroban SAC transfer (to C... addresses)
- `getTransactionProposals` — Paginated list with status filter
- `signAndSubmitProposal` — Verifies signature threshold → submits to Stellar → runs **post-execution hook**

**Post-execution hooks (critical):**
1. `sac_deploy` + `chainAction: 'token_distribute'` → auto-queues `StellarService.distributeTokens`
2. `token_distribute` with `investmentId` → creates distribution record, updates investment to `distributed`, sends confirmation email

**Service dependencies:** `keyManager`, `StellarService`, `stellar.js` config, `prisma`

---

### 9. `webauthnController.js` (425L)

**Purpose:** WebAuthn (passkey) authentication for all 3 user types.

**Key Methods:**
- `startRegistration` — Generates WebAuthn registration options, stores challenge in memory Map
- `completeRegistration` — Verifies attestation, registers credential
- `startAuthentication` — Generates authentication options
- `completeAuthentication` — Verifies assertion → generates JWT + refresh token + httpOnly cookie

**⚠️ Architecture concern:** Challenges stored in in-memory `Map()` — will not survive server restarts or scale horizontally. Comment acknowledges: "em produção, usar Redis".

**User type routing:** `/:userType` param accepts `investor`, `company_user`, `platform_admin`. Each resolves to the appropriate model for lookup.

**Service dependencies:** `WebAuthnService`, `Investor`, `Company`, `CompanyUser`, `PlatformAdmin`, `auth.js` (generateToken, generateRefreshToken, setRefreshCookie)

---

### 10. `contractController.js` (454L)

**Purpose:** Complete Soroban sale contract admin interface — the backend for the Contract Management Portal.

**Operations by severity:**

| Tier | Operation | Method | Notes |
|------|-----------|--------|-------|
| 🟢 Read | `list` | GET | All offers with Soroban contracts |
| 🟢 Read | `detail` | GET | On-chain offer + balance + version (parallel queries) |
| 🟢 Read | `buyerInfo` | GET | Buyer spent amount + freeze status |
| 🟢 Day-to-day | `pause` / `resume` | POST | Set contract active flag |
| 🟢 Day-to-day | `deposit` | POST | **2-TX chain**: authorize SAC → transfer tokens |
| 🟢 Day-to-day | `updatePrice` | POST | Change sell/buy price |
| 🟢 Day-to-day | `extendTtl` / `batchExtendTtl` | POST | TTL extension (capped at 20 concurrent) |
| ⚠️ Sensitive | `withdraw` | POST | Withdraw tokens from contract |
| ⚠️ Sensitive | `freeze` (buyer) | POST | Freeze/unfreeze specific buyer |
| 🔴 Destructive | `drain` | POST | Emergency drain (requires `X-Confirm: true`) |
| 🔴 Destructive | `proposeAdmin` / `acceptAdmin` | POST | Admin transfer |
| 🔴 Destructive | `upgrade` | POST | WASM upgrade (requires `X-Confirm: true` + 64-char hex hash) |

**All write ops flow through:** `SorobanSaleService.build*Xdr()` → `TransactionManager.submit()` → returns 202

**Service dependencies:** `SorobanSaleService`, `StellarService`, `TransactionManager`, `prisma`

---

### 11. `treasuryController.js` (41L)

**Purpose:** Read-only treasury balance endpoint.

**Key Methods:**
- `getBalances` — Loads treasury account from Stellar, returns balances

**Note:** Comment states "Treasury withdrawals are managed directly via Freighter" — this controller is intentionally minimal.

**Service dependencies:** `stellar.js` config (`getTreasuryKeypair`, `stellarServer`)

---

### 12. `notificationController.js` (81L)

**Purpose:** In-app notification management.

**Key Methods:**
- `getNotifications` — Paginated, type-inferred from JWT role
- `markAsRead` — Single notification
- `markAllAsRead` — All notifications for user

**Service dependencies:** `NotificationService`, `prisma`

---

### 13. `investmentMetricsController.js` (159L)

**Purpose:** Admin-only analytics dashboard data.

**Key Methods:**
- `getMetrics` — General metrics with optional offer/date filters
- `getStatistics` — Period-based statistics (requires start_date/end_date)
- `getPendingInvestments` — Queue of pending investments
- `getFundraisingProgress` — Per-offer fundraising status
- `getRevenueBreakdown` — Revenue analysis
- `getInvestorCohorts` — Investor cohort analysis

**Service dependencies:** `InvestmentMetricsService`

---

## Method Inventory

Total methods across all controllers: **~108**

| Category | Count | Examples |
|----------|-------|---------|
| CRUD / List | ~35 | getInvestors, getOffers, getTokens |
| Registration / Auth | ~16 | startRegistration, completeRegistration, loginInvestor |
| Blockchain Ops | ~22 | issueToken, deploySAC, freezeAccount, drain |
| Wallet / TX | ~12 | proposeWithdrawal, submitWithdrawal, createTransactionProposal |
| Payments / Metrics | ~10 | getPaymentHistory, getMetrics, getFeeLogs |
| Config / Admin | ~8 | getSystemConfig, updateSystemConfig, approveInvestor |
| Notifications | ~3 | getNotifications, markAsRead, markAllAsRead |
| Contract Mgmt | ~13 | pause, resume, deposit, updatePrice, upgrade |

---

## Service Call Map

```
Controller                    → Service(s) Called
─────────────────────────────────────────────────────
investorController            → Investor, Investment, Token, EmailService,
                                PasskeyWalletService, DepositRelayService,
                                WebAuthnService, prisma
investmentController          → SorobanSaleService, PasskeyWalletService,
                                ConfigService, Investment, Investor, Offer, Token
offerController               → Offer, OfferService, Token, Investment,
                                StellarService, IPFSService
companyController             → Company, CompanyUser, EmailService,
                                PasskeyWalletService, prisma
companyUserController         → CompanyUser, Company, EmailService,
                                PasskeyWalletService, prisma
platformAdminController       → PlatformAdmin, StellarService, EmailService, prisma
tokenController               → Token, StellarService, keyManager,
                                MultiSigTransactionService
walletController              → keyManager, StellarService, stellar.js config, prisma
webauthnController            → WebAuthnService, Investor, Company, CompanyUser,
                                PlatformAdmin, auth.js
contractController            → SorobanSaleService, StellarService,
                                TransactionManager, prisma
treasuryController            → stellar.js config
notificationController        → NotificationService, prisma
investmentMetricsController   → InvestmentMetricsService
```

---

## Auth & Role Matrix

| Controller | Required Role | Notes |
|-----------|--------------|-------|
| `investorController` | `investor` (most), public (registration) | Registration endpoints are public |
| `investmentController` | `investor` | Rate limited per investor |
| `offerController` | `company_user` (CRUD), `platform_admin` (review/issue/activate) | `activateCompanyOffer` requires `admin_verified` flag |
| `companyController` | `company_user` (profile), `platform_admin` (list/status), public (registration) | `approveCompanyDebug` ⚠️ no role check in code |
| `companyUserController` | `company_user` | Scoped to own company |
| `platformAdminController` | `platform_admin`, `super_admin` (create/role-change) | Role hierarchy enforced inline |
| `tokenController` | `platform_admin` | Company users see filtered token list |
| `walletController` | `platform_admin` | System wallet operations |
| `webauthnController` | Public (all endpoints) | Auth is the purpose, not the guard |
| `contractController` | `platform_admin` | Destructive ops need `X-Confirm` header |
| `treasuryController` | `platform_admin` | Read-only |
| `notificationController` | Any authenticated user | Type inferred from JWT |
| `investmentMetricsController` | `platform_admin` | Analytics only |

---

## Architecture Patterns

### 1. Three Registration Patterns
All 3 user types (investor, company, company_user) support:
- **Single-step** (modern): Email + passkey data → wallet creation → JWT in one call
- **Legacy 3-step**: Step1 (email) → Step2 (verify code) → Step3 (complete profile) → separate wallet creation

### 2. Multisig-Aware Responses
Controllers that trigger chain operations return `202 Accepted` with `status: 'pending_multisig'` when `keyManager.requiresMultisigApproval()` is true. This pattern appears in:
- `tokenController.issueToken`, `tokenController.deploySAC`, `tokenController.disableClawback`
- `offerController.issueTokenFromOffer`
- `walletController.createTransactionProposal`
- All `contractController` write operations (via `TransactionManager.submit`)

### 3. Post-Execution Hooks
`walletController.signAndSubmitProposal` runs async hooks after multisig TX execution:
- **SAC → Distribution chaining**: Completing a SAC deploy auto-queues token distribution
- **Distribution → Investment completion**: Completing distribution finalizes the investment record + sends email

### 4. Dual Response Format
`offerController.formatOfferForResponse` returns both `camelCase` and `snake_case` keys for every field — supporting frontend migration between naming conventions.

### 5. Contract Operation Tiers
`contractController` categorizes operations by risk level:
- 🟢 Day-to-day: pause, resume, deposit, price, TTL
- ⚠️ Sensitive: withdraw, freeze
- 🔴 Destructive: drain, admin transfer, upgrade (require `X-Confirm: true`)

### 6. Fee Logging at Purchase (not Settlement)
`investmentController.purchase` calculates and logs the fee to `feeLog` but doesn't deduct it on-chain. The fee is purely a database record.

---

## Dead Code & Issues

### 1. `approveCompanyDebug` (companyController.js)
**Severity: HIGH** — Debug endpoint that bypasses KYC verification. Should be behind `NODE_ENV !== 'production'` guard or removed entirely.

### 2. In-Memory Challenge Store (webauthnController.js)
**Severity: MEDIUM** — `const challenges = new Map()` will not survive restarts or scale. Redis migration noted in comment but not implemented.

### 3. In-Memory Rate Limiter (investmentController.js)
**Severity: LOW** — `const txSubmissions = new Map()` for rate limiting. Same horizontality concern but less critical for MVP.

### 4. Duplicate Registration Logic
**Severity: LOW (tech debt)** — `companyController` and `companyUserController` both implement nearly identical registration flows (single-step + legacy 3-step). Should be extracted to a shared registration service.

### 5. Fee Collection Gap
**Severity: HIGH (business)** — Fees are logged to `feeLog` at purchase time but there is **no on-chain fee transfer mechanism** visible in the controllers. The fee is a database record only — no actual USDC is collected for the platform.

### 6. Inconsistent Controller Styles
**Severity: LOW** — Three different export patterns used: class static methods, named function exports, object literal. No impact on functionality but inconsistent codebase.

### 7. `treasuryController.getBalances` uses `getTreasuryKeypair()`
**Severity: LOW** — This imports the full keypair (including secret key) but only uses `.publicKey()`. Should use `keyManager.getPublicKey('TREASURY')` for consistency.

---

## Findings & Recommendations

### Critical Gaps for MVP
1. **Fee collection is database-only** — No on-chain mechanism to split/transfer platform fees
2. **Debug approval endpoint in production** — `approveCompanyDebug` needs guard
3. **WebAuthn challenges need Redis** — Required before horizontal scaling

### Positive Architecture
1. **Clean separation** — Controllers are thin wrappers around services, with minimal business logic
2. **Consistent error handling** — All controllers use try/catch with scoped logging
3. **Multisig-aware throughout** — The `202 + pending_multisig` pattern is well-established
4. **Post-execution hooks** — Elegant async chaining for multi-step operations
5. **Contract management portal** — Complete admin interface with proper severity tiers
