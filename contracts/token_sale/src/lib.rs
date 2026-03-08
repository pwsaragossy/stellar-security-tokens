#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env,
};

const CONTRACT_VERSION: u32 = 2;
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
}

#[contracttype]
pub enum DataKey {
    Offer,
}

/// Represents a single token sale offer.
///
/// Two-role access control:
/// - `admin`: cold key / multisig — controls upgrade + withdraw (high privilege)
/// - `seller`: hot key — controls pause, price updates (day-to-day operations)
///
/// sell_token: token being sold (e.g., TOKEN SAC address).
/// buy_token: payment token (e.g., USDC SAC address).
/// treasury: where buy_token payments are routed.
/// For 1:1 pricing: sell_price = 1, buy_price = 1.
#[contracttype]
#[derive(Clone)]
pub struct Offer {
    pub admin: Address,
    pub seller: Address,
    pub sell_token: Address,
    pub buy_token: Address,
    pub treasury: Address,
    pub sell_price: u32,
    pub buy_price: u32,
    pub is_active: bool,
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
    /// `admin`: high-privilege key (upgrade, withdraw). Ideally multisig/cold.
    /// `seller`: operational key (pause, price). Can be same as admin for MVP.
    pub fn create(
        e: Env,
        admin: Address,
        seller: Address,
        sell_token: Address,
        buy_token: Address,
        treasury: Address,
        sell_price: u32,
        buy_price: u32,
    ) -> Result<(), SaleError> {
        if e.storage().instance().has(&DataKey::Offer) {
            return Err(SaleError::AlreadyCreated);
        }
        if buy_price == 0 || sell_price == 0 {
            return Err(SaleError::ZeroPrice);
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
                sell_price,
                buy_price,
                is_active: false,
            },
        );
        Ok(())
    }

    /// Buyer trades buy_token (USDC) for sell_token.
    /// buy_token_amount is in stroops (1 USDC = 10_000_000 stroops).
    /// Rejects zero amounts. Atomic: all 3 transfers succeed or all revert.
    pub fn trade(e: Env, buyer: Address, buy_token_amount: i128) -> Result<(), SaleError> {
        buyer.require_auth();
        if buy_token_amount <= 0 {
            return Err(SaleError::InvalidAmount);
        }

        let offer = load_offer(&e);
        if !offer.is_active {
            return Err(SaleError::NotActive);
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

        // Atomic: if any transfer fails, all revert (Soroban guarantee)
        buy_token_client.transfer(&buyer, &contract, &buy_token_amount);
        sell_token_client.transfer(&contract, &buyer, &sell_token_amount);
        buy_token_client.transfer(&contract, &offer.treasury, &buy_token_amount);

        emit(
            &e,
            symbol_short!("trade"),
            (buyer, buy_token_amount, sell_token_amount, e.ledger().sequence(), CONTRACT_VERSION),
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

        emit(
            &e,
            symbol_short!("wdrw"),
            (token, amount, e.ledger().sequence()),
        );
        Ok(())
    }

    /// Pause or resume the sale. Seller only.
    pub fn set_active(e: Env, active: bool) {
        let mut offer = load_offer(&e);
        offer.seller.require_auth();
        offer.is_active = active;
        write_offer(&e, &offer);

        emit(
            &e,
            symbol_short!("status"),
            (active, e.ledger().sequence()),
        );
    }

    /// Update price. Seller only.
    pub fn updt_price(e: Env, sell_price: u32, buy_price: u32) -> Result<(), SaleError> {
        if buy_price == 0 || sell_price == 0 {
            return Err(SaleError::ZeroPrice);
        }
        let mut offer = load_offer(&e);
        offer.seller.require_auth();
        offer.sell_price = sell_price;
        offer.buy_price = buy_price;
        write_offer(&e, &offer);
        Ok(())
    }

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

    /// Returns the contract version.
    pub fn version(_e: Env) -> u32 {
        CONTRACT_VERSION
    }
}

fn load_offer(e: &Env) -> Offer {
    e.storage().instance().get(&DataKey::Offer).unwrap()
}

fn write_offer(e: &Env, offer: &Offer) {
    e.storage().instance().set(&DataKey::Offer, offer);
    e.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}

mod test;
