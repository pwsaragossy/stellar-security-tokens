# 02 — Feature Matrix

> Complete feature inventory with implementation status
> Generated: 2026-03-10 · Updated: 2026-04-29

---

## Legend
- ✅ Implemented and wired end-to-end
- 🟡 Partially implemented (backend exists, frontend incomplete or vice versa)
- ❌ Not implemented / stub only
- 🔴 Critical gap

---

## Authentication & Identity

| Feature | Backend | Frontend | Smart Contract | Status |
|---------|---------|----------|---------------|--------|
| Passkey registration (investor) | ✅ investorRoutes | ✅ Register + usePasskey | ✅ Smart wallet deploy | ✅ |
| Passkey registration (company) | ✅ companyRoutes | ✅ CompanyRegister | ✅ Smart wallet deploy | ✅ |
| Discoverable passkey login | ✅ authRoutes | ✅ Login + PasskeyClient | — | ✅ |
| Email-first registration flow | ✅ 3-step flow | ✅ Register page | — | ✅ |
| JWT + refresh tokens | ✅ httpOnly cookies | ✅ client.ts auto-refresh | — | ✅ |
| Freighter login (admin) | ✅ platformAdminRoutes | ✅ `useFreighter` hook (~~FreighterConnect~~ component **deleted** — pages use hook directly) | — | ✅ |
| Admin passkey login | ✅ platformAdminRoutes | ✅ AdminLogin | — | ✅ |
| Multi-device passkeys | 🔴 Routes removed | 🔴 Hooks removed | — | 🔴 REMOVED — backend used wrong auth key, needs frontend-initiated flow |
| Ledger recovery signers | 🔴 Routes removed | 🔴 LedgerConnect orphaned | — | 🔴 REMOVED — same auth issue |
| Legacy password login | ❌ ~~Dead code in auth.ts~~ | ❌ ~~Dead code in authApi~~ | — | `auth.ts` **DELETED** (commit 696f300); `api/auth.ts` also deleted |

## Investor Portal

| Feature | Backend | Frontend | Status |
|---------|---------|----------|--------|
| Marketplace (browse offers) | ✅ offerRoutes /active | ✅ Marketplace page | ✅ |
| Offer detail view | ✅ offerRoutes /:id | ✅ OfferDetails page | ✅ |
| Investment purchase (Soroban) | ✅ investmentRoutes /purchase | ✅ InvestmentDialog | ✅ |
| Portfolio view | ✅ investorRoutes /portfolio | ✅ Portfolio page | ✅ |
| Transaction history | ✅ investorRoutes /investments | ✅ Transactions page | ✅ |
| Wallet balance | ✅ PasskeyWalletService | ✅ Wallet + useWalletBalance | ✅ |
| USDC deposit (relay) | ✅ DepositRelayService | ✅ DepositDialog/Tracker | ✅ |
| USDC withdrawal | ✅ investorRoutes /withdraw | ✅ Wallet page | ✅ |
| BRL → TESOURO on-ramp (EtherFuse PIX) | ✅ rampRoutes + RampOrderService + webhooks | ✅ DepositDialog `PixPanel` | ✅ |
| TESOURO/USDC → BRL off-ramp (Anchor + two-TX relayer bridge) | ✅ RampOfframpService + 5 endpoints, behind `ENABLE_OFFRAMP` (default off until relayer trustlines verified) | ✅ WithdrawDialog `PixOfframpPanel` | 🟡 v1 — needs relayer trustline setup before mainnet (see OFFRAMP_RUNBOOK) |
| Fee schedule display | ✅ investmentRoutes /fee-schedule | ✅ useInvestmentFees | ✅ |
| Notifications | ✅ notificationRoutes | ✅ NotificationBell | ✅ |
| Passkey settings | ✅ securityRoutes | ✅ Settings page | ✅ |

## Company Portal

