# Radox — Production Roadmap

> Last updated: 2026-03-10
> Status: Pre-production hardening + PR3 admin UI

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

## Phase 5 — PR3: Admin UI (Week 3-4)

> The admin portal needs a proper operations interface. These are the features that were scoped for PR3 but never landed.

### Offer Pipeline
- [ ] Kanban board: `pending → approved → issued → verified → active`
- [ ] Visual status for each offer with transition actions

### Pre-flight Checklist
- [ ] Before activation, verify: SAC deployed, tokens deposited, sale contract linked
- [ ] Activate button only enables when all checks are ✅

### One-Click Activation
- [ ] Single click → 4 automatic steps with progress bar
- [ ] Retry from any failed step

### Contract Health Dashboard
- [ ] Card per contract: balance, sold, revenue, buyers, TTL countdown, version
- [ ] Real-time data from Soroban RPC

### Alerts
- [ ] TTL expiring soon
- [ ] Sell tokens running low
- [ ] Large trade detected
- [ ] Contract paused > 24h

### Batch Operations
- [ ] Select multiple contracts → extend TTL in one action

### Audit Trail
- [ ] Who did what, when (admin action log)

### Multisig Badge
- [ ] Badge in menu showing pending signature operations

### Edge Cases
- [ ] **SAC reuse on re-issued asset codes** — When an offer uses an asset code whose SAC already exists on-chain (e.g. re-issuing after a failed/cancelled offer), `deploySACForAsset` throws `Error(Storage, ExistingValue)`. Fix: swap to `ensureSACDeployed` in `reviewOffer()` auto-issue, which checks on-chain first and skips deploy if SAC exists, then chains sale_deploy directly.

---

## Phase 6 — Bible as MCP Server (Week 3+)

- [ ] Expose Project Bible as MCP context source
- [ ] Priority docs for MCP: `01_call_graph.md`, `02_feature_matrix.md`, `05_config_env_map.md`, `06_security_audit.md`
- [ ] Every future AI session starts with deep understanding instead of grep

---

## Strategic Principle

> The platform is **feature-complete**. The gap isn't features — it's:
> 1. **Revenue collection** (fees)
> 2. **Operational resilience** (Redis challenges, TX retry queue)
> 3. **Code hygiene** (dead code, mega-files)
>
> These separate "works in demo" from "works in production with real money."
> **No new features until the foundation is solid.**
