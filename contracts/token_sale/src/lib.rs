#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env,
};

const CONTRACT_VERSION: u32 = 5;
// ~30 days at 5s per ledger
const TTL_THRESHOLD: u32 = 518_400;
const TTL_EXTEND: u32 = 518_400;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SaleError {
    AlreadyCreated = 1,
    ZeroPrice = 2,
    NotActive = 3,
    InvalidAmount = 4,
    TradeTooSmall = 5,
    Overflow = 6,
    Expired = 7,
    BelowMinimum = 8,
    BuyerCapExceeded = 9,
    BuyerBlocked = 10,
    NoPendingAdmin = 11,
    NotPendingAdmin = 12,
    InsufficientForFee = 13,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Offer,
    PendingAdmin,
    BuyerSpent(Address),
    BuyerBlocked(Address),
}

/// Represents a single token sale offer.
///
/// Two-role access control:
/// - `admin`: cold key / multisig — controls upgrade, withdraw, drain, freeze, admin transfer, fee updates
/// - `seller`: hot key — controls pause, price updates (day-to-day operations)
///
/// Fixed fee model:
/// ```text
///   Investor ──$100──▶ trade()
///                        ├── fixed_fee ($5)  → treasury (processing fee)
///                        └── remainder ($95) → company (full capital)
/// ```
/// - `fixed_fee = 50_000_000`: $5 USDC per trade (1 USDC = 10^7 stroops)
/// - `fixed_fee = 0`:          no fee, company gets 100%
///
/// Compliance fields:
/// - `deadline_ledger`: sale closes after this ledger (0 = no deadline)
/// - `min_buy_amount`: minimum trade size in stroops (0 = no minimum)
/// - `max_buy_per_buyer`: cumulative cap per buyer in stroops (0 = no cap)
#[contracttype]
#[derive(Clone)]
pub struct Offer {
    pub admin: Address,
    pub seller: Address,
    pub sell_token: Address,
    pub buy_token: Address,
    pub treasury: Address,
    pub company: Address,
    pub fixed_fee: i128,
    pub sell_price: u32,
    pub buy_price: u32,
    pub is_active: bool,
    pub deadline_ledger: u32,
    pub min_buy_amount: i128,
    pub max_buy_per_buyer: i128,
}

#[contract]
pub struct TokenSale;

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
impl TokenSale {
    /// Creates the offer. Must be called once.
    /// Starts INACTIVE — seller must call set_active(true) after deposit + SAC setup.
    ///
    /// `admin`: high-privilege key (upgrade, withdraw, drain, freeze). Ideally multisig/cold.
    /// `seller`: operational key (pause, price). Can be same as admin for MVP.
    /// `fixed_fee`: flat fee per trade in stroops (e.g., 50_000_000 = $5 USDC). 0 = no fee.
    /// `deadline_ledger`: ledger sequence after which trades are rejected (0 = no deadline).
    /// `min_buy_amount`: minimum buy_token amount per trade in stroops (0 = no minimum).
    /// `max_buy_per_buyer`: cumulative buy_token cap per buyer in stroops (0 = no cap).
    pub fn create(
        e: Env,
        admin: Address,
        seller: Address,
        sell_token: Address,
        buy_token: Address,
        treasury: Address,
        company: Address,
        fixed_fee: i128,
        sell_price: u32,
        buy_price: u32,
        deadline_ledger: u32,
        min_buy_amount: i128,
        max_buy_per_buyer: i128,
    ) -> Result<(), SaleError> {
        if e.storage().instance().has(&DataKey::Offer) {
            return Err(SaleError::AlreadyCreated);
        }
        if buy_price == 0 || sell_price == 0 {
            return Err(SaleError::ZeroPrice);
        }
        if fixed_fee < 0 {
            return Err(SaleError::InvalidAmount);
        }
        admin.require_auth();
        write_offer(
            &e,
            &Offer {
                admin,
                seller,
                sell_token,
                buy_token,
                treasury,
                company,
                fixed_fee,
                sell_price,
                buy_price,
                is_active: false,
                deadline_ledger,
                min_buy_amount,
                max_buy_per_buyer,
            },
        );
        Ok(())
    }

