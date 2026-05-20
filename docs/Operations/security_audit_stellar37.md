# Security Audit — Stellar 37º Class Methodology

> **Date**: 2026-05-20
> **Last updated**: 2026-05-20 (4 HIGH findings resolved — F-001, F-003, F-010, F-011)
> **Scope**: Radox platform (backend + frontend + Soroban contracts + infra)
> **Framework**: Caroline Cardoso's "Segurança em Produtos Financeiros" class (Sprint 3, 18-mai-2026) + `/cso` CSO audit skill
> **Baseline**: [docs/Project_Bible/06_security_audit.md](../Project_Bible/06_security_audit.md) (2026-03-10) — this audit refreshes it
> **Confidence gate**: ≥ 8/10 to publish as a formal finding
> **Read-only audit** — no code modified

---

## Disclaimer

> This is an **AI-assisted security scan, not a substitute for a professional audit**. LLMs miss subtle vulnerabilities, misunderstand complex auth flows, and produce false negatives. For a platform handling real custody — passkey-derived smart accounts, AES-encrypted relayer Gs, Soroban contracts moving USDC — engage a qualified security firm before mainnet exposure of user funds. Use this as a first pass and as ongoing improvement between professional audits, not as your only line of defense.

---

## 1. Architecture Summary (CSO Phase 0)

Radox is a **Stellar/Soroban-native security-token platform** with a Node.js/Express backend (Prisma + PostgreSQL + Redis), a React/Vite frontend, and three Rust Soroban contracts (`TokenSale`, `YieldDistributor`, `MaturitySettlement`). Authentication is passkey-only (WebAuthn) for investors and company users; platform admins additionally authenticate via Freighter (Stellar wallet extension). Fiat on/off-ramp is brokered through EtherFuse, with **per-investor classic Stellar G accounts** holding AES-256-GCM-encrypted private keys for off-ramp signing. The hot/cold separation is real: **Operations** key sponsors gas + builds sub-accounts (hot); **Issuer / Distributor / Treasury** keys are intended for Freighter/Ledger hardware-signing in production (cold), and gated through a **multisig flow** with cryptographic threshold verification. Caddy fronts everything with auto-HTTPS; Docker Secrets mount the Operations key into tmpfs.

The biggest trust boundaries:

1. **Browser → backend**: passkey signs, backend mints JWT, refreshes via httpOnly cookie.
2. **Backend → EtherFuse**: bearer-key signed outbound; HMAC-signed inbound webhook (verified canonical-JSON + timing-safe compare).
3. **Backend → Soroban**: builds + submits TX; admin ops go through `MultiSigTransaction` (signature collection in DB, threshold enforced on submit).
4. **Soroban ↔ external SACs**: USDC SAC + each offer's security-token SAC are stored in contract state at init — admin-provided, no on-chain registry check.

The attack surface is concentrated in: (a) admin endpoints that gate destructive ops (drain, freeze, clawback, pause), (b) per-investor relayer-G decryption windows, (c) the EtherFuse webhook lane, and (d) the **MaturitySettlement** contract, which is currently the most rigid and least testable of the three.

---

## 2. Attack Surface Census

### Endpoint classification (full inventory in [routes_layer.md](../Project_Bible/routes_layer.md))

| Class | Examples | Auth required | Rate limiter |
|---|---|---|---|
| **Public** | `/api/auth/config`, `/api/auth/passkey-login/discover`, `/api/companies/initiate-registration`, `/.well-known/stellar.toml` | None | `globalLimiter` (300/min/IP) + `authLimiter` (10/min/IP) on `/api/auth` ([app.js:213](backend/src/app.js:213)) |
| **Webhook** | `/api/webhooks/etherfuse` | HMAC-SHA256 | `globalLimiter` only |
| **Auth (investor/company)** | `/api/companies/profile`, `/api/companies/*/withdraw/propose` | JWT + role middleware | `globalLimiter` |
| **Admin** | `/api/companies/admin/*`, `/api/admin/contracts/*` (drain/freeze/pause), `/api/admin/transactions/*` | JWT + `requirePlatformAdmin` | `globalLimiter` + `strictLimiter` (60/min/IP) on critical routes ([app.js:243-247](backend/src/app.js:243)) |
| **Debug** | `/api/companies/debug/:id/approve` | **`NODE_ENV !== 'production'` only** | `globalLimiter` |

### Trust boundaries

1. **Investor passkey** authority for: sign their own SmartAccount ops, sign off-ramp authorization
2. **Company passkey** authority for: propose company withdrawals (still need multisig admin co-sign)
3. **Platform admin** authority for: pause/freeze/drain contract, approve/reject companies, freeze/unfreeze issuer; **all destructive ops require multisig** in production mode
4. **EtherFuse webhook** authority for: change ramp order state (KYC, deposit confirmation, payout status)
5. **Operations key** authority for: sponsor XLM/trustlines, build sub-accounts, sign deposit-relay TXs — never authorized for issuance, clawback, or treasury moves

---

## 3. Findings — Caroline's 7-Section Checklist

Findings use CSO format: `[SEVERITY] (confidence: N/10) [VERIFIED|UNVERIFIED] file:line — title` + exploit scenario + impact + recommendation. Findings below 8/10 confidence are in the Observations appendix.

---

### §1 Produtos (Business Rules, Custodial Model, Recovery)

