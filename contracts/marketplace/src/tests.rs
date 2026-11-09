use super::*;
use near_sdk::{test_utils::VMContextBuilder, testing_env, PromiseResult};

const USD: u128 = 1_000_000;
fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn context(caller: &str, now: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(id("market.test.near"))
        .predecessor_account_id(id(caller))
        .signer_account_id(id(caller))
        .block_timestamp(now);
    testing_env!(b.build());
}
fn market(settlement: Settlement) -> Marketplace {
    context("factory.test.near", 1);
    Marketplace::new(
        id("seller.test.near"),
        id("arbiter.test.near"),
        id("usdc.test.near"),
        id("intents.test.near"),
        settlement,
        U128(10_000),
        U64(1_000),
        U64(2_000),
    )
}
fn msg(invoice: &str, round: u64) -> String {
    near_sdk::serde_json::to_string(&PurchaseMessage {
        invoice_id: invoice.into(),
        expected_round: U64(round),
    })
    .unwrap()
}
fn buy(m: &mut Marketplace, buyer: &str, dollars: u128, invoice: &str, round: u64) -> u128 {
    context("usdc.test.near", 2);
    match m.ft_on_transfer(id(buyer), U128(dollars * USD), msg(invoice, round)) {
        PromiseOrValue::Value(v) => v.0,
        _ => panic!("unexpected promise"),
    }
}
fn sequence(m: &mut Marketplace) {
    assert_eq!(buy(m, "a.test.near", 100, "a", 0), 0);
    assert_eq!(buy(m, "b.test.near", 150, "b", 1), 0);
    assert_eq!(buy(m, "c.test.near", 225, "c", 2), 0);
}

#[test]
fn successive_takeovers_preserve_full_failure_refund_without_vesting_bonuses() {
    let mut m = market(Settlement::Native);
    sequence(&mut m);
    assert_eq!(m.get_credit(id("a.test.near")).available.0, 100 * USD);
    assert_eq!(
        m.get_credit(id("a.test.near")).conditional_bonus.0,
        10 * USD
    );
    assert_eq!(m.get_credit(id("b.test.near")).available.0, 150 * USD);
    assert_eq!(
        m.get_credit(id("b.test.near")).conditional_bonus.0,
        15 * USD
    );
    assert_eq!(m.potential_seller_revenue, 200 * USD);
    assert_eq!(m.get_credit(id("seller.test.near")).available.0, 0);
    context("arbiter.test.near", 1_000);
    m.finalize_failure();
    assert_eq!(m.get_credit(id("c.test.near")).available.0, 225 * USD);
    assert_eq!(m.get_credit(id("a.test.near")).conditional_bonus.0, 0);
    assert_eq!(m.get_credit(id("b.test.near")).conditional_bonus.0, 0);
    assert_eq!(m.get_credit(id("seller.test.near")).available.0, 0);
    let claims: u128 = m.credits.values().map(|c| c.available.0).sum();
    assert_eq!(claims, m.total_received);
}

#[test]
fn success_vests_exact_bonuses_and_only_then_seller_revenue() {
    let mut m = market(Settlement::Native);
    sequence(&mut m);
    context("arbiter.test.near", 2_000);
    m.finalize_success();
    assert_eq!(m.get_credit(id("a.test.near")).available.0, 110 * USD);
    assert_eq!(m.get_credit(id("b.test.near")).available.0, 165 * USD);
    assert_eq!(m.get_credit(id("c.test.near")).available.0, 0);
    assert_eq!(m.get_credit(id("seller.test.near")).available.0, 200 * USD);
    let claims: u128 = m.credits.values().map(|c| c.available.0).sum();
    assert_eq!(claims, m.total_received);
}