    /// Buyer trades buy_token (USDC) for sell_token.
    /// Enforces: active, deadline, min amount, per-buyer cap, buyer not frozen.
    /// Atomic: all transfers succeed or all revert.
    pub fn trade(e: Env, buyer: Address, buy_token_amount: i128) -> Result<(), SaleError> {
        buyer.require_auth();
        if buy_token_amount <= 0 {
            return Err(SaleError::InvalidAmount);
        }

        let offer = load_offer(&e);
        if !offer.is_active {
            return Err(SaleError::NotActive);
        }

        // Deadline check
        if offer.deadline_ledger > 0 && e.ledger().sequence() > offer.deadline_ledger {
            return Err(SaleError::Expired);
        }

        // Min investment check
        if offer.min_buy_amount > 0 && buy_token_amount < offer.min_buy_amount {
            return Err(SaleError::BelowMinimum);
        }

        // Buyer blocklist check
        if is_buyer_blocked(&e, &buyer) {
            return Err(SaleError::BuyerBlocked);
        }

        // Per-buyer cap check
        if offer.max_buy_per_buyer > 0 {
            let spent = get_buyer_spent(&e, &buyer);
            let new_total = spent
                .checked_add(buy_token_amount)
                .ok_or(SaleError::Overflow)?;
            if new_total > offer.max_buy_per_buyer {
                return Err(SaleError::BuyerCapExceeded);
            }
            set_buyer_spent(&e, &buyer, new_total);
        }

        let sell_token_client = token::Client::new(&e, &offer.sell_token);
        let buy_token_client = token::Client::new(&e, &offer.buy_token);

        let sell_token_amount = buy_token_amount
            .checked_mul(offer.sell_price as i128)
            .ok_or(SaleError::Overflow)?
            .checked_div(offer.buy_price as i128)
            .ok_or(SaleError::Overflow)?;

        if sell_token_amount <= 0 {
            return Err(SaleError::TradeTooSmall);
        }

        let contract = e.current_contract_address();

        // Fee is additive: investor pays buy_token_amount + fixed_fee
        let fee = offer.fixed_fee;
        let total_pull = buy_token_amount
            .checked_add(fee)
            .ok_or(SaleError::Overflow)?;

        // Atomic: if any transfer fails, all revert (Soroban guarantee)
        // Pull investment + fee from buyer in a single transfer
        buy_token_client.transfer(&buyer, &contract, &total_pull);
        // Tokens calculated on buy_token_amount only (not including fee)
        sell_token_client.transfer(&contract, &buyer, &sell_token_amount);

        // Company gets full investment amount, treasury gets fee
        buy_token_client.transfer(&contract, &offer.company, &buy_token_amount);
        if fee > 0 {
            buy_token_client.transfer(&contract, &offer.treasury, &fee);
        }

        emit(
            &e,
            symbol_short!("trade"),
            (buyer, buy_token_amount, sell_token_amount, fee, e.ledger().sequence(), CONTRACT_VERSION),
        );

        e.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Ok(())
    }

    /// Admin withdraws any token from the contract.
    pub fn withdraw(e: Env, token: Address, amount: i128) -> Result<(), SaleError> {
        let offer = load_offer(&e);
        offer.admin.require_auth();
        if amount <= 0 {
            return Err(SaleError::InvalidAmount);
        }
        token::Client::new(&e, &token).transfer(
            &e.current_contract_address(),
            &offer.admin,
            &amount,
        );
        emit(&e, symbol_short!("wdrw"), (token, amount, e.ledger().sequence()));
        Ok(())
    }

    /// Emergency drain: atomically pauses the sale AND withdraws all sell_token to admin.
    /// Admin only. For the "oh shit" scenario.
    pub fn emergency_drain(e: Env) {
        let mut offer = load_offer(&e);
        offer.admin.require_auth();

        // Pause
        offer.is_active = false;
        write_offer(&e, &offer);

        // Drain all sell_token
        let sell_client = token::Client::new(&e, &offer.sell_token);
        let balance = sell_client.balance(&e.current_contract_address());
        if balance > 0 {
            sell_client.transfer(&e.current_contract_address(), &offer.admin, &balance);
        }

        emit(&e, symbol_short!("drain"), (balance, e.ledger().sequence()));
    }

    /// Pause or resume the sale. Seller only.
    pub fn set_active(e: Env, active: bool) {
        let mut offer = load_offer(&e);
        offer.seller.require_auth();
        offer.is_active = active;
        write_offer(&e, &offer);
        emit(&e, symbol_short!("status"), (active, e.ledger().sequence()));
    }

