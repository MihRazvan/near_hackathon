use super::*;
use near_sdk::{test_utils::VMContextBuilder, testing_env};

fn id(value: &str) -> AccountId {
    value.parse().unwrap()
}
fn at(caller: &str, now: u64, deposit: u128) {
    let mut context = VMContextBuilder::new();
    context
        .current_account_id(id("market.test.near"))
        .predecessor_account_id(id(caller))
        .signer_account_id(id(caller))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit));
    testing_env!(context.build());
}
fn terms(takeovers: bool) -> CampaignTerms {
    CampaignTerms {
        sale_id: "sale-1".into(),
        asset_id: "vehicle-1".into(),
        spot_id: "door-left".into(),
        published_terms_sha256: Base64VecU8(vec![1; 32]),
        takeover_enabled: takeovers,
        bidding_close_ns: U64(100),
        artwork_due_ns: U64(110),
        installation_due_ns: U64(120),
        service_start_ns: U64(130),
        service_end_ns: U64(140),
        review_end_ns: U64(150),
    }
}
fn market(takeovers: bool) -> Marketplace {
    at("deployer.test.near", 1, 0);
    Marketplace::new_campaign(
        id("seller.test.near"),
        id("arbiter.test.near"),
        id("usdc.test.near"),
        id("intents.test.near"),
        Settlement::Native,
        U128(10),
        terms(takeovers),
    )
}
fn buy(
    market: &mut Marketplace,
    payer: &str,
    amount: u128,
    invoice: &str,
    round: u64,
    hash: Option<Vec<u8>>,
) -> u128 {
    at("usdc.test.near", 2, 0);
    let mut message =
        near_sdk::serde_json::json!({"invoice_id":invoice,"expected_round":round.to_string()});
    if let Some(value) = hash {
        message["published_terms_sha256"] =
            near_sdk::serde_json::to_value(Base64VecU8(value)).unwrap();
    }
    match market.ft_on_transfer(id(payer), U128(amount), message.to_string()) {
        PromiseOrValue::Value(unused) => unused.0,
        _ => panic!("unused amount expected"),
    }
}
fn prepare_artwork(market: &mut Marketplace) {
    assert_eq!(
        buy(
            market,
            "buyer.test.near",
            100_000,
            "first",
            0,
            Some(vec![1; 32])
        ),
        0
    );
    at(
        "buyer.test.near",
        100,
        NearToken::from_near(1).as_yoctonear(),
    );
    market.mint_final_placement();
    at(
        "buyer.test.near",
        105,
        NearToken::from_near(1).as_yoctonear(),
    );
    market.submit_artwork(
        "market.test.near".into(),
        "ipfs://artwork".into(),
        Base64VecU8(vec![2; 32]),
    );
    at("seller.test.near", 115, 1);
    market.lock_artwork(U64(1));
}
fn prepare_delivery(market: &mut Marketplace) {
    prepare_artwork(market);
    at(
        "seller.test.near",
        119,
        NearToken::from_near(1).as_yoctonear(),
    );
    market.submit_delivery_proof("ipfs://proof".into(), Base64VecU8(vec![3; 32]));
}

#[test]
fn invoices_bind_actual_published_terms_and_do_not_consume_rejected_ids() {
    let mut m = market(true);
    for hash in [None, Some(vec![2; 32]), Some(vec![1; 31])] {
        assert_eq!(
            buy(&mut m, "buyer.test.near", 100_000, "invoice", 0, hash),
            100_000
        );
        assert!(!m.is_invoice_used("invoice".into()));
        assert_eq!(m.round, 0);
    }
    assert_eq!(
        buy(
            &mut m,
            "buyer.test.near",
            100_000,
            "invoice",
            0,
            Some(vec![1; 32])
        ),
        0
    );
    assert_eq!(m.round, 1);
    assert_eq!(m.get_campaign().terms.unwrap().spot_id, "door-left");
}

#[test]
fn fixed_booking_rejects_even_the_correct_next_price_and_takeover_mode_accepts_it() {
    for enabled in [false, true] {
        let mut m = market(enabled);
        assert_eq!(
            buy(
                &mut m,
                "buyer.test.near",
                100_000,
                "first",
                0,
                Some(vec![1; 32])
            ),
            0
        );
        let result = buy(
            &mut m,
            "other.test.near",
            150_000,
            "second",
            1,
            Some(vec![1; 32]),
        );
        assert_eq!(result, if enabled { 0 } else { 150_000 });
        assert_eq!(m.round, if enabled { 2 } else { 1 });
        assert_eq!(m.is_invoice_used("second".into()), enabled);
    }
}

