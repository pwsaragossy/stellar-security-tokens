# Smart Contract Layer — Full Deep Read

> **Soroban (Rust, `#[no_std]`)** | Read date: 2026-03-30
> File: `contracts/token_sale/src/lib.rs` — ~400 lines | 75 test snapshots

---

## Contract Overview

**TokenSale v5** — Atomic token sale contract on Soroban.

Two-role access control:
- **Admin** (cold/multisig): upgrade, withdraw, drain, freeze, admin transfer
- **Seller** (hot): pause/resume, price updates

## Offer Struct

```rust
pub struct Offer {
    admin: Address,           // High-privilege key
    seller: Address,          // Operational key
    sell_token: Address,      // Token being sold (SAC)
    buy_token: Address,       // Payment token (USDC SAC)
    treasury: Address,        // USDC auto-forwarded here on trade
    sell_price: u32,          // Price numerator
    buy_price: u32,           // Price denominator
    is_active: bool,          // Pause/resume flag
    deadline_ledger: u32,     // 0 = no deadline
    min_buy_amount: i128,     // 0 = no minimum
    max_buy_per_buyer: i128,  // 0 = no cap, cumulative per buyer
    fixed_fee: i128,          // v5: flat USDC fee per trade (stroops). 0 = no fee.
}
```

### v5 Migration Notes (2026-03-30)
- **Removed**: `fee_bps: u32` (percentage-based fee, existed in v4 but was a trust-eroding landmine)
- **Added**: `fixed_fee: i128` (flat fee in stroops, e.g. 50_000_000 = $5 USDC)
- **Rationale**: Transparent, predictable fees. Investor pays exactly what they see. No hidden percentage.
- **WASM hash**: `13e1d732b2db74af8ea67866af0890d4e059452d2134018e5e0c1052941fb874`
- **Strategy**: New contracts only — existing v4 contracts are immutable and continue operating with their original parameters.

## Public Functions (15)

| Function | Auth | Risk | Purpose |
|----------|------|------|---------|
| `create` | Admin | Setup | Initialize offer (starts INACTIVE) |
| `trade` | Buyer | Core | Atomic USDC→token swap (3 transfers, fixed fee deducted) |
| `withdraw` | Admin | High | Withdraw any token from contract |
| `emergency_drain` | Admin | Critical | Pause + withdraw ALL sell_token |
| `set_active` | Seller | Medium | Pause/resume trading |
| `updt_price` | Seller | Medium | Update sell_price/buy_price |
| `propose_admin` | Admin | High | Step 1 of admin transfer |
| `accept_admin` | Pending | High | Step 2 of admin transfer |
| `freeze_buyer` | Admin | Medium | Block/unblock buyer address |
| `is_frozen` | Public | Read | Check buyer blocklist |
| `upgrade` | Admin | Critical | Replace contract WASM |
| `extend_ttl` | Public | Safe | Extend contract TTL (~30 days) |
| `get_offer` | Public | Read | Return offer state |
| `get_balance` | Public | Read | Contract's sell_token balance |
| `get_buyer_spent` | Public | Read | Buyer's cumulative spend |
| `version` | Public | Read | Returns 5 |

## Trade Flow (Atomic, v5)

```
buyer sends: buy_token_amount (USDC) → contract

contract checks: buy_token_amount > fixed_fee (else InsufficientForFee)

contract splits:
  ├─ fixed_fee (USDC)                    → treasury
  └─ buy_token_amount - fixed_fee (USDC) → company (seller)

contract sends:
  └─ sell_token_amount (tokens)          → buyer

Formula: sell_amount = (buy_amount - fixed_fee) * sell_price / buy_price
```

```
  ┌─────────┐     buy_token_amount      ┌──────────┐
  │  BUYER  │ ──────────────────────────▶│ CONTRACT │
  └─────────┘                            └────┬─────┘
       ▲                                      │
       │  sell_token_amount                   ├── fixed_fee ──────▶ TREASURY
       │                                      │
       └──────────────────────────────────────┘
                                              └── remainder ─────▶ COMPANY
```

Checks: active, deadline, min amount, buyer not frozen, per-buyer cap, overflow, buy_amount > fixed_fee.

## Storage Layout

| Key | Storage Type | Purpose |
|-----|-------------|---------|
| `DataKey::Offer` | Instance | Main offer state |
| `DataKey::PendingAdmin` | Instance | 2-step admin transfer |
| `DataKey::BuyerSpent(addr)` | Persistent | Cumulative spend per buyer |
| `DataKey::BuyerBlocked(addr)` | Persistent | Buyer blocklist |

## Error Codes (12)

| Code | Name | Trigger |
|------|------|---------|
| 1 | AlreadyCreated | Double `create` |
| 2 | ZeroPrice | sell_price or buy_price = 0 |
| 3 | NotActive | Trade while paused |
| 4 | InvalidAmount | amount ≤ 0 |
| 5 | TradeTooSmall | sell_token_amount ≤ 0 after calc |
| 6 | Overflow | i128 arithmetic overflow |
| 7 | Expired | Past deadline_ledger |
| 8 | BelowMinimum | Below min_buy_amount |
| 9 | BuyerCapExceeded | Exceeds max_buy_per_buyer |
| 10 | BuyerBlocked | Buyer is frozen |
| 11 | NoPendingAdmin | No pending admin to accept |
| 12 | NotPendingAdmin | Wrong address accepting |
| 13 | InsufficientForFee | buy_token_amount ≤ fixed_fee (v5) |

## TTL Configuration
- Threshold: 518,400 ledgers (~30 days at 5s/ledger)
- Extended on: trade, create, price update, pause, admin transfer

## Backend Integration

### Stroops Conversion
```
DB: offer.processingFee = 5.0 (Decimal, USDC)
JS: fixedFee = BigInt(processingFee * 10_000_000) = 50_000_000n (stroops)
```

### Services Touched
- `sorobanSale.service.js` — `buildCreateSaleXdr()` accepts `fixedFee` param
- `multiSigTransaction.service.js` — Both `sale_create` paths use `fixedFee`
- `offer.service.js` — Reads `offer.processingFee`, converts to stroops
- `investmentController.js` — Logs processing fee for audit trail

### Fee Schedule API (`GET /api/investments/fee-schedule`)
```json
{
  "processingFee": 5.0,
  "yieldFee": "Spread-based (company rate - investor rate)",
  "description": "A fixed $5 processing fee is deducted per trade on-chain."
}
```

## Test Coverage (75 snapshots)
Happy path, edge cases (overflow, zero caps, double-create), buyer cap enforcement (independent per buyer), admin transfer chain, emergency drain, pause/resume, supply exhaustion, blocklist, deadline, **fixed fee deduction** (5 tests: zero fee, non-zero fee, fee equals trade, fee exceeds trade, fee treasury balance).
