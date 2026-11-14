use super::*;
use near_sdk::serde_json::json;
use near_sdk::{
    test_utils::{get_created_receipts, get_logs, VMContextBuilder},
    testing_env, PromiseResult,
};
fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn offer(n: u8) -> String {
    format!("offer-{n:032x}")
}
fn context(caller: &str, time: u64, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(id("hub.test.near"))
        .predecessor_account_id(id(caller))
        .signer_account_id(id(caller))
        .block_timestamp(time)
        .attached_deposit(NearToken::from_yoctonear(deposit));
    testing_env!(b.build());
}
fn terms() -> CampaignTerms {
    CampaignTerms {
        sale_id: "sale".into(),
        asset_id: "asset".into(),
        spot_id: "spot".into(),
        published_terms_sha256: Base64VecU8(vec![7; 32]),
        takeover_enabled: true,
        bidding_close_ns: U64(100),
        artwork_due_ns: U64(200),
        installation_due_ns: U64(300),
        service_start_ns: U64(400),
        service_end_ns: U64(500),
        review_end_ns: U64(600),
    }
}
fn hub() -> MarketplaceHub {
    context("operator.test.near", 1, 0);
    MarketplaceHub::new(
        id("operator.test.near"),
        id("arbiter.test.near"),
        id("usdc.test.near"),
        id("intents.test.near"),
    )
}
fn create(h: &mut MarketplaceHub, n: u8, seller: &str) {
    context(seller, 2, storage_reserve());
    h.create_offer(offer(n), U128(1), terms());
}
fn buy(h: &mut MarketplaceHub, n: u8, buyer: &str, round: u64, amount: u128) -> Vec<U128> {
    context("intents.test.near", 10, 0);
    let result=h.mt_on_transfer(id(buyer),vec![id(buyer)],vec!["nep141:usdc.test.near".into()],vec![U128(amount)],json!({"offer_id":offer(n),"invoice_id":format!("invoice-{round}"),"expected_round":round.to_string(),"published_terms_sha256":Base64VecU8(vec![7;32])}).to_string());
    match result {
        PromiseOrValue::Value(v) => v,
        _ => panic!("unexpected promise"),
    }
}
fn auth(h: &mut MarketplaceHub, signer: &str, time: u64, msg: near_sdk::serde_json::Value) {
    context("intents.test.near", time, 0);
    h.on_auth(id(signer), msg.to_string());
}
fn delivery(h: &mut MarketplaceHub, n: u8, buyer: &str, seller: &str) {
    auth(
        h,
        buyer,
        110,
        json!({"action":"submit_artwork","offer_id":offer(n),"token_id":offer(n),"artifact_uri":"ipfs://artwork","artifact_sha256":Base64VecU8(vec![8;32])}),
    );
    auth(
        h,
        seller,
        120,
        json!({"action":"lock_artwork","offer_id":offer(n),"expected_revision":"1"}),
    );
    auth(
        h,
        seller,
        130,
        json!({"action":"submit_delivery_proof","offer_id":offer(n),"artifact_uri":"ipfs://proof","artifact_sha256":Base64VecU8(vec![9;32])}),
    );
}
fn callback(h: &mut MarketplaceHub, n: u8, wid: U64, success: bool) -> bool {
    let mut b = VMContextBuilder::new();
    b.current_account_id(id("hub.test.near"))
        .predecessor_account_id(id("hub.test.near"))
        .signer_account_id(id("operator.test.near"))
        .block_timestamp(700)
        .prepaid_gas(CALLBACK_GAS);
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![if success {
            PromiseResult::Successful(vec![])
        } else {
            PromiseResult::Failed
        }]
    );
    h.on_withdrawal(offer(n), wid)
}

