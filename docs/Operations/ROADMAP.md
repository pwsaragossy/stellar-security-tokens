# Radox — Production Roadmap

> Last updated: 2026-03-31
> Status: Pre-production hardening — feature-complete, hardening E2E test suite

---

## Phase 1 — Fix the Money ✅ (Complete)

- [x] **Fixed Processing Fee** — $5 additive fee per trade via Soroban v6 contract
- [x] **Yield Spread Model** — `investorRate` vs `annualInterestRate`, spread → treasury
- [x] **FeeLog recording** — all fee events logged to `FeeLog` table via `companyPayment.service.js` and `multiSigTransaction.service.js`
- [x] **Admin fee dashboard** — `GET /fee-logs` endpoint + `investmentMetrics.service.js` revenue aggregation
- [ ] **SorobanEventIndexer → FeeLog** — wire on-chain trade fee events to FeeLog for redundancy (currently DB-only recording is sufficient)

---

## Phase 1.5 — Bullet Maturity ✅ (Complete — Soroban Settlement)

- [x] **Soroban MaturitySettlement contract** — atomic USDC distribution + token burn at maturity
- [x] **Settlement flow** — `prepare-deposit` → `submit-deposit` → `executeFullSettlement()`
- [x] **Multi-investor batching** — 49-investor cap per TX for periodic dividends (tested in `paymentBatching.test.js`)
- [x] **Legacy clawback pipeline purged** — `maturity_clawback` enum + `batch_pending` status + zombie defenses removed (Apr 2026)

> [!CAUTION]
> **Trading Market Lockout**: Do NOT unlock tokens for secondary trading before maturity date.
> If tokens are unlocked and traded, the settlement burn will target current on-chain holders,
> not the original investors. When a secondary market is implemented, maturity payout must
> account for current on-chain balances at settlement time.

---

## Phase 2 — RWA Asset Discoverability ✅ (Complete — 2026-03-31)

- [x] **SEP-1 compliant TOML** — `TomlService.js` maps IPFS docs to standard fields (`attestation_of_reserve`, `redemption_instructions`)
- [x] **Caddy routing** — `/.well-known/stellar.toml` served for `radox.net` and `dev.radox.net`
- [x] **E2E TOML validation** — `contractManagement.test.js` Layer 3 asserts SEP-1 fields + IPFS links
- [x] **TOML injection mitigation** — `tomlEscape()` sanitizes all user-supplied values
- [x] **Startup security guard** — `index.js` blocks `NODE_ENV=test` in production without `ALLOW_TEST_MODE=1`

---

## Phase 3 — Delete Dead Weight (Week 2)

> Checklist source: `04_dead_code.md`

- [x] Delete `frontend/src/lib/api/auth.ts` (legacy password login) — **DONE**
- [x] Delete `TransactionManagerService` (superseded by Soroban) — **DONE**
- [ ] Remove password fields from `types/index.ts` (lines 9, 183) — dead types, no functional impact
- [ ] Consolidate API clients: kill `lib/api.ts`, migrate `passkey.ts` to use Axios client
- [ ] Sweep remaining dead code from `04_dead_code.md`
- [ ] **DRY audit** — find and consolidate duplicated constants, magic numbers, and repeated logic across backend/frontend

---

## Phase 4 — Break Up the Monster (Week 2)

> `platformAdminRoutes.js` = 1,902 lines with inline handlers

- [ ] Extract `adminSponsorRoutes.js` (eliminate ~300L duplication)
- [ ] Extract `adminDefaultsRoutes.js`
- [ ] Extract `adminSorobanRoutes.js`
- [x] Move core handlers to `PlatformAdminController` — **DONE** (209+ lines extracted)
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

## Backlog — Verified / Resolved

### SAC Edge Case ✅
- [x] **SAC reuse on re-issued asset codes** — `ensureSACDeployed()` implemented in `stellar.service.js:601`, handles `ExistingValue` gracefully