    /// Update price. Seller only. Emits "price" event.
    pub fn updt_price(e: Env, sell_price: u32, buy_price: u32) -> Result<(), SaleError> {
        if buy_price == 0 || sell_price == 0 {
            return Err(SaleError::ZeroPrice);
        }
        let mut offer = load_offer(&e);
        offer.seller.require_auth();
        offer.sell_price = sell_price;
        offer.buy_price = buy_price;
        write_offer(&e, &offer);
        emit(&e, symbol_short!("price"), (sell_price, buy_price, e.ledger().sequence()));
        Ok(())
    }

    // ═══════════════════════════════════════════
    // Admin transfer (2-step)
    // ═══════════════════════════════════════════

    /// Step 1: Current admin proposes a new admin.
    pub fn propose_admin(e: Env, new_admin: Address) {
        let offer = load_offer(&e);
        offer.admin.require_auth();
        e.storage().instance().set(&DataKey::PendingAdmin, &new_admin);
        e.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        emit(&e, symbol_short!("padmin"), (new_admin, e.ledger().sequence()));
    }

    /// Step 2: Proposed admin accepts the role.
    pub fn accept_admin(e: Env) -> Result<(), SaleError> {
        let pending: Address = e
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(SaleError::NoPendingAdmin)?;
        pending.require_auth();

        let mut offer = load_offer(&e);
        let old_admin = offer.admin.clone();
        offer.admin = pending;
        write_offer(&e, &offer);

        e.storage().instance().remove(&DataKey::PendingAdmin);
        emit(&e, symbol_short!("aadmin"), (old_admin, e.ledger().sequence()));
        Ok(())
    }

    // ═══════════════════════════════════════════
    // Buyer freeze / blocklist
    // ═══════════════════════════════════════════

    /// Admin freezes or unfreezes a buyer. Frozen buyers cannot trade.
    pub fn freeze_buyer(e: Env, buyer: Address, frozen: bool) {
        let offer = load_offer(&e);
        offer.admin.require_auth();

        let key = DataKey::BuyerBlocked(buyer.clone());
        if frozen {
            e.storage().persistent().set(&key, &true);
            e.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        } else {
            e.storage().persistent().remove(&key);
        }
        emit(&e, symbol_short!("freeze"), (buyer, frozen, e.ledger().sequence()));
    }

    /// Returns whether a buyer is frozen.
    pub fn is_frozen(e: Env, buyer: Address) -> bool {
        is_buyer_blocked(&e, &buyer)
    }

    // ═══════════════════════════════════════════
    // Read-only queries
    // ═══════════════════════════════════════════

    /// Upgrade contract WASM. Admin only (high-privilege).
    pub fn upgrade(e: Env, new_wasm_hash: BytesN<32>) {
        let offer = load_offer(&e);
        offer.admin.require_auth();
        e.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Extend contract instance TTL. Anyone can call (allows cron jobs).
    /// NOTE: WASM code TTL must be extended separately via
    /// `stellar contract extend --wasm-hash <HASH> --ledgers-to-extend 518400`
    pub fn extend_ttl(e: Env) {
        e.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    }

    /// Returns the current offer state.
    pub fn get_offer(e: Env) -> Offer {
        load_offer(&e)
    }

    /// Returns the contract's balance of the sell token.
    pub fn get_balance(e: Env) -> i128 {
        let offer = load_offer(&e);
        token::Client::new(&e, &offer.sell_token).balance(&e.current_contract_address())
    }

    /// Returns cumulative buy_token spent by a buyer.
    pub fn get_buyer_spent(e: Env, buyer: Address) -> i128 {
        get_buyer_spent(&e, &buyer)
    }

    /// Returns the contract version.
    pub fn version(_e: Env) -> u32 {
        CONTRACT_VERSION
    }
}

// ═══════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════

fn load_offer(e: &Env) -> Offer {
    e.storage().instance().get(&DataKey::Offer).unwrap()
}

fn write_offer(e: &Env, offer: &Offer) {
    e.storage().instance().set(&DataKey::Offer, offer);
    e.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}

fn get_buyer_spent(e: &Env, buyer: &Address) -> i128 {
    let key = DataKey::BuyerSpent(buyer.clone());
    e.storage().persistent().get(&key).unwrap_or(0)
}

fn set_buyer_spent(e: &Env, buyer: &Address, amount: i128) {
    let key = DataKey::BuyerSpent(buyer.clone());
    e.storage().persistent().set(&key, &amount);
    e.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn is_buyer_blocked(e: &Env, buyer: &Address) -> bool {
    let key = DataKey::BuyerBlocked(buyer.clone());
    e.storage().persistent().get(&key).unwrap_or(false)
}

mod test;
