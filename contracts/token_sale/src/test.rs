#![cfg(test)]

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{token, Address, Env};

use crate::{DataKey, Offer, SaleError, TokenSale, TokenSaleClient};

fn create_token_contract<'a>(
    e: &Env,
    admin: &Address,
) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let sac = e.register_stellar_asset_contract_v2(admin.clone());
    (
        token::Client::new(e, &sac.address()),
        token::StellarAssetClient::new(e, &sac.address()),
    )
}

/// Standard setup: admin == seller, fixed_fee=0 (no fee, all to company), no deadline, no min, no cap.
fn setup_sale<'a>(
    e: &Env,
) -> (
    TokenSaleClient<'a>,
    Address,                       // admin (== seller)
    Address,                       // buyer
    Address,                       // treasury
    token::Client<'a>,             // sell_token
    token::StellarAssetClient<'a>, // sell_token_admin
    token::Client<'a>,             // buy_token
    token::StellarAssetClient<'a>, // buy_token_admin
    Address,                       // sale_id
) {
    let admin = Address::generate(e);
    let buyer = Address::generate(e);
    let treasury = Address::generate(e);
    let company = Address::generate(e);

    let (sell_token, sell_token_admin) = create_token_contract(e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(e, &buyer);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(e, &sale_id);

    sale.create(
        &admin, &admin,
        &sell_token.address, &buy_token.address, &treasury,
        &company, &0i128,  // fixed_fee=0: no fee, all to company
        &1, &1,
        &0, &0, &0, // no deadline, no min, no cap
    );

    let supply: i128 = 1_000 * 10_000_000;
    sell_token_admin.mint(&admin, &supply);
    buy_token_admin.mint(&buyer, &(500 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &supply);
    sale.set_active(&true);

    (sale, admin, buyer, treasury, sell_token, sell_token_admin, buy_token, buy_token_admin, sale_id)
}

// ═══════════════════════════════════════════════════════
//  1. create() — 7 tests
// ═══════════════════════════════════════════════════════

#[test]
fn test_create_happy_path() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let seller = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &admin);
    let treasury = Address::generate(&e);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &seller, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &1000, &(10*10_000_000), &(100*10_000_000));

    let offer = sale.get_offer();
    assert_eq!(offer.admin, admin);
    assert_eq!(offer.seller, seller);
    assert_eq!(offer.is_active, false);
    assert_eq!(offer.deadline_ledger, 1000);
    assert_eq!(offer.min_buy_amount, 10 * 10_000_000);
    assert_eq!(offer.max_buy_per_buyer, 100 * 10_000_000);
}

#[test]
fn test_create_double_create_fails() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &admin);
    let treasury = Address::generate(&e);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &0, &0);
    let result = sale.try_create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &0, &0);
    assert_eq!(result, Err(Ok(SaleError::AlreadyCreated)));
}

#[test]
fn test_create_zero_sell_price() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    let result = sale.try_create(&admin, &admin, &sell_token.address, &buy_token.address, &Address::generate(&e), &Address::generate(&e), &0i128, &0, &1, &0, &0, &0);
    assert_eq!(result, Err(Ok(SaleError::ZeroPrice)));
}

#[test]
fn test_create_zero_buy_price() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    let result = sale.try_create(&admin, &admin, &sell_token.address, &buy_token.address, &Address::generate(&e), &Address::generate(&e), &0i128, &1, &0, &0, &0, &0);
    assert_eq!(result, Err(Ok(SaleError::ZeroPrice)));
}

#[test]
fn test_create_both_prices_zero() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    let result = sale.try_create(&admin, &admin, &sell_token.address, &buy_token.address, &Address::generate(&e), &Address::generate(&e), &0i128, &0, &0, &0, &0, &0);
    assert_eq!(result, Err(Ok(SaleError::ZeroPrice)));
}

#[test]
fn test_create_max_u32_prices() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &Address::generate(&e), &Address::generate(&e), &0i128, &u32::MAX, &u32::MAX, &0, &0, &0);
    let offer = sale.get_offer();
    assert_eq!(offer.sell_price, u32::MAX);
    assert_eq!(offer.buy_price, u32::MAX);
}

#[test]
fn test_create_with_compliance_fields() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    // deadline=500, min=1000 stroops, cap=5000 stroops
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &Address::generate(&e), &Address::generate(&e), &0i128, &1, &1, &500, &1000, &5000);
    let offer = sale.get_offer();
    assert_eq!(offer.deadline_ledger, 500);
    assert_eq!(offer.min_buy_amount, 1000);
    assert_eq!(offer.max_buy_per_buyer, 5000);
}

