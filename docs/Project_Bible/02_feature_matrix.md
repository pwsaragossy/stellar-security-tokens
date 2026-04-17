# 02 — Feature Matrix

> Complete feature inventory with implementation status
> Generated: 2026-03-10

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
| Freighter login (admin) | ✅ platformAdminRoutes | ✅ FreighterConnect | — | ✅ |
| Admin passkey login | ✅ platformAdminRoutes | ✅ AdminLogin | — | ✅ |
| Multi-device passkeys | 🔴 Routes removed | 🔴 Hooks removed | — | 🔴 REMOVED — backend used wrong auth key, needs frontend-initiated flow |
| Ledger recovery signers | 🔴 Routes removed | 🔴 LedgerConnect orphaned | — | 🔴 REMOVED — same auth issue |
| Legacy password login | ❌ Dead code in auth.ts | ❌ Dead code in authApi | — | Dead code |

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
| Bullet (maturity) payments | ✅ CompanyPaymentService | ✅ PayInvestors page | ✅ |
| Payment history | ✅ companyPaymentRoutes /history | ✅ PayInvestors page | ✅ |
| Penalties tracking | ✅ companyPaymentRoutes /penalties | ✅ PayInvestors page | ✅ |
| Company wallet | ✅ companytRoutes /wallet-status | ✅ Wallet page | ✅ |
| Company withdrawal | ✅ companyRoutes /withdraw | ✅ Wallet page | ✅ |
| IPFS document info | ✅ PinataService | ✅ IPFSInfo page | ✅ |
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
| Token issuance | ✅ StellarService.issueToken | ✅ AdminOffers | ✅ |
| SAC deployment | ✅ StellarService.deploySAC | ✅ AdminOffers | ✅ |
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

## 🔴 Critical Gaps

| Gap | Impact | Where |
|-----|--------|-------|
| **Fee collection not on-chain** | Platform fees are logged in DB (`feeLog`) but never collected on-chain | FeeService → only `prisma.feeLog.create` |
| **In-memory WebAuthn challenges** | Won't scale horizontally, lost on restart | authRoutes, platformAdminRoutes |
| **Duplicate API clients** | Maintenance burden, potential behavior divergence | `api/client.ts` (Axios) + `lib/api.ts` (fetch) |
| **Type mismatch** | Runtime bugs from snake_case types vs camelCase responses | `types/index.ts` |
| **platformAdminRoutes mega-file** | 1,877L with inline handlers, duplicated code | routes layer |
