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

### Fee Model Redesign
> **Principle:** Company is the customer. Investor's yield is sacred. Platform earns via spread.

#### Change 1 — Fixed Processing Fee ✅ (2026-03-30)
- [x] Removed `feeBps` entirely from Soroban Offer struct
- [x] Added `fixed_fee: i128` field — flat $5 USDC per trade (50_000_000 stroops)
- [x] In `trade()`: deduct `fixed_fee` → treasury, remainder → company
- [x] Added `processingFee` field to Prisma Offer model (Decimal, default 5.0)
- [x] Bumped `CONTRACT_VERSION` to 5, added `InsufficientForFee` error
- [x] Built + deployed v5 WASM to testnet: `13e1d732...1fb874`
- [x] E2E verified: 75/75 Rust, 38/38 E2E lifecycle
- [x] Updated Project Bible `smart_contract_layer.md`

#### Change 2 — Yield Spread ✅ (2026-03-30)
- [x] Added `investorRate` field to Prisma Offer schema + migration
- [x] Payout math: company pays at `annualInterestRate`, investor receives at `investorRate`, delta → treasury
- [x] Removed `DIVIDEND_FEE_PERCENT` constant + `ConfigService` import entirely
- [x] Spread-based fee in `createPaymentTransaction`, `processSignedPayment`, `_recordPayments`
- [x] Updated `multiSigTransaction.service.js` processEffects to use `spreadPct`
- [x] E2E verified with dual computation: 12% company / 10% investor → $0.16 spread on $100 over 29 days
- [x] 42/42 E2E assertions pass
- [ ] Frontend: investor sees `investorRate` as "APY", company sees `annualInterestRate` as "Cost of Capital"

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
- Frontend overdue warning updated to soft language (no fake rates) — Mar 2026

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

- [ ] New Soroban contract: `token_distribution`
  - `deposit(company, amount)` — company sends USDC to contract
  - `distribute(admin, plan[])` — backend submits the split, contract validates + executes
  - `clawback_and_close(admin)` — maturity settlement
- [ ] Backend: adapt `companyPayment.service.js` to submit distribution plan to contract
- [ ] E2E: verify atomic payout + clawback via contract
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

### Fee UX (Investor-Facing)
> **Build with** Change 2 (yield spread). Once spread model is live, investor never sees a "fee."

- [ ] Investor payment history shows net amount only (= `investorRate` yield, no deductions)
- [ ] Admin panel retains full visibility: `companyRate`, `investorRate`, `spread`, `treasuryAmount`
- [ ] Payment notification: "Payment received: R$ 800.00 — 8.0% APY on your R$ 10,000 investment"

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