| Feature | Backend | Frontend | Status |
|---------|---------|----------|--------|
| Company dashboard | 🟡 No dedicated endpoint | ✅ Dashboard page | 🟡 Uses multiple endpoints |
| Offer creation (with files) | ✅ offerRoutes POST + multer | ✅ CreateOffer + SelectOfferType | ✅ |
| Offer management | ✅ CRUD in offerRoutes | ✅ Offers + OfferDetails | ✅ |
| Company offer activation | ✅ offerRoutes /activate | ✅ OfferDetails page | ✅ |
| Cap table (investors list) | ✅ offerRoutes /investors | ✅ OfferDetails page | ✅ |
| Dividend / Interest payments | ✅ companyPaymentRoutes | ✅ PayInvestors page | ✅ |
| Batched yield (Soroban YieldDistributor) | ✅ YieldDistributorService (multi-batch, retry, reconciler) | ✅ PayInvestors (seq. signing, partial failure UI) | ✅ |
| Bullet (maturity) payments — Soroban Settlement ⭐ | ✅ SorobanSettlementService + companyPaymentRoutes (prepare-deposit, submit-deposit, settlement-status) | ✅ PayInvestors maturity flow | ✅ |
| Payment history | ✅ companyPaymentRoutes /history | ✅ PayInvestors page | ✅ |
| Penalties tracking | ✅ companyPaymentRoutes /penalties | ✅ PayInvestors page | ✅ |
| Company wallet | ✅ companytRoutes /wallet-status | ✅ Wallet page | ✅ |
| Company withdrawal | ✅ companyRoutes /withdraw | ✅ Wallet page | ✅ |
| IPFS document info | ✅ IPFSService.uploadFile | ✅ IPFSInfo page | ✅ |
| Legal documents | ✅ Stored on upload | ✅ Documents page | ✅ |
| Company reports | 🟡 Limited endpoints | ✅ Reports page | 🟡 |

## Admin Portal

| Feature | Backend | Frontend | Status |
|---------|---------|----------|--------|
| Admin dashboard + metrics | ✅ InvestmentMetricsService (6 endpoints) | ✅ Dashboard page | ✅ |
| Investor KYC approval | ✅ PlatformAdminController + auto-whitelist | ✅ UserManagement | ✅ |
| Investor KYC rejection | ✅ + email notification | ✅ UserManagement | ✅ |
| Company approval/rejection | ✅ platformAdminRoutes + email | ✅ Companies page | ✅ |
| Offer review workflow | ✅ offerRoutes /review | ✅ AdminOffers page | ✅ |
| Token issuance | ✅ StellarService.issueSecurityToken | ✅ AdminOffers | ✅ |
| SAC deployment | ✅ StellarService.deploySACForAsset | ✅ AdminOffers | ✅ |
| Offer activation (Soroban deploy) | ✅ Full chain via multisig | ✅ AdminOffers | ✅ |
| Multisig TX queue | ✅ adminTransactionRoutes | ✅ Approvals page | ✅ |
| System wallet management | ✅ walletRoutes | ✅ Wallets page | ✅ |
| Token compliance (freeze/clawback) | ✅ tokenRoutes | ✅ AssetCompliance | ✅ |
| Emergency controls | ✅ contractRoutes (pause, drain) | ✅ EmergencyControls | ✅ |
| Soroban contract management | ✅ contractRoutes (full CRUD) | ✅ Contracts page | ✅ |
| Fee configuration | ✅ platformAdminRoutes /system-config | ✅ FeeConfig page | ✅ |
| Fee log viewing | ✅ platformAdminRoutes /fee-logs | ✅ FeeConfig page | ✅ |
| Default case management | ✅ CollateralDistributionService | ✅ DefaultCases page | ✅ |
| Wallet sponsorship (XLM) | ✅ platformAdminRoutes /sponsor | ✅ UserManagement | ✅ |
| Token unlock for DEX | ✅ platformAdminRoutes /unlock-token | ✅ AdminOffers | ✅ |
| Soroban dashboard | ✅ platformAdminRoutes /soroban/dashboard | 🟡 Contracts page (partial) | 🟡 |
| Admin CRUD | ✅ platformAdminRoutes | ✅ UserManagement | ✅ |