// ═══════════════════════════════════════════════════════
//  2. trade() — CORE (14 tests)
// ═══════════════════════════════════════════════════════

#[test]
fn test_trade_happy_1_to_1() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, treasury, sell_token, _, buy_token, _, sale_id) = setup_sale(&e);
    let amount: i128 = 100 * 10_000_000;
    sale.trade(&buyer, &amount);
    assert_eq!(sell_token.balance(&buyer), amount);
    // fixed_fee=0: company gets all USDC, treasury gets 0
    assert_eq!(buy_token.balance(&treasury), 0);
    assert_eq!(sell_token.balance(&sale_id), 1_000 * 10_000_000 - amount);
}

#[test]
fn test_trade_minimum_1_stroop() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, treasury, sell_token, _, buy_token, _, _) = setup_sale(&e);
    sale.trade(&buyer, &1i128);
    assert_eq!(sell_token.balance(&buyer), 1);
    // fixed_fee=0: company gets 1 stroop, treasury 0
    assert_eq!(buy_token.balance(&treasury), 0);
}

#[test]
fn test_trade_exact_exhaustion() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &buyer);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &0, &0);
    let supply: i128 = 100 * 10_000_000;
    sell_token_admin.mint(&admin, &supply);
    sell_token.transfer(&admin, &sale_id, &supply);
    buy_token_admin.mint(&buyer, &supply);
    sale.set_active(&true);
    sale.trade(&buyer, &supply);
    assert_eq!(sell_token.balance(&sale_id), 0);
    assert_eq!(sell_token.balance(&buyer), supply);
}

#[test]
fn test_trade_multiple_buyers() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let buyer_a = Address::generate(&e);
    let buyer_b = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &0, &0);
    sell_token_admin.mint(&admin, &(200 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(200 * 10_000_000i128));
    buy_token_admin.mint(&buyer_a, &(100 * 10_000_000i128));
    buy_token_admin.mint(&buyer_b, &(100 * 10_000_000i128));
    sale.set_active(&true);
    sale.trade(&buyer_a, &(100 * 10_000_000i128));
    sale.trade(&buyer_b, &(100 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer_a), 100 * 10_000_000);
    assert_eq!(sell_token.balance(&buyer_b), 100 * 10_000_000);
    assert_eq!(sell_token.balance(&sale_id), 0);
}

#[test]
fn test_trade_non_1to1_pricing() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &3, &2, &0, &0, &0);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(100 * 10_000_000i128));
    sale.set_active(&true);
    sale.trade(&buyer, &(100 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer), 150 * 10_000_000); // 100 * 3/2
}

#[test]
fn test_trade_rounding_truncation() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &3, &0, &0, &0);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(100 * 10_000_000i128));
    sale.set_active(&true);

    sale.trade(&buyer, &10i128);
    assert_eq!(sell_token.balance(&buyer), 3); // 10/3 = 3.33 → 3

    let result = sale.try_trade(&buyer, &1i128);
    assert_eq!(result, Err(Ok(SaleError::TradeTooSmall))); // 1/3 → 0

    let result = sale.try_trade(&buyer, &2i128);
    assert_eq!(result, Err(Ok(SaleError::TradeTooSmall))); // 2/3 → 0

    sale.trade(&buyer, &3i128);
    assert_eq!(sell_token.balance(&buyer), 4); // 3/3 → 1
}

#[test]
fn test_trade_zero_amount() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);
    assert_eq!(sale.try_trade(&buyer, &0), Err(Ok(SaleError::InvalidAmount)));
}

#[test]
fn test_trade_negative_amount() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);
    assert_eq!(sale.try_trade(&buyer, &-1), Err(Ok(SaleError::InvalidAmount)));
}

#[test]
fn test_trade_i128_min() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);
    assert_eq!(sale.try_trade(&buyer, &i128::MIN), Err(Ok(SaleError::InvalidAmount)));
}

#[test]
fn test_trade_while_paused() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);
    sale.set_active(&false);
    assert_eq!(sale.try_trade(&buyer, &(100 * 10_000_000i128)), Err(Ok(SaleError::NotActive)));
}

#[test]
fn test_trade_before_activation() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &buyer);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &Address::generate(&e), &Address::generate(&e), &0i128, &1, &1, &0, &0, &0);
    assert_eq!(sale.try_trade(&buyer, &(10 * 10_000_000i128)), Err(Ok(SaleError::NotActive)));
}