#[test]
fn multi_offer_purchase_invoices_credits_and_pooled_balance_are_isolated() {
    let mut h = hub();
    create(&mut h, 1, "seller-a.test.near");
    create(&mut h, 2, "seller-b.test.near");
    assert_eq!(buy(&mut h, 1, "alice.test.near", 0, 10_000), vec![U128(0)]);
    assert_eq!(buy(&mut h, 2, "alice.test.near", 0, 10_000), vec![U128(0)]);
    assert_eq!(buy(&mut h, 1, "bob.test.near", 1, 20_000), vec![U128(0)]);
    assert_eq!(h.get_state(offer(1)).round, U64(2));
    assert_eq!(h.get_state(offer(2)).round, U64(1));
    assert_eq!(
        h.get_credit(offer(1), id("alice.test.near")).available,
        U128(10_000)
    );
    assert_eq!(
        h.get_credit(offer(2), id("alice.test.near")).available,
        U128(0)
    );
    assert_eq!(h.get_totals().accounted_balance, U128(40_000));
    assert!(get_logs()
        .iter()
        .any(|l| l.contains("purchase_accepted") && l.contains(&offer(1))));
    // Same invoice ID is safely scoped per offer, but a stale duplicate is refunded.
    assert_eq!(
        buy(&mut h, 2, "charlie.test.near", 0, 10_000),
        vec![U128(10_000)]
    );
    assert_eq!(h.get_totals().total_received, U128(40_000));
}
#[test]
fn two_withdrawal_zero_ids_resolve_independently_and_pending_does_not_block_other_offer() {
    let mut h = hub();
    for n in [1, 2] {
        create(&mut h, n, "seller.test.near");
        assert_eq!(buy(&mut h, n, "alice.test.near", 0, 10_000), vec![U128(0)]);
        assert_eq!(buy(&mut h, n, "bob.test.near", 1, 20_000), vec![U128(0)]);
    }
    context("keeper.test.near", 20, 0);
    let a = h.release_credit(offer(1), id("alice.test.near"));
    assert_eq!(a, U64(0));
    let receipts = get_created_receipts();
    let callback_args = receipts
        .iter()
        .flat_map(|r| r.actions.iter())
        .find_map(|a| match a {
            near_sdk::mock::MockAction::FunctionCallWeight {
                method_name, args, ..
            } if method_name == b"on_withdrawal" => {
                Some(near_sdk::serde_json::from_slice::<near_sdk::serde_json::Value>(args).unwrap())
            }
            _ => None,
        })
        .expect("withdraw callback");
    assert_eq!(callback_args["offer_id"], offer(1));
    assert_eq!(callback_args["withdrawal_id"], "0");
    context("keeper.test.near", 21, 0);
    let b = h.release_credit(offer(2), id("alice.test.near"));
    assert_eq!(b, U64(0));
    assert_eq!(h.get_totals().total_pending, U128(20_000));
    assert!(callback(&mut h, 2, b, true));
    assert!(!callback(&mut h, 1, a, false));
    assert_eq!(
        h.get_withdrawal(offer(1), a).unwrap().status,
        WithdrawalStatus::Failed
    );
    assert_eq!(
        h.get_withdrawal(offer(2), b).unwrap().status,
        WithdrawalStatus::Succeeded
    );
    assert_eq!(
        h.get_credit(offer(1), id("alice.test.near")).available,
        U128(10_000)
    );
    assert_eq!(
        h.get_credit(offer(2), id("alice.test.near")).available,
        U128(0)
    );
    assert_eq!(h.get_totals().total_received, U128(60_000));
    assert_eq!(h.get_totals().total_withdrawn, U128(10_000));
    assert_eq!(h.get_totals().total_pending, U128(0));
    assert_eq!(h.get_totals().accounted_balance, U128(50_000));
}
#[test]
fn evm_owner_is_nft_recipient_artwork_authority_and_claims_remain_with_payer_after_transfer() {
    let evm = "0x1111111111111111111111111111111111111111";
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    create(&mut h, 2, "other.test.near");
    buy(&mut h, 1, evm, 0, 10_000);
    buy(&mut h, 2, evm, 0, 10_000);
    context("keeper.test.near", 100, 0);
    assert!(h.get_placement_rights(offer(1)).active);
    assert_eq!(
        h.get_placement_rights(offer(1)).current_owner_id,
        Some(id(evm))
    );
    delivery(&mut h, 1, evm, "seller.test.near");
    let token = h.nft_token(offer(1)).unwrap();
    assert_eq!(token.owner_id, id(evm));
    assert_eq!(
        token.metadata.unwrap().reference,
        Some("ipfs://artwork".into())
    );
    auth(
        &mut h,
        evm,
        140,
        json!({"action":"transfer_placement","offer_id":offer(1),"receiver_id":"new-owner.test.near"}),
    );
    assert_eq!(
        h.get_placement_rights(offer(1)).current_owner_id,
        Some(id("new-owner.test.near"))
    );
    assert_eq!(
        h.get_placement_rights(offer(1)).original_payer_id,
        Some(id(evm))
    );
    context("keeper.test.near", 150, 0);
    h.mint_final_placement(offer(2));
    assert_eq!(h.nft_total_supply(), U128(2));
    assert_eq!(h.nft_supply_for_owner(id(evm)), U128(1));
    assert_eq!(h.nft_tokens(None, Some(10)).len(), 2);
    context("arbiter.test.near", 600, 0);
    h.finalize_failure(offer(1));
    assert_eq!(h.get_credit(offer(1), id(evm)).available, U128(10_000));
    assert_eq!(
        h.get_credit(offer(1), id("new-owner.test.near")).available,
        U128(0)
    );
}
#[test]
#[should_panic(expected = "placement owner only")]
fn former_payer_cannot_submit_artwork_after_nft_transfer_during_active_window() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "payer.test.near", 0, 10_000);
    context("keeper.test.near", 100, 0);
    h.mint_final_placement(offer(1));
    auth(
        &mut h,
        "payer.test.near",
        110,
        json!({"action":"transfer_placement","offer_id":offer(1),"receiver_id":"controller.test.near"}),
    );
    let rights = h.get_placement_rights(offer(1));
    assert!(rights.active && !rights.locked);
    assert_eq!(rights.current_owner_id, Some(id("controller.test.near")));
    assert_eq!(rights.original_payer_id, Some(id("payer.test.near")));
    auth(
        &mut h,
        "payer.test.near",
        120,
        json!({"action":"submit_artwork","offer_id":offer(1),"token_id":offer(1),"artifact_uri":"ipfs://forbidden","artifact_sha256":Base64VecU8(vec![8;32])}),
    );
}

