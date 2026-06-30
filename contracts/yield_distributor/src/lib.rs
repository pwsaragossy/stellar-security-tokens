#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    symbol_short, token, Address, BytesN, Env, Map, Vec,
};

// v3: 2-step admin rotation.
// v4 (Jun 2026, security review F-SOR-001 / F-SOR-011 follow-up):
//   - canonical USDC SAC hardcoded per network + validated in distribute()
//   - initialize() replaced by __constructor — init is now atomic with deploy,
//     closing the front-run / unauthorized-init gap (F-SOR-011).
//   The `testing` feature disables the USDC check so unit tests can use
//   generated SACs; production WASMs build with
//   `--no-default-features --features testnet|mainnet`.
//   See soroban_security_review_2026-06.md.
const CONTRACT_VERSION: u32 = 4;

// Canonical USDC Stellar Asset Contract (must match token_sale /
// maturity_settlement). IMPORTANT: when changing, also update
// the deployments record.
#[cfg(feature = "testnet")]
const USDC_SAC: &str = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
#[cfg(feature = "mainnet")]
const USDC_SAC: &str = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

// ═══════════════════════════════════════════════════════════════
//  Storage layout — flat keys (no Config struct = easier upgrades)
//
//  DataKey::Admin        → Address   (high-privilege: upgrade, pause, propose_admin)
//  DataKey::PendingAdmin → Address   (v3: 2-step rotation, awaiting accept)
//  DataKey::Paused       → bool      (circuit breaker)
//
//  v3: 2-step admin rotation
//  via propose_admin + accept_admin. The legacy set_admin remains for
//  back-compat but is marked deprecated.
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
    /// v3: address proposed by current admin via propose_admin().
    /// Cleared on accept_admin().
    PendingAdmin,
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
    /// v3: accept_admin() called but no propose_admin() is pending
    NoPendingAdmin = 12,
    /// v4 (F-SOR-001): supplied token is not the canonical USDC SAC for this network.
    UnauthorizedToken = 13,
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

/// v4 (F-SOR-001) — verify the supplied token matches the canonical USDC SAC
/// for this network. In `testing` feature builds the check is a no-op so unit
/// tests can use generated SACs. Production builds (testnet / mainnet feature)
/// enforce the check.
#[allow(unused_variables)]
fn validate_canonical_usdc(env: &Env, token: &Address) -> Result<(), DistributeError> {
    #[cfg(not(feature = "testing"))]
    {
        let canonical = Address::from_string(&soroban_sdk::String::from_str(env, USDC_SAC));
        if *token != canonical {
            return Err(DistributeError::UnauthorizedToken);
        }
    }
    Ok(())
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

    /// v4 (F-SOR-011) — Contract constructor. Runs exactly once, atomically, as
    /// part of the deploy operation. This closes the front-run / unauthorized-init
    /// gap a separate `initialize()` had: there is no window in which an attacker
    /// can set the admin before the deployer does.
    ///
    /// `admin.require_auth()` ensures the admin address consents to being set
    /// (prevents installing an admin the deployer does not control). The deploy
    /// transaction must therefore carry the admin's authorization.
    pub fn __constructor(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
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

    /// Transfer admin role in one step. Current admin must authorize.
    ///
    /// **Deprecated** in v3 — prefer the 2-step `propose_admin` + `accept_admin`
    /// flow which requires the new admin to prove they hold the keypair
    /// (prevents transfer-to-typo'd-address footgun).
    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), DistributeError> {
        let admin = load_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        // Clear any stale propose-admin proposal to avoid a misleading state.
        env.storage().instance().remove(&DataKey::PendingAdmin);
        emit(&env, symbol_short!("admchg"), new_admin);
        Ok(())
    }

    /// v3 — Step 1 of admin rotation. Current admin proposes a new admin.
    /// The new admin must call accept_admin() to take ownership.
    /// Overwrites any prior pending proposal.
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), DistributeError> {
        let admin = load_admin(&env)?;
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        emit(&env, symbol_short!("propadm"), new_admin);
        Ok(())
    }

    /// v3 — Step 2 of admin rotation. Pending admin accepts ownership.
    /// The pending admin must sign — proves they hold the keypair.
    pub fn accept_admin(env: Env) -> Result<(), DistributeError> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(DistributeError::NoPendingAdmin)?;
        pending.require_auth();
        env.storage().instance().set(&DataKey::Admin, &pending);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        emit(&env, symbol_short!("admchg"), pending);
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

        // v4 (F-SOR-001): only the canonical USDC SAC may be distributed —
        // a fake/typo'd token would otherwise pay investors in a worthless asset.
        validate_canonical_usdc(&env, &token)?;

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
        CONTRACT_VERSION // v4 (F-SOR-001/011): canonical USDC + __constructor
    }

    /// Returns the admin address.
    pub fn get_admin(env: Env) -> Result<Address, DistributeError> {
        load_admin(&env)
    }

    /// Returns whether the contract is paused.
    pub fn get_paused(env: Env) -> bool {
        is_paused(&env)
    }

    /// v3 — Returns the pending admin if propose_admin() was called and not yet accepted.
    pub fn get_pending_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }
}

mod test;