#[test]
fn duplicate_stale_wrong_amount_malformed_and_cutoff_return_full_without_changes() {
    let mut m = market(Settlement::Native);
    assert_eq!(buy(&mut m, "a.test.near", 100, "invoice", 0), 0);
    let before = near_sdk::borsh::to_vec(&m).unwrap();
    assert_eq!(buy(&mut m, "b.test.near", 150, "invoice", 1), 150 * USD);
    assert_eq!(buy(&mut m, "b.test.near", 150, "other", 0), 150 * USD);
    assert_eq!(buy(&mut m, "b.test.near", 100, "other", 1), 100 * USD);
    context("usdc.test.near", 2);
    assert!(
        matches!(m.ft_on_transfer(id("b.test.near"), U128(150 * USD), "invalid".into()), PromiseOrValue::Value(U128(v)) if v == 150 * USD)
    );
    context("usdc.test.near", 1_000);
    assert!(
        matches!(m.ft_on_transfer(id("b.test.near"), U128(150 * USD), msg("cutoff", 1)), PromiseOrValue::Value(U128(v)) if v == 150 * USD)
    );
    assert_eq!(near_sdk::borsh::to_vec(&m).unwrap(), before);
}

#[test]
fn wrong_native_predecessor_and_wrong_backend_cannot_create_credit() {
    let mut native = market(Settlement::Native);
    context("fake.test.near", 2);
    assert!(
        matches!(native.ft_on_transfer(id("a.test.near"), U128(100 * USD), msg("a", 0)), PromiseOrValue::Value(U128(v)) if v == 100 * USD)
    );
    assert_eq!(native.round, 0);
    let mut intents = market(Settlement::Intents);
    assert_eq!(buy(&mut intents, "a.test.near", 100, "a", 0), 100 * USD);
    assert_eq!(intents.round, 0);
}

#[test]
fn intents_checks_token_predecessor_original_owner_and_backend() {
    let mut m = market(Settlement::Intents);
    let token = m.intents_token_id();
    let buyer = id("0x0123456789012345678901234567890123456789");
    for (caller, owner, token_id) in [
        ("fake.test.near", buyer.clone(), token.clone()),
        ("intents.test.near", id("other.test.near"), token.clone()),
        (
            "intents.test.near",
            buyer.clone(),
            "nep141:fake.test.near".into(),
        ),
    ] {
        context(caller, 2);
        assert!(
            matches!(m.mt_on_transfer(buyer.clone(), vec![owner], vec![token_id], vec![U128(100 * USD)], msg("a", 0)), PromiseOrValue::Value(v) if v[0].0 == 100 * USD)
        );
        assert_eq!(m.round, 0);
    }
    context("intents.test.near", 2);
    assert!(
        matches!(m.mt_on_transfer(buyer.clone(), vec![buyer.clone()], vec![token], vec![U128(100 * USD)], msg("a", 0)), PromiseOrValue::Value(v) if v[0].0 == 0)
    );
    assert_eq!(m.holder.as_ref().unwrap().account_id, buyer);
}

#[test]
fn cent_rounding_is_up_for_both_price_and_bonus() {
    assert_eq!(checked_next_price(CENT), Some(2 * CENT));
    assert_eq!(checked_payout(CENT), Some(2 * CENT));
    assert_eq!(checked_next_price(101 * CENT), Some(152 * CENT));
    assert_eq!(checked_payout(101 * CENT), Some(112 * CENT));
    assert_eq!(checked_next_price(u128::MAX), None);
}

#[test]
#[should_panic(expected = "refund window open")]
fn seller_proceeds_and_bonuses_cannot_vest_early() {
    let mut m = market(Settlement::Native);
    sequence(&mut m);
    context("arbiter.test.near", 1_999);
    m.finalize_success();
}

#[test]
#[should_panic(expected = "arbiter only")]
fn seller_cannot_decide_fulfillment() {
    let mut m = market(Settlement::Native);
    context("seller.test.near", 2_000);
    m.finalize_success();
}

