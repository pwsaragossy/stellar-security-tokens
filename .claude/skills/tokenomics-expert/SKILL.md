---
name: tokenomics-expert
version: 3.1.0
description: |
  Security token lifecycle expert. Provides ground-truth formulas, money flow
  diagrams, and invariant checks for the Radox platform's token issuance,
  trading, yield calculations, and maturity/clawback flows. Use this skill
  whenever working on payment services, lifecycle tests, or tokenomics features.
  v2: Adds economic model, risk/default framework, fee governance map, and
  lifecycle post-maturity documentation.
  v3 (Mar 2026): Updated for Soroban contract v6 (additive fixed_fee model)
  and investorRate yield spread model. Removes stale fee_bps / DIVIDEND_FEE_PERCENT
  references which are now deprecated.
  v3.1 (Mar 2026): Added E2E test coverage map (146 assertions across 10 phases).
  Fixed stale round2 reference in dual computation example (now round7).
  v3.2 (Apr 2026): Updated maturity flow to Soroban Settlement. Removed all
  references to legacy maturity_clawback and batch_pending pipeline.
---

# Tokenomics Expert — Radox Platform

Use this skill when working on anything related to:
- Token issuance, SAC deployment, sale contracts
- Yield/interest calculations (monthly, quarterly, bullet)
- Payment processing (dividends, maturity payouts)
- Clawback/burn mechanics
- Lifecycle tests or financial assertions

## The Full Token Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SECURITY TOKEN LIFECYCLE                        │
│                                                                        │
│   BIRTH ──────────── LIFE ──────────── DEATH                          │
│                                                                        │
│   1. Issue token     3. Investor buys    5. Maturity/bullet payout    │
│   2. Deploy SAC         via Soroban      6. Clawback (burn tokens)    │
│      + Sale contract 4. Yield payments      Offer → closed            │
│      + Activate         (monthly/etc)                                  │
│                                                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Money Flow Diagram

```
ISSUANCE PHASE                           TRADING PHASE
══════════════                           ═════════════
                                         
  ISSUER                                   INVESTOR
    │                                        │
    │  setOptions(flags)                     │  sends USDC
    │  issue token (SAC)                     ▼
    ▼                                     ┌──────────────┐
  ┌──────────┐                            │  SOROBAN SALE │
  │  SAC     │──── deposit tokens ──────► │  CONTRACT     │
  └──────────┘                            └──────┬───────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    ▼            ▼            ▼
                               INVESTOR     COMPANY      TREASURY
                              gets tokens  gets 100%    gets $5
                                           buy_amount   fixedFee
                                           (additive,   (additive,
                                           fee not      from investor
                                           deducted)    separately)

PAYOUT PHASE (BULLET — Soroban Settlement)
SETTLEMENT PHASE                        BURN PHASE
══════════════                           ══════════
                                         
  COMPANY                                 SOROBAN SETTLEMENT
    │                                       CONTRACT
    │  deposits USDC                        │
    │  (principal + yield)                  │  atomic:
    ▼                                       │  1. distribute USDC to investors
  ┌──────────────────────┐                  │  2. burn tokens from investors
  │ SETTLEMENT CONTRACT  │ ────────────────►│  3. close offer
  └──────────────────────┘                  ▼
    │                                   Token balance = 0
    ├── INVESTOR gets principal + investorRate yield
    ├── TREASURY gets platform spread (annualRate − investorRate) × yield
    └── Offer → closed

  NOTE: Periodic yield payments still use the classic payment TX flow
  (companyPayment.service.js → processSignedPayment). Only bullet
  maturity uses Soroban Settlement.
```

## Yield Formulas (Ground Truth)

Source: `companyPayment.service.js`

### Bullet Payment (lines 236-260)