#[test]
#[should_panic]
fn test_trade_exceeds_buyer_balance() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);
    sale.trade(&buyer, &(600 * 10_000_000i128));
}

#[test]
#[should_panic]
fn test_trade_exceeds_contract_supply() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &Address::generate(&e), &Address::generate(&e), &0i128, &1, &1, &0, &0, &0);
    sell_token_admin.mint(&admin, &(5 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(5 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(100 * 10_000_000i128));
    sale.set_active(&true);
    sale.trade(&buyer, &(50 * 10_000_000i128));
}

#[test]
fn test_trade_repeated_same_buyer() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, treasury, sell_token, _, buy_token, _, sale_id) = setup_sale(&e);
    for _ in 0..10 {
        sale.trade(&buyer, &(50 * 10_000_000i128));
    }
    assert_eq!(sell_token.balance(&buyer), 500 * 10_000_000);
    // fixed_fee=0: treasury gets nothing
    assert_eq!(buy_token.balance(&treasury), 0);
    assert_eq!(sell_token.balance(&sale_id), 500 * 10_000_000);
}

// ═══════════════════════════════════════════════════════
//  3. DEADLINE — 4 tests
// ═══════════════════════════════════════════════════════

#[test]
fn test_deadline_trade_before_deadline() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    // Deadline at ledger 1000
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &1000, &0, &0);
    sell_token_admin.mint(&admin, &(100 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(100 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(100 * 10_000_000i128));
    sale.set_active(&true);

    // Ledger 500 — before deadline
    e.ledger().with_mut(|li| li.sequence_number = 500);
    sale.trade(&buyer, &(10 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer), 10 * 10_000_000);
}

#[test]
fn test_deadline_trade_at_exact_deadline() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &1000, &0, &0);
    sell_token_admin.mint(&admin, &(100 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(100 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(100 * 10_000_000i128));
    sale.set_active(&true);

    // Ledger 1000 — exactly at deadline → still OK
    e.ledger().with_mut(|li| li.sequence_number = 1000);
    sale.trade(&buyer, &(10 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer), 10 * 10_000_000);
}

#[test]
fn test_deadline_trade_after_deadline() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &buyer);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &Address::generate(&e), &Address::generate(&e), &0i128, &1, &1, &1000, &0, &0);
    sale.set_active(&true);

    // Ledger 1001 — AFTER deadline → Expired
    e.ledger().with_mut(|li| li.sequence_number = 1001);
    let result = sale.try_trade(&buyer, &(10 * 10_000_000i128));
    assert_eq!(result, Err(Ok(SaleError::Expired)));
}

#[test]
fn test_deadline_zero_means_no_deadline() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, _, sell_token, _, _, _, _) = setup_sale(&e);

    // Set ledger far into the future — should still work (deadline=0)
    e.ledger().with_mut(|li| li.sequence_number = 999_999_999);
    sale.trade(&buyer, &(10 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer), 10 * 10_000_000);
}

// ═══════════════════════════════════════════════════════
//  4. MIN INVESTMENT — 3 tests
// ═══════════════════════════════════════════════════════

#[test]
fn test_min_investment_above_minimum() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    let min: i128 = 100 * 10_000_000; // min 100 USDC
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &min, &0);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(500 * 10_000_000i128));
    sale.set_active(&true);

    // 200 USDC ≥ 100 min → OK
    sale.trade(&buyer, &(200 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer), 200 * 10_000_000);
}

#[test]
fn test_min_investment_exact_minimum() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    let min: i128 = 100 * 10_000_000;
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &min, &0);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(500 * 10_000_000i128));
    sale.set_active(&true);

    // Exactly 100 USDC → OK
    sale.trade(&buyer, &min);
    assert_eq!(sell_token.balance(&buyer), 100 * 10_000_000);
}

#[test]
fn test_min_investment_below_minimum() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &buyer);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    let min: i128 = 100 * 10_000_000;
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &Address::generate(&e), &Address::generate(&e), &0i128, &1, &1, &0, &min, &0);
    sale.set_active(&true);

    // 50 USDC < 100 min → BelowMinimum
    let result = sale.try_trade(&buyer, &(50 * 10_000_000i128));
    assert_eq!(result, Err(Ok(SaleError::BelowMinimum)));
}

// ═══════════════════════════════════════════════════════
//  5. PER-BUYER CAP — 5 tests
// ═══════════════════════════════════════════════════════

