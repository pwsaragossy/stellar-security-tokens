# Services Layer — Complete Inventory

> 28 files · 12,734 lines · Read 2026-03-10

---

## 1. Stellar Core

### stellar.service.js (2,011L)
**Role:** Full Stellar backbone — token issue, trust, SAC deploy, distribution, treasury ops

| Method | Purpose |
|---|---|
| `issueToken` | Create + issue Stellar asset with auth flags + StellarService.prepareSorobanTransaction |
| `createTrustline` | Investor trustline for asset |
| `distributeTokens` | ISSUER → Investor (delegates to TransactionManager for multisig routing) |
| `withdrawFromTreasury` | Treasury → destination with muxed ID + multisig or direct signing |
| `deploySACForAsset` | Deploy Stellar Asset Contract (SAC) on Soroban |
| `getAccountRPC` | Soroban RPC account load (sequence-safe) |
| `prepareSorobanTransaction` | Simulate + prepare Soroban TX |
| `extendContractTTL` | Bump Soroban entry TTL |
| `getContractTTL` | Read remaining TTL from ledger |
| `getSACContractId` | Derive SAC contract ID from Asset |
| `buildUnsignedTransaction` | Build unsigned classic TX |
| `submitTransaction` | Submit raw XDR to Horizon |

**Calls:** `TransactionManager`, `KeyManager`, `stellar.js` config, `prisma`
**Called by:** Almost everything — controllers, other services

---

### sorobanSale.service.js (632L)
**Role:** Soroban sale contract lifecycle wrapper

| Method | Purpose |
|---|---|
| `deploySaleContract` | Upload WASM + instantiate sale contract via `initDeploy()` |
| `buildCreateSaleXdr` | Build `create()` call XDR with sell/buy config |
| `trade` | Execute `trade(buyer, amount)` — atomic USDC→token swap |
| `getVersion` / `getState` / `getBalance` | Read-only contract queries |
| `buildSetActiveXdr` | Pause/resume contract |
| `buildSacTransferXdr` | SAC `transfer()` for depositing tokens into contract |
| `buildSetAuthorizedXdr` | SAC `set_authorized()` for contract authorization |

**Calls:** `StellarService`, `KeyManager`, Soroban RPC
**Called by:** `offer.service.js`, `multiSigTransaction.service.js` (processEffects)

---

### transactionManager.service.js (87L)
**Role:** Unified routing — direct sign vs multisig queue

```
submit(opts) → KeyManager mode === 'multisig' 
    ? MultiSigTransactionService.create(…) 
    : sign + submit directly
```

**Calls:** `KeyManager`, `MultiSigTransactionService`, `stellar.js`
**Called by:** All services that need to submit Stellar TXs

---

### multiSigTransaction.service.js (1,045L)
**Role:** Full multisig lifecycle — create → approve → submit → side-effects

| Method | Purpose |
|---|---|
| `create` | Queue TX with XDR, operation type, required signers, expiration |
| `signTransaction` | Cryptographic signature verification + threshold check |
| `getPendingForSigner` | List pending TXs for a signer |
| `getStats` | Dashboard metrics |
| `processEffects` | **13 post-exec hooks** (chain operations) |
| `processRejectionEffects` | Rollback DB state on reject/expire |

**processEffects operation types:**
| Op | Side Effect |
|---|---|
| `token_issue` | Auto-deploy SAC → chain `sac_deploy` TX |
| `sac_deploy` | Update Token.sacContractId, chain `token_distribute` if investmentId |
| `token_distribute` | Update Investment status + TokenDistribution |
| `sale_deploy` | Chain `sale_create` TX |
| `sale_create` | Verify contract, extend TTL, chain `contract_resume` |
| `contract_resume` | Auto-activate offer in DB |
| `contract_deposit_auth` | Chain SAC transfer to contract |
| `contract_deposit_transfer` | Log completion |
| `treasury_payment` | Update Deposit status if deposit_relay |
| `dividend_distribution` | Record InterestPayments + send emails |

---

