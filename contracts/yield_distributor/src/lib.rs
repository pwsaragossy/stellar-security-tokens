#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    symbol_short, token, Address, BytesN, Env, Map, Vec,
};

// ═══════════════════════════════════════════════════════════════
//  Storage layout — flat keys (no Config struct = easier upgrades)
//
//  DataKey::Admin   → Address   (high-privilege: upgrade, pause, set_admin)
//  DataKey::Paused  → bool      (circuit breaker)
// ═══════════════════════════════════════════════════════════════

/// TTL constants — same as maturity_settlement.
const TTL_THRESHOLD: u32 = 17_280;  // ~1 day at 5s ledgers
const TTL_EXTEND: u32 = 518_400;    // ~30 days

/// Maximum investors per distribute() call.
/// At ~12M CPU per SAC.transfer, 30 × 12M = 360M, within 600M budget.
/// Footprint: 30 investors × 2 reads/writes + base ≈ 64 entries (fits ~200 limit).
/// Same batch size as maturity_settlement for consistency.
const MAX_BATCH_SIZE: u32 = 30;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Paused,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum DistributeError {
    EmptyBatch = 1,
    BatchTooLarge = 2,
    InvalidAmount = 3,
    Overflow = 4,
    MismatchedArrays = 5,
    /// Fee exceeds 70% of total payout — safety cap
    FeeTooHigh = 6,
    /// Contract already initialized
    AlreadyInitialized = 7,
    /// Contract not yet initialized
    NotInitialized = 8,
    /// Contract is paused
    ContractPaused = 9,
    /// Duplicate recipient in the batch
    DuplicateRecipient = 10,
    /// Payer cannot be a recipient (self-transfer)
    SelfTransfer = 11,
}

#[contract]
pub struct YieldDistributor;

// ─── Helpers ─────────────────────────────────────────────────

fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Admin)
}

fn load_admin(env: &Env) -> Result<Address, DistributeError> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(DistributeError::NotInitialized)
}

fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

/// Emit helper — wraps the deprecated API with a suppression.
#[allow(deprecated)]
fn emit<D: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(
    e: &Env,
    topic: soroban_sdk::Symbol,
    data: D,
) {
    e.events().publish((topic,), data);
}

// ═══════════════════════════════════════════════════════════════
//  Contract implementation
//
//  Lifecycle:
//    deploy → initialize(admin) → distribute(...) / pause / resume / upgrade
//
//  Auth model:
//    - distribute(): payer.require_auth() — company passkey signs
//    - admin functions: admin.require_auth() — platform key signs
//    - extend_ttl(): no auth — anyone (cron jobs)
// ═══════════════════════════════════════════════════════════════

#[contractimpl]
impl YieldDistributor {
    // ─── Admin lifecycle ──────────────────────────────────────