#[test]
fn test_buyer_cap_within_limit() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    let cap: i128 = 200 * 10_000_000;
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &0, &cap);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(500 * 10_000_000i128));
    sale.set_active(&true);

    sale.trade(&buyer, &(100 * 10_000_000i128));
    assert_eq!(sale.get_buyer_spent(&buyer), 100 * 10_000_000);

    sale.trade(&buyer, &(100 * 10_000_000i128));
    assert_eq!(sale.get_buyer_spent(&buyer), 200 * 10_000_000);
}

#[test]
fn test_buyer_cap_exceeded() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    let cap: i128 = 100 * 10_000_000;
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &0, &cap);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(500 * 10_000_000i128));
    sale.set_active(&true);

    sale.trade(&buyer, &(80 * 10_000_000i128));

    // 80 + 50 = 130 > 100 cap → BuyerCapExceeded
    let result = sale.try_trade(&buyer, &(50 * 10_000_000i128));
    assert_eq!(result, Err(Ok(SaleError::BuyerCapExceeded)));
}

#[test]
fn test_buyer_cap_exact_limit() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    let cap: i128 = 100 * 10_000_000;
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &0, &cap);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(500 * 10_000_000i128));
    sale.set_active(&true);

    // Exactly at cap → OK
    sale.trade(&buyer, &cap);
    assert_eq!(sale.get_buyer_spent(&buyer), cap);

    // 1 stroop over → BuyerCapExceeded
    let result = sale.try_trade(&buyer, &1);
    assert_eq!(result, Err(Ok(SaleError::BuyerCapExceeded)));
}

#[test]
fn test_buyer_cap_independent_per_buyer() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer_a = Address::generate(&e);
    let buyer_b = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    let cap: i128 = 100 * 10_000_000;
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &0, &cap);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    buy_token_admin.mint(&buyer_a, &(200 * 10_000_000i128));
    buy_token_admin.mint(&buyer_b, &(200 * 10_000_000i128));
    sale.set_active(&true);

    // A uses full cap
    sale.trade(&buyer_a, &cap);
    let result = sale.try_trade(&buyer_a, &1);
    assert_eq!(result, Err(Ok(SaleError::BuyerCapExceeded)));

    // B is independent — full cap available
    sale.trade(&buyer_b, &cap);
    assert_eq!(sale.get_buyer_spent(&buyer_a), cap);
    assert_eq!(sale.get_buyer_spent(&buyer_b), cap);
}

#[test]
fn test_buyer_cap_zero_means_no_cap() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, _, sell_token, _, _, _, _) = setup_sale(&e);

    // cap=0 in setup → no limit
    sale.trade(&buyer, &(500 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer), 500 * 10_000_000);
}

// ═══════════════════════════════════════════════════════
//  6. EMERGENCY DRAIN — 4 tests
// ═══════════════════════════════════════════════════════

#[test]
fn test_emergency_drain() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, admin, _, _, sell_token, _, _, _, sale_id) = setup_sale(&e);

    let balance_before = sell_token.balance(&sale_id);
    assert_eq!(balance_before, 1_000 * 10_000_000);

    sale.emergency_drain();

    // Contract is paused
    assert_eq!(sale.get_offer().is_active, false);
    // All tokens drained to admin
    assert_eq!(sell_token.balance(&sale_id), 0);
    assert_eq!(sell_token.balance(&admin), balance_before);
}

#[test]
fn test_emergency_drain_empty_contract() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, admin, _, _, sell_token, _, _, _, sale_id) = setup_sale(&e);

    // First drain everything
    sale.withdraw(&sell_token.address, &(1_000 * 10_000_000i128));
    assert_eq!(sell_token.balance(&sale_id), 0);

    // Emergency drain on empty contract — should not panic
    sale.emergency_drain();
    assert_eq!(sale.get_offer().is_active, false);
    assert_eq!(sell_token.balance(&admin), 1_000 * 10_000_000);
}

#[test]
fn test_emergency_drain_blocks_further_trades() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);

    sale.emergency_drain();

    let result = sale.try_trade(&buyer, &(10 * 10_000_000i128));
    assert_eq!(result, Err(Ok(SaleError::NotActive)));
}

#[test]
fn test_emergency_drain_after_partial_trades() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, admin, buyer, _, sell_token, _, _, _, sale_id) = setup_sale(&e);

    // Some trades happen
    sale.trade(&buyer, &(300 * 10_000_000i128));
    assert_eq!(sell_token.balance(&sale_id), 700 * 10_000_000);

    // Emergency drain
    sale.emergency_drain();
    assert_eq!(sell_token.balance(&sale_id), 0);
    assert_eq!(sell_token.balance(&admin), 700 * 10_000_000);
}