## 2. Smart Wallet (Passkeys)

### passkeyWallet.service.js (~950L)
**Role:** Complete smart wallet lifecycle via `smart-account-kit` + OpenZeppelin Stellar Channels

| Method | Purpose |
|---|---|
| `deploySmartWallet` | OZ SmartAccountClient.deploy → Channels submission → DB update (stellarContractId) |
| `buildInvestmentTx` | SAC transfer USDC investor→company (footprint handled by Channels) |
| `sendTransaction` | Channels submitTransaction → fee-bump fallback |
| `sendSorobanTransaction` | Channels submitSorobanTransaction (func+auth — auto footprint) |
| `submitWithdrawalTx` | Validates contract allowlist before sponsoring |
| `buildWithdrawalTx` / `buildWithdrawalTxForCompany` | Build SAC transfer from smart wallet |
| `addPasskeySigner` / `removePasskeySigner` | Multi-device passkey management (OZ add_signer/remove_signer + DB) |
| `addEd25519Signer` / `removeEd25519Signer` | Ledger recovery signer management (Delegated type) |
| `listUserPasskeys` / `listEd25519Signers` | List all signers |

**Architecture notes:**
- 2-tier submission: Channels → fee-bump fallback
- OZ smart-account contract uses External (passkey) and Delegated (Stellar account) signer types
- Channels handles footprint discovery + resource calculation for Soroban transactions

---

### webauthn.service.js (391L)
**Role:** WebAuthn CRUD across 3 user types

| Method | Purpose |
|---|---|
| `registerCredential` | Store WebAuthn credential for investor/companyUser/platformAdmin |
| `getCredentialByUserId` | Lookup by user |
| `getCredentialById` | Lookup by credential ID |
| `updateCounter` | Increment auth counter |

---

## 3. Payments & Dividends

### payment.service.js (1,741L)
**Role:** Complete dividend/interest engine

| Method | Purpose |
|---|---|
| `getBalanceSource` | Locked=DB, Unlocked=on-chain |
| `getOnChainTokenBalance` | Query SAC balance via Soroban RPC |
| `getInvestorsWithBalances` | DB-based investor+balance query |
| `getInvestorsWithBalancesByOffer` | Offer-aware with locked/unlocked routing |
| `calculateMonthlyInterest` | `balance × (annualRate / 12 / 100)` |
| `createBatchUSDCPayment` | Batch USDC from distributor, 95 ops/tx, routes via TransactionManager |
| `processMonthlyInterestPayments` | Full flow: fetch → calculate → fee deduct → batch pay → record → email |
| `processBulletPayments` | MVP: notification-only on maturity |
| `processAllScheduledPayments` | Daily cron: bullet maturity + periodic notifications |
| `scheduleMonthlyPayments` | Cron: `0 0 1 * *` |
| `scheduleQuarterlyPayments` | Cron: `0 0 1 1,4,7,10 *` |
| `scheduleSemiAnnualPayments` | Cron: `0 0 1 1,7 *` |

**Fee handling:** `ConfigService.getFloat('DIVIDEND_FEE_PERCENT')` → `ConfigService.logFee({ category: 'DIVIDEND_FEE' })`

---

### companyPayment.service.js (~850L)
**Role:** Company-facing payment calculations, execution, and bullet maturity batch flow

| Method | Purpose |
|---|---|
| `calculateOwedAmount` | Per-investor interest breakdown (locked=DB, unlocked=on-chain) |
| `calculateBulletPayment` | Principal + accrued interest at maturity |
| `getUpcomingPayments` | All due payments for a company |
| `processTokenSaleFees` | 1% platform fee on token sale |
| `createPaymentTransaction` | Build unsigned TX — periodic (direct) or bullet (49-cap batches with guard + clawback ops) |
| `processSignedPayment` | Submit periodic TX directly + call `_recordPayments()` |
| `_recordPayments(prisma, offer, breakdown, opts)` | DRY helper: creates InterestPayment + FeeLog records (shared by periodic + bullet) |
| `checkOverduePayments` | Late fees (0.1%/day) + 10-day grace → default + CompanyPenalty |