    /// One-time initialization. Sets the admin address.
    /// Must be called once after deployment before any distribute() calls.
    pub fn initialize(env: Env, admin: Address) -> Result<(), DistributeError> {
        if is_initialized(&env) {
            return Err(DistributeError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }

    /// Upgrade contract WASM. Admin only (high-privilege).
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), DistributeError> {
        let admin = load_admin(&env)?;
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    /// Pause the contract. Admin only. Blocks all distribute() calls.
    pub fn pause(env: Env) -> Result<(), DistributeError> {
        let admin = load_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        emit(&env, symbol_short!("paused"), true);
        Ok(())
    }

    /// Resume the contract. Admin only. Unblocks distribute() calls.
    pub fn resume(env: Env) -> Result<(), DistributeError> {
        let admin = load_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        emit(&env, symbol_short!("resumed"), true);
        Ok(())
    }

    /// Transfer admin role. Current admin must authorize.
    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), DistributeError> {
        let admin = load_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Ok(())
    }

    /// Extend contract instance TTL. Anyone can call (allows cron jobs).
    pub fn extend_ttl(env: Env) {
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    }

    // ─── Core: Batched USDC distribution ─────────────────────

    /// Distribute USDC from `payer` to multiple `recipients` in a single transaction.
    ///
    /// **Stateful-minimal**: stores admin + paused flag only.
    /// The contract's primary purpose is to batch SAC.transfer() calls under one
    /// require_auth(payer) invocation tree — enabling one passkey prompt
    /// for N investor payments.
    ///
    /// ```text
    ///   Company Wallet (payer)
    ///        │
    ///        ├──► Investor 1  (amounts[0])
    ///        ├──► Investor 2  (amounts[1])
    ///        ├──► ...
    ///        ├──► Investor N  (amounts[N-1])
    ///        │
    ///        └──► Treasury    (fee_amount)  ← skipped if fee == 0
    /// ```
    ///
    /// Auth model:
    ///   - `payer.require_auth()` is called once at the top.
    ///   - Each `token.transfer(payer, recipient, amount)` creates a
    ///     sub-invocation automatically included in the auth tree.
    ///   - Simulation builds the full tree; passkey signs the root.
    ///
    /// # Arguments
    /// - `payer`: Company smart wallet (C... address). Signs via passkey.
    /// - `token`: USDC SAC contract address.
    /// - `recipients`: Investor addresses (C... or G...).
    /// - `amounts`: Per-investor USDC amounts in stroops (i128).
    /// - `fee_recipient`: Platform treasury address.
    /// - `fee_amount`: Total platform fee in stroops (i128). 0 = no fee.
    pub fn distribute(
        env: Env,
        payer: Address,
        token: Address,
        recipients: Vec<Address>,
        amounts: Vec<i128>,
        fee_recipient: Address,
        fee_amount: i128,
    ) -> Result<(), DistributeError> {
        // ── Pre-checks ──────────────────────────────────────────
        if !is_initialized(&env) {
            return Err(DistributeError::NotInitialized);
        }
        if is_paused(&env) {
            return Err(DistributeError::ContractPaused);
        }

        // ── Validation ──────────────────────────────────────────
        let count = recipients.len();

        if count == 0 {
            return Err(DistributeError::EmptyBatch);
        }
        if count > MAX_BATCH_SIZE {
            return Err(DistributeError::BatchTooLarge);
        }
        if count != amounts.len() {
            return Err(DistributeError::MismatchedArrays);
        }
        if fee_amount < 0 {
            return Err(DistributeError::InvalidAmount);
        }

        // Duplicate recipient check + validate amounts + compute total
        let mut seen: Map<Address, bool> = Map::new(&env);
        let mut total_payout: i128 = 0;

        for i in 0..count {
            let recipient = recipients.get(i).unwrap();
            let amt = amounts.get(i).unwrap();

            // No self-transfers (payer paying themselves)
            if recipient == payer {
                return Err(DistributeError::SelfTransfer);
            }

            // Duplicate detection
            if seen.contains_key(recipient.clone()) {
                return Err(DistributeError::DuplicateRecipient);
            }
            seen.set(recipient, true);

            if amt <= 0 {
                return Err(DistributeError::InvalidAmount);
            }
            total_payout = total_payout
                .checked_add(amt)
                .ok_or(DistributeError::Overflow)?;
        }

        // Fee safety cap: fee ≤ 70% of total payout
        if fee_amount > 0 && total_payout > 0 {
            let max_fee = total_payout * 7 / 10; // 70%
            if fee_amount > max_fee {
                return Err(DistributeError::FeeTooHigh);
            }
        }

        // ── Auth ────────────────────────────────────────────────
        // Single require_auth covers the root invocation.
        // All SAC.transfer sub-invocations are automatically included
        // in the auth tree via Soroban's sub-contract call authorization.
        payer.require_auth();

        // ── Execute transfers ───────────────────────────────────
        let usdc = token::Client::new(&env, &token);

        for i in 0..count {
            let recipient = recipients.get(i).unwrap();
            let amount = amounts.get(i).unwrap();
            usdc.transfer(&payer, &recipient, &amount);
        }

        // ── Fee to treasury (skip if zero) ──────────────────────
        if fee_amount > 0 {
            usdc.transfer(&payer, &fee_recipient, &fee_amount);
        }

        // ── Rich event: (payer, count, total_payout, fee_amount) ─
        emit(&env, symbol_short!("distrib"), (payer, count, total_payout, fee_amount));
        Ok(())
    }

    // ─── Read-only ────────────────────────────────────────────

    /// Returns the contract version.
    pub fn version(_env: Env) -> u32 {
        2 // v2: admin, pause, dedup, TTL, rich events
    }

    /// Returns the admin address.
    pub fn get_admin(env: Env) -> Result<Address, DistributeError> {
        load_admin(&env)
    }

    /// Returns whether the contract is paused.
    pub fn get_paused(env: Env) -> bool {
        is_paused(&env)
    }
}

mod test;