## Smart Contract

| Feature | Contract | Backend Integration | Status |
|---------|----------|-------------------|--------|
| Token sale (atomic trade) | ✅ `trade()` | ✅ SorobanSaleService | ✅ |
| Fixed fee collection (trade-time) | ✅ `fixed_fee` → treasury | ✅ Configurable per offer (`processingFee`) | ✅ |
| Pause/resume | ✅ `set_active()` | ✅ contractRoutes | ✅ |
| Price update | ✅ `updt_price()` | ✅ contractRoutes | ✅ |
| Admin withdrawal | ✅ `withdraw()` | ✅ contractRoutes | ✅ |
| Emergency drain | ✅ `emergency_drain()` | ✅ contractRoutes | ✅ |
| Buyer freeze/unfreeze | ✅ `freeze_buyer()` | ✅ contractRoutes | ✅ |
| Contract upgrade | ✅ `upgrade()` | ✅ contractRoutes | ✅ |
| TTL extension | ✅ `extend_ttl()` | ✅ MaintenanceService | ✅ |
| 2-step admin transfer | ✅ `propose/accept_admin()` | ✅ contractRoutes | ✅ |
| Per-buyer spending cap | ✅ `max_buy_per_buyer` | ✅ on create | ✅ |
| Minimum investment | ✅ `min_buy_amount` | ✅ on create | ✅ |
| Deadline enforcement | ✅ `deadline_ledger` | ✅ on create | ✅ |

## Infrastructure

| Feature | Status | Notes |
|---------|--------|-------|
| Docker Compose (dev) | ✅ | 4 services |
| Docker Compose (prod) | ✅ | 5 services + Caddy |
| Auto-HTTPS (Caddy) | ✅ | Let's Encrypt |
| SEP-1 stellar.toml | ✅ | Dynamic, DB-driven via TomlService |
| Database backups | ✅ | Daily pg_dump at 3 AM UTC |
| Sentry error monitoring | ✅ | Backend + Frontend |
| Health + readiness probes | ✅ | /health + /ready (DB + Redis) |
| Rate limiting (4 tiers) | ✅ | auth=5, api=30, strict=10, global=100 |
| Graceful shutdown | ✅ | SIGTERM/SIGINT handlers |
| Operations Wallet Monitor ⭐ | ✅ | WalletMonitorService — 5-min Horizon poll, warn/critical email alerts via ADMIN_ALERT_EMAIL |

## 🔴 Critical Gaps

| Gap | Impact | Where |
|-----|--------|-------|
| ~~**In-memory WebAuthn challenges**~~ | ~~Won't scale horizontally, lost on restart~~ — **RESOLVED**: all stores migrated to Redis with TTL (webauthnController, authRoutes, platformAdminRoutes) | ~~authRoutes, platformAdminRoutes~~ |
| **Duplicate API clients** | Maintenance burden, potential behavior divergence | `api/client.ts` (Axios) + `lib/api.ts` (fetch) |
| **Type mismatch** | Runtime bugs from snake_case types vs camelCase responses | `types/index.ts` |
| **platformAdminRoutes mega-file** | 2,067L with inline handlers, duplicated code | routes layer |

> **Note (2026-04-28):** The "Fee collection not on-chain" gap listed in earlier versions of this
> document has been **resolved**. Platform fees are now collected on-chain through two channels:
> 1. **Trade-time:** `fixed_fee` deducted atomically in Soroban `trade()` → treasury (contract v6, `lib.rs:203-219`)
> 2. **Yield distribution:** Spread (`annualInterestRate − investorRate`) collected via `Operation.payment` (classic path) or `distribute()` `fee_amount` (Soroban YieldDistributor path)
>
> `feeLog.create` in the DB is a **receipt** for admin reporting, not the collection mechanism.