### Contract Management Actions ✅
> All 8 Soroban admin actions + 5 Classic token actions E2E tested in `contractManagement.test.js`

- [x] **Pause** — pause a sale contract
- [x] **Resume** — unpause a paused sale contract
- [x] **Deposit** — deposit sell tokens into contract
- [x] **Price** — update token price on active contract
- [x] **Extend TTL** — extend Soroban contract time-to-live
- [x] **Withdraw** — withdraw unsold tokens from contract
- [x] **Freeze** — freeze investor account (compliance)
- [x] **Emergency Drain** — drain all funds from contract (emergency)

---

## E2E Test Coverage Summary (61 files, 3,537 E2E + ~4,200 unit/integration)

| Suite | Lines | Coverage |
|---|---|---|
| `tokenLifecycle.test.js` | 2,053 | 10 phases: setup → trade → dividends → maturity → multi-investor → defaults |
| `contractManagement.test.js` | 961 | 8 Soroban + 5 Classic actions + TOML/SEP-1 + validation |
| `paymentBatching.test.js` | 342 | 49-investor cap, split logic, fee recalc per batch |
| `hardeningE2E.test.js` | 196 | Reconciler, idempotency, race conditions |
| `sorobanSaleE2E.test.js` | 175 | Soroban sale contract setup + trade |
| `sorobanOnlySmoke.test.js` | 152 | Quick Soroban connectivity check |
| Integration (28 files) | ~2,200 | Auth, passkey, KYC, payments, compliance, investments, offers |
| Unit (33 files) | ~2,000 | Controllers, middleware, services, models |

---

## Multi-User Companies (Future — When Needed)