```
INPUT:
  totalInvested  = sum of all investments.usdcAmount
  annualRate     = offer.annualInterestRate (e.g. 12.0)
  offerStartDate = offer.createdAt
  maturityDate   = offer.maturityDate

FORMULA:
  yearsToMaturity = (maturityDate - offerStartDate) / (365 × 24 × 60 × 60 × 1000)
  totalInterest   = totalInvested × (annualRate / 100) × yearsToMaturity
  totalPayout     = totalInvested + round7(totalInterest)

PER INVESTOR:
  proportion     = investorAmount / totalInvested
  interest       = round7(totalInterest × proportion)
  payout         = principal + interest

EXAMPLE:
  Invested: 100 USDC, Rate: 12% APY, Duration: 1 year
  Interest: 100 × 0.12 × 1.0 = 12.00 USDC
  Payout:   100 + 12 = 112.00 USDC

  Duration: 1 day (test scenario, maturityDate = yesterday)
  Interest: 100 × 0.12 × (1/365) = 0.03 USDC
  Payout:   100 + 0.03 = 100.03 USDC
```

### Monthly/Quarterly Dividend (lines 87-94)

```
INPUT:
  investedAmount = investment.usdcAmount
  annualRate     = offer.annualInterestRate
  periodsPerYear = { monthly: 12, quarterly: 4, semi_annual: 2, annual: 1 }
  
FORMULA:
  periodRate   = annualRate / 100 / periodsPerYear
  interestOwed = investedAmount × periodRate

EXAMPLE:
  100 USDC at 12% monthly: 100 × 0.12 / 12 = 1.00 USDC/month
```

### Platform Fee — Two Separate Fee Mechanisms

#### 1. Trade Fee (on-chain, additive — Soroban contract v6)

```
Charged AT TRADE TIME. Additive — investor pays investment + fee.
Never deducted from the company's principal.

  fixedFee      = offer.processingFee (default $5 USDC = 50_000_000 stroops)
  investor pays = buy_token_amount + fixedFee
  company gets  = 100% of buy_token_amount
  treasury gets = fixedFee
  tokens issued = based on buy_token_amount only (fee doesn't affect token count)

Key property: company receives FULL investment. Fee is purely additive.
```

#### 2. Yield Spread (off-chain — investorRate model)

```
Charged AT PAYOUT TIME. Platform keeps the spread between company rate and investor rate.
Applied to YIELD ONLY, never to principal.

  annualRate    = offer.annualInterestRate  (company's cost of capital, e.g. 12%)
  investorRate  = offer.investorRate        (investor-facing yield, e.g. 10%)
  spread        = annualRate - investorRate (platform revenue, e.g. 2%)

  companyInterest  = principal × (annualRate / 100) × years
  investorInterest = principal × (investorRate / 100) × years
  platformFee      = companyInterest - investorInterest  (= the spread)
  netToInvestors   = principal + investorInterest

If investorRate is null → falls back to annualRate → spread = 0 (no fee taken).

DEPRECATED: DIVIDEND_FEE_PERCENT / fee_bps model no longer used.
```

## Balance Source Logic

```
Token LOCKED (isTokenLocked = true):
  └── DB is source of truth (investment.usdcAmount)
  └── No DEX trading allowed → platform controls all transfers

Token UNLOCKED (isTokenLocked = false):
  └── ON-CHAIN ledger is source of truth
  └── Must query StellarService.listAssetHolders()
  └── DEX trades can move tokens independently of platform
```

## Soroban Sale Contract Architecture

```
CONTRACT LIFECYCLE:
  1. Upload WASM → get wasmHash
  2. deployContract(issuer, wasmHash, salt) → contractId
  3. create_sale(contractId, {
       admin, seller, sellToken, buyToken,
       treasury, company,
       fixedFee,          ← flat $5 in stroops (50_000_000), NOT fee_bps
       sellPrice, buyPrice, deadlineLedger,
       minBuyAmount, maxBuyPerBuyer
     })
  4. authorizeBuyerOnSac(tokenSAC, contractId)  ← OPS signs, needs threshold
  5. sacTransfer(issuer → contract, amount)       ← deposit sell tokens
  6. set_active(true)                             ← sale goes live

TRADE FLOW (v6 — additive fee model):
  investor calls trade(buyer, buy_token_amount):
    1. buyer.require_auth()                          ← SourceAccount or Passkey
    2. buyToken.transfer(buyer → contract,
                         buy_token_amount + fixedFee) ← investor pays investment + fee
    3. buyToken.transfer(contract → company,
                         buy_token_amount)            ← company gets 100%
    4. buyToken.transfer(contract → treasury,
                         fixedFee)                   ← treasury gets flat fee
    5. sellToken.transfer(contract → buyer,
                          sellAmount)                ← tokens based on buy_token_amount only

ERROR CODES:
  13 = InsufficientForFee  (investor balance < buy_amount + fixedFee)

PRICE MATH (stroops):
  sellPrice  = 10_000_000  means 1 token = 1 USDC
  buyPrice   = 10_000_000  means 1 USDC  = 1 token
  sellAmount = buy_token_amount × buyPrice / sellPrice
  (fee is NOT included in sellAmount calculation)
```