#[test]
fn transferred_nft_owner_revises_active_artwork_without_receiving_original_creditors_money() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "displaced.test.near", 0, 10_000);
    buy(&mut h, 1, "payer.test.near", 1, 20_000);
    auth(
        &mut h,
        "payer.test.near",
        110,
        json!({"action":"submit_artwork","offer_id":offer(1),"token_id":offer(1),"artifact_uri":"ipfs://original","artifact_sha256":Base64VecU8(vec![8;32])}),
    );
    let creditors = ["displaced.test.near", "payer.test.near", "seller.test.near", "controller.test.near"];
    let credits_before: Vec<_> = creditors.iter().map(|who| near_sdk::serde_json::to_value(h.get_credit(offer(1), id(who))).unwrap()).collect();
    let totals_before = near_sdk::serde_json::to_value(h.get_totals()).unwrap();
    auth(
        &mut h,
        "payer.test.near",
        120,
        json!({"action":"transfer_placement","offer_id":offer(1),"receiver_id":"controller.test.near"}),
    );
    assert!(h.get_placement_rights(offer(1)).active);
    assert!(!h.get_placement_rights(offer(1)).locked);
    auth(
        &mut h,
        "controller.test.near",
        130,
        json!({"action":"submit_artwork","offer_id":offer(1),"token_id":offer(1),"artifact_uri":"ipfs://revision-two","artifact_sha256":Base64VecU8(vec![9;32])}),
    );
    let rights = h.get_placement_rights(offer(1));
    assert_eq!(rights.revision, U64(2));
    assert_eq!(rights.current_owner_id, Some(id("controller.test.near")));
    assert_eq!(rights.original_payer_id, Some(id("payer.test.near")));
    let artwork = rights.proposal.unwrap();
    assert_eq!(artwork.submitted_by, id("controller.test.near"));
    assert_eq!(artwork.artifact_uri, "ipfs://revision-two");
    let metadata = h.nft_token(offer(1)).unwrap().metadata.unwrap();
    assert_eq!(metadata.reference, Some(artwork.artifact_uri));
    assert_eq!(metadata.reference_hash, Some(artwork.artifact_sha256));
    for (who, before) in creditors.iter().zip(credits_before) {
        assert_eq!(near_sdk::serde_json::to_value(h.get_credit(offer(1), id(who))).unwrap(), before);
    }
    assert_eq!(near_sdk::serde_json::to_value(h.get_totals()).unwrap(), totals_before);
    context("arbiter.test.near", 600, 0);
    h.finalize_failure(offer(1));
    assert_eq!(h.get_credit(offer(1), id("displaced.test.near")).available, U128(10_000));
    assert_eq!(h.get_credit(offer(1), id("payer.test.near")).available, U128(20_000));
    assert_eq!(h.get_credit(offer(1), id("controller.test.near")).available, U128(0));
    assert_eq!(h.get_credit(offer(1), id("seller.test.near")).available, U128(0));
}