// ═══════════════════════════════════════════════════════
//  7. ADMIN TRANSFER (2-step) — 6 tests
// ═══════════════════════════════════════════════════════

#[test]
fn test_admin_transfer_happy_path() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, old_admin, _, _, _, _, _, _, _) = setup_sale(&e);
    let new_admin = Address::generate(&e);

    // Step 1: propose
    sale.propose_admin(&new_admin);

    // Step 2: accept
    sale.accept_admin();

    let offer = sale.get_offer();
    assert_eq!(offer.admin, new_admin);
    assert_ne!(offer.admin, old_admin);
}

#[test]
fn test_admin_transfer_new_admin_can_withdraw() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _old_admin, _, _, sell_token, _, _, _, sale_id) = setup_sale(&e);
    let new_admin = Address::generate(&e);

    sale.propose_admin(&new_admin);
    sale.accept_admin();

    // New admin can withdraw (goes to new admin)
    sale.withdraw(&sell_token.address, &(100 * 10_000_000i128));
    assert_eq!(sell_token.balance(&new_admin), 100 * 10_000_000);
    assert_eq!(sell_token.balance(&sale_id), 900 * 10_000_000);
}

#[test]
fn test_admin_transfer_accept_without_propose() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, _, _, _, _, _, _, _) = setup_sale(&e);

    let result = sale.try_accept_admin();
    assert_eq!(result, Err(Ok(SaleError::NoPendingAdmin)));
}

#[test]
fn test_admin_transfer_propose_overwrite() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, _, _, _, _, _, _, _) = setup_sale(&e);
    let first = Address::generate(&e);
    let second = Address::generate(&e);

    sale.propose_admin(&first);
    sale.propose_admin(&second); // overwrite

    sale.accept_admin();
    assert_eq!(sale.get_offer().admin, second); // second wins
}

#[test]
fn test_admin_transfer_chain() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, admin_a, _, _, _, _, _, _, _) = setup_sale(&e);
    let admin_b = Address::generate(&e);
    let admin_c = Address::generate(&e);

    // A → B
    sale.propose_admin(&admin_b);
    sale.accept_admin();
    assert_eq!(sale.get_offer().admin, admin_b);

    // B → C
    sale.propose_admin(&admin_c);
    sale.accept_admin();
    assert_eq!(sale.get_offer().admin, admin_c);

    // Verify A is no longer admin
    assert_ne!(sale.get_offer().admin, admin_a);
}

#[test]
fn test_admin_transfer_seller_unchanged() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _old_admin, _, _, _, _, _, _, _) = setup_sale(&e);
    let new_admin = Address::generate(&e);

    let seller_before = sale.get_offer().seller.clone();

    sale.propose_admin(&new_admin);
    sale.accept_admin();

    // Admin changed, seller unchanged
    assert_eq!(sale.get_offer().admin, new_admin);
    assert_eq!(sale.get_offer().seller, seller_before);
}

// ═══════════════════════════════════════════════════════
//  8. BUYER FREEZE — 5 tests
// ═══════════════════════════════════════════════════════

#[test]
fn test_freeze_buyer_blocks_trade() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);

    sale.freeze_buyer(&buyer, &true);
    assert_eq!(sale.is_frozen(&buyer), true);

    let result = sale.try_trade(&buyer, &(10 * 10_000_000i128));
    assert_eq!(result, Err(Ok(SaleError::BuyerBlocked)));
}

#[test]
fn test_unfreeze_buyer_allows_trade() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, buyer, _, sell_token, _, _, _, _) = setup_sale(&e);

    sale.freeze_buyer(&buyer, &true);
    assert_eq!(sale.try_trade(&buyer, &(10 * 10_000_000i128)), Err(Ok(SaleError::BuyerBlocked)));

    sale.freeze_buyer(&buyer, &false);
    assert_eq!(sale.is_frozen(&buyer), false);

    sale.trade(&buyer, &(10 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer), 10 * 10_000_000);
}

#[test]
fn test_freeze_only_affects_target() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer_a = Address::generate(&e);
    let buyer_b = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &0, &0);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    buy_token_admin.mint(&buyer_a, &(100 * 10_000_000i128));
    buy_token_admin.mint(&buyer_b, &(100 * 10_000_000i128));
    sale.set_active(&true);

    // Freeze A only
    sale.freeze_buyer(&buyer_a, &true);

    // B can still trade
    sale.trade(&buyer_b, &(50 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer_b), 50 * 10_000_000);

    // A is blocked
    let result = sale.try_trade(&buyer_a, &(50 * 10_000_000i128));
    assert_eq!(result, Err(Ok(SaleError::BuyerBlocked)));
}

