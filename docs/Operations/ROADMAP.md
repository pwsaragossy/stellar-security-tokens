# Radox — Production Roadmap

> Last updated: 2026-03-15
> Status: Pre-production hardening

---

## Phase 1 — Fix the Money (Week 1)

- [ ] When fees are enabled: log on-chain fee events to `FeeLog` via `SorobanEventIndexer` for dashboard reporting

---

## Phase 1.5 — Bullet Maturity (Week 1)

- [ ] **Reconciliation results UI** — display discrepancies table in admin detail panel
- [ ] **Persistent batch_pending status** — show "waiting for admin" on PayInvestors if batches exist in pending state

> [!CAUTION]
> **Trading Market Lockout**: Do NOT unlock tokens for secondary trading before maturity date.
> If tokens are unlocked and traded, the maturity clawback will fail because holder balances
> won't match the original investment records. This is a known constraint — when a secondary
> market is implemented, maturity payout must account for current on-chain balances at clawback
> time, not the original investment amounts.

---

---

## Phase 3 — Delete Dead Weight (Week 2)

> Checklist source: `04_dead_code.md`

- [ ] Delete `frontend/src/lib/api/auth.ts` (legacy password login)
- [ ] Delete `TransactionManagerService` (superseded by Soroban)
- [ ] Remove password fields from `types/index.ts`
- [ ] Consolidate API clients: kill `lib/api.ts`, migrate `passkey.ts` to use Axios client
- [ ] Sweep remaining dead code from `04_dead_code.md`
- [ ] **DRY audit** — find and consolidate duplicated constants, magic numbers, and repeated logic across backend/frontend (e.g. fee defaults were hardcoded in 3 files)

---

## Phase 4 — Break Up the Monster (Week 2)

> `platformAdminRoutes.js` = 1,877 lines with inline handlers

- [ ] Extract `adminSponsorRoutes.js` (eliminate ~300L duplication)
- [ ] Extract `adminDefaultsRoutes.js`
- [ ] Extract `adminSorobanRoutes.js`
- [ ] Move all inline handlers to `PlatformAdminController`
- [ ] Reference: `routes_layer.md`

---

## Phase 5 — Passkey Recovery (Week 3)

> Motivated by real incident: user lost access to Windows-encrypted passkey wallet with $150 in crypto.

### Tier 2 — Recovery Key (Coinbase Model)
- [ ] **Post-registration "Create Recovery Key" screen** — generate a recovery phrase while user has access; user stores offline
- [ ] **Recovery flow** — recovery phrase registers a new passkey signer on the Stellar smart contract
- [ ] Store recovery key hash in DB (not the key itself) to verify recovery attempts

### Tier 3 — Server-Assisted Recovery (Future)
- [ ] Email + identity verification → admin-assisted new passkey registration
- [ ] Social recovery — trusted contacts approve new signer on smart contract
- [ ] MPC key-splitting — server holds recovery share

---

## Phase 6 — Bible as MCP Server (Week 3+)

- [ ] Expose Project Bible as MCP context source
- [ ] Priority docs for MCP: `01_call_graph.md`, `02_feature_matrix.md`, `05_config_env_map.md`, `06_security_audit.md`
- [ ] Every future AI session starts with deep understanding instead of grep

---

## Backlog — Untested / Unverified

### SAC Edge Case
- [ ] **SAC reuse on re-issued asset codes** — `deploySACForAsset` throws `Error(Storage, ExistingValue)` when SAC already exists. Fix: swap to `ensureSACDeployed` in `reviewOffer()`.

### Contract Management Actions (Admin → Contracts)
> These buttons exist in the UI but have **never been end-to-end tested** with real contract state.

- [ ] **Pause** — pause a sale contract
- [ ] **Resume** — unpause a paused sale contract
- [ ] **Deposit** — deposit sell tokens into contract
- [ ] **Price** — update token price on active contract
- [ ] **Extend TTL** — extend Soroban contract time-to-live
- [ ] **Withdraw** — withdraw unsold tokens from contract
- [ ] **Freeze** — freeze investor account (compliance)
- [ ] **Emergency Drain** — drain all funds from contract (emergency)

---

## Post-Launch — Deferred from PR #3

> These items were scoped in PR #3 but are not needed for MVP. Each has a clear trigger for when to build.

### Domain Alert Triggers
> **Build when:** Active sales with real trade volume exist.

The alert plumbing is complete (`AlertService`, `AlertRouter` → Slack/PagerDuty/DB), but no domain events fire alerts yet.

- [ ] **Sell tokens low** — fire when contract sell-token balance < 10% of total supply
  - Wire into `SorobanEventIndexer` trade event handler
- [ ] **Large trade detected** — flag single trades > 5% of token supply
  - Wire into `SorobanEventIndexer` trade event handler
- [ ] **Contract paused > 24h** — cron check in `MaintenanceService`
  - Add status check alongside TTL sweep

### Batch TTL UI
> **Build when:** 20+ contracts make auto-maintenance insufficient.

Backend route exists (`POST /contracts/batch/ttl` → `ContractController.batchExtendTtl`). Frontend missing.

- [ ] Checkbox column in Contracts list
- [ ] Floating action bar: "Extend TTL (N selected)"

### Audit Trail
> **Build when:** Second admin is added, or regulatory audit requires action history.

- [ ] `contract_audit_log` table in Prisma schema: `{ offerId, action, actor, details, timestamp }`
- [ ] `AuditService.log()` called on every contract route (pause, resume, drain, price update, etc.)
- [ ] Scrollable log section in `ContractDetail.tsx`

### Fee UX (Investor-Facing)
> **Build now:** Hide fee breakdown from investor payment history. Show only net amount received.

- [ ] Remove `platformFeeAmount` column from investor payment history UI
- [ ] Payment notification shows: "Payment received: R$ 980.00 (net of 2% platform service fee)"
- [ ] Admin panel retains full fee visibility (grossAmount, netAmount, platformFeeAmount)

### Loyalty Points Program 🎯
> **Build when:** Post-MVP, when investor retention becomes a priority.

Turn platform fees into loyalty points. Instead of "we took $40," the investor sees "you earned 40 Radox Points." Reframes the fee as a reward mechanism.

- [ ] Points model: 1 point = $1 of platform fees paid
- [ ] Investor dashboard: points balance + tier (Bronze/Silver/Gold)
- [ ] Tier benefits: fee discounts, early access to new offers, priority support
- [ ] Points history: "Earned 40 pts from REALT1 payout (Mar 2026)"
- [ ] Consider: on-chain points as a Stellar asset (composability, transferability)

---

## Strategic Principle

> The platform is **feature-complete**. The gap isn't features — it's:
> 1. **Operational resilience** (Redis challenges, TX retry queue)
> 2. **Code hygiene** (dead code, mega-files)
>
> These separate "works in demo" from "works in production with real money."
> **No new features until the foundation is solid.**