#[test]
fn permissionless_settlement_pays_seller_and_bonus_only_with_evidence_and_resolved_issues() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "alice.test.near", 0, 10_000);
    buy(&mut h, 1, "bob.test.near", 1, 20_000);
    delivery(&mut h, 1, "bob.test.near", "seller.test.near");
    auth(
        &mut h,
        "alice.test.near",
        550,
        json!({"action":"open_issue","offer_id":offer(1),"case_id":"case1","evidence_sha256":Base64VecU8(vec![3;32])}),
    );
    assert_eq!(h.get_campaign(offer(1)).open_issues, 1);
    auth(
        &mut h,
        "arbiter.test.near",
        590,
        json!({"action":"record_issue_decision","offer_id":offer(1),"case_id":"case1","open":false,"evidence_sha256":Base64VecU8(vec![4;32])}),
    );
    context("anyone.test.near", 600, 0);
    h.finalize_success(offer(1));
    assert_eq!(
        h.get_credit(offer(1), id("seller.test.near")).available,
        U128(10_000)
    );
    assert_eq!(
        h.get_credit(offer(1), id("alice.test.near")).available,
        U128(20_000)
    );
    assert_eq!(h.get_state(offer(1)).outcome, Outcome::Success);
    let seller = h.release_credit(offer(1), id("seller.test.near"));
    assert!(callback(&mut h, 1, seller, true));
    context("keeper.test.near", 700, 0);
    let alice = h.release_credit(offer(1), id("alice.test.near"));
    assert!(callback(&mut h, 1, alice, true));
    assert_eq!(h.get_totals().accounted_balance, U128(0));
    context("seller.test.near", 700, 0);
    let refund = h.reclaim_storage_reserve(offer(1));
    assert!(refund.0 > NearToken::from_millinear(500).as_yoctonear());
}
#[test]
fn sponsor_pool_requires_explicit_funding_and_native_offers_cannot_spend_another_reserve() {
    let mut h = hub();
    context("operator.test.near", 1, storage_reserve() * 2);
    h.fund_sponsor_pool(U64(2), None);
    let before = h.get_config().sponsor_available;
    auth(
        &mut h,
        "0x2222222222222222222222222222222222222222",
        2,
        json!({"action":"create_offer","offer_id":offer(1),"initial_price_cents":"1","terms":terms()}),
    );
    assert_eq!(
        h.get_config().sponsor_available,
        U128(before.0 - storage_reserve())
    );
    assert_eq!(
        h.get_state(offer(1)).seller_id,
        id("0x2222222222222222222222222222222222222222")
    );
    let remaining = h.get_state(offer(1)).storage_remaining;
    create(&mut h, 2, "native.test.near");
    assert_eq!(h.get_state(offer(1)).storage_remaining, remaining);
    assert_eq!(h.get_config().sponsored_offers, U64(1));
    assert!(h.get_state(offer(2)).storage_remaining.0 < storage_reserve());
}
#[test]
#[should_panic(expected = "Intents verifier only")]
fn relayer_cannot_impersonate_verified_external_owner() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    context("attacker.test.near", 110, 0);
    h.on_auth(
        id("seller.test.near"),
        json!({"action":"lock_artwork","offer_id":offer(1),"expected_revision":"1"}).to_string(),
    );
}
#[test]
#[should_panic(expected = "placement owner only")]
fn verified_signer_cannot_edit_another_offer() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "alice.test.near", 0, 10_000);
    auth(
        &mut h,
        "bob.test.near",
        110,
        json!({"action":"submit_artwork","offer_id":offer(1),"artifact_uri":"ipfs://fake","artifact_sha256":Base64VecU8(vec![3;32])}),
    );
}
#[test]
#[should_panic(expected = "unresolved campaign issue")]
fn participant_issue_blocks_permissionless_success() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "alice.test.near", 0, 10_000);
    delivery(&mut h, 1, "alice.test.near", "seller.test.near");
    context("alice.test.near", 550, 0);
    h.open_issue(offer(1), "case".into(), Base64VecU8(vec![4; 32]));
    context("keeper.test.near", 600, 0);
    h.finalize_success(offer(1));
}
#[test]
#[should_panic(expected = "delivery proof and locked artwork required")]
fn time_alone_cannot_prove_fulfillment() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "alice.test.near", 0, 10_000);
    context("keeper.test.near", 600, 0);
    h.finalize_success(offer(1));
}
#[test]
#[should_panic(expected = "campaign participant only")]
fn outsider_cannot_block_other_offers_with_issue() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "alice.test.near", 0, 10_000);
    context("attacker.test.near", 550, 0);
    h.open_issue(offer(1), "case".into(), Base64VecU8(vec![4; 32]));
}
#[test]
#[should_panic(expected = "owner sponsored listing limit reached")]
fn sponsored_owner_limit_bounds_storage_griefing() {
    let mut h = hub();
    context("operator.test.near", 1, storage_reserve() * 2);
    h.fund_sponsor_pool(U64(2), Some(U64(1)));
    for n in [1, 2] {
        auth(
            &mut h,
            "0x2222222222222222222222222222222222222222",
            2,
            json!({"action":"create_offer","offer_id":offer(n),"initial_price_cents":"1","terms":terms()}),
        );
    }
}
#[test]
#[should_panic(expected = "already resolved")]
fn callback_cannot_credit_twice() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "alice.test.near", 0, 10_000);
    buy(&mut h, 1, "bob.test.near", 1, 20_000);
    context("keeper.test.near", 30, 0);
    let w = h.release_credit(offer(1), id("alice.test.near"));
    assert!(!callback(&mut h, 1, w, false));
    callback(&mut h, 1, w, false);
}

