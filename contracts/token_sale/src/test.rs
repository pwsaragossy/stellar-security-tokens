#![cfg(test)]

use soroban_sdk::testutils::Address as _;
use soroban_sdk::{token, Address, Env};

use crate::{SaleError, TokenSale, TokenSaleClient};

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

/// Standard setup: admin and seller are the SAME address (MVP scenario).
/// For tests that need separated roles, set up manually.
fn setup_sale<'a>(
    e: &Env,
) -> (
    TokenSaleClient<'a>,
    Address,                       // admin (== seller in this helper)
    Address,                       // buyer
    Address,                       // treasury
    token::Client<'a>,             // sell_token
    token::StellarAssetClient<'a>, // sell_token_admin
    token::Client<'a>,             // buy_token
    token::StellarAssetClient<'a>, // buy_token_admin
    Address,                       // sale_id
) {
    let admin = Address::generate(e); // admin == seller for simplicity
    let buyer = Address::generate(e);
    let treasury = Address::generate(e);

    let (sell_token, sell_token_admin) = create_token_contract(e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(e, &buyer);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(e, &sale_id);

    // admin == seller
    sale.create(
        &admin,
        &admin,
        &sell_token.address,
        &buy_token.address,
        &treasury,
        &1,
        &1,
    );

    // Mint and deposit
    let supply: i128 = 1_000 * 10_000_000;
    sell_token_admin.mint(&admin, &supply);
    buy_token_admin.mint(&buyer, &(500 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &supply);

    // Activate after setup
    sale.set_active(&true);

    (
        sale,
        admin,
        buyer,
        treasury,
        sell_token,
        sell_token_admin,
        buy_token,
        buy_token_admin,
        sale_id,
    )
}

// ═══════════════════════════════════════════
// HAPPY PATH TESTS
// ═══════════════════════════════════════════

#[test]
fn test_trade_basic() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _admin, buyer, treasury, sell_token, _, buy_token, _, sale_id) = setup_sale(&e);

    let supply: i128 = 1_000 * 10_000_000;
    let trade_amount: i128 = 100 * 10_000_000;
    sale.trade(&buyer, &trade_amount);

    assert_eq!(sell_token.balance(&buyer), trade_amount);
    assert_eq!(buy_token.balance(&treasury), trade_amount);
    assert_eq!(sell_token.balance(&sale_id), supply - trade_amount);
    assert_eq!(buy_token.balance(&buyer), 500 * 10_000_000 - trade_amount);
}

#[test]
fn test_multiple_trades_same_buyer() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _admin, buyer, treasury, sell_token, _, buy_token, _, sale_id) = setup_sale(&e);

    let amount: i128 = 50 * 10_000_000;
    for _ in 0..10 {
        sale.trade(&buyer, &amount);
    }

    assert_eq!(sell_token.balance(&buyer), 500 * 10_000_000);
    assert_eq!(buy_token.balance(&treasury), 500 * 10_000_000);
    assert_eq!(sell_token.balance(&sale_id), 500 * 10_000_000);
    assert_eq!(buy_token.balance(&buyer), 0);
}

#[test]
fn test_exact_supply_exhaustion() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);

    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &buyer);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &1, &1);

    let exact_supply: i128 = 100 * 10_000_000;
    sell_token_admin.mint(&admin, &exact_supply);
    buy_token_admin.mint(&buyer, &exact_supply);
    sell_token.transfer(&admin, &sale_id, &exact_supply);
    sale.set_active(&true);

    sale.trade(&buyer, &exact_supply);

    assert_eq!(sell_token.balance(&buyer), exact_supply);
    assert_eq!(sell_token.balance(&sale_id), 0);
    assert_eq!(buy_token.balance(&treasury), exact_supply);
}

#[test]
fn test_withdraw_goes_to_admin() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, admin, _, _, sell_token, _, _, _, sale_id) = setup_sale(&e);

    let supply: i128 = 1_000 * 10_000_000;
    let withdraw_amount: i128 = 500 * 10_000_000;
    sale.withdraw(&sell_token.address, &withdraw_amount);

    assert_eq!(sell_token.balance(&sale_id), supply - withdraw_amount);
    assert_eq!(sell_token.balance(&admin), withdraw_amount);
}

#[test]
fn test_version() {
    let e = Env::default();
    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);
    assert_eq!(sale.version(), 2);
}

#[test]
fn test_create_starts_inactive() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &admin);
    let treasury = Address::generate(&e);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &1, &1);

    let offer = sale.get_offer();
    assert_eq!(offer.is_active, false);
}

// ═══════════════════════════════════════════
// ROLE SEPARATION TESTS
// ═══════════════════════════════════════════