#[test]
#[should_panic(expected = "no credit")]
fn stranger_cannot_withdraw_another_native_users_credit() {
    let mut m = market(Settlement::Native);
    sequence(&mut m);
    context("stranger.test.near", 4);
    m.withdraw();
}

#[test]
fn withdrawal_debits_before_call_restores_known_failure_and_never_timeout_recredits() {
    let mut m = market(Settlement::Native);
    sequence(&mut m);
    context("a.test.near", 4);
    let id = m.withdraw();
    assert_eq!(m.get_credit(super::tests::id("a.test.near")).available.0, 0);
    assert_eq!(m.total_pending, 100 * USD);
    assert_eq!(
        m.get_withdrawal(id).unwrap().status,
        WithdrawalStatus::Pending
    );
    context("market.test.near", 99_999);
    assert_eq!(
        m.get_withdrawal(id).unwrap().status,
        WithdrawalStatus::Pending
    );
    let b = VMContextBuilder::new()
        .current_account_id(super::tests::id("market.test.near"))
        .predecessor_account_id(super::tests::id("market.test.near"))
        .build();
    testing_env!(
        b,
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        vec![PromiseResult::Failed]
    );
    assert!(!m.on_withdrawal(id));
    assert_eq!(
        m.get_credit(super::tests::id("a.test.near")).available.0,
        100 * USD
    );
    assert_eq!(m.total_pending, 0);
    assert_eq!(
        m.get_withdrawal(id).unwrap().status,
        WithdrawalStatus::Failed
    );
}

#[test]
fn successful_withdrawal_is_not_recredited() {
    let mut m = market(Settlement::Native);
    sequence(&mut m);
    context("a.test.near", 4);
    let withdrawal = m.withdraw();
    let b = VMContextBuilder::new()
        .current_account_id(id("market.test.near"))
        .predecessor_account_id(id("market.test.near"))
        .build();
    testing_env!(
        b,
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        vec![PromiseResult::Successful(vec![])]
    );
    assert!(m.on_withdrawal(withdrawal));
    assert_eq!(m.get_credit(id("a.test.near")).available.0, 0);
    assert_eq!(m.total_withdrawn, 100 * USD);
    assert_eq!(m.total_pending, 0);
}

#[test]
fn intents_release_cannot_redirect_and_emits_exact_transfer() {
    let mut m = market(Settlement::Intents);
    m.credits.insert(
        id("a.test.near"),
        Credit {
            available: U128(42 * USD),
            conditional_bonus: U128(0),
        },
    );
    context("keeper.test.near", 4);
    let withdrawal = m.release_credit(id("a.test.near"));
    assert_eq!(
        m.get_withdrawal(withdrawal).unwrap().owner_id,
        id("a.test.near")
    );
    let receipts = near_sdk::test_utils::get_created_receipts();
    assert_eq!(receipts[0].receiver_id, id("intents.test.near"));
    let near_sdk::mock::MockAction::FunctionCallWeight {
        method_name,
        args,
        attached_deposit,
        ..
    } = &receipts[0].actions[0]
    else {
        panic!("missing call");
    };
    assert_eq!(method_name, b"mt_transfer");
    let args: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(args).unwrap();
    assert_eq!(args["receiver_id"], "a.test.near");
    assert_eq!(args["amount"], "42000000");
    assert_eq!(args["token_id"], "nep141:usdc.test.near");
    assert_eq!(*attached_deposit, NearToken::from_yoctonear(1));
}

#[test]
fn large_success_return_is_not_mistaken_for_failed_transfer() {
    let mut m = market(Settlement::Native);
    sequence(&mut m);
    context("a.test.near", 4);
    let withdrawal = m.withdraw();
    let b = VMContextBuilder::new()
        .current_account_id(id("market.test.near"))
        .predecessor_account_id(id("market.test.near"))
        .build();
    testing_env!(
        b,
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        vec![PromiseResult::Successful(vec![0; 5000])]
    );
    assert!(m.on_withdrawal(withdrawal));
    assert_eq!(m.get_credit(id("a.test.near")).available.0, 0);
}

