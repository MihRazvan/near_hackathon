//! Real local-chain coverage. The local Intents fixture models NEP-245 balances
//! and notification callbacks; it does not claim to verify EVM signatures.
use anyhow::{Context, Result};
use near_api::types::{AccountId, Data, transaction::result::TransactionResult};
use near_api::{Chain, Contract, NearGas, NearToken, NetworkConfig, Signer};
use near_sandbox::{Sandbox, config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY};
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Arc};
fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn offer(n: u8) -> String {
    format!("offer-{n:032x}")
}
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn num(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}
const EVM: &str = "0x1111111111111111111111111111111111111111";
struct World {
    sandbox: Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
}
impl World {
    async fn new() -> Result<Self> {
        let sandbox = Sandbox::start_sandbox_with_version("2.14.0").await?;
        let net = NetworkConfig::from_rpc_url("hub-proof", sandbox.rpc_addr.parse()?);
        let signer = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
        Ok(Self {
            sandbox,
            net,
            signer,
        })
    }
    async fn account(&self, s: &str) -> Result<()> {
        self.sandbox
            .create_account(id(s))
            .initial_balance(NearToken::from_near(100))
            .send()
            .await?;
        Ok(())
    }
    async fn deploy(&self, s: &str, artifact: &str) -> Result<()> {
        self.account(s).await?;
        let bytes = std::fs::read(root().join("target/proof-artifacts").join(artifact))
            .with_context(|| format!("Build {artifact} first"))?;
        Contract::deploy(id(s))
            .use_code(bytes)
            .without_init_call()
            .with_signer(self.signer.clone())
            .send_to(&self.net)
            .await?
            .assert_success();
        Ok(())
    }
    async fn call(
        &self,
        caller: &str,
        target: &str,
        method: &str,
        args: Value,
        deposit: u128,
    ) -> Result<TransactionResult> {
        Ok(Contract(id(target))
            .call_function(method, args)
            .transaction()
            .gas(NearGas::from_tgas(if method == "mt_transfer_call" {
                180
            } else if method == "release_credit" {
                90
            } else {
                50
            }))
            .deposit(NearToken::from_yoctonear(deposit))
            .with_signer(id(caller), self.signer.clone())
            .send_to(&self.net)
            .await?)
    }
    async fn ok(
        &self,
        caller: &str,
        target: &str,
        method: &str,
        args: Value,
        deposit: u128,
    ) -> Result<()> {
        self.call(caller, target, method, args, deposit)
            .await?
            .assert_success();
        Ok(())
    }
    async fn view(&self, target: &str, method: &str, args: Value) -> Result<Value> {
        let v: Data<Value> = Contract(id(target))
            .call_function(method, args)
            .read_only()
            .fetch_from(&self.net)
            .await?;
        Ok(v.data)
    }
    async fn auth(&self, actor: &str, msg: Value) -> Result<()> {
        self.ok(
            "intents.sandbox",
            "hub.sandbox",
            "on_auth",
            json!({"signer_id":actor,"msg":msg.to_string()}),
            0,
        )
        .await
    }
    async fn now(&self) -> Result<u64> {
        Ok(Chain::block()
            .fetch_from(&self.net)
            .await?
            .header
            .timestamp_nanosec
            .parse()?)
    }
    async fn advance(&self, target: u64) -> Result<()> {
        while self.now().await? < target {
            self.sandbox.fast_forward(500).await?;
        }
        Ok(())
    }
    async fn buy(&self, n: u8, buyer: &str, round: u64, amount: u128) -> Result<()> {
        self.ok(buyer,"intents.sandbox","mt_transfer_call",json!({"receiver_id":"hub.sandbox","token_id":"nep141:usdc.sandbox","amount":amount.to_string(),"msg":json!({"offer_id":offer(n),"invoice_id":format!("same-invoice-{round}"),"expected_round":round.to_string(),"published_terms_sha256":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc="}).to_string()}),1).await
    }
    async fn state(&self, n: u8) -> Result<Value> {
        self.view("hub.sandbox", "get_state", json!({"offer_id":offer(n)}))
            .await
    }
}
#[tokio::test]
async fn shared_hub_real_chain_multi_owner_lifecycle_and_payout_isolation() -> Result<()> {
    let w = World::new().await?;
    w.deploy("hub.sandbox", "marketplace-hub.wasm").await?;
    w.deploy("intents.sandbox", "test-intents.wasm").await?;
    for s in [
        "operator.sandbox",
        "arbiter.sandbox",
        "seller.sandbox",
        "buyer-a.sandbox",
        "buyer-b.sandbox",
        "attacker.sandbox",
    ] {
        w.account(s).await?;
    }
    w.ok(
        "intents.sandbox",
        "intents.sandbox",
        "new",
        json!({"owner_id":"intents.sandbox"}),
        0,
    )
    .await?;
    w.ok("hub.sandbox","hub.sandbox","new",json!({"owner_id":"operator.sandbox","arbiter_id":"arbiter.sandbox","ft_contract_id":"usdc.sandbox","intents_contract_id":"intents.sandbox"}),0).await?;
    let initial_storage = near_api::Account(id("hub.sandbox"))
        .view()
        .fetch_from(&w.net)
        .await?
        .data
        .storage_usage;
    let code_bytes =
        std::fs::metadata(root().join("target/proof-artifacts/marketplace-hub.wasm"))?.len();
    println!(
        "Initialized shared hub storage {initial_storage} bytes, code {code_bytes}, initialized state+key {} bytes",
        initial_storage - code_bytes
    );
    let config = w.view("hub.sandbox", "get_config", json!({})).await?;
    let reserve = num(&config["offer_storage_deposit"]);
    w.ok(
        "operator.sandbox",
        "hub.sandbox",
        "fund_sponsor_pool",
        json!({"sponsored_offer_limit":"2","per_owner_limit":"8"}),
        reserve,
    )
    .await?;
    let now = w.now().await?;
    let ns = 1_000_000_000u64;
    let terms = json!({"sale_id":"sale","asset_id":"asset","spot_id":"spot","published_terms_sha256":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=","takeover_enabled":true,"bidding_close_ns":(now+600*ns).to_string(),"artwork_due_ns":(now+1800*ns).to_string(),"installation_due_ns":(now+2400*ns).to_string(),"service_start_ns":(now+3000*ns).to_string(),"service_end_ns":(now+3600*ns).to_string(),"review_end_ns":(now+4200*ns).to_string()});
    w.auth(EVM,json!({"action":"create_offer","offer_id":offer(1),"initial_price_cents":"1","terms":terms})).await?;
    w.ok(
        "seller.sandbox",
        "hub.sandbox",
        "create_offer",
        json!({"offer_id":offer(2),"initial_price_cents":"1","terms":terms}),
        reserve,
    )
    .await?;
    for buyer in ["buyer-a.sandbox", "buyer-b.sandbox"] {
        w.ok(
            "intents.sandbox",
            "intents.sandbox",
            "mint",
            json!({"account_id":buyer,"token_id":"nep141:usdc.sandbox","amount":"1000000"}),
            0,
        )
        .await?;
    }
    for n in [1, 2] {
        w.buy(n, "buyer-a.sandbox", 0, 10_000).await?;
        w.buy(n, "buyer-b.sandbox", 1, 20_000).await?;
    }
    assert_eq!(num(&w.state(1).await?["total_received"]), 30_000);
    assert_eq!(num(&w.state(2).await?["total_received"]), 30_000);
    w.ok(
        "seller.sandbox",
        "hub.sandbox",
        "create_offer",
        json!({"offer_id":offer(3),"initial_price_cents":"1","terms":terms}),
        reserve,
    )
    .await?;
    w.ok(
        "seller.sandbox",
        "hub.sandbox",
        "cancel_empty_offer",
        json!({"offer_id":offer(3)}),
        0,
    )
    .await?;
    assert_eq!(w.state(3).await?["outcome"], "failure");
    assert_eq!(w.state(3).await?["storage_reclaimed"], true);
    assert_eq!(w.state(3).await?["storage_remaining"], "0");
    // Spoofed auth never reaches seller mutation. Incorrect invoice amount returns
    // its tokens via the actual NEP-245 resolver, preserving the pooled balance.
    assert!(w.call("attacker.sandbox","hub.sandbox","on_auth",json!({"signer_id":EVM,"msg":json!({"action":"lock_artwork","offer_id":offer(1),"expected_revision":"1"}).to_string()}),0).await?.is_failure());
    let before = w
        .view(
            "intents.sandbox",
            "mt_balance_of",
            json!({"account_id":"buyer-a.sandbox","token_id":"nep141:usdc.sandbox"}),
        )
        .await?;
    w.buy(1, "buyer-a.sandbox", 2, 1).await?;
    assert_eq!(
        w.view(
            "intents.sandbox",
            "mt_balance_of",
            json!({"account_id":"buyer-a.sandbox","token_id":"nep141:usdc.sandbox"})
        )
        .await?,
        before
    );
    w.advance(now + 600 * ns).await?;
    // Creative authority follows the minted NFT during its actual editing
    // window. Payer credits and seller revenue remain independent throughout.
    w.ok("attacker.sandbox", "hub.sandbox", "mint_final_placement", json!({"offer_id":offer(1)}), 0).await?;
    let finances_before_transfer = w.view("hub.sandbox", "get_totals", json!({})).await?;
    let payer_credit_before_transfer = w.view("hub.sandbox", "get_credit", json!({"offer_id":offer(1),"account_id":"buyer-b.sandbox"})).await?;
    w.ok("buyer-b.sandbox", "hub.sandbox", "nft_transfer", json!({"receiver_id":EVM,"token_id":offer(1)}), 1).await?;
    assert!(w.call("buyer-b.sandbox", "hub.sandbox", "submit_artwork", json!({"offer_id":offer(1),"artifact_uri":"ipfs://old-owner","artifact_sha256":"CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg="}), 0).await?.is_failure());
    w.auth(EVM, json!({"action":"submit_artwork","offer_id":offer(1),"token_id":offer(1),"artifact_uri":"ipfs://new-owner","artifact_sha256":"CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg="})).await?;
    let transferred_rights = w.view("hub.sandbox", "get_placement_rights", json!({"offer_id":offer(1)})).await?;
    assert_eq!(transferred_rights["current_owner_id"], EVM);
    assert_eq!(transferred_rights["proposal"]["submitted_by"], EVM);
    assert_eq!(w.state(1).await?["holder"]["account_id"], "buyer-b.sandbox");
    assert_eq!(w.view("hub.sandbox", "get_totals", json!({})).await?, finances_before_transfer);
    assert_eq!(w.view("hub.sandbox", "get_credit", json!({"offer_id":offer(1),"account_id":"buyer-b.sandbox"})).await?, payer_credit_before_transfer);
    w.auth(EVM, json!({"action":"transfer_placement","offer_id":offer(1),"receiver_id":"buyer-b.sandbox"})).await?;
    assert!(w.call("intents.sandbox", "hub.sandbox", "on_auth", json!({"signer_id":EVM,"msg":json!({"action":"submit_artwork","offer_id":offer(1),"token_id":offer(1),"artifact_uri":"ipfs://former-controller","artifact_sha256":"CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg="}).to_string()}), 0).await?.is_failure());
    for (n, seller) in [(1, EVM), (2, "seller.sandbox")] {
        w.auth("buyer-b.sandbox",json!({"action":"submit_artwork","offer_id":offer(n),"token_id":offer(n),"artifact_uri":"ipfs://artwork","artifact_sha256":"CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg="})).await?;
        w.auth(
            seller,
            json!({"action":"lock_artwork","offer_id":offer(n),"expected_revision":if n==1 { "2" } else { "1" }}),
        )
        .await?;
        w.auth(seller,json!({"action":"submit_delivery_proof","offer_id":offer(n),"artifact_uri":"ipfs://installation","artifact_sha256":"CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk="})).await?;
    }
    assert_eq!(
        w.view("hub.sandbox", "nft_total_supply", json!({})).await?,
        json!("2")
    );
    w.ok(
        "buyer-b.sandbox",
        "hub.sandbox",
        "nft_transfer",
        json!({"receiver_id":EVM,"token_id":offer(1)}),
        1,
    )
    .await?;
    assert_eq!(
        w.view("hub.sandbox", "nft_token", json!({"token_id":offer(1)}))
            .await?["owner_id"],
        EVM
    );
    w.auth(
        EVM,
        json!({"action":"transfer_placement","offer_id":offer(1),"receiver_id":"buyer-b.sandbox"}),
    )
    .await?;
    w.auth("buyer-a.sandbox",json!({"action":"open_issue","offer_id":offer(1),"case_id":"case1","evidence_sha256":"CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk="})).await?;
    w.advance(now + 4200 * ns).await?;
    assert!(
        w.call(
            "attacker.sandbox",
            "hub.sandbox",
            "finalize_success",
            json!({"offer_id":offer(1)}),
            0
        )
        .await?
        .is_failure()
    );
    w.ok(
        "attacker.sandbox",
        "hub.sandbox",
        "finalize_success",
        json!({"offer_id":offer(2)}),
        0,
    )
    .await?;
    w.ok("arbiter.sandbox","hub.sandbox","record_issue_decision",json!({"offer_id":offer(1),"case_id":"case1","open":false,"evidence_sha256":"CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk="}),0).await?;
    w.ok(
        "attacker.sandbox",
        "hub.sandbox",
        "finalize_success",
        json!({"offer_id":offer(1)}),
        0,
    )
    .await?;
    // A failed payout restores only that offer's original creditor. Offer2 remains
    // withdrawable and shares no withdrawal namespace with offer1 (both start0).
    w.ok(
        "intents.sandbox",
        "intents.sandbox",
        "block_recipient",
        json!({"account_id":"buyer-a.sandbox"}),
        0,
    )
    .await?;
    let failed = w
        .call(
            "attacker.sandbox",
            "hub.sandbox",
            "release_credit",
            json!({"offer_id":offer(1),"account_id":"buyer-a.sandbox"}),
            0,
        )
        .await?;
    assert!(!failed.is_failure());
    assert_eq!(
        w.view(
            "hub.sandbox",
            "get_withdrawal",
            json!({"offer_id":offer(1),"withdrawal_id":"0"})
        )
        .await?["status"],
        "failed"
    );
    assert_eq!(
        w.view(
            "hub.sandbox",
            "get_credit",
            json!({"offer_id":offer(1),"account_id":"buyer-a.sandbox"})
        )
        .await?["available"],
        "20000"
    );
    w.ok(
        "intents.sandbox",
        "intents.sandbox",
        "block_recipient",
        json!({"account_id":null}),
        0,
    )
    .await?;
    for (n, seller) in [(1, EVM), (2, "seller.sandbox")] {
        for creditor in ["buyer-a.sandbox", seller] {
            w.ok(
                "attacker.sandbox",
                "hub.sandbox",
                "release_credit",
                json!({"offer_id":offer(n),"account_id":creditor}),
                0,
            )
            .await?;
        }
    }
    w.ok(
        "attacker.sandbox",
        "hub.sandbox",
        "reclaim_storage_reserve",
        json!({"offer_id":offer(1)}),
        0,
    )
    .await?;
    let reclaimed = w.view("hub.sandbox", "get_config", json!({})).await?;
    assert_eq!(reclaimed["sponsored_offers"], "0");
    assert!(num(&reclaimed["sponsor_available"]) > 0);
    let totals = w.view("hub.sandbox", "get_totals", json!({})).await?;
    assert_eq!(num(&totals["total_received"]), 60_000);
    assert_eq!(num(&totals["total_withdrawn"]), 60_000);
    assert_eq!(num(&totals["total_pending"]), 0);
    assert_eq!(num(&totals["accounted_balance"]), 0);
    assert_eq!(
        num(&w
            .view(
                "intents.sandbox",
                "mt_balance_of",
                json!({"account_id":"hub.sandbox","token_id":"nep141:usdc.sandbox"})
            )
            .await?),
        0
    );
    println!(
        "Hub deployed storage: {:?}; per-offer reserve {} yocto",
        near_api::Account(id("hub.sandbox"))
            .view()
            .fetch_from(&w.net)
            .await?
            .data
            .storage_usage,
        reserve
    );
    Ok(())
}