> **Build when:** A company needs more than one user (e.g., CFO + legal + operations).
> **Current state:** Endpoint `/company-users/register-passkey` is locked behind `requirePlatformAdmin` (Fix #4 security patch).

To activate multi-user company registration:

1. **New admin endpoint** — `POST /api/platform-admins/invite-company-user` (or company admin self-serve)
   - Accepts `{ companyId, email, role }`, validates company exists + is approved
   - Signs a JWT `{ companyId, email, role, type: 'company_invitation' }`, expires 7 days
   - Returns `{ invitationToken, invitationUrl }`
2. **Swap middleware** — in `companyUserRoutes.js`, replace `requirePlatformAdmin` with invitation token validation
   - Verify JWT signature, extract `companyId` from token (not from request body)
   - Compare email in token with email in request body
3. **New frontend page** — `CompanyUserRegister.tsx`
   - Reads `?invite=<JWT>` from URL
   - Shows company name + pre-filled email + passkey creation
4. **Email template** — `sendCompanyInvitation(email, companyName, inviteUrl)`

Reference: Security audit Fix #4 (Mar 2026), `companyUserRoutes.js` comments.

---

### Fee Model ✅ (Complete)

#### Change 1 — Fixed Processing Fee ✅ (2026-03-30)
- [x] Removed `feeBps` entirely from Soroban Offer struct
- [x] Added `fixed_fee: i128` field — flat $5 USDC per trade (50_000_000 stroops)
- [x] In `trade()`: fee is **additive** — investor pays `investment + fee`, company gets full `investment`
- [x] Added `processingFee` field to Prisma Offer model (Decimal, default 5.0)
- [x] Bumped `CONTRACT_VERSION` to 6 (v6 = additive fee model)
- [x] Built + deployed v6 WASM to testnet
- [x] E2E verified: 75/75 Rust, full lifecycle E2E

#### Change 2 — Yield Spread ✅ (2026-03-30)
- [x] Added `investorRate` field to Prisma Offer schema + migration
- [x] Payout math: company pays at `annualInterestRate`, investor receives at `investorRate`, delta → treasury
- [x] Removed `DIVIDEND_FEE_PERCENT` constant + `ConfigService` import entirely
- [x] Spread-based fee in `createPaymentTransaction`, `processSignedPayment`, `_recordPayments`
- [x] Updated `multiSigTransaction.service.js` processEffects to use `spreadPct`
- [x] E2E verified with dual computation: 12% company / 10% investor → spread verified
- [x] Frontend: investor sees `investorRate` as "APY" in Portfolio, company sees spread in PayInvestors, admin sets spread at offer approval

#### Change 3 — Admin/AUM Fee (Deferred)
> **Build when:** $1M+ AUM and finer-grained fee control needed. Yield spread (Change 2) already
> captures platform revenue. AUM fee adds complexity without clear MVP value.

- [ ] Add `adminFeePercent` field to Offer schema (default 1.0%)
- [ ] New `adminFee.service.js` — monthly cron charges `AUM × adminFeePercent / 12`
- [ ] Company wallet → treasury, automated USDC transfer
- [ ] FeeLog category: `ADMINISTRATION`
- [ ] Insufficient balance handling: grace period → auto-pause offer

#### Change 4 — Network Fee ✅ (Merged with Change 1)
- [x] Decision: $5 processing fee covers everything (processing + network). No separate fee needed.

#### Change 5 — Late/Default Fee Enablement
> **Status:** Zero for MVP. Rates stay at `0` until legal framework + business decision.

Infrastructure is **already built** in `companyPayment.service.js:22-26`:
- `LATE_FEE_PERCENT_PER_DAY = 0` — calculates `amount × 0 = $0`
- `DEFAULT_FEE_PERCENT = 0` — calculates `amount × 0 = $0`
- `GRACE_PERIOD_DAYS = 10` — cron auto-escalates `due → overdue → defaulted`
- Default state machine E2E tested in `tokenLifecycle.test.js` Phase 6

**Build when:** Legal counsel confirms late fee + default penalty terms are enforceable under Brazilian law.
- [ ] Legal review: confirm terms are enforceable under CVM regulations
- [ ] Set `LATE_FEE_PERCENT_PER_DAY` to agreed rate
- [ ] Set `DEFAULT_FEE_PERCENT` to agreed rate
- [ ] Update investor + company terms of service
- [ ] Add fee disclosure to offer prospectus documents
- [ ] Add E2E assertions for non-zero fee amounts

#### Unlocked Token Balance E2E
> **Status:** Deferred. Tokens are locked for MVP — no secondary trading.

The `isTokenLocked: false` code path uses `listAssetHolders()` (on-chain balances) instead of DB investment records. This path is untested in E2E.

**Build when:** DEX/secondary trading is enabled (tokens unlocked for market trading).
- [ ] Simulate DEX trades in test setup
- [ ] Verify `calculateBulletPayment` uses on-chain balances when unlocked
- [ ] Verify `calculateOwedAmount` uses on-chain balances when unlocked
- [ ] Verify collateral distribution uses on-chain proportions
- [ ] See also: Trading Market Lockout caution in Phase 1.5

#### v6 — On-Chain Distribution Contract (Future)
> **Build when:** Post-MVP, when investor trust and regulatory audit trail are priorities.

Hybrid architecture: backend computes yield math, contract validates and executes atomically.

```
Company deposits USDC → Distribution Contract
Backend submits plan [(investor_A, 50), (investor_B, 30)]
Contract validates: sum(payouts) + fee ≤ deposited
Contract executes: USDC → each investor, fee → treasury, clawback tokens
```

- [ ] New Soroban contract: `token_distribution` (generalized version of MaturitySettlement)
  - `deposit(company, amount)` — company sends USDC to contract
  - `distribute(admin, plan[])` — backend submits the split, contract validates + executes
  - `settle_and_close(admin)` — maturity settlement (partially implemented via MaturitySettlement contract)
- [ ] Backend: adapt `companyPayment.service.js` to submit distribution plan to contract
- [ ] E2E: verify atomic payout + burn via contract
- [ ] Subsumes Changes 2-3 by enforcing fee split on-chain

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