fn intents_final_holder() -> Marketplace {
    let mut m = market(Settlement::Intents);
    let buyer = id("0x0123456789012345678901234567890123456789");
    context("intents.test.near", 2);
    let token = m.intents_token_id();
    assert!(
        matches!(m.mt_on_transfer(buyer.clone(),vec![buyer],vec![token],vec![U128(100*USD)],msg("evm",0)),PromiseOrValue::Value(v) if v[0].0==0)
    );
    m
}

#[test]
fn intents_nomination_and_recipient_acceptance_do_not_change_money_or_payer() {
    let mut m = intents_final_holder();
    let payer = m.holder.as_ref().unwrap().account_id.clone();
    let received = m.total_received;
    let revenue = m.potential_seller_revenue;
    context("intents.test.near", 1_000);
    m.on_auth(payer.clone(),near_sdk::serde_json::json!({"action":"nominate_nft_recipient","recipient_id":"recipient.test.near"}).to_string());
    assert!(!m.nomination_accepted);
    assert_eq!(m.nominated_recipient, Some(id("recipient.test.near")));
    context("recipient.test.near", 1_001);
    m.accept_nft_nomination();
    assert_eq!(m.final_nft_owner(), id("recipient.test.near"));
    assert_eq!(m.holder.as_ref().unwrap().account_id, payer);
    assert_eq!(m.total_received, received);
    assert_eq!(m.potential_seller_revenue, revenue);
    assert_eq!(m.get_credit(id("recipient.test.near")).available.0, 0);
    context("arbiter.test.near", 1_002);
    m.finalize_failure();
    assert_eq!(m.get_credit(payer).available.0, 100 * USD);
    assert_eq!(m.get_credit(id("recipient.test.near")).available.0, 0);
}

#[test]
#[should_panic(expected = "Intents verifier only")]
fn forged_intents_auth_cannot_nominate() {
    let mut m = intents_final_holder();
    let payer = m.holder.as_ref().unwrap().account_id.clone();
    context("attacker.test.near", 1_000);
    m.on_auth(payer,near_sdk::serde_json::json!({"action":"nominate_nft_recipient","recipient_id":"recipient.test.near"}).to_string());
}

#[test]
#[should_panic(expected = "final payer only")]
fn displaced_or_unrelated_intents_signer_cannot_nominate() {
    let mut m = intents_final_holder();
    context("intents.test.near", 1_000);
    m.on_auth(id("attacker.test.near"),near_sdk::serde_json::json!({"action":"nominate_nft_recipient","recipient_id":"recipient.test.near"}).to_string());
}

#[test]
#[should_panic(expected = "nominated recipient only")]
fn nomination_must_be_accepted_by_the_recipient_account() {
    let mut m = intents_final_holder();
    let payer = m.holder.as_ref().unwrap().account_id.clone();
    context("intents.test.near", 1_000);
    m.on_auth(payer,near_sdk::serde_json::json!({"action":"nominate_nft_recipient","recipient_id":"recipient.test.near"}).to_string());
    context("attacker.test.near", 1_001);
    m.accept_nft_nomination();
}

#[test]
#[should_panic(expected = "bidding still open")]
fn nomination_cannot_survive_from_an_earlier_bidding_round() {
    let mut m = market(Settlement::Native);
    sequence(&mut m);
    context("c.test.near", 999);
    m.nominate_nft_recipient(id("recipient.test.near"));
}

#[test]
#[should_panic(expected = "unsupported auth action")]
fn auth_callback_cannot_redirect_financial_withdrawals() {
    let mut m = intents_final_holder();
    let payer = m.holder.as_ref().unwrap().account_id.clone();
    context("intents.test.near", 1_000);
    m.on_auth(
        payer,
        near_sdk::serde_json::json!({"action":"withdraw","recipient_id":"attacker.test.near"})
            .to_string(),
    );
}