#### F-001 ✅ RESOLVED 2026-05-20
**[HIGH] (confidence: 9/10) [VERIFIED] [backend/src/routes/companyRoutes.js:174-177](backend/src/routes/companyRoutes.js:174) — Debug "approve any company without auth" endpoint mounted on env-only guard**

**Resolution**: Route + handler removed. Seed/dev approval can be done via the existing admin endpoint with a seeded admin account.

```js
// Rota de debug para aprovar empresa sem autenticação (apenas em desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
  router.put('/debug/:id/approve', CompanyController.debugApproveCompany);
}
```

**Description**: The endpoint mounts conditionally on `NODE_ENV !== 'production'`. If `NODE_ENV` is unset, defaults to `''` (truthy-falsy on the `!== 'production'` check ⇒ **mounts**). Any deploy where `NODE_ENV` is misspelled (`NODE_END`), missing, or accidentally set to anything other than the literal string `production` (e.g. `Production`, `prod`, `development`) exposes a **public, unauthenticated, no-rate-limit-beyond-global** endpoint that flips a company to `approved` status.

**Exploit scenario**:
1. Attacker scans `api.radox.net` and discovers `/api/companies/debug/{id}/approve` returns 200 instead of 404.
2. Attacker enumerates company IDs (UUIDs are unguessable, but ID may be discoverable via investor browsing of public offer pages → company.id leaks in the API response payload).
3. Attacker `PUT`s `/api/companies/debug/{victim_company_id}/approve` — company is approved without admin review.
4. Approved company can now issue an offer, which onboarded investors see as platform-vetted.

**Impact**: Bypass of company KYB/legal review. Approved-but-unverified companies can issue tokenized securities to real investors. Reputational + regulatory exposure (CVM/VASP) far exceeds technical fix cost.

**Recommendation**: Delete the route entirely. Replace with a seed script that pre-approves a known dev company at boot, or a dev-CLI command. Defense in depth: even if kept, also require `requirePlatformAdmin` middleware *and* an explicit `X-Dev-Confirm: yes` header. The Bible flagged this in 2026-03 — it is **still present**.

---

#### F-002
**[MEDIUM] (confidence: 8/10) [VERIFIED] No documented dev-offboarding key-rotation playbook — Caroline §2 "Sem Processo de Revogação"**

**Description**: [docs/Operations/](docs/Operations/) contains a `CONTINGENCY_RUNBOOK.md`, `MAINNET_CHECKLIST.md`, `POST_MIGRATION_REMINDERS.md`, and `OFFRAMP_RUNBOOK.md` — but **no documented playbook** for what to do when a contractor with repo or operations-key access leaves the project. The class explicitly called this out: "controles internos frágeis ou inexistentes aumentam o risco de uso indevido e comprometimento."

**Exploit scenario**: Contractor leaves with access to the GitHub repo + a copy of the dev `.env`. Two weeks later they (or someone who breaches their personal devices) extract the Operations key from the dev environment. Even if the dev key never touches mainnet directly, it documents the file structure of the mainnet key and the runtime decryption flow — which short-cuts an mainnet attack.

**Impact**: Operational. Solo-founder context means today the surface is one person, but as contractors come and go this gap compounds.

**Recommendation**: Add `docs/Operations/KEY_ROTATION_RUNBOOK.md` covering: (a) rotate `JWT_SECRET`, (b) rotate `OFFRAMP_KEYRING_SECRET` and re-encrypt all `Investor.relayerSecret` rows, (c) rotate `ETHERFUSE_WEBHOOK_SECRET` (and call EtherFuse register-webhook to update), (d) rotate `OPERATIONS_KEY` Stellar account (deploy new G, fund, migrate sponsored signers), (e) revoke GitHub access + audit `git log --author=<departed-contributor>` for any post-offboarding commits.

---

### §2 Gestão de Chaves

#### F-003 ✅ RESOLVED 2026-05-20
**[HIGH] (confidence: 9/10) [VERIFIED] [contracts/maturity_settlement/src/lib.rs](contracts/maturity_settlement/src/lib.rs) — MaturitySettlement contract has no pause / no admin transfer**

**Resolution**: Contract bumped to **v2**. Added `pause()`, `resume()`, `propose_admin()`, `accept_admin()`, plus `is_paused()` / `get_active_admin()` helpers. `deposit`, `settle_batch`, `withdraw`, `refund` now gated on `!is_paused()`. `upgrade` and `accept_admin` intentionally NOT pause-gated (recovery paths). 13 new tests added; all 125 contract tests pass. **Deploy required**: build new WASM and call `upgrade()` on the deployed testnet contract before any debt offer.

**Description**: Function inventory grep across [contracts/maturity_settlement/src/lib.rs](contracts/maturity_settlement/src/lib.rs):
- `initialize` (one-shot, line 116)
- `deposit` (line 152)
- `settle_batch` (line 196)
- `withdraw` (line 310)
- `refund` (line 332)
- `upgrade` (line 369)
- `extend_ttl`, `get_balance`, `get_deposit`, `version`

**Absent**: no `pause`, no `set_admin`, no `propose_admin`/`accept_admin`, no kill-switch. The admin address is stored immutably in `Config` at `initialize()` and cannot be changed. There is no `is_paused` check anywhere in `settle_batch` or `deposit`.

This contract holds USDC during the maturity window (depositor → contract → eventually distributed to investors). It is **the most operationally rigid contract in the system** and the one most likely to need an emergency stop (an investor blocklist update mid-window, a discovered settlement-math bug, a court order).