#[test]
fn failed_withdrawal_retries_prune_resolved_history_without_stranding_credit() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "alice.test.near", 0, 10_000);
    buy(&mut h, 1, "bob.test.near", 1, 20_000);
    for expected in 0..132 {
        context("keeper.test.near", 700, 0);
        let wid = h.release_credit(offer(1), id("alice.test.near"));
        assert_eq!(wid, U64(expected));
        assert!(!callback(&mut h, 1, wid, false));
    }
    assert_eq!(h.offer(&offer(1)).withdrawals.len(), MAX_WITHDRAWALS);
    assert!(h.get_withdrawal(offer(1), U64(0)).is_none());
    assert_eq!(
        h.get_credit(offer(1), id("alice.test.near")).available,
        U128(10_000)
    );
    context("keeper.test.near", 701, 0);
    let last = h.release_credit(offer(1), id("alice.test.near"));
    assert!(callback(&mut h, 1, last, true));
    assert_eq!(
        h.get_credit(offer(1), id("alice.test.near")).available,
        U128(0)
    );
    assert_eq!(h.get_totals().total_withdrawn, U128(10_000));
}

#[test]
fn oversized_successful_transfer_result_never_restores_paid_credit() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "alice.test.near", 0, 10_000);
    buy(&mut h, 1, "bob.test.near", 1, 20_000);
    context("keeper.test.near", 30, 0);
    let wid = h.release_credit(offer(1), id("alice.test.near"));
    let mut b = VMContextBuilder::new();
    b.current_account_id(id("hub.test.near"))
        .predecessor_account_id(id("hub.test.near"));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(vec![0; 5000])]
    );
    assert!(h.on_withdrawal(offer(1), wid));
    assert_eq!(
        h.get_credit(offer(1), id("alice.test.near")).available,
        U128(0)
    );
    assert_eq!(h.get_totals().total_withdrawn, U128(10_000));
}

#[test]
fn native_wallet_can_publish_multiple_sponsored_spots_with_no_attached_near() {
    let mut h = hub();
    context("operator.test.near", 1, storage_reserve() * 2);
    h.fund_sponsor_pool(U64(2), Some(U64(8)));
    for n in [1, 2] {
        context("seller.test.near", 2, 0);
        h.create_offer(offer(n), U128(1), terms());
    }
    assert_eq!(h.get_sponsor_usage(id("seller.test.near")), U64(2));
    assert_eq!(h.get_config().sponsor_available, U128(0));
}