#[test]
fn test_admin_seller_separation() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let seller = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);

    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &buyer);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    // admin creates, but seller is a different address
    sale.create(&admin, &seller, &sell_token.address, &buy_token.address, &treasury, &1, &1);

    let offer = sale.get_offer();
    assert_ne!(offer.admin, offer.seller);
    assert_eq!(offer.admin, admin);
    assert_eq!(offer.seller, seller);

    // Setup tokens
    sell_token_admin.mint(&admin, &(100 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(100 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(100 * 10_000_000i128));

    // seller can activate
    sale.set_active(&true);

    // buyer can trade
    sale.trade(&buyer, &(10 * 10_000_000i128));

    // admin can withdraw (goes to admin, not seller)
    sale.withdraw(&sell_token.address, &(10 * 10_000_000i128));
    assert_eq!(sell_token.balance(&admin), 10 * 10_000_000);
}

// ═══════════════════════════════════════════
// NEGATIVE / EDGE CASE TESTS
// ═══════════════════════════════════════════

#[test]
fn test_trade_while_inactive() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);

    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &buyer);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &1, &1);

    let result = sale.try_trade(&buyer, &(100 * 10_000_000i128));
    assert_eq!(result, Err(Ok(SaleError::NotActive)));
}

#[test]
fn test_pause_blocks_trade() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);

    sale.set_active(&false);
    let result = sale.try_trade(&buyer, &(100 * 10_000_000i128));
    assert_eq!(result, Err(Ok(SaleError::NotActive)));
}

#[test]
fn test_trade_zero_amount() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);
    let result = sale.try_trade(&buyer, &0);
    assert_eq!(result, Err(Ok(SaleError::InvalidAmount)));
}

#[test]
fn test_trade_negative_amount() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);
    let result = sale.try_trade(&buyer, &-100);
    assert_eq!(result, Err(Ok(SaleError::InvalidAmount)));
}

#[test]
#[should_panic]
fn test_insufficient_balance_rollback() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, buyer, _, _, _, _, _, _) = setup_sale(&e);
    sale.trade(&buyer, &(600 * 10_000_000i128));
}

#[test]
#[should_panic]
fn test_supply_exhausted_rollback() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);

    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &buyer);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &1, &1);

    sell_token_admin.mint(&admin, &(10 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(10 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(100 * 10_000_000i128));
    sale.set_active(&true);

    sale.trade(&buyer, &(50 * 10_000_000i128));
}

#[test]
fn test_double_create() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &admin);
    let treasury = Address::generate(&e);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &1, &1);
    let result = sale.try_create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &1, &1);
    assert_eq!(result, Err(Ok(SaleError::AlreadyCreated)));
}

#[test]
fn test_create_zero_price() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &admin);
    let treasury = Address::generate(&e);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    let result = sale.try_create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &0, &1);
    assert_eq!(result, Err(Ok(SaleError::ZeroPrice)));
}

#[test]
fn test_withdraw_zero() {
    let e = Env::default();
    e.mock_all_auths();

    let (sale, _, _, _, sell_token, _, _, _, _) = setup_sale(&e);
    let result = sale.try_withdraw(&sell_token.address, &0);
    assert_eq!(result, Err(Ok(SaleError::InvalidAmount)));
}

// ═══════════════════════════════════════════
// ATOMICITY PROOF TESTS
// ═══════════════════════════════════════════

#[test]
fn test_failed_trade_reverts_all_transfers() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);

    let (sell_token, sell_token_admin) = create_token_contract(&e, &admin);
    let (buy_token, buy_token_admin) = create_token_contract(&e, &buyer);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &1, &1);

    sell_token_admin.mint(&admin, &(5 * 10_000_000i128));
    sell_token.transfer(&admin, &sale_id, &(5 * 10_000_000i128));
    buy_token_admin.mint(&buyer, &(100 * 10_000_000i128));
    sale.set_active(&true);

    let buyer_usdc_before = buy_token.balance(&buyer);
    let contract_tokens_before = sell_token.balance(&sale_id);
    let treasury_usdc_before = buy_token.balance(&treasury);

    let result = sale.try_trade(&buyer, &(50 * 10_000_000i128));
    assert!(result.is_err());

    assert_eq!(buy_token.balance(&buyer), buyer_usdc_before);
    assert_eq!(sell_token.balance(&sale_id), contract_tokens_before);
    assert_eq!(buy_token.balance(&treasury), treasury_usdc_before);
    assert_eq!(sell_token.balance(&buyer), 0);
}

// ═══════════════════════════════════════════
// OVERFLOW / EXTREME VALUE TESTS
// ═══════════════════════════════════════════

#[test]
fn test_overflow_extreme_amount() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let buyer = Address::generate(&e);
    let treasury = Address::generate(&e);

    let (sell_token, _) = create_token_contract(&e, &admin);
    let (buy_token, _) = create_token_contract(&e, &buyer);

    let sale_id = e.register(TokenSale, ());
    let sale = TokenSaleClient::new(&e, &sale_id);

    sale.create(&admin, &admin, &sell_token.address, &buy_token.address, &treasury, &2, &1);
    sale.set_active(&true);

    let result = sale.try_trade(&buyer, &i128::MAX);
    assert_eq!(result, Err(Ok(SaleError::Overflow)));
}