#[test]
fn test_freeze_idempotent() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);

    // Double freeze — no panic
    sale.freeze_buyer(&buyer, &true);
    sale.freeze_buyer(&buyer, &true);
    assert_eq!(sale.is_frozen(&buyer), true);

    // Double unfreeze — no panic
    sale.freeze_buyer(&buyer, &false);
    sale.freeze_buyer(&buyer, &false);
    assert_eq!(sale.is_frozen(&buyer), false);
}

#[test]
fn test_unfrozen_by_default() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);

    // Fresh buyer is NOT frozen
    assert_eq!(sale.is_frozen(&buyer), false);
    assert_eq!(sale.is_frozen(&Address::generate(&e)), false);
}

// ═══════════════════════════════════════════════════════
//  9. withdraw / set_active / updt_price — 8 tests
// ═══════════════════════════════════════════════════════

#[test]
fn test_withdraw_happy_path() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, admin, _, _, sell_token, _, _, _, sale_id) = setup_sale(&e);
    sale.withdraw(&sell_token.address, &(200 * 10_000_000i128));
    assert_eq!(sell_token.balance(&sale_id), 800 * 10_000_000);
    assert_eq!(sell_token.balance(&admin), 200 * 10_000_000);
}

#[test]
fn test_withdraw_zero() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, _, _, sell_token, _, _, _, _) = setup_sale(&e);
    assert_eq!(sale.try_withdraw(&sell_token.address, &0), Err(Ok(SaleError::InvalidAmount)));
}

#[test]
fn test_withdraw_negative() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, _, _, sell_token, _, _, _, _) = setup_sale(&e);
    assert_eq!(sale.try_withdraw(&sell_token.address, &-1), Err(Ok(SaleError::InvalidAmount)));
}

#[test]
fn test_set_active_toggle() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, _, _, _, _, _, _, _) = setup_sale(&e);
    sale.set_active(&false);
    assert_eq!(sale.get_offer().is_active, false);
    sale.set_active(&true);
    assert_eq!(sale.get_offer().is_active, true);
}

#[test]
fn test_updt_price_happy() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, _, _, _, _, _, _, _) = setup_sale(&e);
    sale.updt_price(&5, &2);
    let offer = sale.get_offer();
    assert_eq!(offer.sell_price, 5);
    assert_eq!(offer.buy_price, 2);
}

#[test]
fn test_updt_price_zero() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, _, _, _, _, _, _, _) = setup_sale(&e);
    assert_eq!(sale.try_updt_price(&0, &1), Err(Ok(SaleError::ZeroPrice)));
    assert_eq!(sale.try_updt_price(&1, &0), Err(Ok(SaleError::ZeroPrice)));
}

#[test]
fn test_trade_uses_updated_price() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, _, sell_token, _, _, _, _) = setup_sale(&e);
    sale.trade(&buyer, &(100 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer), 100 * 10_000_000);
    sale.updt_price(&2, &1);
    sale.trade(&buyer, &(100 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer), 300 * 10_000_000); // 100 + 200
}

#[test]
fn test_trade_after_pause_resume() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, _, sell_token, _, _, _, _) = setup_sale(&e);
    sale.set_active(&false);
    assert_eq!(sale.try_trade(&buyer, &(10 * 10_000_000i128)), Err(Ok(SaleError::NotActive)));
    sale.set_active(&true);
    sale.trade(&buyer, &(10 * 10_000_000i128));
    assert_eq!(sell_token.balance(&buyer), 10 * 10_000_000);
}

// ═══════════════════════════════════════════════════════
//  10. FEE SPLIT — 5 tests
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//  10. FIXED FEE — 5 tests
// ═══════════════════════════════════════════════════════

#[test]
fn test_trade_fixed_fee_5_usdc() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let company = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    // fixed_fee = 50_000_000 stroops = $5 USDC (additive)
    let fee: i128 = 50_000_000;
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &company, &fee, &1, &1, &0, &0, &0);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    // Buyer needs 100 USDC + $5 fee = 105 USDC
    buy_token_admin.mint(&buyer, &(105 * 10_000_000i128));
    sale.set_active(&true);

    let amount: i128 = 100 * 10_000_000; // 100 USDC investment
    sale.trade(&buyer, &amount);
    // Additive fee: company gets full $100, treasury gets $5
    assert_eq!(buy_token.balance(&treasury), 50_000_000);       // $5 fee
    assert_eq!(buy_token.balance(&company), 100 * 10_000_000);  // $100 investment
    assert_eq!(buy_token.balance(&buyer), 0);                   // 105 - 105 = 0
    assert_eq!(sell_token.balance(&buyer), 100 * 10_000_000);   // 100 tokens
}