## Threshold Configuration

```
ISSUER ACCOUNT (after threshold setup):
  Master key:    weight = 10
  OPS key:       weight = 2
  Thresholds:    low = 1, med = 2, high = 10

WHY:
  - setFlags, setTrustlineFlags → medium threshold → OPS can sign alone (2 ≥ 2)
  - SAC set_authorized() → uses TX source as admin → OPS signs TX → 2 ≥ med
  - Account merge, change thresholds → high → only master key (10 ≥ 10)
```

## Financial Invariants (Use for Assertions)

When testing or auditing, verify these invariants:

```
TRADE INVARIANTS (additive fee model):
  ✓ investor_USDC_before - (trade_amount + fixedFee) = investor_USDC_after
  ✓ investor_tokens_after = trade_amount / price  (exact ===, not >=)
  ✓ company_USDC_after = company_USDC_before + trade_amount  (100%, no fee deduction)
  ✓ treasury_USDC_after = treasury_USDC_before + fixedFee

BULLET PAYOUT INVARIANTS:
  ✓ netToInvestors > principal  (investorRate > 0 means interest accrued)
  ✓ netToInvestors < principal × 2  (sanity: no >100% interest for <1 year)
  ✓ investor_tokens_after_clawback = 0
  ✓ investor_USDC_after > investor_USDC_before  (they got paid)
  ✓ company_USDC_after < company_USDC_before  (they paid out)
  ✓ netToInvestors = principal + round7(principal × investorRate/100 × years)
  ✓ platformFee = round7(principal × (annualRate - investorRate)/100 × years)

YIELD SPREAD INVARIANTS:
  ✓ investorInterest = principal × (investorRate / 100) / periodsPerYear
  ✓ spread = companyInterest - investorInterest  (platform fee)
  ✓ spread charged on interest only, NEVER on principal
  ✓ netToInvestors = principalRepayment + investorInterest
  ✓ service.platformFee === independent spread calculation

CLAWBACK INVARIANTS:
  ✓ Only issuer can clawback (auth_clawback_enabled flag)
  ✓ Clawback amount = investor's full token balance
  ✓ Post-clawback: investor trustline balance = 0
```

## Key Service Files

| File | Responsibility |
|---|---|
| `stellar.service.js` | Token issuance, SAC deploy, trustlines, flags |
| `sorobanSale.service.js` | Contract deploy, create/activate sale, trade, SAC auth |
| `companyPayment.service.js` | Yield calc, bullet calc, periodic TX building, fee split |
| `payment.service.js` | Maturity detection cron, balance source, notification |
| `sorobanSettlement.service.js` | Bullet maturity: deposit → settle_batch → burn (Soroban) |
| `KeyManager.js` | Key retrieval, mode enforcement (env vs multisig) |
| `offer.service.js` | Offer state machine, activation chain orchestration |

## Common Gotchas

1. **maturityDate = yesterday in tests**: Yields ~0.03 USDC on 100 invested at 12%. 
   The interest IS there but tiny. Assert `> principal`, not a specific value.

2. **Locked vs unlocked tokens**: Changes which balance source is used for calculations.
   Test uses `isTokenLocked: true` → DB source.

3. **Threshold setup must come BEFORE authorizeBuyerOnSac**: Otherwise OPS has no 
   signing authority on issuer account.

4. **forSaleContract=true skips classic minting**: Tokens aren't minted via payment 
   to distributor. Instead, SAC transfer() from issuer (issuer has unlimited balance).

5. **Two-fee model (v6)**: Trade fee = flat `$5 fixedFee` additive on-chain (contract
   `fixed_fee` field, `offer.processingFee` in DB). Yield fee = `investorRate` spread
   (company pays `annualRate`, investor gets `investorRate`, platform keeps the diff).
   DEPRECATED: `fee_bps`, `platformFeeBps`, `DIVIDEND_FEE_PERCENT` — do not use these.

