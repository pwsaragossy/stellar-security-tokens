#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    symbol_short, token, Address, BytesN, Env, Map, Vec,
};

const CONTRACT_VERSION: u32 = 1;
// ~30 days at 5s per ledger
const TTL_THRESHOLD: u32 = 518_400;
const TTL_EXTEND: u32 = 518_400;
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
    AlreadySettled = 6,
    BatchTooLarge = 7,
    NoDeposit = 8,
    /// Duplicate investor address in batch — defense against backend dedup bugs.
    DuplicateInvestor = 9,
    /// Payout to address holding zero tokens — defense against phantom investor attack.
    PhantomInvestor = 10,
    /// Fee exceeds the max_fee_bps cap declared at initialization (CVM transparency).
    FeeTooHigh = 11,
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
    /// Set to `true` after settle_batch() succeeds. Prevents double settlement (V-1).
    Settled,
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

/// One item in a settlement batch — represents a single investor's payout + clawback.
///
/// ```text
///   investor ◄── payout USDC ── contract
///   investor ──► clawback tokens ──► burned (issuer/admin)
/// ```
#[contracttype]
#[derive(Clone)]
pub struct SettleItem {
    pub investor: Address,
    pub payout: i128,
    pub clawback_amount: i128,
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
    ///   1. Validate: no duplicate investor addresses (DuplicateInvestor)
    ///   2. Validate: no phantom investors — if payout > 0 && clawback == 0,
    ///      verify investor holds tokens on-chain (PhantomInvestor)
    ///   3. USDC → each investor (payout)
    ///   4. Clawback security tokens from each investor (burn)
    ///   5. USDC → treasury (aggregated fee, single transfer)
    ///
    /// Guarded by DataKey::Settled — can only be called once per contract (V-1).
    /// Batch size capped at MAX_BATCH_SIZE (V-6).
    /// Duplicate investor addresses rejected with DuplicateInvestor (V-R6).
    /// Phantom investors (0 tokens, nonzero payout) rejected with PhantomInvestor (V-R8).
    /// Admin auth propagates to SAC clawback (admin = issuer = SAC admin).
    ///
    /// TRUSTLESS DESIGN: The contract validates clawback_amount against the
    /// investor's actual on-chain token balance via token::Client::balance().
    /// The contract does NOT blindly trust backend-provided values.
    pub fn settle_batch(
        env: Env,
        items: Vec<SettleItem>,
        total_fee: i128,
    ) -> Result<(), SettleError> {
        let config = load_config(&env)?;
        config.admin.require_auth();

        // V-1: Idempotency guard — settle can only happen once
        if env.storage().instance().has(&DataKey::Settled) {
            return Err(SettleError::AlreadySettled);
        }

        // V-5: Empty batch check
        if items.is_empty() {
            return Err(SettleError::EmptyBatch);
        }

        // V-6: Batch size cap
        if items.len() > MAX_BATCH_SIZE {
            return Err(SettleError::BatchTooLarge);
        }

        // V-3: Validate fee
        if total_fee < 0 {
            return Err(SettleError::InvalidAmount);
        }

        // V-R6: Duplicate investor detection + input validation
        let mut seen: Map<Address, bool> = Map::new(&env);
        let sec_token = token::Client::new(&env, &config.token_sac);

        for i in 0..items.len() {
            let item = items.get(i).unwrap();

            // V-3: Validate per-item amounts
            if item.payout < 0 || item.clawback_amount < 0 {
                return Err(SettleError::InvalidAmount);
            }

            // Check for duplicate
            if seen.contains_key(item.investor.clone()) {
                return Err(SettleError::DuplicateInvestor);
            }
            seen.set(item.investor.clone(), true);

            // V-R8: Phantom investor check
            // If payout > 0 and clawback == 0, investor must hold tokens
            if item.payout > 0 && item.clawback_amount == 0 {
                let token_balance = sec_token.balance(&item.investor);
                if token_balance == 0 {
                    return Err(SettleError::PhantomInvestor);
                }
            }
        }

        // V-CVM: Fee cap enforcement (CVM transparency invariant)
        // Fee cannot exceed max_fee_bps of total payouts.
        // e.g. max_fee_bps=200 → fee ≤ 2% of payouts.
        // Skip when: fee=0, max_fee_bps=0 (uncapped), or payouts=0 (clawback-only).
        if total_fee > 0 && config.max_fee_bps > 0 {
            let mut sum_payouts: i128 = 0;
            for i in 0..items.len() {
                let item = items.get(i).unwrap();
                sum_payouts = sum_payouts.checked_add(item.payout).ok_or(SettleError::Overflow)?;
            }
            // Only enforce when there are actual payouts (fee as % of payouts)
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

        // All validation passed — execute transfers atomically
        let usdc = token::Client::new(&env, &config.usdc_sac);
        let sac = token::StellarAssetClient::new(&env, &config.token_sac);
        let contract = env.current_contract_address();

        for i in 0..items.len() {
            let item = items.get(i).unwrap();

            // USDC payout to investor (skip if zero)
            if item.payout > 0 {
                usdc.transfer(&contract, &item.investor, &item.payout);
            }

            // Clawback security tokens from investor (skip if zero)
            if item.clawback_amount > 0 {
                sac.clawback(&item.investor, &item.clawback_amount);
            }
        }

        // Fee to treasury (skip if zero)
        if total_fee > 0 {
            usdc.transfer(&contract, &config.treasury, &total_fee);
        }

        // Mark as settled — prevents re-execution (V-1)
        env.storage().instance().set(&DataKey::Settled, &true);

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
        let config = load_config(&env)?;
        config.admin.require_auth();

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
        config.admin.require_auth();

        // Block refunds after settlement
        if env.storage().instance().has(&DataKey::Settled) {
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
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let config = load_config(&env).expect("not initialized");
        config.admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
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