**Exploit scenario**: Suppose an admin discovers a bug in the settlement payout math one day before maturity. With `TokenSale`, you'd call `set_active(false)`. With `YieldDistributor`, you'd call `pause()`. With `MaturitySettlement`, **the only option is `upgrade(new_wasm_hash)` — which itself requires the admin to have already deployed and registered a patched WASM**. If the admin key is also lost or compromised, there is no recovery.

**Impact**: Single point of failure. If the admin keypair is compromised, an attacker can call `withdraw()` and `refund()` to drain the contract; the legitimate admin cannot rotate them out. If the admin key is *lost*, deposits are stuck and refund/settle is impossible.

**Recommendation**: Add three functions to MaturitySettlement before mainnet deploy of any debt offer:

```rust
pub fn pause(env: Env) -> Result<(), SettleError> { /* admin.require_auth(), set Paused = true */ }
pub fn resume(env: Env) -> Result<(), SettleError> { /* admin.require_auth(), set Paused = false */ }
pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), SettleError> { /* + accept_admin two-step */ }
pub fn accept_admin(env: Env) -> Result<(), SettleError> { /* new_admin.require_auth() */ }
```
Then gate `settle_batch`, `deposit`, `withdraw`, `refund` on `!is_paused()`. The pattern is already used in YieldDistributor — copy that. Also add tests for the pause-gated paths.

---

#### F-004
**[MEDIUM] (confidence: 8/10) [VERIFIED] [contracts/yield_distributor/src/lib.rs:141](contracts/yield_distributor/src/lib.rs:141) — YieldDistributor admin transfer is 1-step (no accept)**

**Description**: YieldDistributor's `set_admin(new_admin)` overwrites `DataKey::Admin` immediately upon `admin.require_auth()`. Compare TokenSale, which has `propose_admin` → `accept_admin` two-step (where the *incoming* admin must explicitly call `accept_admin` and `require_auth()` proves they hold the keypair).

