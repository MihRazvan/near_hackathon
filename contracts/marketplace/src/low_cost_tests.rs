//! Small-principal tests use the same authenticated Intents receiver and
//! settlement methods as dollar-sized campaigns. No public transactions.
use super::*;
use near_sdk::{test_utils::VMContextBuilder, testing_env};

fn id(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn at(caller: &str, timestamp: u64) {
    let mut context = VMContextBuilder::new();
    context
        .current_account_id(id("tiny-market.test.near"))
        .predecessor_account_id(id(caller))
        .signer_account_id(id(caller))
        .block_timestamp(timestamp);
    testing_env!(context.build());
}

fn new_market(cents: u128) -> Marketplace {
    at("factory.test.near", 1);
    Marketplace::new(
        id("seller.test.near"),
        id("arbiter.test.near"),
        id("usdc.test.near"),
        id("intents.test.near"),
        Settlement::Intents,
        U128(cents),
        U64(100),
        U64(200),
    )
}

fn purchase(
    market: &mut Marketplace,
    buyer: &str,
    amount: u128,
    invoice: &str,
    round: u64,
) -> u128 {
    at("intents.test.near", 2);
    let buyer_id = id(buyer);
    let token = market.intents_token_id();
    let message = near_sdk::serde_json::to_string(&PurchaseMessage {
        invoice_id: invoice.into(),
        expected_round: U64(round),
    })
    .unwrap();
    match market.mt_on_transfer(
        buyer_id.clone(),
        vec![buyer_id],
        vec![token],
        vec![U128(amount)],
        message,
    ) {
        PromiseOrValue::Value(returned) => returned[0].0,
        _ => panic!("receiver must return an unused amount"),
    }
}

#[test]
fn one_cent_campaign_failure_preserves_every_principal_and_cancels_rounded_bonus() {
    let mut market = new_market(1);
    assert_eq!(purchase(&mut market, "a.test.near", 10_000, "a", 0), 0);
    assert_eq!(market.get_state().next_price.0, 20_000);
    assert_eq!(purchase(&mut market, "b.test.near", 20_000, "b", 1), 0);
    assert_eq!(market.get_credit(id("a.test.near")).available.0, 10_000);
    assert_eq!(
        market.get_credit(id("a.test.near")).conditional_bonus.0,
        10_000
    );
    at("arbiter.test.near", 100);
    market.finalize_failure();
    assert_eq!(market.get_credit(id("a.test.near")).available.0, 10_000);
    assert_eq!(market.get_credit(id("a.test.near")).conditional_bonus.0, 0);
    assert_eq!(market.get_credit(id("b.test.near")).available.0, 20_000);
    assert_eq!(market.get_credit(id("seller.test.near")).available.0, 0);
    assert_eq!(
        market
            .credits
            .values()
            .map(|credit| credit.available.0)
            .sum::<u128>(),
        30_000
    );
}

#[test]
fn ten_cent_purchase_and_fifteen_cent_takeover_have_exact_ten_percent_reward() {
    let mut market = new_market(10);
    assert_eq!(purchase(&mut market, "a.test.near", 100_000, "a", 0), 0);
    assert_eq!(market.get_state().next_price.0, 150_000);
    assert_eq!(purchase(&mut market, "b.test.near", 150_000, "b", 1), 0);
    assert_eq!(market.get_credit(id("a.test.near")).available.0, 100_000);
    assert_eq!(
        market.get_credit(id("a.test.near")).conditional_bonus.0,
        10_000
    );
    assert_eq!(market.get_credit(id("seller.test.near")).available.0, 0);
    at("arbiter.test.near", 200);
    market.finalize_success();
    assert_eq!(market.get_credit(id("a.test.near")).available.0, 110_000);
    assert_eq!(
        market.get_credit(id("seller.test.near")).available.0,
        140_000
    );
    assert_eq!(
        market
            .credits
            .values()
            .map(|credit| credit.available.0)
            .sum::<u128>(),
        250_000
    );
}

#[test]
fn subcent_and_wrong_price_intents_return_full_amount_without_consuming_invoice() {
    let mut market = new_market(1);
    let original = near_sdk::borsh::to_vec(&market).unwrap();
    for amount in [0, 1, 9_999, 10_001, 15_000] {
        assert_eq!(
            purchase(&mut market, "a.test.near", amount, "retryable", 0),
            amount
        );
        assert!(!market.is_invoice_used("retryable".into()));
        assert_eq!(near_sdk::borsh::to_vec(&market).unwrap(), original);
    }
    assert_eq!(
        purchase(&mut market, "a.test.near", 10_000, "retryable", 0),
        0
    );
    assert!(market.is_invoice_used("retryable".into()));
}

#[test]
fn repeated_small_takeovers_conserve_all_value_on_both_settlement_outcomes() {
    for initial_cents in [1, 2, 3, 5, 9, 10, 11, 15, 25, 33, 50, 100] {
        for successful in [false, true] {
            let mut market = new_market(initial_cents);
            let mut funded = 0;
            for round in 0..6 {
                let amount = market.get_state().next_price.0;
                assert_eq!(amount % 10_000, 0);
                assert!(amount > 0);
                let buyer = format!("buyer-{round}.test.near");
                assert_eq!(
                    purchase(
                        &mut market,
                        &buyer,
                        amount,
                        &format!("invoice-{round}"),
                        round
                    ),
                    0
                );
                funded += amount;
                assert_eq!(market.total_received, funded);
                assert_eq!(market.get_credit(id("seller.test.near")).available.0, 0);
                let principal_claims: u128 = market
                    .credits
                    .values()
                    .map(|credit| credit.available.0)
                    .sum();
                assert_eq!(
                    principal_claims + market.holder.as_ref().unwrap().principal.0,
                    funded
                );
            }
            at("arbiter.test.near", 200);
            if successful {
                market.finalize_success();
            } else {
                market.finalize_failure();
            }
            assert!(
                market
                    .credits
                    .values()
                    .all(|credit| credit.conditional_bonus.0 == 0)
            );
            assert_eq!(
                market
                    .credits
                    .values()
                    .map(|credit| credit.available.0)
                    .sum::<u128>(),
                funded
            );
        }
    }
}
