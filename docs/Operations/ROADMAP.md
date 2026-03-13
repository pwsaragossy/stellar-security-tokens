# Radox — Production Roadmap

> Last updated: 2026-03-13
> Status: Pre-production hardening

---

## Phase 1 — Fix the Money (Week 1)

> [!CAUTION]
> Revenue is being lost on every trade. Fees are logged but never collected on-chain.

- [ ] **On-chain fee collection** in `trade()` contract function
  - Option A: Fee split in `trade()` — atomic, USDC goes to treasury AND platform in one TX ⭐ preferred
  - Option B: Post-trade fee sweep via `SorobanEventIndexer` — easier to ship, less atomic
  - Reference: `02_feature_matrix.md` → Fee Collection row, `smart_contract_layer.md`

---

## Phase 2 — Kill Ticking Time Bombs (Week 1)

- [ ] **WebAuthn challenges → Redis** — in-memory store breaks on server restart. ~30min fix.
  - Reference: `06_security_audit.md`, `07_error_recovery.md`
- [ ] **Fix `log` redeclaration in `platformAdminRoutes.js`** — crashes entire admin panel on first call
  - Reference: `routes_layer.md`
- [ ] **Fix validator ordering in `investmentRoutes.js`** — validators must run before auth, not after
  - Reference: `routes_layer.md`
- [ ] **Improve passkey registration UX** — simplify the onboarding flow, reduce information overload on the passkey creation step

---

## Phase 3 — Delete Dead Weight (Week 2)

> Checklist source: `04_dead_code.md`

- [ ] Delete `frontend/src/lib/api/auth.ts` (legacy password login)
- [ ] Delete `TransactionManagerService` (superseded by Soroban)
- [ ] Remove password fields from `types/index.ts`
- [ ] Consolidate API clients: kill `lib/api.ts`, migrate `passkey.ts` to use Axios client
- [ ] Sweep remaining dead code from `04_dead_code.md`

---

## Phase 4 — Break Up the Monster (Week 2)

> `platformAdminRoutes.js` = 1,877 lines with inline handlers

- [ ] Extract `adminSponsorRoutes.js` (eliminate ~300L duplication)
- [ ] Extract `adminDefaultsRoutes.js`
- [ ] Extract `adminSorobanRoutes.js`
- [ ] Move all inline handlers to `PlatformAdminController`
- [ ] Reference: `routes_layer.md`

---

## ~~Phase 5 — PR3: Admin UI~~ ✅ Resolved (2026-03-13)

> PR #3 was analyzed against the current codebase. Most items were built organically or superseded.

### ✅ Completed / Superseded
- ~~Offer Pipeline~~ → `Approvals.tsx` unified queue with filter chips + `AdminOffers.tsx` pipeline
- ~~Pre-flight Checklist~~ → `reviewOffer()` auto-issue chain validates SAC/tokens/contract
- ~~One-Click Activation~~ → Inline signing flow in Approvals Hub with stepped progress
- ~~Contract Health Dashboard~~ → `Contracts` page with per-contract cards + on-chain data
- ~~Multisig Badge~~ → **Superseded by Approvals Hub** (993L unified approval queue with real-time counts, Freighter signing, filter chips across 5 domains)
- ~~TTL expiring alert~~ → `MaintenanceService` auto-extends at startup + daily 3 AM cron

### Edge Cases (still open)
- [ ] **SAC reuse on re-issued asset codes** — `deploySACForAsset` throws `Error(Storage, ExistingValue)` when SAC already exists. Fix: swap to `ensureSACDeployed` in `reviewOffer()`.

### Deferred → moved to Post-Launch below

---

## Phase 6 — Bible as MCP Server (Week 3+)

- [ ] Expose Project Bible as MCP context source
- [ ] Priority docs for MCP: `01_call_graph.md`, `02_feature_matrix.md`, `05_config_env_map.md`, `06_security_audit.md`
- [ ] Every future AI session starts with deep understanding instead of grep

---

## Backlog — Untested / Unverified

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

---

## Strategic Principle

> The platform is **feature-complete**. The gap isn't features — it's:
> 1. **Revenue collection** (fees)
> 2. **Operational resilience** (Redis challenges, TX retry queue)
> 3. **Code hygiene** (dead code, mega-files)
>
> These separate "works in demo" from "works in production with real money."
> **No new features until the foundation is solid.**