#[test]
fn maximum_bounded_history_and_evidence_fit_prepaid_storage_budget() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    for round in 0..MAX_PURCHASES {
        let buyer = format!("buyer-{round:02}-{}", "a".repeat(55));
        assert_eq!(buyer.len(), 64);
        let amount = h.get_state(offer(1)).next_price;
        context("intents.test.near", 10, 0);
        let result = h.mt_on_transfer(id(&buyer), vec![id(&buyer)], vec![h.token_id()], vec![amount], json!({"offer_id":offer(1),"invoice_id":format!("{round:064}"),"expected_round":round.to_string(),"published_terms_sha256":Base64VecU8(vec![7;32])}).to_string());
        assert!(matches!(result, PromiseOrValue::Value(v) if v==vec![U128(0)]));
    }
    let payer = h.get_state(offer(1)).holder.unwrap().account_id;
    let uri = format!("ipfs://{}", "a".repeat(2041));
    context(payer.as_str(), 110, 0);
    h.submit_artwork(offer(1), uri.clone(), Base64VecU8(vec![2; 32]));
    context("seller.test.near", 120, 0);
    h.lock_artwork(offer(1), U64(1));
    h.submit_delivery_proof(offer(1), uri, Base64VecU8(vec![3; 32]));
    let first = format!("buyer-00-{}", "a".repeat(55));
    for n in 0..MAX_ISSUES {
        context(&first, 130, 0);
        h.open_issue(offer(1), format!("{n:064}"), Base64VecU8(vec![4; 32]));
    }
    for _ in 0..MAX_WITHDRAWALS {
        context("keeper.test.near", 700, 0);
        let wid = h.release_credit(offer(1), id(&first));
        assert!(!callback(&mut h, 1, wid, false));
    }
    let remaining = h.get_state(offer(1)).storage_remaining.0;
    let bytes = (storage_reserve() - remaining) / env::storage_byte_cost().as_yoctonear();
    println!("Maximum bounded offer fixture uses {bytes} prepaid bytes of {OFFER_STORAGE_BYTES}; callback host gas {}",env::used_gas().as_gas());
    assert!(remaining > 0);
    assert!(bytes < OFFER_STORAGE_BYTES);
}

#[test]
fn native_and_verified_seller_can_cancel_only_empty_offer_and_funder_reclaims() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    auth(
        &mut h,
        "seller.test.near",
        3,
        json!({"action":"cancel_empty_offer","offer_id":offer(1)}),
    );
    assert_eq!(h.get_state(offer(1)).outcome, Outcome::Failure);
    assert_eq!(h.get_state(offer(1)).storage_remaining, U128(0));
    assert!(get_logs()
        .iter()
        .any(|log| log.contains("storage_reserve_reclaimed")));
    create(&mut h, 2, "seller.test.near");
    context("operator.test.near", 3, 0);
    h.cancel_empty_offer(offer(2));
    assert_eq!(h.get_state(offer(2)).outcome, Outcome::Failure);
}

#[test]
#[should_panic(expected = "offer already has bookings or is finalized")]
fn empty_cancellation_cannot_bypass_buyer_refund_settlement() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "buyer.test.near", 0, 10_000);
    context("seller.test.near", 20, 0);
    h.cancel_empty_offer(offer(1));
}

#[test]
#[should_panic(expected = "bidding must close within 30 days")]
fn far_future_bidding_cannot_lock_prepaid_storage_indefinitely() {
    let mut h = hub();
    let mut t = terms();
    t.bidding_close_ns = U64(31 * DAY_NS);
    t.artwork_due_ns = U64(32 * DAY_NS);
    t.installation_due_ns = U64(33 * DAY_NS);
    t.service_start_ns = U64(34 * DAY_NS);
    t.service_end_ns = U64(35 * DAY_NS);
    t.review_end_ns = U64(36 * DAY_NS);
    context("seller.test.near", 2, storage_reserve());
    h.create_offer(offer(1), U128(1), t);
}

#[test]
#[should_panic(expected = "sponsored campaign review must finish within 30 days")]
fn sponsorship_has_a_shorter_capital_exposure_window() {
    let mut h = hub();
    context("operator.test.near", 1, storage_reserve());
    h.fund_sponsor_pool(U64(1), None);
    let mut t = terms();
    t.review_end_ns = U64(31 * DAY_NS);
    auth(
        &mut h,
        "0x2222222222222222222222222222222222222222",
        2,
        json!({"action":"create_offer","offer_id":offer(1),"initial_price_cents":"1","terms":t}),
    );
}