**Bullet Maturity Flow:**
1. `createPaymentTransaction` with `isBullet` → caps at 49 investors/batch, adds `setOptions` guard + `clawback` ops per investor
2. Submit → `multiSigTransactionService.create()` with `maturity_clawback` type, `batch_pending` status
3. Last batch uses `prisma.$transaction()` to atomically create TX + flip all batches to `pending`
4. Admin signs in Freighter → `processEffects` calls `_recordPayments()` + closes offer

> ⚠️ **Trading Lockout:** Tokens must NOT be unlocked before maturity. On-chain balances must match investment records for clawback to work.

---

### paymentReminder.service.js (400L)
**Role:** Automated payment reminder scheduler

**Schedule:** Daily cron at 09:00 UTC
- 30d, 21d, 14d, 7d, 6-2d, 1d, due day → escalating emails + notifications
- Overdue: daily reminders with late fee calculation, 10-day grace period
- Updates `paymentDueStatus`: current → upcoming → due → overdue → defaulted

---

### paymentMonitor.service.js (351L)
**Role:** Real-time Horizon payment stream (singleton)

- Watches treasury account for incoming payments
- Routes `DEP`-prefixed memos to `DepositRelayService`
- Handles 429 rate limiting with 30s base backoff
- Handles 404 (unfunded treasury) with 5-min retry
- Max 10 reconnect attempts before alert

---

### depositRelay.service.js (215L)
**Role:** Off-chain deposit → smart wallet forwarding

| Method | Purpose |
|---|---|
| `initiateDeposit` | Generate deterministic memo (`DEP` + sha256) |
| `handleIncomingPayment` | Create Deposit record on first payment, forward via treasury |
| `forwardAsset` | `StellarService.withdrawFromTreasury()` → smart wallet |

---

## 4. Collateral & Default

### collateralDistribution.service.js (353L)
**Role:** Admin-triggered collateral distribution on company default

| Method | Purpose |
|---|---|
| `getDefaultedOffers` | List defaulted offers with pro-rata distributions (locked=DB, unlocked=on-chain) |
| `prepareCollateralDistribution` | Build unsigned batch payment TX |
| `processCollateralDistribution` | Submit + close offer + enforce penalties + notify investors |
| `getDefaultStatistics` | Dashboard: pending defaults, resolved, total pending penalties |

---

## 5. Offer Management

### offer.service.js (540L)
**Role:** Offer CRUD + Soroban contract deployment pipeline

| Method | Purpose |
|---|---|
| `getAll` / `getById` | Prisma queries with relations |
| `create` | Validate + prisma create |
| `update` / `updateStatus` | Field updates |
| `deployToSoroban` | 3-step chain: token issue → SAC deploy → sale deploy → sale create → activate (all via TransactionManager with crash recovery) |

---

## 6. Infrastructure Services

### alert.service.js (132L)
**Role:** Alert logging hub (6 methods: `paymentMonitorFailed`, `transactionFailed`, `distributionQueueFailed`, etc.)
**⚠️ Dead code:** `distributionQueueFailed` — references removed queue pattern

### alertRouter.service.js (136L)
**Role:** Multi-channel alert routing: Slack webhook + PagerDuty + DB notifications

### notification.service.js (~200L)
**Role:** CRUD for in-app notifications with Pusher real-time broadcasting

### email.service.js (~300L)
**Role:** Resend-based transactional email with 15+ templates

### config.service.js (~200L)
**Role:** SystemConfig CRUD + FeeLog management

### backup.service.js (~200L)
**Role:** Database pg_dump + user snapshot backup with retention

---

## 7. Soroban Monitoring

### sorobanEventIndexer.js (326L)
**Role:** 30-second interval Soroban event poller

- Tracks all active sale contracts
- 8 event types: `trade`, `status`, `price`, `wdrw`, `drain`, `padmin`, `aadmin`, `freeze`
- Cursor persisted in SystemConfig
- Critical events (`wdrw`, `drain`, `padmin`, `aadmin`) → admin notifications