#[test]
fn test_trade_fixed_fee_zero_no_fee() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let company = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    // fixed_fee = 0 → company gets 100%
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &company, &0i128, &1, &1, &0, &0, &0);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(100 * 10_000_000i128));
    sale.set_active(&true);

    sale.trade(&buyer, &(100 * 10_000_000i128));
    assert_eq!(buy_token.balance(&treasury), 0);
    assert_eq!(buy_token.balance(&company), 100 * 10_000_000);
}

#[test]
fn test_trade_insufficient_balance_for_fee() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let company = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    // fixed_fee = $5. Buyer has $10, wants to buy $10 → needs $15, fails
    let fee: i128 = 50_000_000;
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &company, &fee, &1, &1, &0, &0, &0);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    // Buyer only has $10, but $10 trade + $5 fee = $15 needed
    buy_token_admin.mint(&buyer, &(10 * 10_000_000i128));
    sale.set_active(&true);

    // $10 trade → needs $15, but only has $10 → transfer fails (Soroban reverts)
    let result = sale.try_trade(&buyer, &(10 * 10_000_000i128));
    assert!(result.is_err());
}

#[test]
fn test_trade_fixed_fee_just_above() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let company = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    // fixed_fee = $5. Trade 1 stroop → company gets 1 stroop, treasury gets $5
    let fee: i128 = 50_000_000;
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &company, &fee, &1, &1, &0, &0, &0);
    sell_token_admin.mint(&admin, &(1_000 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(1_000 * 10_000_000i128));
    // Buyer needs 1 stroop + $5 fee
    buy_token_admin.mint(&buyer, &(50_000_001i128));
    sale.set_active(&true);

    let one_stroop: i128 = 1;
    sale.trade(&buyer, &one_stroop);
    assert_eq!(buy_token.balance(&treasury), 50_000_000); // $5 fee
    assert_eq!(buy_token.balance(&company), 1);            // 1 stroop investment
    assert_eq!(sell_token.balance(&buyer), 1);             // 1 token
}

#[test]
fn test_create_negative_fixed_fee() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    let result = sale.try_create(&admin, &admin, &sell_token.address, &buy_token.address, &Address::generate(&e), &Address::generate(&e), &-1i128, &1, &1, &0, &0, &0);
    assert_eq!(result, Err(Ok(SaleError::InvalidAmount)));
}

// ═══════════════════════════════════════════════════════
//  11. Read-only + extend_ttl + overflow — 5 tests
// ═══════════════════════════════════════════════════════

#[test]
fn test_version_returns_5() {
    let e = Env::default();
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    assert_eq!(sale.version(), 5);
}

#[test]
fn test_extend_ttl_anyone_can_call() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, _, _, _, _, _, _, _) = setup_sale(&e);
    sale.extend_ttl();
}

#[test]
fn test_get_balance_after_trades() {
    let e = Env::default();
    e.mock_all_auths();
    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);
    assert_eq!(sale.get_balance(), 1_000 * 10_000_000);
    sale.trade(&buyer, &(100 * 10_000_000i128));
    assert_eq!(sale.get_balance(), 900 * 10_000_000);
}

#[test]
fn test_overflow_i128_max() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &buyer);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &Address::generate(&e), &Address::generate(&e), &0i128, &2, &1, &0, &0, &0);
    sale.set_active(&true);
    assert_eq!(sale.try_trade(&buyer, &i128::MAX), Err(Ok(SaleError::Overflow)));
}