#[test]
fn self_funded_native_campaign_can_run_beyond_sponsorship_window() {
    let mut h = hub();
    let mut t = terms();
    t.review_end_ns = U64(365 * DAY_NS);
    context("seller.test.near", 2, storage_reserve());
    h.create_offer(offer(1), U128(1), t);
    assert_eq!(
        h.get_campaign(offer(1)).terms.unwrap().review_end_ns,
        U64(365 * DAY_NS)
    );
}

#[test]
fn sponsored_cancellation_returns_unused_pool_and_active_quota_without_redirect() {
    let mut h = hub();
    context("operator.test.near", 1, storage_reserve());
    h.fund_sponsor_pool(U64(1), Some(U64(1)));
    context("seller.test.near", 2, 0);
    h.create_offer(offer(1), U128(1), terms());
    assert_eq!(h.get_sponsor_usage(id("seller.test.near")), U64(1));
    auth(
        &mut h,
        "seller.test.near",
        3,
        json!({"action":"cancel_empty_offer","offer_id":offer(1)}),
    );
    assert_eq!(h.get_sponsor_usage(id("seller.test.near")), U64(0));
    assert_eq!(h.get_config().sponsored_offers, U64(0));
    assert!(h.get_config().sponsor_available.0 > NearToken::from_millinear(590).as_yoctonear());
    assert!(
        get_created_receipts().is_empty(),
        "sponsored reserve stays in the original pool rather than paying the cancelling caller"
    );
}

#[test]
fn pending_original_principals_survive_repeat_buyers_failure_and_unrelated_offer_callbacks() {
    let mut h = hub();
    create(&mut h, 1, "seller-a.test.near");
    create(&mut h, 2, "seller-b.test.near");
    buy(&mut h, 1, "alice.test.near", 0, 10_000);
    buy(&mut h, 1, "bob.test.near", 1, 20_000);
    buy(&mut h, 1, "alice.test.near", 2, 30_000);
    buy(&mut h, 2, "charlie.test.near", 0, 10_000);
    buy(&mut h, 2, "dana.test.near", 1, 20_000);
    context("keeper.test.near", 30, 0);
    let alice = h.release_credit(offer(1), id("alice.test.near"));
    let bob = h.release_credit(offer(1), id("bob.test.near"));
    let charlie = h.release_credit(offer(2), id("charlie.test.near"));
    context("anyone.test.near", 110, 0);
    h.mint_final_placement(offer(1));
    auth(
        &mut h,
        "alice.test.near",
        110,
        json!({"action":"transfer_placement","offer_id":offer(1),"receiver_id":"outsider.test.near"}),
    );
    context("arbiter.test.near", 110, 0);
    h.finalize_failure(offer(1));
    assert!(callback(&mut h, 1, bob, true));
    assert!(!callback(&mut h, 1, alice, false));
    assert_eq!(
        h.get_credit(offer(1), id("alice.test.near")).available,
        U128(40_000)
    );
    assert_eq!(
        h.get_credit(offer(1), id("outsider.test.near")).available,
        U128(0)
    );
    assert_eq!(h.get_state(offer(2)).total_pending, U128(10_000));
    assert_eq!(h.get_totals().total_pending, U128(10_000));
    context("keeper.test.near", 700, 0);
    let remaining = h.release_credit(offer(1), id("alice.test.near"));
    assert!(callback(&mut h, 1, remaining, true));
    context("arbiter.test.near", 700, 0);
    h.finalize_failure(offer(2));
    assert!(!callback(&mut h, 2, charlie, false));
    for creditor in ["charlie.test.near", "dana.test.near"] {
        context("keeper.test.near", 700, 0);
        let wid = h.release_credit(offer(2), id(creditor));
        assert!(callback(&mut h, 2, wid, true));
    }
    assert_eq!(h.get_totals().total_received, U128(90_000));
    assert_eq!(h.get_totals().total_withdrawn, U128(90_000));
    assert_eq!(h.get_totals().total_pending, U128(0));
    assert_eq!(h.get_totals().accounted_balance, U128(0));
}