### sorobanMetrics.service.js (104L)
**Role:** In-memory trade latency tracking (avg, p95, min, max, error rate)
- Periodic flush to SystemConfig every 10 min

### sorobanReconciler.js (207L)
**Role:** Fix orphaned Soroban investments (every 5 min)

| Scenario | Action |
|---|---|
| TX succeeded on-chain, DB stuck | Fix to `distributed` |
| TX failed on-chain | Fix to `failed` |
| No TX hash after 10 min | Mark `failed` (stale) |
| `pending_payment` > 30 min | Auto-cancel |
| ≥5 orphans in one cycle | Alert via AlertRouter |

### maintenance.service.js (118L)
**Role:** Daily TTL extension sweep (03:00 UTC + startup)
- Checks SACs, smart wallets, sale contracts
- Extends if TTL < 50,000 ledgers (~3.5 days)

---

## 8. TOML & IPFS

### toml.service.js (123L)
**Role:** Dynamic `stellar.toml` from DB — all tokens + offers with IPFS legal doc links (SEP-1)

### ipfs.service.js (146L)
**Role:** Pinata SDK wrapper — upload, fetch, validate CID. Mock mode if no `PINATA_JWT`

---

## 9. Identity & Keys

### KeyManager.js (447L)
**Role:** Key management with `env` (dev) and `multisig` (prod) modes
- Resolves keypairs for ISSUER, DISTRIBUTOR, TREASURY, OPERATIONS, CHANNEL_X
- Configures multisig thresholds

---

## 10. Metrics & Analytics

### investmentMetrics.service.js (284L)
**Role:** Dashboard analytics

| Method | Purpose |
|---|---|
| `getMetrics` | Counts by status, totals, success rate, avg processing time |
| `getStatisticsByPeriod` | Daily breakdown with unique investors |
| `getPendingInvestments` | Stale investments > 5 min old |
| `getFundraisingProgress` | Per-offer sold/target/percentage |
| `getRevenueBreakdown` | FeeLog aggregation by category |
| `getInvestorCohorts` | Active (30d) vs dormant investors |

---

## Cron Job Summary

| Schedule | Service | Job |
|---|---|---|
| Every 30s | `SorobanEventIndexer` | Poll contract events |
| Every 5m | `SorobanReconciler` | Fix orphaned investments |
| Every 10m | `SorobanMetrics` | Flush latency stats |
| Daily 01:00 | `PaymentService` | Bullet maturity check + periodic notifications |
| Daily 03:00 | `MaintenanceService` | TTL extension sweep |
| Daily 09:00 | `PaymentReminderService` | Payment reminder emails |
| 1st of month | `PaymentService` | Monthly interest payments |
| 1st of Jan/Apr/Jul/Oct | `PaymentService` | Quarterly payments |
| 1st of Jan/Jul | `PaymentService` | Semi-annual payments |

---

## Key Findings

### Dead Code
- `alert.service.js` → `distributionQueueFailed()` references removed queue
- `payment.service.js` → `getOffersByPaymentTypeAndFrequency()` uses `snake_case` field names (`payment_type`, `payment_frequency`) but Prisma schema uses `camelCase` — **will fail at runtime**
- `payment.service.js` → `processPeriodicPayments()` constructs empty investor objects (no wallet/email) — upstream `createBatchUSDCPayment` will skip them

### Security Notes
- `submitWithdrawalTx` validates contract allowlist before sponsoring
- `buildInvestmentTx` footprint and resource calculation handled by Channels service
- Multisig signatures cryptographically verified before acceptance
- Withdrawal XDR validation: single op, invokeHostFunction only, known contracts, transfer function only

### Architecture Patterns
- **Balance source routing:** locked tokens → DB, unlocked → on-chain SAC query
- **2-tier TX submission:** Channels → fee-bump fallback
- **Chain operations:** processEffects cascades up to 5 TXs automatically
- **Crash recovery:** offer.service.js checks sorobanInitStatus on deploy