**Exploit scenario**: Admin sets a typo'd or wrong public key in `set_admin`. The new "admin" doesn't actually exist (or is held by an attacker who collected the address but hasn't been validated). Contract is now permanently controlled by an unintended party — `pause/resume/upgrade` all locked.

**Impact**: Recoverable mistake (sending to a wrong-but-controlled address) becomes unrecoverable when it sends to an address the team doesn't actually control (typo, ledger-display mismatch, malicious copy-paste in a notion doc).

**Recommendation**: Mirror TokenSale's pattern. Add `propose_admin` / `accept_admin` to YieldDistributor. Test that `set_admin` without acceptance leaves the contract in a `PendingAdmin` state.

---

#### F-005
**[MEDIUM] (confidence: 8/10) [VERIFIED] No documented WASM hashes / verified-deploy artifacts for deployed contracts**

**Description**: Caroline §6 demanded: "Comparar o bytecode on-chain com compilado localmente garante integridade. Divergência indica que o contrato em execução pode não ser oficial ou foi alterado." Searched the repo for documentation of deployed contract WASM hashes (`grep -rn "wasm.*hash" docs/`). Findings:

- [docs/Operations/MAINNET_CHECKLIST.md:46-50](docs/Operations/MAINNET_CHECKLIST.md:46) lists `ACCOUNT_WASM_HASH`, `SALE_WASM_HASH`, `SETTLEMENT_WASM_HASH` as **TODO** for mainnet ("Testnet hash already set — must be replaced for mainnet").
- [docs/Operations/PASSKEY_KIT_MIGRATION_GUIDE.md:55](docs/Operations/PASSKEY_KIT_MIGRATION_GUIDE.md:55) records the **testnet** ACCOUNT_WASM_HASH: `a12e8fa9621efd20315753bd4007d974390e31fbcb4a7ddc4dd0a0dec728bf2e`
- No reproducible-build documentation (compiler version pinned, `cargo build --release --target wasm32-unknown-unknown` + `stellar contract optimize` command), no published hash of `token_sale.wasm`, `yield_distributor.wasm`, `maturity_settlement.wasm` — even for testnet.

**Exploit scenario**: Today, a security-conscious investor wants to verify the testnet contract running at the published contract ID is the same code in the GitHub repo. They cannot. Tomorrow, a contractor pushes a malicious commit, redeploys to testnet during an "innocent" patch, and the change is not detected because there's no published hash for the team to diff against.

**Impact**: Caroline's primary fraud signal (verified source + verified bytecode hash) is unmet. This is the difference between "we built it right" and "we *prove* we built it right."

**Recommendation**: Add to [docs/Operations/MAINNET_CHECKLIST.md](docs/Operations/MAINNET_CHECKLIST.md): for each contract, document (a) the Rust toolchain version, (b) the build command, (c) the resulting WASM hash, (d) the Stellar contract ID it's deployed at. Make this part of the deploy script in [scripts/deploy-yield-distributor.mjs](scripts/deploy-yield-distributor.mjs) — print + persist the hash. Publish them in a top-level `DEPLOYMENTS.md` so anyone can `sha256sum` their local build and verify.

---

#### F-006
**[MEDIUM] (confidence: 8/10) [VERIFIED] [contracts/token_sale/src/lib.rs:101](contracts/token_sale/src/lib.rs:101), [contracts/maturity_settlement/src/lib.rs:116](contracts/maturity_settlement/src/lib.rs:116) — External token addresses trust admin input, no on-chain registry check**

**Description**: Both contracts accept `sell_token`/`buy_token` (TokenSale) and `usdc_sac`/`token_sac` (MaturitySettlement) as parameters to `create()`/`initialize()` — supplied by the admin. There is no on-chain check that these are well-known USDC, or that they match a registry of approved token SACs. Caroline §6: "Atenção a nomes falsos (ex: token apresentado como 'USDT' mas sendo outro ativo) e address poisoning."

**Exploit scenario**: Compromised admin keypair (or malicious admin) calls `create()` with `buy_token = G_FAKE_USDC_SAC` that they control. Investors connect their wallets, see "USDC offer" in the UI, sign the trustline (UI doesn't show the SAC contract ID prominently — see F-013), and send what they think is real USDC to a SAC the attacker controls. The contract still executes valid-looking trades; investors hold a worthless security token, attacker holds real USDC drained via `withdraw()` from the fake SAC.

**Impact**: Trust-bypass attack on investors. Class of attack Caroline explicitly warned about.

**Recommendation**: Hardcode the USDC SAC contract ID in the contract source as a `const` (different per network — `USDC_SAC_MAINNET` / `USDC_SAC_TESTNET` via build-feature flags), OR maintain an on-chain "approved tokens" registry contract that TokenSale checks via cross-contract call. Either way, remove user-supplied `buy_token` for the canonical case. The security-token SAC can stay configurable since each offer has its own.

---

### §3 Controle e Lógica

#### F-007
**[POSITIVE — informational, not a finding]** — `require_auth()` coverage verified at 100% of state-mutating Soroban functions; all financial arithmetic uses `.checked_*()` ops; logic-before-math (Caroline's central rule) is enforced everywhere I checked. See [contracts/token_sale/src/lib.rs:171-225](contracts/token_sale/src/lib.rs:171) for the canonical pattern: business-rule checks (active, deadline, min-buy, frozen, cap) → state update (`set_buyer_spent` at line 185) → math (`checked_mul/_div` at lines 191-195) → external token transfers atomically. **This is good news to surface for the accelerator.**

---

#### F-008
**[MEDIUM] (confidence: 8/10) [VERIFIED] No application-level sequential-identical-tx detection (Caroline's "3 transações de $50 no mesmo minuto" signal)**

**Description**: Caroline emphasized: "três sanções do mesmo valor sequencial, quase no mesmo minuto … aqui tem uma falha de segurança … pode ser um ataque de robô." Stellar's sequence number prevents *byte-identical* replay, but does NOT prevent the user-flow of submitting three logically-identical TXs in rapid succession (different sequence numbers, same investor, same amount, same target — could be a nervous-finger replay OR a credential-replay bot). Grepped `backend/src/services/` for any debounce/dedup of recent identical investment intents — none found.

**Exploit scenario**: Attacker steals an investor's session cookie (or executes a CSRF, though SameSite=Lax mitigates). Within 60 seconds they trigger `POST /api/investments/purchase` three times with identical amounts. All three pass (different Stellar sequence numbers, all signed by the same passkey-derived smart account). Investor loses 3× their intended purchase.

**Impact**: Financial. Bounded by investor's available balance, so not catastrophic, but exactly the kind of "dedinho nervoso ou ataque de robô" Caroline flagged.

**Recommendation**: Add a debounce on `POST /api/investments/purchase` (and similarly on `POST /api/companies/:companyId/withdraw/propose`) keyed on `(userId, offerId, amount)` with a Redis-backed 10-second TTL: if the same triple shows up twice in 10s, return 409 Conflict with a "duplicate intent suspected — confirm by retrying after delay" message. Cheap, exactly maps to Caroline's signal.

---

#### F-009
**[MEDIUM] (confidence: 8/10) [VERIFIED] [backend/src/services/investmentMetrics.service.js:274](backend/src/services/investmentMetrics.service.js:274) — Dormant-cohort tracked as metric only, no anomaly alert on dormant-then-active flip**

**Description**: `getInvestorCohorts()` computes `dormantCount = totalCount - activeCount` (active = `lastLogin >= 30d`). This is a **dashboard metric**, not an alert. Caroline §4: "endereço de carteira aí que fica dormindo. Criou 30 dias, ficou adormecida … daqui a pouco ela resolve se mexer. E quando ela se mexeu, foi pra um hacking … O silêncio é um alerta também."

The signal Caroline meant: a dormant account that *suddenly* wakes up + transacts is a red-flag pattern (often a stolen credential being cashed). Today, when a dormant investor logs in and transacts, no special handling fires.

**Exploit scenario**: Attacker phishes an investor's passkey credential 6 months ago (e.g., via a fake "Radox account-recovery" page during the credential's enrollment window). Holds it dormant. Eventually drains it. Radox sees a normal investor login, normal investment-flow API calls, no alert. The legitimate investor only notices days later when their portfolio is empty.

**Impact**: Detection latency. The fix doesn't prevent the attack but shortens the response window — exactly what Caroline's SWAT group exploited during C&M to retain R$17M of R$29M.

**Recommendation**: Add a webhook trigger: when `Investor.lastLogin` flips from `> 30 days ago` to a current value AND the same session attempts a purchase or withdrawal within 10 min, log a `SecurityAnomaly` row and alert the admin via Resend email. Optional: require a re-auth (second passkey assertion) before allowing the first sensitive op.

---

### §4 Proteção de API / Infraestrutura

#### F-010 ✅ RESOLVED 2026-05-20
**[HIGH] (confidence: 9/10) [VERIFIED] [docker-compose.yml:80](docker-compose.yml:80) — JWT_SECRET defaults to literal "change_this_in_production" in dev compose**

**Resolution**: Fallback removed. Now matches prod compose: `${JWT_SECRET:?JWT_SECRET is required (run: openssl rand -hex 32)}`. Devs must set `JWT_SECRET` in `.env` or the container fails fast at boot.

**Description**:
```yaml
JWT_SECRET: ${JWT_SECRET:-change_this_in_production}
```
The production compose ([docker-compose.prod.yml:125](docker-compose.prod.yml:125)) correctly uses `${JWT_SECRET:?JWT_SECRET is required}` (errors out if unset). But the **dev** compose silently defaults to a known string. If `docker-compose.yml` is ever used in a production-like context (a misconfigured VM, a contractor "I'll just spin up local prod for testing" moment), JWT will be signed with `change_this_in_production`.

**Exploit scenario**: An attacker who knows Radox uses this default (and the project is open-source-style accessible to the accelerator + community) can forge a JWT for any user, including `requirePlatformAdmin = true`, simply by signing with the known string. They then hit `/api/admin/contracts/:offerId/drain` — pause + drain a sale contract.

**Impact**: Conditional on a specific deploy mistake but high-impact if it lands. The Bible flagged this in 2026-03 — **still present**.

**Recommendation**: Change the line to:
```yaml
JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required (set in .env)}
```
Match the prod compose. Devs will need to put a value in `.env` (template can suggest `openssl rand -hex 32`).

---

#### F-011 ✅ RESOLVED 2026-05-20
**[HIGH] (confidence: 9/10) [VERIFIED] No `AuditLog` / `AdminAction` table in DB — admin actions are not centrally audit-trailed**

**Resolution**: Added `AdminAction` model to [backend/prisma/schema.prisma](backend/prisma/schema.prisma) with indexes on `(actorId, createdAt)`, `(action, createdAt)`, `(targetType, targetId, createdAt)`, and `createdAt`. New service [backend/src/services/adminAuditLog.service.js](backend/src/services/adminAuditLog.service.js) provides `logAdminAction` + `attachAdminAuditHook`. `requirePlatformAdmin` and `requireAdminRole` in [backend/src/middleware/authorize.js](backend/src/middleware/authorize.js) now log every denial inline and hook `res.on('finish')` to log success/failure with actor + payload-hash + IP + status. **Action required**: run `cd backend && npx prisma migrate dev --name add_admin_action_audit_log` to apply the schema. Follow-up hardening: revoke UPDATE/DELETE on `admin_actions` for the app DB role.

**Description**: Grepped [backend/prisma/schema.prisma](backend/prisma/schema.prisma) for `@@map(...)` tables. Found: investors, tokens, offers, investments, company_users, platform_admins, multisig_transactions, refresh_tokens, ramp_orders, ramp_webhook_events, fee_logs, deposits, notifications, etc. **Absent**: any `admin_actions`, `audit_log`, `security_events` table. Admin operations like "approve company", "freeze buyer", "drain offer", "pause contract" are only indirectly traceable: via `MultiSigTransaction` for ops that require multisig, and Sentry exceptions for ops that fail.

Caroline §4: "Logs de acesso habilitados … Logs de requisição ativos." She meant per-request, per-actor, immutable.

**Exploit scenario**: Insider with admin privileges performs a malicious action (approves a fake company they control, freezes a competitor's buyer account, calls a soft-drain). Sentry doesn't fire because the action succeeded. MultiSigTransaction has a record only if the op required multisig. **There is no way to retroactively answer "who approved company X at time Y from what IP?"** without trawling Caddy access logs, which don't include actor identity.

**Impact**: Investigation, dispute resolution, regulatory compliance (CVM/VASP audit requests) — all degraded. Insider risk is not detected at all unless the financial outcome is obviously wrong.

**Recommendation**: Add a Prisma model:
```prisma
model AdminAction {
  id          String   @id @default(uuid())
  actorId     String   // platform_admin.id
  actorType   String   // "platform_admin" | "system" | "company_user"
  action      String   // "approve_company" | "freeze_buyer" | "drain_offer" | etc.
  targetType  String?  // "company" | "offer" | "investor"
  targetId    String?
  payloadHash String   // sha256 of request body (don't store raw payload — may contain PII)
  ip          String?
  userAgent   String?
  result      String   // "success" | "failure" | "rejected"
  multisigTxId String? // FK to multisig_transactions if applicable
  createdAt   DateTime @default(now())

  @@index([actorId, createdAt])
  @@index([action, createdAt])
  @@map("admin_actions")
}
```
Then add `auditAction()` middleware on every `requirePlatformAdmin`-gated route. Make the audit-log table **append-only at the DB level** (revoke UPDATE/DELETE for the application's Postgres user; only `audit_writer` role can INSERT).

---

#### F-012
**[POSITIVE — informational]** — Rate limiting **is** properly wired: `authLimiter` (10/min) is mounted on `/api/auth` and `/api/webauthn` at [backend/src/app.js:213-214](backend/src/app.js:213); `strictLimiter` (60/min) on `/api/admin/contracts`, `/api/admin/transactions`, `/api/company/payments`, and key wallet routes; Redis-backed with memory fallback. The initial recon flagged this as "not mounted" — that was incorrect. **This is good news.** Caveat: limits are per-IP, not per-user (see F-024 below).

---

### §5 UI/UX

#### F-013
**[MEDIUM] (confidence: 8/10) [VERIFIED] [frontend/src/layouts/DashboardLayout.tsx:57](frontend/src/layouts/DashboardLayout.tsx:57), [frontend/src/pages/.../OfferDetails.tsx:26](frontend/src/pages/) — Stellar addresses truncated `slice(0,6)…slice(-4)` with no full-address-on-hover affordance**

**Description**:
```tsx
const truncatedAddress = contractId ? `${contractId.slice(0, 6)}…${contractId.slice(-4)}` : null;
```
Address poisoning attacks (Caroline §6: "olha tudo, ver se aquela carteira é a carteira oficial") generate addresses whose first 6 and last 4 chars match a target — entirely feasible for vanity-style ed25519 generation given Stellar's 56-char addresses. A user comparing the displayed truncated string to a remembered one (or one in another app) cannot distinguish a real vs poisoned address. There's a copy-to-clipboard button but no tooltip/modal showing the full 56-char address.

**Exploit scenario**: Attacker poisons the investor's transaction history with a `GAAAAA…ABCD` send-1-stroop tx where the visible prefix/suffix matches the company's real Treasury address. The investor goes to "send withdrawal to known company address" and copy-pastes the poisoned address from their history into a manual withdrawal step. Funds gone.

**Impact**: Conditional on a manual flow where the user re-types or re-copies an address. Today Radox's automated flows don't trigger this much (purchase/redeem use server-provided addresses, not user input), but the off-ramp bank-account screen and any future "send to known address" feature would.

**Recommendation**: Wherever an address is displayed truncated, render the full address in a `<Tooltip>` on hover or in a "Show full address" expand-on-click. Use the same `shadcn/ui` `Tooltip` already in the dependency tree. Bonus: also display a 4-color identicon next to the address (already done in `DashboardLayout` — extend to OfferDetails) — color is harder to poison than text.

---

#### F-014
**[MEDIUM] (confidence: 8/10) [VERIFIED] No explicit "you cannot reverse this" warning + double-confirm on irreversible admin ops**

**Description**: Caroline §5 / ISO 9241:10 demanded "confirmações de transação antes de liberar operações irreversíveis." Searched the admin frontend for the drain/freeze/clawback flows. The backend route requires header `X-Confirm: yes` ([backend/src/routes/contractRoutes.js:105](backend/src/routes/contractRoutes.js:105)), but the frontend UI (admin contract management page) needs to be checked for whether the click is:
(a) one-click drain — bad, or
(b) confirm modal with typed-value confirmation ("type DRAIN OFFER_X to confirm") — good.

Per recon, the X-Confirm header is set in the API client, so the gate is purely server-side; the UX is a single button click.

**Exploit scenario**: Tired admin at 2am misclicks "drain" instead of "pause" on a healthy offer. Investors are immediately served from a treasury that now has zero tokens; they see errors; trust evaporates. This is recoverable on Soroban (admin can refund + re-deploy + re-trade) but expensive in operational time and reputational cost.

**Impact**: Self-inflicted human-error blast radius. Caroline's explicit ISO 9241:10 ask.

**Recommendation**: For pause / drain / freeze / clawback / unfreeze in the admin UI, require a typed-confirmation modal: user must type the offer code (e.g. `BR-CDB-001`) and click a second button before the API call fires. Use shadcn `AlertDialog`. Server-side keep the `X-Confirm` header check.

---

### §6 Auditoria

#### F-015
**[POSITIVE]** — EtherFuse webhook is correctly verified (HMAC-SHA256 over JCS-canonical-JSON, timing-safe compare, returns 401 on invalid sig) at [backend/src/controllers/rampWebhookController.js:41-86](backend/src/controllers/rampWebhookController.js:41); idempotent via DB unique constraint on `(eventType, resourceId, resourceStatus)` ([backend/prisma/schema.prisma:1068](backend/prisma/schema.prisma:1068)).

---

#### F-016
**[MEDIUM] (confidence: 8/10) [VERIFIED] [contracts/yield_distributor/src/test.rs] — YieldDistributor has only 18 tests vs 75/112 for TokenSale/MaturitySettlement; sparse coverage on the contract that moves the most money on yield-distribution day**

**Description**: YieldDistributor's `distribute()` is the highest-throughput state-mutating function (one tx pays N investors). It has 18 tests vs 75 for TokenSale and 112 for MaturitySettlement. Caroline §3 demanded "código revisado, dependências auditadas, contrato verificado on-chain, ABI disponível, eventos emitidos corretamente, funções críticas revisadas." Tests are the cheapest form of "código revisado" you can publish.

**Exploit scenario**: A regression in `distribute()` — e.g., a future change to the fee-cap math that breaks the 70% invariant at lib.rs:248-254 — slips through because the test matrix doesn't cover the edge case (fee = total_payout boundary, recipient array of size 1, payer == fee_recipient, etc.).

**Impact**: Probabilistic. Probability rises with each subsequent change to this contract.

**Recommendation**: Add at minimum: (a) boundary tests at every `checked_*` arithmetic site, (b) duplicate-recipient test, (c) payer-equals-recipient self-transfer test, (d) zero-recipient test, (e) fee-amount-equals-cap and fee-amount-exceeds-cap tests, (f) paused-while-distributing test. Target 50+ tests before any mainnet deploy of this contract.

---

### §7 Deploy GO/NO-GO

**Mapped against Caroline's §7 checklist:**

| Item | Status | Evidence |
|---|---|---|
| Critical vulnerabilities resolved | 🟡 PARTIAL | F-001, F-003, F-010, F-011 are HIGH and open |
| Team can respond to incident | 🟡 PARTIAL | `CONTINGENCY_RUNBOOK.md` exists but no rehearsed time target |
| Logs and monitoring working | 🟡 PARTIAL | Sentry yes, dedicated AuditLog no (F-011) |
| Operational limits active | 🟡 PARTIAL | Rate limits yes; per-investor daily caps not implemented (F-024) |
| Rollback possible | 🟡 PARTIAL | TokenSale + YieldDistributor have upgrade + pause; MaturitySettlement does not (F-003) |
| Audit complete | 🔴 NO | This is the audit; findings still open |
| Team aligned on residual risk | 🟡 SELF | Solo founder + accelerator |

### Deploy verdict (testnet vs mainnet)

**Updated 2026-05-20** after F-001/F-003/F-010/F-011 resolution:

- **Testnet**: ✅ GO.
- **Mainnet — investor funds in TokenSale**: 🟡 → 🟢 PENDING TASKS. F-001, F-010, F-011 code-resolved; remaining ops: (a) run the Prisma migration in prod, (b) confirm prod compose `JWT_SECRET` is set in real env. Then GO. Strongly recommended before launch: F-005 (WASM hash registry).
- **Mainnet — debt offers using MaturitySettlement**: 🔴 → 🟡 v2 contract written + tests pass. Remaining ops: build the v2 WASM (`cargo build --release --target wasm32-unknown-unknown` + `stellar contract optimize`), call `upgrade()` on the deployed testnet contract, smoke-test the new pause/admin-rotation flows on testnet, then deploy mainnet.

---

## 4. Incident Response Readiness (Caroline's C&M Benchmark)

Caroline's SWAT group retained **R$17M of R$29M** by responding within minutes when the C&M heist hit. Can Radox do the same?

### Capabilities present today
- ✅ `freeze_buyer` on TokenSale ([contracts/token_sale/src/lib.rs:327](contracts/token_sale/src/lib.rs:327)) — admin can block a specific buyer mid-flow.
- ✅ `emergency_drain` on TokenSale ([contracts/token_sale/src/lib.rs:249](contracts/token_sale/src/lib.rs:249)) — admin pauses + drains tokens to themselves.
- ✅ `pause` / `resume` on YieldDistributor.
- ✅ Issuer flags allow `clawback` from any holder (via [tokenRoutes.js](backend/src/routes/tokenRoutes.js) `/api/tokens/freeze`).
- ✅ EtherFuse off-ramp is per-investor isolated (compromising one relayer-G doesn't expose others).
- ✅ `WalletMonitorService` watches Operations balance, alerts when low.

### Gaps to close before claiming "we can respond in <30 min"
1. **No pause on MaturitySettlement** (F-003) — if a settlement-day exploit fires, you cannot stop it on-chain. Only `upgrade()` after deploying a patched WASM.
2. **No AuditLog** (F-011) — incident investigation is hampered by lack of immutable per-action trail.
3. **No documented response playbook** for "investor passkey credential stolen". Today: kill the JWT (revoke refresh token), but the attacker can still sign Soroban TXs with the compromised passkey if they have the credential. Need a per-investor `account_frozen` flag enforced at API + smart-account `webauthn_verifier` level.
4. **No SLA-tested rehearsal** — write a `docs/Operations/INCIDENT_RESPONSE_DRILL.md` and run it quarterly. Simulate: passkey theft, admin-key compromise, contract-bug discovery, EtherFuse webhook spoof.

### Suggested incident response time targets
| Scenario | Detection target | Containment target |
|---|---|---|
| Passkey credential compromise (single investor) | <10 min via dormant-then-active flag (F-009) + WalletMonitor | <5 min via per-investor freeze flag |
| Admin key compromise | <5 min via SecurityAnomaly on admin action from new IP + AuditLog | <10 min via 2-of-N multisig refusal of attacker's signed TXs |
| Soroban contract bug | <30 min from disclosure → triage | <60 min via pause() (all contracts) — **F-003 blocks this for MaturitySettlement** |
| EtherFuse webhook spoofing | Already blocked by HMAC (F-015) | N/A |

---

## 5. Baseline Diff vs `06_security_audit.md` (2026-03-10)

### Newly resolved (was open in baseline)
- ✅ In-memory WebAuthn challenges → all migrated to Redis with TTL ([backend/src/config/redis.js:256](backend/src/config/redis.js:256))
- ✅ Fee collection on-chain (Soroban v6 `fixed_fee` + YieldDistributor fee_amount)
- ✅ `WalletMonitorService` now has `stop()` + graceful shutdown
- ✅ JWT secret correctly required in prod compose

### Still open (carried over from baseline)
- ⚠️ `approveCompanyDebug` env-gated only — **F-001 above, unchanged for 2+ months**
- ⚠️ `platformAdminRoutes.js` 2,067-line mega-file (organizational hygiene, not security-critical; not re-flagged here)
- ⚠️ Contract admin is a single key (not on-chain Soroban multisig) — partially mitigated by the off-chain `MultiSigTransactionService`, but on-chain multisig would be stronger
- ⚠️ No file type validation in offer upload (Multer)
- ⚠️ Validator-after-authenticateToken ordering on `/purchase` — was that fixed since 2026-03? Recheck during follow-up

### Newly found (post-2026-03)
- 🆕 MaturitySettlement contract immutable (F-003) — this contract is newer than the baseline audit
- 🆕 YieldDistributor 1-step admin transfer (F-004)
- 🆕 No AuditLog table (F-011)
- 🆕 Dockerfile USER missing (F-019 — observations)
- 🆕 Address truncation w/o full-display (F-013)
- 🆕 No dormant-then-active alerting (F-009)
- 🆕 No sequential-identical-tx debounce (F-008)
- 🆕 No WASM-hash registry (F-005)
- 🆕 Token-address-trust on admin input (F-006)

---

## 6. Top 5 to Fix This Week

Prioritized by `impact × likelihood × fix-cost`:

1. **F-001 — Remove `approveCompanyDebug`** (5 min). It has been flagged since March. Just delete the route.
2. **F-010 — Fix `JWT_SECRET` default in dev compose** (5 min). One-line change to mirror prod compose.
3. **F-011 — Add `AdminAction` table + middleware** (4 hours). Catches insider risk + regulatory expectations.
4. **F-003 — Add `pause()` + `propose_admin/accept_admin` to MaturitySettlement** (1 day including tests + redeploy testnet). Blocking for any mainnet debt offer.
5. **F-013 — Add full-address tooltip on truncated displays** (1 hour). UX-level address-poisoning mitigation.

After these, plan a sprint for F-005 (WASM hash registry), F-006 (token allowlist), F-008/F-009 (anomaly detection), and F-016 (YieldDistributor test coverage).

---

## 7. Observations Appendix (confidence < 8/10 or low impact)

These are not formal findings but worth tracking:

| # | File | Note |
|---|---|---|
| O-001 | [Dockerfile](Dockerfile), [frontend/Dockerfile](frontend/Dockerfile) | No `USER` directive — containers run as root. Caddy + Docker isolation already mitigate, but a `USER node` line costs nothing. |
| O-002 | [backend/src/middleware/rateLimit.js](backend/src/middleware/rateLimit.js) | Rate limits are per-IP only, not per-user. Sophisticated attackers rotate IPs. Consider adding a per-user limiter on auth endpoints (key by passkey credential ID). |
| O-003 | EtherFuse webhook subject to `globalLimiter` | A burst from EtherFuse during a payout day could hit 300/min. Probably fine given EtherFuse's likely volume, but consider whitelisting their IP range via `skipRateLimitForTrusted`. |
| O-004 | [contracts/token_sale/src/lib.rs:185-218](contracts/token_sale/src/lib.rs:185) | Recon flagged this as a CEI violation. Re-reading: state IS updated pre-math (line 185 sets buyer_spent), so reentrancy via the external token cannot double-spend the cap. The pattern is **acceptable**; documenting here so future reviewers don't re-raise it. |
| O-005 | [.github/workflows/](.github/workflows/) absent | No CI/CD pipeline. Not a finding per se, but means no automated SAST/`npm audit`/lint/test gate before deploy. Worth adding a minimal GitHub Action that runs `npm audit --production --audit-level=high` + `cargo audit` on PRs. |
| O-006 | No subaccount / per-investor daily limits | Caroline §1 ("travas e limites de segurança"). Without per-investor caps, a compromised passkey can drain the entire investor balance in one TX. Mitigated by smart-account passkey requirement (attacker needs the credential), but a daily cap (e.g., max 50K USDC/day/investor) adds defense in depth. Defer to product. |
| O-007 | No documented LinkedIn-baiting policy for the founder | Caroline emphasized this. Out of scope for code audit; surface as an op-sec note: don't accept GitHub repo clone requests from "interviewers". Recommend 2FA-required GitHub + commit signing. |
| O-008 | Frontend address-truncation appears in multiple components | Not just `DashboardLayout` and `OfferDetails` — likely in transaction history components too. Sweep grep for `slice(0, 4)` / `slice(0, 6)` / `truncateAddress` and apply F-013 fix consistently. |

---

## 8. Methodology Notes

- **CSO Phase 0–10** completed (stack detection, attack-surface census, secrets archaeology, dep audit summary, CI/CD review, infra/shadow surface, webhooks, LLM-N/A, OWASP Top 10 sweep, STRIDE on major components, FP filter at 8/10 confidence gate).
- **Caroline's 7-section checklist** applied as the report's primary organizing structure (matches the accelerator submission expectation).
- **Read-only**: no code modified during audit. All findings are file:line-cited and verified by direct read (3 parallel `Explore` agents + targeted re-reads on every flagged file).
- **Confidence gate**: 8/10 minimum for formal finding. Items below moved to Observations.
- **Severity calibration**: CRITICAL would require a realistic exploit path with high probability and high impact. The HIGHs in this report (F-001, F-003, F-010, F-011) all require either a specific deploy misconfiguration (F-001, F-010) or a specific operational scenario (F-003 needs admin key loss or settlement-day bug; F-011 needs an insider) — they don't meet the CRITICAL bar but are absolutely blocking for mainnet exposure to user funds.
- **Out of scope**: live RPC probing, penetration testing, KYC/AML legal sufficiency, browser-agent walkthrough (passkey + Freighter prevent agent auth).

---

*Generated by AI-assisted audit. Re-run before each mainnet deploy or major contract change. Track findings in this file's Top-5 list until closed.*
