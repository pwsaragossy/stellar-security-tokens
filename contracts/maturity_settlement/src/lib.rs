#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    symbol_short, token, Address, BytesN, Env, Map, String, Vec,
};

// v2 (May 2026): adds pause/resume + 2-step admin rotation (propose_admin/accept_admin).
// v3: canonical USDC SAC is hardcoded per network and validated at
// initialize(). Prevents address-poisoning attacks where a malicious or
// compromised admin could initialize the contract with a fake USDC SAC.
// The `testing` feature disables the check so unit tests can use generated
// SACs; production WASMs are built with `--no-default-features --features
// testnet|mainnet`.
const CONTRACT_VERSION: u32 = 3;
// ~30 days at 5s per ledger
const TTL_THRESHOLD: u32 = 518_400;
const TTL_EXTEND: u32 = 518_400;

// Canonical USDC Stellar Asset Contract.
#[cfg(feature = "testnet")]
const USDC_SAC: &str = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

// TODO(mainnet): VERIFY this address before building the mainnet WASM. It was
// carried over from the audit plan and has NOT been independently confirmed
// against Circle's documentation or Stellar Lab. If the address is wrong,
// EVERY mainnet contract deployment will fail at initialize() with
// UnauthorizedToken. To verify:
//   1. Look up Circle's mainnet USDC issuer (well-known:
//      GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN).
//   2. Compute / look up its Stellar Asset Contract address on stellar.expert
//      or via `stellar contract id asset --asset USDC:<issuer> --network mainnet`.
//   3. Replace the const, rebuild the mainnet WASM, update the deployments record.
// Until verified, do NOT deploy mainnet contracts.
#[cfg(feature = "mainnet")]
const USDC_SAC: &str = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
/// Maximum investors per settle_batch() call.
/// At ~12M CPU per investor, 30 × 12M = 360M, within 600M budget.
/// Footprint: 30 investors × 4 reads + 4 base = 124 entries (62% of ~200 limit).
/// Reduced from 40 in R4 review for mainnet safety margin.
const MAX_BATCH_SIZE: u32 = 30;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SettleError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    Overflow = 4,
    EmptyBatch = 5,
    /// Investor already settled (in this or a previous batch).
    AlreadySettled = 6,
    BatchTooLarge = 7,
    NoDeposit = 8,
    /// Duplicate investor address within the same batch.
    DuplicateInvestor = 9,
    /// Payout to address holding zero tokens.
    PhantomInvestor = 10,
    /// Fee exceeds the max_fee_bps cap declared at initialization.
    FeeTooHigh = 11,
    /// Contract is paused — settle/deposit/withdraw/refund blocked.
    ContractPaused = 12,
    /// accept_admin() called but no propose_admin() is pending.
    NoPendingAdmin = 13,
    /// v3: supplied usdc_sac is not the canonical USDC SAC for this network.
    UnauthorizedToken = 14,
}

/// Per-offer contract state keys.
/// Each deployed contract instance = one offer.
/// No offer_id needed — the contract address IS the offer scope.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    /// Tracks USDC deposited by a specific address (typically the company).
    Deposit(Address),
    /// Per-investor settlement flag. Set after an investor is settled.
    /// Stored in persistent storage. Prevents double-payout across batches.
    InvestorSettled(Address),
    /// Counter of total investors settled. Used as guard for refund().
    /// Stored in instance storage (fast access).
    SettledCount,
    /// Active admin override. Set after a successful accept_admin().
    /// If absent (fresh-init contract), Config.admin is the active admin.
    /// Added in v2.
    Admin,
    /// Admin proposed by current admin via propose_admin(), awaiting
    /// new admin's accept_admin() call. Cleared on acceptance.
    /// Added in v2.
    PendingAdmin,
    /// Pause flag — when true, deposit/settle_batch/withdraw/refund return
    /// ContractPaused. Upgrade and admin-rotation are intentionally
    /// NOT gated (the recovery path must remain accessible).
    /// Added in v2.
    Paused,
}

/// Immutable configuration set once during initialize().
///
/// `admin`: issuer public key — must be SAC admin for both USDC (transfer) and
///          security token (clawback). Signs settle_batch() and withdraw().
/// `usdc_sac`: USDC SAC contract address (for payouts + fee routing).
/// `token_sac`: security token SAC contract address (for clawback/burn).
/// `treasury`: platform treasury address (receives aggregated fees).
/// `max_fee_bps`: maximum fee in basis points (e.g. 200 = 2%). Immutable after init.
///                Enforced on-chain: total_fee ≤ sum(payouts) × max_fee_bps / 10_000.
///                CVM transparency: auditors can verify fee cap on-chain.
#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub usdc_sac: Address,
    pub token_sac: Address,
    pub treasury: Address,
    pub max_fee_bps: u32,
}