#[test]
fn test_atomicity_failed_trade_reverts() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);
    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &admin);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &Address::generate(&e), &0i128, &1, &1, &0, &0, &0);
    sell_token_admin.mint(&admin, &(5 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(5 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(100 * 10_000_000i128));
    sale.set_active(&true);

    let buyer_before = buy_token.balance(&buyer);
    let contract_before = sell_token.balance(&sale_id);
    let treasury_before = buy_token.balance(&treasury);

    let result = sale.try_trade(&buyer, &(50 * 10_000_000i128));
    assert!(result.is_err());

    assert_eq!(buy_token.balance(&buyer), buyer_before);
    assert_eq!(sell_token.balance(&sale_id), contract_before);
    assert_eq!(buy_token.balance(&treasury), treasury_before);
}

// ═══════════════════════════════════════════════════════════
//  11. AUTH ENFORCEMENT — 9 tests (NO mock_all_auths!)
//
//  These tests run WITHOUT mock_all_auths(). They use
//  e.as_contract() to seed storage directly, then verify
//  that require_auth() panics for every sensitive function.
//  If require_auth() was ever accidentally removed from
//  any function, these tests would FAIL (not panic).
// ═══════════════════════════════════════════════════════════

/// Helper: seed the Offer into contract storage without mock_all_auths.
fn seed_offer(e: &Env, contract: &Address, admin: &Address, seller: &Address) {
    e.as_contract(contract, || {
        e.storage().instance().set(
            &DataKey::Offer,
            &Offer {
                admin: admin.clone(),
                seller: seller.clone(),
                sell_token: Address::generate(e),
                buy_token: Address::generate(e),
                treasury: Address::generate(e),
                company: Address::generate(e),
                fixed_fee: 0,
                sell_price: 1,
                buy_price: 1,
                is_active: true,
                deadline_ledger: 0,
                min_buy_amount: 0,
                max_buy_per_buyer: 0,
            },
        );
    });
}

#[test]
#[should_panic]
fn test_auth_create_requires_admin_auth() {
    let e = Env::default();
    // NO mock_all_auths
    let admin = Address::generate(&e);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    // require_auth() on admin will panic — no auth provided
    sale.create(
        &admin, &admin,
        &Address::generate(&e), &Address::generate(&e), &Address::generate(&e),
        &Address::generate(&e), &0i128,
        &1, &1, &0, &0, &0,
    );
}

#[test]
#[should_panic]
fn test_auth_trade_requires_buyer_auth() {
    let e = Env::default();
    // NO mock_all_auths
    let buyer = Address::generate(&e);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    // buyer.require_auth() is the FIRST statement in trade()
    // Panics before even loading the offer
    sale.trade(&buyer, &100);
}

#[test]
#[should_panic]
fn test_auth_withdraw_requires_admin_auth() {
    let e = Env::default();
    // NO mock_all_auths
    let admin = Address::generate(&e);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    seed_offer(&e, &sale_id, &admin, &admin);

    // offer.admin.require_auth() panics — no auth
    sale.withdraw(&Address::generate(&e), &100);
}

#[test]
#[should_panic]
fn test_auth_emergency_drain_requires_admin_auth() {
    let e = Env::default();
    // NO mock_all_auths
    let admin = Address::generate(&e);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    seed_offer(&e, &sale_id, &admin, &admin);

    // offer.admin.require_auth() panics — no auth
    sale.emergency_drain();
}

#[test]
#[should_panic]
fn test_auth_set_active_requires_seller_auth() {
    let e = Env::default();
    // NO mock_all_auths
    let admin = Address::generate(&e);
    let seller = Address::generate(&e);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    seed_offer(&e, &sale_id, &admin, &seller);

    // offer.seller.require_auth() panics — no auth
    sale.set_active(&true);
}

#[test]
#[should_panic]
fn test_auth_updt_price_requires_seller_auth() {
    let e = Env::default();
    // NO mock_all_auths
    let admin = Address::generate(&e);
    let seller = Address::generate(&e);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    seed_offer(&e, &sale_id, &admin, &seller);

    // offer.seller.require_auth() panics — no auth
    sale.updt_price(&5, &2);
}

#[test]
#[should_panic]
fn test_auth_propose_admin_requires_admin_auth() {
    let e = Env::default();
    // NO mock_all_auths
    let admin = Address::generate(&e);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    seed_offer(&e, &sale_id, &admin, &admin);

    // offer.admin.require_auth() panics — no auth
    sale.propose_admin(&Address::generate(&e));
}

#[test]
#[should_panic]
fn test_auth_accept_admin_requires_pending_auth() {
    let e = Env::default();
    // NO mock_all_auths
    let admin = Address::generate(&e);
    let pending = Address::generate(&e);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    seed_offer(&e, &sale_id, &admin, &admin);

    // Seed pending admin in storage
    e.as_contract(&sale_id, || {
        e.storage().instance().set(&DataKey::PendingAdmin, &pending);
    });

    // pending.require_auth() panics — no auth
    sale.accept_admin();
}

#[test]
#[should_panic]
fn test_auth_freeze_buyer_requires_admin_auth() {
    let e = Env::default();
    // NO mock_all_auths
    let admin = Address::generate(&e);
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    seed_offer(&e, &sale_id, &admin, &admin);

    // offer.admin.require_auth() panics — no auth
    sale.freeze_buyer(&Address::generate(&e), &true);
}