#[test]
fn current_holder_cannot_manufacture_a_self_takeover_reward() {
    let mut m = market(true);
    assert_eq!(
        buy(
            &mut m,
            "buyer.test.near",
            100_000,
            "first",
            0,
            Some(vec![1; 32])
        ),
        0
    );
    assert_eq!(
        buy(
            &mut m,
            "buyer.test.near",
            150_000,
            "self",
            1,
            Some(vec![1; 32])
        ),
        150_000
    );
    assert_eq!(m.round, 1);
    assert_eq!(m.get_credit(id("buyer.test.near")).conditional_bonus.0, 0);
    assert!(!m.is_invoice_used("self".into()));
}

#[test]
#[should_panic(expected = "invalid campaign schedule")]
fn invalid_production_and_service_sequence_is_rejected() {
    let mut t = terms(true);
    t.service_end_ns = U64(130);
    at("deployer.test.near", 1, 0);
    Marketplace::new_campaign(
        id("seller.test.near"),
        id("arbiter.test.near"),
        id("usdc.test.near"),
        id("intents.test.near"),
        Settlement::Native,
        U128(1),
        t,
    );
}

#[test]
#[should_panic(expected = "seller and arbiter must differ")]
fn seller_cannot_be_its_own_fulfillment_arbiter() {
    at("deployer.test.near", 1, 0);
    Marketplace::new_campaign(
        id("seller.test.near"),
        id("seller.test.near"),
        id("usdc.test.near"),
        id("intents.test.near"),
        Settlement::Native,
        U128(1),
        terms(true),
    );
}

#[test]
#[should_panic(expected = "delivery proof and locked artwork required")]
fn elapsed_review_deadline_alone_never_authorizes_seller_payout() {
    let mut m = market(true);
    assert_eq!(
        buy(
            &mut m,
            "buyer.test.near",
            100_000,
            "first",
            0,
            Some(vec![1; 32])
        ),
        0
    );
    at("arbiter.test.near", 150, 0);
    m.finalize_success();
}

#[test]
#[should_panic(expected = "refund window open")]
fn installation_proof_does_not_release_earnings_before_campaign_review_end() {
    let mut m = market(true);
    prepare_delivery(&mut m);
    at("arbiter.test.near", 140, 0);
    m.finalize_success();
}

#[test]
#[should_panic(expected = "unresolved campaign issue")]
fn open_case_blocks_payout_even_after_review_end() {
    let mut m = market(true);
    prepare_delivery(&mut m);
    at(
        "arbiter.test.near",
        135,
        NearToken::from_near(1).as_yoctonear(),
    );
    m.record_issue_decision("case-1".into(), true, Base64VecU8(vec![4; 32]));
    at("arbiter.test.near", 150, 0);
    m.finalize_success();
}

#[test]
fn production_lock_delivery_and_reasoned_case_resolution_allow_only_final_release() {
    let mut m = market(true);
    prepare_delivery(&mut m);
    assert!(m.get_placement_rights().locked);
    assert_eq!(
        m.get_campaign().delivery_proof.unwrap().artwork_revision.0,
        1
    );
    assert_eq!(m.get_credit(id("seller.test.near")).available.0, 0);
    at(
        "arbiter.test.near",
        135,
        NearToken::from_near(1).as_yoctonear(),
    );
    m.record_issue_decision("case-1".into(), true, Base64VecU8(vec![4; 32]));
    assert_eq!(m.get_campaign().open_issues, 1);
    at(
        "arbiter.test.near",
        145,
        NearToken::from_near(1).as_yoctonear(),
    );
    m.record_issue_decision("case-1".into(), false, Base64VecU8(vec![5; 32]));
    assert_eq!(m.get_campaign().open_issues, 0);
    at("arbiter.test.near", 150, 0);
    m.finalize_success();
    assert_eq!(m.get_credit(id("seller.test.near")).available.0, 100_000);
}

#[test]
#[should_panic(expected = "arbiter only")]
fn seller_cannot_close_a_dispute() {
    let mut m = market(true);
    at(
        "seller.test.near",
        135,
        NearToken::from_near(1).as_yoctonear(),
    );
    m.record_issue_decision("case-1".into(), false, Base64VecU8(vec![5; 32]));
}

#[test]
#[should_panic(expected = "artwork rights inactive")]
fn artwork_edits_stop_at_the_published_artwork_deadline() {
    let mut m = market(true);
    assert_eq!(
        buy(
            &mut m,
            "buyer.test.near",
            100_000,
            "first",
            0,
            Some(vec![1; 32])
        ),
        0
    );
    at(
        "buyer.test.near",
        100,
        NearToken::from_near(1).as_yoctonear(),
    );
    m.mint_final_placement();
    at(
        "buyer.test.near",
        110,
        NearToken::from_near(1).as_yoctonear(),
    );
    m.submit_artwork(
        "market.test.near".into(),
        "ipfs://late".into(),
        Base64VecU8(vec![2; 32]),
    );
}