/// One item in a settlement batch — represents a single investor's payout.
///
/// Clawback is AUTOMATIC: the contract reads the investor's on-chain token
/// balance and burns ALL of it. No clawback_amount needed — the chain is
/// the source of truth.
///
/// ```text
///   investor ◄── payout USDC ── contract
///   investor ──► ALL tokens clawbacked (read from chain)
/// ```
#[contracttype]
#[derive(Clone)]
pub struct SettleItem {
    pub investor: Address,
    pub payout: i128,
}

#[contract]
pub struct MaturitySettlement;

/// Emit helper — wraps the deprecated API with a suppression.
/// When soroban-sdk stabilizes #[contractevent], migrate these calls.
#[allow(deprecated)]
fn emit<D: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(
    e: &Env,
    topic: soroban_sdk::Symbol,
    data: D,
) {
    e.events().publish((topic,), data);
}

/// Returns the contract's pause flag. Default false (fresh deploys).
fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

/// v3 — verify the supplied usdc_sac matches the canonical USDC SAC
/// for this network. In `testing` feature builds the check is a no-op so unit
/// tests can use generated SACs. Production builds (testnet / mainnet
/// feature) enforce the check.
#[allow(unused_variables)]
fn validate_canonical_usdc(env: &Env, usdc_sac: &Address) -> Result<(), SettleError> {
    #[cfg(not(feature = "testing"))]
    {
        let canonical = Address::from_string(&String::from_str(env, USDC_SAC));
        if *usdc_sac != canonical {
            return Err(SettleError::UnauthorizedToken);
        }
    }
    Ok(())
}

/// Returns the address currently authorized as admin.
///
/// v1 → v2 upgrade-safe: if `DataKey::Admin` is unset (never rotated),
/// falls back to `Config.admin` (which v1 set during initialize()).
/// After a successful `accept_admin()`, `DataKey::Admin` is set and
/// takes precedence over `Config.admin`.
fn get_active_admin(env: &Env) -> Result<Address, SettleError> {
    if let Some(admin) = env
        .storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::Admin)
    {
        return Ok(admin);
    }
    let config = load_config(env)?;
    Ok(config.admin)
}

#[contractimpl]
impl MaturitySettlement {
    /// Initialize the per-offer settlement contract. Called once after deployment.
    ///
    /// `admin`: issuer public key (SAC admin for clawback authority).
    /// `usdc_sac`: USDC SAC contract address.
    /// `token_sac`: security token SAC contract address.
    /// `treasury`: platform treasury for fee routing.
    /// `max_fee_bps`: maximum platform fee in basis points (200 = 2%).
    ///                Immutable after init. Enforced in settle_batch().
    pub fn initialize(
        env: Env,
        admin: Address,
        usdc_sac: Address,
        token_sac: Address,
        treasury: Address,
        max_fee_bps: u32,
    ) -> Result<(), SettleError> {
        // Prevent double init
        if env.storage().instance().has(&DataKey::Config) {
            return Err(SettleError::AlreadyInitialized);
        }

        // v3: enforce canonical USDC SAC at initialize() — prevents
        // address-poisoning by a malicious or compromised admin.
        validate_canonical_usdc(&env, &usdc_sac)?;

        admin.require_auth();

        let config = Config {
            admin,
            usdc_sac,
            token_sac,
            treasury,
            max_fee_bps,
        };
        env.storage().instance().set(&DataKey::Config, &config);

        // Extend TTL on init
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);