6. **round7() — Stellar precision**: All interest amounts use `Math.round(value × 10_000_000) / 10_000_000`
   (7 decimal places = 1 stroop = USDC's minimum on-chain unit). This replaced `round2()` (cents)
   which caused a ±$0.01 rounding leak in multi-investor proportional splits.
   Multi-investor invariant: `Σ(round7(part_i)) === round7(total)` (±1 stroop max).

## Offer State Machine

```
                    ┌──────────┐
                    │ rejected │ (terminal)
                    └──────────┘
                         ▲
                         │ admin rejects
                         │
  ┌────────────────┐  ┌──────────────┐  ┌──────────┐
  │ pending_review │──│ under_review │──│ approved │
  └────────────────┘  └──────────────┘  └──────────┘
    Company creates     Admin picks up    Admin approves
                                              │
                                              │ Token issued + SAC + sale deployed
                                              ▼
                                         ┌────────┐
                                         │ active │ ◄── Sale live, investors can buy
                                         └────────┘
                                              │
                                              │ processBulletPayments()
                                              │ (maturityDate <= now)
                                              ▼
                                         ┌─────────┐
                                         │ matured │ ◄── Awaiting company deposit
                                         └─────────┘
                                              │
                                              │ SorobanSettlementService 
                                              │   .executeFullSettlement()
                                              ▼
                                         ┌────────┐
                                         │ closed │ (terminal)
                                         └────────┘
```

**Key transitions to assert in tests:**
- `active → matured` requires `maturityDate <= now` AND `paymentType === 'bullet'`
- `matured → closed` requires successful Soroban Settlement execution (atomic USDC distribution + token burn)
- No state can transition backwards (no `matured → active`)

> **Removed (Apr 2026):** The `maturity_clawback` MultiSigOperationType and `batch_pending` MultiSigTxStatus
> enum values were purged from the Prisma schema. The classic multi-batch clawback pipeline is fully dead.

## Edge Case Catalog

Always test or consider these when working on payment/yield logic:

| # | Edge Case | What breaks | Expected behavior |
|---|---|---|---|
| 1 | **Zero-duration offer** | maturityDate = createdAt | interest = 0, payout = principal only |
| 2 | **Zero-rate offer** | annualInterestRate = 0 | interest = 0, payout = principal only |
| 3 | **Sub-cent interest** | 100 USDC × 12% × 1 day = 0.032... | round7() → 0.0328... USDC (7dp precision). Never assert === 0 |
| 4 | **Multiple investors, uneven split** | 3 investors: 50, 30, 20 USDC | Proportional split must sum to total |
| 5 | **Single investor = 100% proportion** | proportion = 1.0 | No division issues, interest = totalInterest |
| 6 | **Leap year** | 366-day year | Code uses 365 constant. Feb 29 → slightly >1.0 year |
| 7 | **Locked vs unlocked token** | isTokenLocked changes balance source | Locked → DB, unlocked → ledger query |
| 8 | **Fee on zero interest** | rate=0, fee should be 0 | fee = round7(0 × feePercent) = 0 |
| 9 | **Max operations per TX** | >95 investors in one offer | Batching logic in createPaymentTransaction |
| 10 | **Decimal precision overflow** | Prisma Decimal(20,7) vs JS float | Use parseFloat(), compare at 2 decimal places |

## Dual Computation Testing

**Rule: Never test a service's output against itself.**

If you call `calculateBulletPayment()` and assert its return value "looks reasonable," you're
testing the code against its own bugs. A formula error would pass green.

Two approaches are both valid:

**Option A — Inline math (used in `tokenLifecycle.test.js`):**
```javascript
// Independent calculation directly in test — no external dependency
const round7 = v => Math.round(v * 10_000_000) / 10_000_000;
const yearsToMaturity = (maturity - start) / (365 * 24 * 60 * 60 * 1000);
const independentInterest = round7(invested * (investorRate / 100) * yearsToMaturity);
const independentPayout = invested + independentInterest;
const independentSpread = round7(invested * ((annualRate - investorRate) / 100) * yearsToMaturity);

// Assert service matches
assert(parseFloat(paymentResult.netToInvestors) === independentPayout,
  `Dual computation: service(${paymentResult.netToInvestors}) === independent(${independentPayout})`);
assert(parseFloat(paymentResult.platformFee) === independentSpread,
  `Spread: service(${paymentResult.platformFee}) === independent(${independentSpread})`);
```

**Option B — `scripts/compute.js` (if it exists in the skill folder):**
```javascript
import { bulletPayout } from './skills/tokenomics-expert/scripts/compute.js';
const expected = bulletPayout(invested, investorRate, start, maturity);
assert(parseFloat(actual.netToInvestors) === expected.totalPayout);
```

> Note: `compute.js` is a reference implementation, not required. Inline math that does
> NOT call any service code satisfies the dual-computation rule equally well.

**Key formula functions to inline:**

| Calculation | Formula |
|---|---|
| Bullet investor payout | `principal + round7(principal × investorRate/100 × years)` |
| Bullet platform spread | `round7(principal × (annualRate - investorRate)/100 × years)` |
| Periodic investor interest | `round7(principal × investorRate/100 / periodsPerYear)` |
| Periodic spread | `round7(principal × (annualRate - investorRate)/100 / periodsPerYear)` |
| Trade fee | `fixedFee` flat dollar amount (from `offer.processingFee`, default $5) |
| round7 | `Math.round(value × 10_000_000) / 10_000_000` (Stellar USDC 7dp) |

## Economic Model

### Supply & Demand

```
SUPPLY:
  - Fixed per offer (offer.tokenAmount). No inflation, no minting post-issuance.
  - Tokens represent debt claims, NOT equity/governance.
  - Total supply = sum of all active offers' tokenAmounts.

DEMAND:
  - Driven by yield (annualInterestRate) and maturity date.
  - No secondary DEX market when isTokenLocked = true.
  - Unlocked tokens CAN trade on Stellar DEX → price may diverge from NAV.

PRICE DISCOVERY:
  - Primary market: Soroban sale contract, FIXED price.
    sellPrice / buyPrice = 1:1 (1 token = 1 USDC at 10_000_000 stroops)
  - Secondary (unlocked only): Stellar DEX orderbook. No platform control.
  - There is NO AMM or bonding curve. Price is admin-set at sale creation.

NAV (Net Asset Value):
  - Locked:   NAV = principal + accrued interest (DB-calculated)
  - Unlocked: NAV = on-chain balance × price (price = what someone will pay)
  - Platform does NOT compute or display NAV currently.
```

### Vesting

```
NOT APPLICABLE for security tokens.
  - All tokens are fully vested at purchase.
  - No cliff, no linear unlock. 
  - Lock/unlock is an ADMIN flag (isTokenLocked), not a vesting schedule.
```

## Risk & Default Framework

Source: `companyPayment.service.js` (lines 22-24, 900-1062), `collateralDistribution.service.js`

### Payment Due Status State Machine

```
paymentDueStatus transitions (independent from offer.status):

  null ──► due ──► overdue ──► defaulted
           │        │
           │        └── Grace period active (1 to GRACE_PERIOD_DAYS)
           │
           └── Payment day reached (nextPaymentDue < now, or maturityDate < now for bullet)

CONSTANTS (companyPayment.service.js:22-24):
  GRACE_PERIOD_DAYS         = 10
  LATE_FEE_PERCENT_PER_DAY  = 0     ← DISABLED for MVP (no legal framework)
  DEFAULT_FEE_PERCENT       = 0     ← DISABLED for MVP (no legal framework)
```

### Timeline of a Default

```
Day 0:   maturityDate reached. paymentDueStatus = 'due'
         Company should pay principal + interest.

Day 1-10: paymentDueStatus = 'overdue'
         Late fee accrues daily: totalOwed × LATE_FEE_PERCENT_PER_DAY × daysOverdue
         (Currently = $0 because fee = 0)

Day 11+:  paymentDueStatus = 'defaulted'
         CompanyPenalty created: { penaltyType: 'default_fee', amount: 0 (MVP) }
         Offer remains status='active' until admin acts.

Admin action:
         1. Admin sees offer in getDefaultedOffers()
         2. Admin calls prepareCollateralDistribution(offerId)
            → Builds TX to send collateral tokens to investors (pro-rata)
         3. Admin signs + submits TX
         4. processCollateralDistribution():
            offer.status = 'closed'
            CompanyPenalty.status = 'enforced'
            Investors notified via email + in-app notification
```

### Collateral Distribution Math

```
LOCKED TOKENS:
  proportion_i = investment_i.usdcAmount / Σ(all investment.usdcAmount)
  collateralShare_i = offer.collateralValue × proportion_i

UNLOCKED TOKENS:
  proportion_i = onChainBalance_i / Σ(all onChainBalances)
  collateralShare_i = offer.collateralValue × proportion_i

⚠ If an investor sold tokens on DEX (unlocked), they get LESS collateral.
  This is correct: collateral follows current holders, not original buyers.
```

### What to Assert in Tests

```
DEFAULT INVARIANTS:
  ✓ daysOverdue > GRACE_PERIOD_DAYS → paymentDueStatus = 'defaulted'
  ✓ CompanyPenalty.penaltyType = 'default_fee' created
  ✓ Collateral distribution: Σ(collateralShare_i) = offer.collateralValue
  ✓ After distribution: offer.status = 'closed'
  ✓ After distribution: CompanyPenalty.status = 'enforced'
  ✓ Investor tokens may still exist (collateral ≠ clawback)
```

## Governance & Fee Incentive Map

### Three-Party Value Flow

```
                    ┌───────────────────────────────────────────────────┐
                    │              MONEY FLOW PER PHASE                 │
                    ├───────────┬──────────────┬────────────────────────┤
                    │ COMPANY   │ INVESTOR     │ PLATFORM (Treasury)    │
  ──────────────────┼───────────┼──────────────┼────────────────────────┤
  TRADE             │ +USDC     │ -USDC        │ +$5 fixedFee (additive)│
  (investor buys)   │ (100% of  │ +tokens      │  on-chain, from        │
                    │ buy_amt)  │              │  investor's wallet     │
  ──────────────────┼───────────┼──────────────┼────────────────────────┤
  YIELD PAYMENT     │ -USDC     │ +USDC        │ +spread (annualRate −  │
  (monthly/bullet)  │ (payout)  │ (investorRate│  investorRate) × yield │
                    │ at annual │  portion)    │  NOT on principal      │
                    │ Rate)     │              │                        │
  ──────────────────┼───────────┼──────────────┼────────────────────────┤
  DEFAULT           │ -collateral│ +collateral  │ (no fee)              │
                    │ -reputation│ (pro-rata)   │                        │
  ──────────────────┼───────────┼──────────────┼────────────────────────┤
  LATE FEE          │ -USDC     │ (none)       │ +late fee (currently   │
  (MVP: disabled)   │ (penalty) │              │  $0, infrastructure    │
                    │           │              │  ready)                │
  ──────────────────┴───────────┴──────────────┴────────────────────────┘
```

### Fee Configuration Points

```
1. TRADE FEE (on-chain — additive fixed fee, contract v6):
   offer.processingFee → BigInt(processingFee × 10_000_000) stroops
   Passed to Soroban create_sale() as `fixedFee` parameter.
   Default: $5 USDC (50_000_000 stroops)
   Recipient: treasury wallet (contract enforces atomically)
   Model: ADDITIVE — investor pays investment + fee, company gets 100% of investment.
   DEPRECATED: offer.platformFeeBps / fee_bps — do not use (v4/v5 model, removed in v6)

2. YIELD SPREAD (off-chain — investorRate model):
   offer.investorRate set by admin at offer approval time.
   spread = offer.annualInterestRate − offer.investorRate
   Formula: platformFee = round7(principal × (spread/100) × years)
   Applied to: yield portion ONLY — never to principal repayment.
   Recipient: treasury (deducted from company payout before sending to investor)
   Note: not a separate TX — company sends total, platform keeps the spread implicitly.
   DEPRECATED: ConfigService.getFloat('DIVIDEND_FEE_PERCENT') — replaced by investorRate spread.

3. LATE FEE (off-chain, disabled):
   LATE_FEE_PERCENT_PER_DAY = 0
   Would accrue: totalOwed × rate × daysOverdue
   Creates CompanyPenalty record

4. DEFAULT FEE (off-chain, disabled):
   DEFAULT_FEE_PERCENT = 0
   One-time: totalOwed × rate
   Creates CompanyPenalty with penaltyType='default_fee'
```

### Incentive Alignment Check

```
✓ Company: motivated to pay on time (avoids default + collateral seizure)
✓ Investor: earns yield, protected by collateral on default
✓ Platform: earns on successful trades AND successful payouts
✗ GAP: Platform earns nothing on defaults (no enforcement fee for MVP)
✗ GAP: No investor penalty for early exit (selling tokens on DEX)
```

## Lifecycle Post-Maturity

### What Happens After `closed`?

```
offer.status = 'closed' is TERMINAL. There is no re-opening mechanism.

After closed:
  - Tokens burned via Soroban settlement contract (balance = 0 for all holders)
  - Or collateral distributed (if default path)
  - Offer appears in historical views only
  - No new investments possible
  - No further yield payments scheduled
  - CompanyPayment records preserved for audit
```

### Maturity Settlement Failure Scenarios

```
SCENARIO 1: Insufficient deposit
  - Company deposits less than totalOwed (principal + interest + spread)
  - Settlement contract rejects: balance < required amount
  - MITIGATION: prepare-deposit calculates exact amount upfront

SCENARIO 2: Investor moved tokens (unlocked)
  - Settlement uses listAssetHolders() → gets CURRENT holders, not original buyers
  - If investor sold all tokens: they're not in holders list → no payout/burn needed  
  - If tokens in DEX orderbook: burn may fail (can't burn from offers)

SCENARIO 3: Network failure during settlement
  - Soroban settlement is ATOMIC — either all investors paid + burned, or none
  - No partial state possible (unlike the old multi-batch clawback flow)
  - multiSigTransaction.status tracks: pending → submitted → completed/failed

ASSERTIONS:
  ✓ After settlement: ALL investors have USDC + tokens burned
  ✓ Offer status = 'closed'
  ✓ No partial payout possible (atomicity guaranteed by contract)
```

### Audit Trail

```
RECORDS PRESERVED:
  - Investment records (investment table): usdcAmount, tokenAmount, status
  - CompanyPayment records: paidAmount, transactionHash, paidAt
  - CompanyPenalty records: penaltyType, amount, status, enforcedAt
  - MultiSigTransaction: signedXdr, transactionHash, status
  - Stellar ledger: immutable on-chain history via transaction hash

QUERY PATTERN:
  "Show me everything about offer X" =
    prisma.offer.findUnique({ include: {
      investments: true,
      companyPayments: true,
      companyPenalties: true,
      tokens: true,
      multiSigTransactions: true
    }})
```

## E2E Test Coverage Map

File: `backend/tests/e2e/tokenLifecycle.test.js`
Assertions: **146** (Mar 2026)
Execution: `docker exec stellar_backend sh -c 'cd /app/backend && node --import tsx ../backend/tests/e2e/tokenLifecycle.test.js'`

```
PIPELINE:
  SETUP → DEPLOY → TRADE → DIVIDEND → PAYOUT → BURN → MULTI-INVESTOR → PERIODIC-DIV → EDGE-CASES → DEFAULT

PHASE 1: SETUP (fund + issue + USDC)
  - 7 throwaway testnet keypairs funded via friendbot
  - Token issued with SAC (forSaleContract=true)
  - USDC SAC deployed, test USDC minted
  - DB records: Company, Investor, Offer, Token

PHASE 2: DEPLOY (WASM + sale contract)
  - Upload WASM → deploy contract → create sale → deposit tokens → activate
  - Issuer threshold setup (OPS weight=2, med=2, high=10)

PHASE 3: TRADE (single investor, additive fee)
  INVARIANTS TESTED:
  ✓ investor_USDC -= (100 + $5 fee)
  ✓ investor_tokens = 100 (exact ===)
  ✓ company_USDC += 100 (100%, no deduction)
  ✓ treasury_USDC += $5 (flat fee)

PHASE 3.5: MONTHLY DIVIDEND (single investor)
  INVARIANTS TESTED:
  ✓ investorInterest = round7(100 × 10%/12) = 0.8333333
  ✓ spread = round7(100 × 2%/12) = 0.1666667
  ✓ service.platformFee === independent spread
  ✓ On-chain: investor += interest, treasury += spread, company -= total
  ✓ Tokens preserved (no clawback in periodic)

PHASE 4: BULLET PAYOUT + BURN
  INVARIANTS TESTED:
  ✓ active → matured (maturityDate <= now)
  ✓ netToInvestors > principal (interest accrued)
  ✓ netToInvestors < principal × 2 (sanity)
  ✓ Dual computation: service net === independent calc
  ✓ Yield spread: platformFee === independent spread
  ✓ Post-clawback: token balance = 0
  ✓ Offer status: closed

PHASE 5: MULTI-INVESTOR BULLET (60/40 split)
  INVARIANTS TESTED:
  ✓ Per-investor interest correct (proportional)
  ✓ Per-investor payout correct (principal + interest)
  ✓ Σ(interest_i) === totalInterest (sum conservation)
  ✓ Σ(payout_i) === totalPayout (sum conservation)
  ✓ Platform spread === independent calc
  ✓ Trade: A_USDC -= 65, B_USDC -= 45 (investment + $5 fee each)
  ✓ Company += 100, Treasury += $10 (2 × $5)

PHASE 5.5: MULTI-INVESTOR PERIODIC DIVIDEND (60/40)
  INVARIANTS TESTED:
  ✓ A interest = round7(60 × 10%/12) = 0.5
  ✓ B interest = round7(40 × 10%/12) = 0.3333333
  ✓ Σ(interest) === totalInvestorInterest
  ✓ Platform spread === independent calc
  ✓ Interest ratio A/B ≈ 1.5 (60/40)
  ✓ On-chain TX signed + submitted
  ✓ On-chain USDC: A,B,Company,Treasury movements verified
  ✓ On-chain sum conservation: Σ deltas ≈ 0

PHASE 5.6: EDGE CASES
  Edge 1 — Zero-duration (maturityDate = createdAt):
  ✓ interest = 0 (not NaN)
  ✓ payout = principal only (100)
  ✓ per-investor interest = 0, payout = 100

  Edge 2 — Zero-rate bullet (annualInterestRate = 0):
  ✓ interest = 0, payout = principal
  ✓ companyTotalInterest = 0
  ✓ No NaN or divide-by-zero

  Edge 2b — Zero-rate periodic (monthly, rate = 0):
  ✓ totalOwed = 0
  ✓ per-investor interestOwed = 0
  ✓ No NaN or divide-by-zero

PHASE 6: DEFAULT STATE MACHINE + COLLATERAL
  6b — Overdue transition:
  ✓ 5 days late → paymentDueStatus = 'overdue'
  ✓ Late fee penalty created (amount = 0, MVP disabled)

  6c — Default transition:
  ✓ 15 days late (> 10-day grace) → paymentDueStatus = 'defaulted'
  ✓ CompanyPenalty created (penaltyType = 'default_fee')

  6d — Defaulted offers query:
  ✓ getDefaultedOffers() returns correct proportions
  ✓ A proportion = 0.6, B proportion = 0.4
  ✓ Σ proportions = 1.0

  6e — Bullet maturity default:
  ✓ Bullet offer past grace → defaulted

  6f — On-chain collateral distribution:
  ✓ Trustlines created (A, B, distributor)
  ✓ Collateral minted to distributor
  ✓ Proportional distribution: A=60, B=40
  ✓ Distributor balance = 0 after distribution
  ✓ Sum conservation: 60 + 40 = 100
```

### Known Gaps (intentionally not E2E-tested)

| Gap | Reason |
|---|---|
| Batch TX (>47 investors) | Impractical — needs 47+ funded testnet accounts. Unit test instead. |
| Unlocked token balance source | Requires DEX-traded tokens setup. Different code path but same math. |
| `processCollateralDistribution()` status | Admin flow — sets offer.status='closed' + CompanyPenalty.status='enforced'. |
| Offer state machine (pending→approved→active) | Admin UI flow, not financial math. |

---

> **Roadmap: Compliance Skill**
> 
> A separate `compliance-expert` skill is planned to cover:
> - CVM (Brazilian Securities Commission) regulatory requirements
> - KYC/AML enforcement points in the lifecycle
> - Security vs utility token classification criteria
> - Transfer restriction enforcement (whitelisting)
> - Cross-jurisdictional offering rules
> 
> This is intentionally separated from tokenomics because compliance rules
> change independently of financial math. The tokenomics skill assumes
> all compliance checks have ALREADY passed.