#[test]
fn successful_settlement_then_failed_pending_principal_merges_bonus_without_double_payment() {
    let mut h = hub();
    create(&mut h, 1, "seller.test.near");
    buy(&mut h, 1, "alice.test.near", 0, 10_000);
    buy(&mut h, 1, "bob.test.near", 1, 20_000);
    context("keeper.test.near", 30, 0);
    let pending = h.release_credit(offer(1), id("alice.test.near"));
    delivery(&mut h, 1, "bob.test.near", "seller.test.near");
    context("anyone.test.near", 600, 0);
    h.finalize_success(offer(1));
    assert_eq!(
        h.get_credit(offer(1), id("alice.test.near")).available,
        U128(10_000)
    );
    assert!(!callback(&mut h, 1, pending, false));
    assert_eq!(
        h.get_credit(offer(1), id("alice.test.near")).available,
        U128(20_000)
    );
    assert_eq!(
        h.get_credit(offer(1), id("bob.test.near")).available,
        U128(0)
    );
    for creditor in ["alice.test.near", "seller.test.near"] {
        context("keeper.test.near", 700, 0);
        let wid = h.release_credit(offer(1), id(creditor));
        assert!(callback(&mut h, 1, wid, true));
    }
    assert_eq!(h.get_totals().total_withdrawn, U128(30_000));
    assert_eq!(h.get_totals().accounted_balance, U128(0));
}

#[test]
fn cancellation_and_operator_pool_withdrawal_preserve_every_active_offer_near_reserve() {
    let mut h = hub();
    let reserve = storage_reserve();
    let byte_cost = env::storage_byte_cost().as_yoctonear();
    context("operator.test.near", 1, reserve * 2);
    h.fund_sponsor_pool(U64(2), Some(U64(2)));
    let mut charged_bytes = 0u64;
    for (n, seller, deposit) in [
        (1, "native.test.near", reserve),
        (2, "sponsored.test.near", 0),
        (3, "active.test.near", reserve),
    ] {
        context(seller, 2, deposit);
        let before = env::storage_usage();
        h.create_offer(offer(n), U128(1), terms());
        charged_bytes += env::storage_usage() - before;
    }
    context("intents.test.near", 10, 0);
    let before = env::storage_usage();
    let msg=json!({"offer_id":offer(3),"invoice_id":"active","expected_round":"0","published_terms_sha256":Base64VecU8(vec![7;32])}).to_string();
    let _ = h.mt_on_transfer(
        id("buyer.test.near"),
        vec![id("buyer.test.near")],
        vec!["nep141:usdc.test.near".into()],
        vec![U128(10_000)],
        msg,
    );
    charged_bytes += env::storage_usage() - before;
    let active_reserve = h.get_state(offer(3)).storage_remaining.0;
    context("operator.test.near", 20, 0);
    h.cancel_empty_offer(offer(2));
    assert!(get_created_receipts().is_empty());
    context("operator.test.near", 20, 0);
    h.cancel_empty_offer(offer(1));
    let native_refund = get_created_receipts()
        .iter()
        .filter(|r| r.receiver_id == id("native.test.near"))
        .flat_map(|r| r.actions.iter())
        .filter_map(|a| match a {
            near_sdk::mock::MockAction::Transfer { deposit, .. } => Some(deposit.as_yoctonear()),
            _ => None,
        })
        .sum::<u128>();
    let pool = h.get_config().sponsor_available.0;
    context("operator.test.near", 20, 0);
    h.withdraw_sponsor_pool(U128(pool));
    let operator_refund = get_created_receipts()
        .iter()
        .filter(|r| r.receiver_id == id("operator.test.near"))
        .flat_map(|r| r.actions.iter())
        .filter_map(|a| match a {
            near_sdk::mock::MockAction::Transfer { deposit, .. } => Some(deposit.as_yoctonear()),
            _ => None,
        })
        .sum::<u128>();
    assert_eq!(h.get_config().sponsor_available, U128(0));
    assert_eq!(
        h.get_state(offer(3)).storage_remaining,
        U128(active_reserve)
    );
    assert_eq!(h.get_state(offer(3)).total_received, U128(10_000));
    assert_eq!(
        native_refund + operator_refund + active_reserve + u128::from(charged_bytes) * byte_cost,
        reserve * 4
    );
}