        emit(&env, symbol_short!("init"), CONTRACT_VERSION);
        Ok(())
    }

    /// Company deposits USDC into this settlement contract.
    /// Depositor signs via passkey (C... smart wallet).
    /// Multiple deposits from the same depositor accumulate (checked_add).
    pub fn deposit(
        env: Env,
        depositor: Address,
        amount: i128,
    ) -> Result<(), SettleError> {
        let config = load_config(&env)?;

        if is_paused(&env) {
            return Err(SettleError::ContractPaused);
        }

        if amount <= 0 {
            return Err(SettleError::InvalidAmount);
        }

        depositor.require_auth();

        // Transfer USDC from depositor to contract
        let usdc = token::Client::new(&env, &config.usdc_sac);
        usdc.transfer(&depositor, &env.current_contract_address(), &amount);

        // Accumulate deposit tracking (checked_add for overflow safety)
        let key = DataKey::Deposit(depositor.clone());
        let existing: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let new_total = existing.checked_add(amount).ok_or(SettleError::Overflow)?;
        env.storage().persistent().set(&key, &new_total);

        // Extend deposit TTL
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);

        emit(&env, symbol_short!("deposit"), amount);
        Ok(())
    }

    /// Atomically settle a batch of investors:
    ///   1. Validate: no duplicates, no phantom investors
    ///   2. USDC → each investor (payout)
    ///   3. Read on-chain token balance → clawback ALL (burn)
    ///   4. USDC → treasury (aggregated fee)
    ///
    /// TRUSTLESS: Clawback is automatic. The contract reads each investor's
    /// token balance from the chain and burns ALL of it. No backend input
    /// needed for burns — the public ledger is the source of truth.
    ///
    /// MULTI-BATCH: Can be called multiple times with different investor sets.
    /// Per-investor idempotency prevents double-payouts across batches.
    pub fn settle_batch(
        env: Env,
        items: Vec<SettleItem>,
        total_fee: i128,
    ) -> Result<(), SettleError> {
        let config = load_config(&env)?;

        if is_paused(&env) {
            return Err(SettleError::ContractPaused);
        }

        let admin = get_active_admin(&env)?;
        admin.require_auth();

        if items.is_empty() {
            return Err(SettleError::EmptyBatch);
        }

        if items.len() > MAX_BATCH_SIZE {
            return Err(SettleError::BatchTooLarge);
        }

        if total_fee < 0 {
            return Err(SettleError::InvalidAmount);
        }

        // ── Validation loop ──────────────────────────────────────────
        let mut seen: Map<Address, bool> = Map::new(&env);
        let sec_token = token::Client::new(&env, &config.token_sac);

        for i in 0..items.len() {
            let item = items.get(i).unwrap();

            if item.payout < 0 {
                return Err(SettleError::InvalidAmount);
            }

            // Within-batch dedup
            if seen.contains_key(item.investor.clone()) {
                return Err(SettleError::DuplicateInvestor);
            }
            seen.set(item.investor.clone(), true);

            // Cross-batch dedup (persistent storage)
            let settled_key = DataKey::InvestorSettled(item.investor.clone());
            if env.storage().persistent().has(&settled_key) {
                return Err(SettleError::AlreadySettled);
            }

            // Phantom investor: can't pay someone with 0 tokens
            let balance = sec_token.balance(&item.investor);
            if balance == 0 && item.payout > 0 {
                return Err(SettleError::PhantomInvestor);
            }
        }

        // ── Fee cap (CVM transparency) ───────────────────────────────
        if total_fee > 0 && config.max_fee_bps > 0 {
            let mut sum_payouts: i128 = 0;
            for i in 0..items.len() {
                let item = items.get(i).unwrap();
                sum_payouts = sum_payouts.checked_add(item.payout).ok_or(SettleError::Overflow)?;
            }
            if sum_payouts > 0 {
                let max_allowed = sum_payouts
                    .checked_mul(config.max_fee_bps as i128)
                    .ok_or(SettleError::Overflow)?
                    / 10_000;
                if total_fee > max_allowed {
                    return Err(SettleError::FeeTooHigh);
                }
            }
        }

        // ── Execute atomically ────────────────────────────────────────
        let usdc = token::Client::new(&env, &config.usdc_sac);
        let sac = token::StellarAssetClient::new(&env, &config.token_sac);
        let contract = env.current_contract_address();

        for i in 0..items.len() {
            let item = items.get(i).unwrap();

            // Pay investor
            if item.payout > 0 {
                usdc.transfer(&contract, &item.investor, &item.payout);
            }

            // Burn ALL tokens — read balance from chain, clawback everything
            let balance = sec_token.balance(&item.investor);
            if balance > 0 {
                sac.clawback(&item.investor, &balance);
            }

            // Mark settled (persistent — survives across batches)
            let settled_key = DataKey::InvestorSettled(item.investor.clone());
            env.storage().persistent().set(&settled_key, &true);
            env.storage()
                .persistent()
                .extend_ttl(&settled_key, TTL_THRESHOLD, TTL_EXTEND);
        }

        // Fee to treasury
        if total_fee > 0 {
            usdc.transfer(&contract, &config.treasury, &total_fee);
        }

        // Increment settled count (instance storage, fast read for refund guard)
        let prev_count: u32 = env.storage().instance().get(&DataKey::SettledCount).unwrap_or(0);
        env.storage().instance().set(&DataKey::SettledCount, &(prev_count + items.len()));

        // Extend TTL after state change
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);

        emit(&env, symbol_short!("settled"), items.len());
        Ok(())
    }

    /// Admin withdraws any token from the contract (emergency recovery).
    pub fn withdraw(
        env: Env,
        token: Address,
        amount: i128,
        to: Address,
    ) -> Result<(), SettleError> {
        let _config = load_config(&env)?;

        if is_paused(&env) {
            return Err(SettleError::ContractPaused);
        }

        let admin = get_active_admin(&env)?;
        admin.require_auth();

        if amount <= 0 {
            return Err(SettleError::InvalidAmount);
        }

        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &to, &amount);

        emit(&env, symbol_short!("withdraw"), amount);
        Ok(())
    }

    /// Admin refunds a depositor's USDC. Blocked after settlement (V-1).
    /// Only callable by admin (not depositor) to prevent company self-refund attack.
    pub fn refund(
        env: Env,
        depositor: Address,
    ) -> Result<(), SettleError> {
        let config = load_config(&env)?;

        if is_paused(&env) {
            return Err(SettleError::ContractPaused);
        }

        let admin = get_active_admin(&env)?;
        admin.require_auth();

        // Block refunds after any settlement has started
        let settled_count: u32 = env.storage().instance().get(&DataKey::SettledCount).unwrap_or(0);
        if settled_count > 0 {
            return Err(SettleError::AlreadySettled);
        }

        // Load deposit amount
        let key = DataKey::Deposit(depositor.clone());
        let amount: i128 = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(SettleError::NoDeposit)?;

        if amount == 0 {
            return Err(SettleError::NoDeposit);
        }

        // Transfer USDC back to depositor
        let usdc = token::Client::new(&env, &config.usdc_sac);
        usdc.transfer(&env.current_contract_address(), &depositor, &amount);

        // Clear deposit tracking
        env.storage().persistent().set(&key, &0i128);

        emit(&env, symbol_short!("refund"), amount);
        Ok(())
    }

    /// Upgrade contract WASM. Admin only (high-privilege).
    /// Intentionally NOT pause-gated — upgrade is the recovery path when a
    /// pause has been triggered to contain a bug.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin = get_active_admin(&env).expect("not initialized");
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    // ─── v2 additions: pause + 2-step admin rotation ─────────────

    /// Pause the contract. Admin-only. Blocks deposit/settle/withdraw/refund.
    /// Upgrade and accept_admin remain accessible (recovery paths).
    pub fn pause(env: Env) -> Result<(), SettleError> {
        let admin = get_active_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        emit(&env, symbol_short!("paused"), true);
        Ok(())
    }

    /// Resume the contract. Admin-only.
    pub fn resume(env: Env) -> Result<(), SettleError> {
        let admin = get_active_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        emit(&env, symbol_short!("resumed"), true);
        Ok(())
    }

    /// Step 1 of admin rotation: current admin proposes a new admin.
    /// The new admin must then call accept_admin() to take ownership.
    /// Overwrites any prior pending proposal.
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), SettleError> {
        let admin = get_active_admin(&env)?;
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        emit(&env, symbol_short!("propadm"), new_admin);
        Ok(())
    }

    /// Step 2 of admin rotation: pending admin accepts ownership.
    /// The pending admin must sign — proves they hold the keypair (prevents
    /// transfer-to-typo'd-address footgun).
    pub fn accept_admin(env: Env) -> Result<(), SettleError> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(SettleError::NoPendingAdmin)?;
        pending.require_auth();
        env.storage().instance().set(&DataKey::Admin, &pending);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        emit(&env, symbol_short!("admchg"), pending);
        Ok(())
    }

    // ─── v2 readers ──────────────────────────────────────────────

    /// Returns whether the contract is paused.
    pub fn get_paused(env: Env) -> bool {
        is_paused(&env)
    }

    /// Returns the currently active admin.
    pub fn get_admin(env: Env) -> Result<Address, SettleError> {
        get_active_admin(&env)
    }

    /// Returns the pending admin if one has been proposed.
    pub fn get_pending_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }

    /// Extend contract instance TTL. Anyone can call (allows cron jobs).
    pub fn extend_ttl(env: Env) {
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    }

    /// Read: contract's USDC balance.
    pub fn get_balance(env: Env) -> Result<i128, SettleError> {
        let config = load_config(&env)?;
        let usdc = token::Client::new(&env, &config.usdc_sac);
        Ok(usdc.balance(&env.current_contract_address()))
    }

    /// Read: deposit amount for a specific depositor.
    pub fn get_deposit(env: Env, depositor: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Deposit(depositor))
            .unwrap_or(0)
    }

    /// Returns the contract version.
    pub fn version(_env: Env) -> u32 {
        CONTRACT_VERSION
    }
}

fn load_config(env: &Env) -> Result<Config, SettleError> {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .ok_or(SettleError::NotInitialized)
}

mod test;
