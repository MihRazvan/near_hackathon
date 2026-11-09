use anyhow::{Context, Result};
use near_api::types::{AccountId, Data, transaction::result::TransactionResult};
use near_api::{Chain, Contract, NearGas, NearToken, NetworkConfig, Signer};
use near_sandbox::{Sandbox, config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY};
use serde_json::{Value, json};
use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    sync::Arc,
};

const USDC: u128 = 1_000_000;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn id(name: &str) -> AccountId {
    name.parse().unwrap()
}
fn invoice(name: &str, round: u64) -> String {
    json!({"invoice_id":name,"expected_round":round.to_string()}).to_string()
}
fn number(value: &Value) -> u128 {
    value.as_str().unwrap().parse().unwrap()
}

struct World {
    sandbox: Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
    bounded_gas: bool,
}
impl World {
    async fn start() -> Result<Self> {
        let sandbox = Sandbox::start_sandbox_with_version("2.14.0").await?;
        let net = NetworkConfig::from_rpc_url("local-proof", sandbox.rpc_addr.parse()?);
        let signer = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
        Ok(Self {
            sandbox,
            net,
            signer,
            bounded_gas: false,
        })
    }
    async fn account(&self, name: &str) -> Result<()> {
        self.sandbox
            .create_account(id(name))
            .initial_balance(NearToken::from_near(100))
            .send()
            .await?;
        Ok(())
    }
    async fn deploy(&self, name: &str, artifact: &str) -> Result<()> {
        let bytes = std::fs::read(root().join("target/proof-artifacts").join(artifact))
            .with_context(|| format!("Run bash scripts/build-proof.sh first ({artifact})"))?;
        self.deploy_bytes(name, bytes).await
    }
    async fn deploy_bytes(&self, name: &str, bytes: Vec<u8>) -> Result<()> {
        self.account(name).await?;
        Contract::deploy(id(name))
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
        sender: &str,
        contract: &str,
        method: &str,
        args: Value,
        yocto: u128,
    ) -> Result<TransactionResult> {
        Ok(Contract(id(contract))
            .call_function(method, args)
            .transaction()
            .gas(NearGas::from_tgas(if self.bounded_gas {
                match method {
                    "execute_intents" | "release_credit" => 60,
                    "new_campaign" | "finalize_success" | "finalize_failure" => 20,
                    "mint_final_placement" | "nft_transfer" | "submit_artwork" | "lock_artwork" |
                    "submit_delivery_proof" | "record_issue_decision" | "accept_nft_nomination" => 25,
                    _ => 280,
                }
            } else { 280 }))
            .deposit(NearToken::from_yoctonear(yocto))
            .with_signer(id(sender), self.signer.clone())
            .send_to(&self.net)
            .await?)
    }
    async fn ok(
        &self,
        sender: &str,
        contract: &str,
        method: &str,
        args: Value,
        yocto: u128,
    ) -> Result<()> {
        self.call(sender, contract, method, args, yocto)
            .await?
            .assert_success();
        Ok(())
    }
    async fn view(&self, contract: &str, method: &str, args: Value) -> Result<Value> {
        let value: Data<Value> = Contract(id(contract))
            .call_function(method, args)
            .read_only()
            .fetch_from(&self.net)
            .await?;
        Ok(value.data)
    }
    async fn ft(&self, name: &str) -> Result<()> {
        self.deploy(name, "test-token.wasm").await?;
        self.ok(name, name, "new", json!({"owner_id":name}), 0)
            .await
    }
    async fn mint(&self, token: &str, account: &str, amount: u128) -> Result<()> {
        self.ok(
            token,
            token,
            "mint",
            json!({"account_id":account,"amount":amount.to_string()}),
            0,
        )
        .await
    }
    async fn balance(&self, token: &str, account: &str) -> Result<u128> {
        Ok(number(
            &self
                .view(token, "ft_balance_of", json!({"account_id":account}))
                .await?,
        ))
    }
    async fn market(
        &self,
        name: &str,
        token: &str,
        intents: &str,
        settlement: &str,
        artifact: &str,
    ) -> Result<()> {
        self.deploy(name, artifact).await?;
        let block = Chain::block().fetch_from(&self.net).await?;
        let now: u64 = block.header.timestamp_nanosec.parse()?;
        self.ok(
            name,
            name,
            "new",
            json!({
                "seller_id":"seller.sandbox","arbiter_id":"arbiter.sandbox",
                "ft_contract_id":token,"intents_contract_id":intents,"settlement":settlement,
                "initial_price_cents":"10000","cutoff_ns":(now+600_000_000_000).to_string(),
                "refund_end_ns":(now+1_200_000_000_000).to_string()
            }),
            0,
        )
        .await?;
        if settlement == "native" {
            self.mint(token, name, 0).await?;
        }
        Ok(())
    }
    async fn buy(
        &self,
        buyer: &str,
        market: &str,
        token: &str,
        amount: u128,
        name: &str,
        round: u64,
    ) -> Result<()> {
        self.ok(buyer,token,"ft_transfer_call",json!({"receiver_id":market,"amount":amount.to_string(),"msg":invoice(name,round),"memo":null}),1).await
    }
    async fn credit(&self, market: &str, owner: &str) -> Result<Value> {
        self.view(market, "get_credit", json!({"account_id":owner}))
            .await
    }
    async fn state(&self, market: &str) -> Result<Value> {
        self.view(market, "get_state", json!({})).await
    }
}

fn sdk_signed(
    world: &World,
    standard: &str,
    buyer: &str,
    market: &str,
    amount: u128,
    round: u64,
) -> Result<Value> {
    sdk_envelope(
        world,
        standard,
        buyer,
        json!([{"intent":"transfer","receiver_id":market,
        "tokens":{"nep141:usdc.sandbox":amount.to_string()},"msg":invoice(standard,round),"min_gas":"65000000000000"}]),
    )
}

fn sdk_envelope(world: &World, standard: &str, buyer: &str, intents: Value) -> Result<Value> {
    sdk_batches(world, standard, buyer, intents, json!([]))
}

fn sdk_batches(
    world: &World,
    standard: &str,
    buyer: &str,
    intents: Value,
    followups: Value,
) -> Result<Value> {
    let mut child = Command::new("node")
        .arg(root().join("proofs/intents-compatibility/sign-local-intent.mjs"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let config = json!({"rpcUrl":world.sandbox.rpc_addr,"standard":standard,"accountId":buyer,
        "verifyingContract":"verifier.sandbox","intents":intents,"followupIntents":followups});
    child
        .stdin
        .take()
        .unwrap()
        .write_all(config.to_string().as_bytes())?;
    let output = child.wait_with_output()?;
    anyhow::ensure!(
        output.status.success(),
        "SDK signer failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(serde_json::from_slice(&output.stdout)?)
}

async fn advance_to(world: &World, target: u64) -> Result<()> {
    for _ in 0..32 {
        let now: u64 = Chain::block()
            .fetch_from(&world.net)
            .await?
            .header
            .timestamp_nanosec
            .parse()?;
        if now >= target {
            return Ok(());
        }
        world.sandbox.fast_forward(500).await?;
    }
    anyhow::bail!("Sandbox did not cross requested timestamp");
}

fn evm_cases(market: &str, amount: u128, round: u64) -> Result<Value> {
    let output = Command::new("node")
        .arg(root().join("proofs/evm-intent-signing/sign.mjs"))
        .args([
            "--intents",
            "verifier.sandbox",
            "--storefront",
            market,
            "--token",
            "nep141:usdc.sandbox",
            "--invoice",
            "erc191-takeover",
            "--amount",
            &amount.to_string(),
            "--round",
            &round.to_string(),
        ])
        .output()?;
    anyhow::ensure!(
        output.status.success(),
        "EVM cases failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(serde_json::from_slice(&output.stdout)?)
}

#[tokio::test]
async fn real_local_chain_proof() -> Result<()> {
    let world = World::start().await?;
    for name in [
        "seller.sandbox",
        "arbiter.sandbox",
        "alice.sandbox",
        "bob.sandbox",
        "carol.sandbox",
    ] {
        world.account(name).await?;
    }
    world.ft("usdc.sandbox").await?;
    world.ft("wrong.sandbox").await?;
    for owner in ["alice.sandbox", "bob.sandbox", "carol.sandbox"] {
        world.mint("usdc.sandbox", owner, 10_000 * USDC).await?;
        world.mint("wrong.sandbox", owner, 1_000 * USDC).await?;
    }
    for market in ["success.sandbox", "failure.sandbox", "isolated.sandbox"] {
        world
            .market(
                market,
                "usdc.sandbox",
                "intents.sandbox",
                "native",
                "marketplace.wasm",
            )
            .await?;
    }
    world
        .market(
            "fault.sandbox",
            "usdc.sandbox",
            "intents.sandbox",
            "native",
            "marketplace-callback-fault.wasm",
        )
        .await?;
    world.mint("wrong.sandbox", "success.sandbox", 0).await?;
    assert!(
        world
            .call(
                "arbiter.sandbox",
                "success.sandbox",
                "mint_final_placement",
                json!({}),
                100_000_000_000_000_000_000_000
            )
            .await?
            .is_failure()
    );
    assert_eq!(
        world
            .view("success.sandbox", "nft_total_supply", json!({}))
            .await?,
        "0"
    );
    let mut checks = Vec::<Value>::new();

    // Actual NEP-141 resolver refunds the wrong token without awarding a position.
    let before = world.balance("wrong.sandbox", "alice.sandbox").await?;
    world
        .buy(
            "alice.sandbox",
            "success.sandbox",
            "wrong.sandbox",
            100 * USDC,
            "wrong",
            0,
        )
        .await?;
    assert_eq!(
        world.balance("wrong.sandbox", "alice.sandbox").await?,
        before
    );
    assert_eq!(world.state("success.sandbox").await?["round"], "0");
    world.ok("alice.sandbox","success.sandbox","ft_on_transfer",json!({"sender_id":"alice.sandbox","amount":(100*USDC).to_string(),"msg":invoice("forged",0)}),0).await?;
    assert_eq!(world.state("success.sandbox").await?["round"], "0");
    checks.push(json!({"check":"wrong_token_and_forged_receiver","passed":true}));

    world
        .buy(
            "alice.sandbox",
            "success.sandbox",
            "usdc.sandbox",
            100 * USDC,
            "first",
            0,
        )
        .await?;
    let bob_before = world.balance("usdc.sandbox", "bob.sandbox").await?;
    let carol_before = world.balance("usdc.sandbox", "carol.sandbox").await?;
    let (b, c) = tokio::join!(
        world.buy(
            "bob.sandbox",
            "success.sandbox",
            "usdc.sandbox",
            150 * USDC,
            "race-b",
            1
        ),
        world.buy(
            "carol.sandbox",
            "success.sandbox",
            "usdc.sandbox",
            150 * USDC,
            "race-c",
            1
        )
    );
    b?;
    c?;
    let state = world.state("success.sandbox").await?;
    assert_eq!(state["round"], "2");
    let current = state["holder"]["account_id"].as_str().unwrap().to_owned();
    assert_eq!(
        world.balance("usdc.sandbox", "success.sandbox").await?,
        250 * USDC
    );
    let b_spent = bob_before - world.balance("usdc.sandbox", "bob.sandbox").await?;
    let c_spent = carol_before - world.balance("usdc.sandbox", "carol.sandbox").await?;
    assert_eq!(b_spent + c_spent, 150 * USDC);
    assert!(b_spent == 0 || c_spent == 0);
    assert_eq!(
        number(&world.credit("success.sandbox", "alice.sandbox").await?["available"]),
        100 * USDC
    );
    assert_eq!(
        number(&world.credit("success.sandbox", "alice.sandbox").await?["conditional_bonus"]),
        10 * USDC
    );
    assert_eq!(world.state("isolated.sandbox").await?["round"], "0");
    checks.push(json!({"check":"concurrent_takeovers_one_winner_full_loser_refund","passed":true,"winner":current}));

    let before = world.balance("usdc.sandbox", "bob.sandbox").await?;
    world
        .buy(
            "bob.sandbox",
            "success.sandbox",
            "usdc.sandbox",
            225 * USDC,
            "first",
            2,
        )
        .await?;
    assert_eq!(world.balance("usdc.sandbox", "bob.sandbox").await?, before);
    assert_eq!(world.state("success.sandbox").await?["round"], "2");
    assert!(
        world
            .call(
                "seller.sandbox",
                "success.sandbox",
                "finalize_success",
                json!({}),
                0
            )
            .await?
            .is_failure()
    );
    assert!(
        world
            .call(
                "arbiter.sandbox",
                "success.sandbox",
                "finalize_success",
                json!({}),
                0
            )
            .await?
            .is_failure()
    );
    checks.push(json!({"check":"duplicate_invoice_and_early_unauthorized_release","passed":true}));

    // Outgoing FT failure restores only the vested principal, then retry works.
    world
        .ok(
            "usdc.sandbox",
            "usdc.sandbox",
            "block_recipient",
            json!({"account_id":"alice.sandbox"}),
            0,
        )
        .await?;
    world
        .ok("alice.sandbox", "success.sandbox", "withdraw", json!({}), 0)
        .await?;
    assert_eq!(
        world
            .view(
                "success.sandbox",
                "get_withdrawal",
                json!({"withdrawal_id":"0"})
            )
            .await?["status"],
        "failed"
    );
    assert_eq!(
        number(&world.credit("success.sandbox", "alice.sandbox").await?["available"]),
        100 * USDC
    );
    world
        .ok(
            "usdc.sandbox",
            "usdc.sandbox",
            "block_recipient",
            json!({"account_id":null}),
            0,
        )
        .await?;
    world
        .ok("alice.sandbox", "success.sandbox", "withdraw", json!({}), 0)
        .await?;
    assert_eq!(
        world
            .view(
                "success.sandbox",
                "get_withdrawal",
                json!({"withdrawal_id":"1"})
            )
            .await?["status"],
        "succeeded"
    );
    assert_eq!(
        number(&world.credit("success.sandbox", "alice.sandbox").await?["available"]),
        0
    );
    checks.push(
        json!({"check":"known_failed_transfer_restores_credit_and_retry_pays_once","passed":true}),
    );

    for market in ["failure.sandbox", "fault.sandbox"] {
        world
            .buy(
                "alice.sandbox",
                market,
                "usdc.sandbox",
                100 * USDC,
                &format!("a-{market}"),
                0,
            )
            .await?;
        world
            .buy(
                "bob.sandbox",
                market,
                "usdc.sandbox",
                150 * USDC,
                &format!("b-{market}"),
                1,
            )
            .await?;
    }
    let before = world.balance("usdc.sandbox", "alice.sandbox").await?;
    let fault_tx = world
        .call("alice.sandbox", "fault.sandbox", "withdraw", json!({}), 0)
        .await?;
    let fault_result = fault_tx
        .into_full()
        .context("full receipt results required")?;
    assert_eq!(fault_result.receipt_failures().len(), 1);
    assert_eq!(
        fault_result.receipt_failures()[0].executor_id,
        id("fault.sandbox")
    );
    assert_eq!(
        world.balance("usdc.sandbox", "alice.sandbox").await?,
        before + 100 * USDC
    );
    assert_eq!(
        world
            .view(
                "fault.sandbox",
                "get_withdrawal",
                json!({"withdrawal_id":"0"})
            )
            .await?["status"],
        "pending"
    );
    assert_eq!(
        number(&world.credit("fault.sandbox", "alice.sandbox").await?["available"]),
        0
    );
    assert!(
        world
            .call("alice.sandbox", "fault.sandbox", "withdraw", json!({}), 0)
            .await?
            .is_failure()
    );
    assert_eq!(
        world.balance("usdc.sandbox", "alice.sandbox").await?,
        before + 100 * USDC
    );
    checks.push(json!({"check":"successful_transfer_failed_callback_stays_pending_no_duplicate","passed":true}));

    // A local NEP-245 fixture isolates wrong-asset and transfer-failure behavior.
    world.deploy("intents.sandbox", "test-intents.wasm").await?;
    world
        .ok(
            "intents.sandbox",
            "intents.sandbox",
            "new",
            json!({"owner_id":"intents.sandbox"}),
            0,
        )
        .await?;
    world
        .market(
            "mtmarket.sandbox",
            "usdc.sandbox",
            "intents.sandbox",
            "intents",
            "marketplace.wasm",
        )
        .await?;
    let tid = "nep141:usdc.sandbox";
    for owner in ["alice.sandbox", "bob.sandbox"] {
        world
            .ok(
                "intents.sandbox",
                "intents.sandbox",
                "mint",
                json!({"account_id":owner,"token_id":tid,"amount":(1_000*USDC).to_string()}),
                0,
            )
            .await?;
    }
    for (buyer, amount, round) in [
        ("alice.sandbox", 100 * USDC, 0),
        ("bob.sandbox", 150 * USDC, 1),
    ] {
        world.ok(buyer,"intents.sandbox","mt_transfer_call",json!({"receiver_id":"mtmarket.sandbox","token_id":tid,"amount":amount.to_string(),"msg":invoice(buyer,round)}),1).await?;
    }
    let alice_mt_before = number(
        &world
            .view(
                "intents.sandbox",
                "mt_balance_of",
                json!({"account_id":"alice.sandbox","token_id":tid}),
            )
            .await?,
    );
    world
        .ok(
            "intents.sandbox",
            "intents.sandbox",
            "block_recipient",
            json!({"account_id":"alice.sandbox"}),
            0,
        )
        .await?;
    world
        .ok(
            "carol.sandbox",
            "mtmarket.sandbox",
            "release_credit",
            json!({"account_id":"alice.sandbox"}),
            0,
        )
        .await?;
    assert_eq!(
        world
            .view(
                "mtmarket.sandbox",
                "get_withdrawal",
                json!({"withdrawal_id":"0"})
            )
            .await?["status"],
        "failed"
    );
    assert_eq!(
        number(&world.credit("mtmarket.sandbox", "alice.sandbox").await?["available"]),
        100 * USDC
    );
    assert_eq!(
        number(
            &world
                .view(
                    "intents.sandbox",
                    "mt_balance_of",
                    json!({"account_id":"alice.sandbox","token_id":tid})
                )
                .await?
        ),
        alice_mt_before
    );
    world
        .ok(
            "intents.sandbox",
            "intents.sandbox",
            "block_recipient",
            json!({"account_id":null}),
            0,
        )
        .await?;
    world
        .ok(
            "carol.sandbox",
            "mtmarket.sandbox",
            "release_credit",
            json!({"account_id":"alice.sandbox"}),
            0,
        )
        .await?;
    assert_eq!(
        number(
            &world
                .view(
                    "intents.sandbox",
                    "mt_balance_of",
                    json!({"account_id":"alice.sandbox","token_id":tid})
                )
                .await?
        ),
        alice_mt_before + 100 * USDC
    );
    checks.push(
        json!({"check":"nep245_fixture_original_beneficiary_permissionless_release","passed":true}),
    );
    world.ok("intents.sandbox","intents.sandbox","mint",json!({"account_id":"bob.sandbox","token_id":"nep141:wrong.sandbox","amount":(225*USDC).to_string()}),0).await?;
    world.ok("bob.sandbox","intents.sandbox","mt_transfer_call",json!({"receiver_id":"mtmarket.sandbox","token_id":"nep141:wrong.sandbox","amount":(225*USDC).to_string(),"msg":invoice("wrong-mt",2)}),1).await?;
    assert_eq!(
        number(
            &world
                .view(
                    "intents.sandbox",
                    "mt_balance_of",
                    json!({"account_id":"bob.sandbox","token_id":"nep141:wrong.sandbox"})
                )
                .await?
        ),
        225 * USDC
    );
    for (caller, previous) in [
        ("carol.sandbox", "bob.sandbox"),
        ("intents.sandbox", "alice.sandbox"),
    ] {
        world.ok(caller,"mtmarket.sandbox","mt_on_transfer",json!({"sender_id":"bob.sandbox","previous_owner_ids":[previous],"token_ids":[tid],"amounts":[(225*USDC).to_string()],"msg":invoice("forged-mt",2)}),0).await?;
    }
    assert_eq!(world.state("mtmarket.sandbox").await?["round"], "2");
    assert!(
        !world
            .view(
                "mtmarket.sandbox",
                "is_invoice_used",
                json!({"invoice_id":"forged-mt"})
            )
            .await?
            .as_bool()
            .unwrap()
    );
    checks.push(json!({"check":"nep245_fixture_wrong_asset_forged_actor_previous_owner_failed_payout","passed":true}));

    // This is the EXACT downloaded live Intents WASM, freshly initialized locally.
    // Local assets/keys replace mainnet state; the public relay and bridges are absent.
    let actual =
        std::fs::read(root().join("proofs/intents-compatibility/artifacts/intents-mainnet.wasm"))
            .context("Run the read-only Intents probe to fetch the pinned deployed WASM")?;
    let pinned: Value = serde_json::from_slice(&std::fs::read(
        root().join("proofs/intents-compatibility/pin.json"),
    )?)?;
    let expected_hash = pinned["intents_account"]["response"]["result"]["code_hash"]
        .as_str()
        .context("pinned live code hash missing")?;
    assert_eq!(
        near_api::types::CryptoHash::hash(&actual).to_string(),
        expected_hash,
        "Intents WASM must match pinned mainnet account"
    );
    world.deploy_bytes("verifier.sandbox", actual).await?;
    world
        .ok(
            "verifier.sandbox",
            "verifier.sandbox",
            "new",
            json!({"config":{
                "wnear_id":"usdc.sandbox","fees":{"fee":0,"fee_collector":"seller.sandbox"},
                "roles":{"super_admins":["sandbox"],"admins":{},"grantees":{}}
            }}),
            0,
        )
        .await?;
    world.mint("usdc.sandbox", "verifier.sandbox", 0).await?;
    world
        .market(
            "realmt.sandbox",
            "usdc.sandbox",
            "verifier.sandbox",
            "intents",
            "marketplace.wasm",
        )
        .await?;
    let near_signed = sdk_signed(
        &world,
        "nep413",
        "alice.sandbox",
        "realmt.sandbox",
        100 * USDC,
        0,
    )?;
    world
        .ok(
            "alice.sandbox",
            "verifier.sandbox",
            "add_public_key",
            json!({"public_key":near_signed["publicKey"]}),
            1,
        )
        .await?;
    world.ok("alice.sandbox","usdc.sandbox","ft_transfer_call",json!({"receiver_id":"verifier.sandbox","amount":(500*USDC).to_string(),"msg":"alice.sandbox","memo":null}),1).await?;
    world
        .ok(
            "carol.sandbox",
            "verifier.sandbox",
            "execute_intents",
            near_signed["executeArgs"].clone(),
            0,
        )
        .await?;
    assert_eq!(
        world.state("realmt.sandbox").await?["holder"]["account_id"],
        "alice.sandbox"
    );
    assert_eq!(world.state("realmt.sandbox").await?["round"], "1");
    checks.push(
        json!({"check":"deployed_intents_wasm_nep413_signed_notification_buy","passed":true}),
    );

    let evm_signed = evm_cases("realmt.sandbox", 150 * USDC, 1)?;
    let evm_id = evm_signed["signer_id"].as_str().unwrap();
    world.ok("bob.sandbox","usdc.sandbox","ft_transfer_call",json!({"receiver_id":"verifier.sandbox","amount":(500*USDC).to_string(),"msg":evm_id,"memo":null}),1).await?;
    for case in ["expired", "tampered", "wrong_verifier"] {
        assert!(
            world
                .call(
                    "carol.sandbox",
                    "verifier.sandbox",
                    "execute_intents",
                    evm_signed[case].clone(),
                    0
                )
                .await?
                .is_failure(),
            "negative case {case}"
        );
        assert_eq!(world.state("realmt.sandbox").await?["round"], "1");
        assert_eq!(
            number(
                &world
                    .view(
                        "verifier.sandbox",
                        "mt_balance_of",
                        json!({"account_id":evm_id,"token_id":tid})
                    )
                    .await?
            ),
            500 * USDC
        );
    }
    checks.push(json!({"check":"deployed_intents_wasm_expired_tampered_wrong_verifier_signatures_rejected","passed":true}));
    world
        .ok(
            "carol.sandbox",
            "verifier.sandbox",
            "execute_intents",
            evm_signed["valid"].clone(),
            0,
        )
        .await?;
    assert_eq!(
        world.state("realmt.sandbox").await?["holder"]["account_id"],
        evm_id
    );
    assert_eq!(world.state("realmt.sandbox").await?["round"], "2");
    assert_eq!(
        number(&world.credit("realmt.sandbox", "alice.sandbox").await?["available"]),
        100 * USDC
    );
    assert!(
        world
            .call(
                "carol.sandbox",
                "verifier.sandbox",
                "execute_intents",
                evm_signed["replay"].clone(),
                0
            )
            .await?
            .is_failure()
    );
    assert_eq!(world.state("realmt.sandbox").await?["round"], "2");
    checks.push(json!({"check":"deployed_intents_wasm_erc191_takeover_without_near_buyer_account_replay_rejected","passed":true,"buyer":evm_id}));

    // Distinct signed nonce, stale expected round: notification refunds the EVM identity.
    let stale = sdk_signed(
        &world,
        "erc191",
        "unused.sandbox",
        "realmt.sandbox",
        225 * USDC,
        1,
    )?;
    let stale_id = stale["signerId"].as_str().unwrap();
    world.ok("bob.sandbox","usdc.sandbox","ft_transfer_call",json!({"receiver_id":"verifier.sandbox","amount":(225*USDC).to_string(),"msg":stale_id,"memo":null}),1).await?;
    world
        .ok(
            "carol.sandbox",
            "verifier.sandbox",
            "execute_intents",
            stale["executeArgs"].clone(),
            0,
        )
        .await?;
    assert_eq!(
        number(
            &world
                .view(
                    "verifier.sandbox",
                    "mt_balance_of",
                    json!({"account_id":stale_id,"token_id":tid})
                )
                .await?
        ),
        225 * USDC
    );
    assert_eq!(world.state("realmt.sandbox").await?["round"], "2");
    world
        .ok(
            "carol.sandbox",
            "realmt.sandbox",
            "release_credit",
            json!({"account_id":"alice.sandbox"}),
            0,
        )
        .await?;
    assert_eq!(
        number(
            &world
                .view(
                    "verifier.sandbox",
                    "mt_balance_of",
                    json!({"account_id":"alice.sandbox","token_id":tid})
                )
                .await?
        ),
        500 * USDC
    );
    checks.push(json!({"check":"deployed_intents_wasm_stale_notification_refund_and_original_beneficiary_claim","passed":true}));

    // A further purchase displaces the EVM buyer. A keeper can release their
    // principal to that same Intents identity without a native buyer account.
    let nomination = json!({"intent":"auth_call","contract_id":"realmt.sandbox","msg":json!({"action":"nominate_nft_recipient","recipient_id":"alice.sandbox"}).to_string(),"min_gas":"65000000000000"});
    let third = sdk_batches(
        &world,
        "erc191",
        "unused.sandbox",
        json!([{
            "intent":"transfer","receiver_id":"realmt.sandbox","tokens":{"nep141:usdc.sandbox":(225*USDC).to_string()},
            "msg":invoice("third-final-buyer",2),"min_gas":"65000000000000"
        }]),
        json!([
            [nomination.clone()],
            [nomination.clone()],
            [nomination.clone()]
        ]),
    )?;
    let third_id = third["signerId"].as_str().unwrap();
    world.ok("bob.sandbox","usdc.sandbox","ft_transfer_call",json!({"receiver_id":"verifier.sandbox","amount":(225*USDC).to_string(),"msg":third_id,"memo":null}),1).await?;
    world
        .ok(
            "carol.sandbox",
            "verifier.sandbox",
            "execute_intents",
            third["executeArgs"].clone(),
            0,
        )
        .await?;
    assert_eq!(
        world.state("realmt.sandbox").await?["holder"]["account_id"],
        third_id
    );
    assert!(
        near_api::Account(id(evm_id))
            .view()
            .fetch_from(&world.net)
            .await
            .is_err(),
        "EVM buyer must have no native NEAR account in this proof"
    );
    assert_eq!(
        number(&world.credit("realmt.sandbox", evm_id).await?["available"]),
        150 * USDC
    );
    assert_eq!(
        number(&world.credit("realmt.sandbox", evm_id).await?["conditional_bonus"]),
        15 * USDC
    );
    world
        .ok(
            "carol.sandbox",
            "realmt.sandbox",
            "release_credit",
            json!({"account_id":evm_id}),
            0,
        )
        .await?;
    assert_eq!(
        number(
            &world
                .view(
                    "verifier.sandbox",
                    "mt_balance_of",
                    json!({"account_id":evm_id,"token_id":tid})
                )
                .await?
        ),
        500 * USDC
    );
    checks.push(json!({"check":"deployed_intents_wasm_evm_displaced_principal_release_without_native_account","passed":true}));
    let early_auth = world
        .call(
            "carol.sandbox",
            "verifier.sandbox",
            "execute_intents",
            third["followupExecuteArgs"][0].clone(),
            0,
        )
        .await?
        .into_full()
        .context("complete auth receipts")?;
    assert!(
        !early_auth.receipt_failures().is_empty(),
        "pre-cutoff auth callback must reject nomination"
    );
    assert_eq!(
        world.state("realmt.sandbox").await?["nominated_recipient"],
        Value::Null
    );

    // Exit a credited balance through the real verifier's native FT withdrawal.
    let exit = sdk_envelope(
        &world,
        "nep413",
        "alice.sandbox",
        json!([{"intent":"ft_withdraw","token":"usdc.sandbox","receiver_id":"alice.sandbox","amount":(100*USDC).to_string()}]),
    )?;
    world
        .ok(
            "alice.sandbox",
            "verifier.sandbox",
            "add_public_key",
            json!({"public_key":exit["publicKey"]}),
            1,
        )
        .await?;
    let alice_before_exit = world.balance("usdc.sandbox", "alice.sandbox").await?;
    world
        .ok(
            "carol.sandbox",
            "verifier.sandbox",
            "execute_intents",
            exit["executeArgs"].clone(),
            0,
        )
        .await?;
    assert_eq!(
        world.balance("usdc.sandbox", "alice.sandbox").await?,
        alice_before_exit + 100 * USDC
    );
    assert_eq!(
        number(
            &world
                .view(
                    "verifier.sandbox",
                    "mt_balance_of",
                    json!({"account_id":"alice.sandbox","token_id":tid})
                )
                .await?
        ),
        400 * USDC
    );
    checks.push(json!({"check":"deployed_intents_wasm_signed_native_ft_exit_after_credit_release","passed":true}));

    // Close bidding while the artwork window and financial refund window remain open.
    let close_target = number(&world.state("realmt.sandbox").await?["cutoff_ns"]) as u64;
    advance_to(&world, close_target).await?;
    let close_time: u64 = Chain::block()
        .fetch_from(&world.net)
        .await?
        .header
        .timestamp_nanosec
        .parse()?;
    assert!(close_time < number(&world.state("success.sandbox").await?["refund_end_ns"]) as u64);
    let token_id = "success.sandbox";
    let recipient = if current == "bob.sandbox" {
        "carol.sandbox"
    } else {
        "bob.sandbox"
    };
    let storage_budget = 100_000_000_000_000_000_000_000;
    let artwork_budget = 50_000_000_000_000_000_000_000;
    let artwork_one = json!({"token_id":token_id,"artifact_uri":"https://example.invalid/brand-a-fixture.png","artifact_sha256":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="});
    let artwork_two = json!({"token_id":token_id,"artifact_uri":"https://example.invalid/brand-b-fixture.png","artifact_sha256":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE="});
    world
        .ok(
            "carol.sandbox",
            "success.sandbox",
            "mint_final_placement",
            json!({}),
            storage_budget,
        )
        .await?;
    assert_eq!(
        world
            .view("success.sandbox", "nft_token", json!({"token_id":token_id}))
            .await?["owner_id"],
        current
    );
    assert_eq!(
        world
            .view("success.sandbox", "nft_total_supply", json!({}))
            .await?,
        "1"
    );
    assert!(
        world
            .call(
                "carol.sandbox",
                "success.sandbox",
                "mint_final_placement",
                json!({}),
                storage_budget
            )
            .await?
            .is_failure()
    );
    world
        .ok(
            &current,
            "success.sandbox",
            "submit_artwork",
            artwork_one.clone(),
            artwork_budget,
        )
        .await?;
    assert_eq!(
        world
            .view("success.sandbox", "get_placement_rights", json!({}))
            .await?["revision"],
        "1"
    );
    assert!(world.call(&current,"success.sandbox","nft_transfer_call",json!({"receiver_id":recipient,"token_id":token_id,"approval_id":null,"memo":null,"msg":""}),1).await?.is_failure());
    world
        .ok(
            &current,
            "success.sandbox",
            "nft_transfer",
            json!({"receiver_id":recipient,"token_id":token_id,"approval_id":null,"memo":null}),
            1,
        )
        .await?;
    assert!(
        world
            .call(
                &current,
                "success.sandbox",
                "submit_artwork",
                artwork_two.clone(),
                artwork_budget
            )
            .await?
            .is_failure()
    );
    world
        .ok(
            recipient,
            "success.sandbox",
            "submit_artwork",
            artwork_two,
            artwork_budget,
        )
        .await?;
    let rights = world
        .view("success.sandbox", "get_placement_rights", json!({}))
        .await?;
    assert_eq!(rights["current_owner_id"], recipient);
    assert_eq!(rights["original_payer_id"], current);
    assert_eq!(rights["revision"], "2");
    assert!(
        world
            .call(
                "seller.sandbox",
                "success.sandbox",
                "lock_artwork",
                json!({"expected_revision":"1"}),
                1
            )
            .await?
            .is_failure()
    );
    assert!(
        world
            .call(
                recipient,
                "success.sandbox",
                "lock_artwork",
                json!({"expected_revision":"2"}),
                1
            )
            .await?
            .is_failure()
    );
    world
        .ok(
            "seller.sandbox",
            "success.sandbox",
            "lock_artwork",
            json!({"expected_revision":"2"}),
            1,
        )
        .await?;
    assert!(
        world
            .call(
                recipient,
                "success.sandbox",
                "submit_artwork",
                artwork_one,
                artwork_budget
            )
            .await?
            .is_failure()
    );
    assert_eq!(
        world.state("success.sandbox").await?["holder"]["account_id"],
        current
    );
    assert_eq!(
        number(&world.credit("success.sandbox", "alice.sandbox").await?["conditional_bonus"]),
        10 * USDC
    );
    checks.push(json!({"check":"final_placement_mints_at_bidding_close_transfers_artwork_authority_revision_lock_preserves_money","passed":true}));

    // The final EVM holder appoints an actual NEAR NFT recipient through the
    // deployed verifier's authenticated callback, then that recipient consents.
    assert!(
        world
            .call(
                "carol.sandbox",
                "realmt.sandbox",
                "mint_final_placement",
                json!({}),
                storage_budget
            )
            .await?
            .is_failure()
    );
    assert!(world.call("carol.sandbox","realmt.sandbox","on_auth",json!({"signer_id":third_id,"msg":json!({"action":"nominate_nft_recipient","recipient_id":"alice.sandbox"}).to_string()}),0).await?.is_failure());
    world
        .ok(
            "carol.sandbox",
            "verifier.sandbox",
            "execute_intents",
            third["followupExecuteArgs"][1].clone(),
            0,
        )
        .await?;
    assert_eq!(
        world.state("realmt.sandbox").await?["nominated_recipient"],
        "alice.sandbox"
    );
    assert!(
        world
            .call(
                "bob.sandbox",
                "realmt.sandbox",
                "accept_nft_nomination",
                json!({}),
                0
            )
            .await?
            .is_failure()
    );
    assert!(
        world
            .call(
                "carol.sandbox",
                "realmt.sandbox",
                "mint_final_placement",
                json!({}),
                storage_budget
            )
            .await?
            .is_failure()
    );
    world
        .ok(
            "alice.sandbox",
            "realmt.sandbox",
            "accept_nft_nomination",
            json!({}),
            0,
        )
        .await?;
    world
        .ok(
            "carol.sandbox",
            "realmt.sandbox",
            "mint_final_placement",
            json!({}),
            storage_budget,
        )
        .await?;
    assert_eq!(
        world
            .view(
                "realmt.sandbox",
                "nft_token",
                json!({"token_id":"realmt.sandbox"})
            )
            .await?["owner_id"],
        "alice.sandbox"
    );
    let evm_artwork = json!({"token_id":"realmt.sandbox","artifact_uri":"https://example.invalid/evm-advertiser-artwork.png","artifact_sha256":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="});
    world
        .ok(
            "alice.sandbox",
            "realmt.sandbox",
            "submit_artwork",
            evm_artwork.clone(),
            artwork_budget,
        )
        .await?;
    let repeated_auth = world
        .call(
            "carol.sandbox",
            "verifier.sandbox",
            "execute_intents",
            third["followupExecuteArgs"][2].clone(),
            0,
        )
        .await?
        .into_full()
        .context("auth callback results")?;
    assert!(
        !repeated_auth.receipt_failures().is_empty(),
        "recipient cannot change after mint"
    );
    assert_eq!(
        world.state("realmt.sandbox").await?["holder"]["account_id"],
        third_id
    );
    checks.push(json!({"check":"deployed_intents_erc191_auth_call_nomination_native_acceptance_and_usable_final_nft","passed":true}));

    world
        .ok(
            "arbiter.sandbox",
            "realmt.sandbox",
            "finalize_failure",
            json!({}),
            0,
        )
        .await?;
    assert!(
        !world
            .view("realmt.sandbox", "get_placement_rights", json!({}))
            .await?["active"]
            .as_bool()
            .unwrap()
    );
    assert!(
        world
            .call(
                "alice.sandbox",
                "realmt.sandbox",
                "submit_artwork",
                evm_artwork,
                artwork_budget
            )
            .await?
            .is_failure()
    );
    assert_eq!(
        number(&world.credit("realmt.sandbox", third_id).await?["available"]),
        225 * USDC
    );
    assert_eq!(
        number(&world.credit("realmt.sandbox", "alice.sandbox").await?["available"]),
        0
    );
    world
        .ok(
            "carol.sandbox",
            "realmt.sandbox",
            "release_credit",
            json!({"account_id":third_id}),
            0,
        )
        .await?;
    assert_eq!(
        number(
            &world
                .view(
                    "verifier.sandbox",
                    "mt_balance_of",
                    json!({"account_id":third_id,"token_id":tid})
                )
                .await?
        ),
        225 * USDC
    );
    assert_eq!(
        world
            .view(
                "realmt.sandbox",
                "nft_token",
                json!({"token_id":"realmt.sandbox"})
            )
            .await?["owner_id"],
        "alice.sandbox"
    );
    checks.push(json!({"check":"cancelled_campaign_disables_nft_rights_refunds_original_evm_payer_not_nft_owner","passed":true}));

    // Financial success still waits for refund exposure to end, independently of NFT issuance.
    let target = number(&world.state("success.sandbox").await?["refund_end_ns"]) as u64;
    advance_to(&world, target).await?;
    let before = world.balance("usdc.sandbox", "carol.sandbox").await?;
    world
        .buy(
            "carol.sandbox",
            "success.sandbox",
            "usdc.sandbox",
            225 * USDC,
            "too-late",
            2,
        )
        .await?;
    assert_eq!(
        world.balance("usdc.sandbox", "carol.sandbox").await?,
        before
    );
    world
        .ok(
            "arbiter.sandbox",
            "success.sandbox",
            "finalize_success",
            json!({}),
            0,
        )
        .await?;
    assert_eq!(
        number(&world.credit("success.sandbox", "alice.sandbox").await?["available"]),
        10 * USDC
    );
    assert_eq!(
        number(&world.credit("success.sandbox", "seller.sandbox").await?["available"]),
        140 * USDC
    );
    world
        .ok("alice.sandbox", "success.sandbox", "withdraw", json!({}), 0)
        .await?;
    world.mint("usdc.sandbox", "seller.sandbox", 0).await?;
    world
        .ok(
            "seller.sandbox",
            "success.sandbox",
            "withdraw",
            json!({}),
            0,
        )
        .await?;
    assert_eq!(world.balance("usdc.sandbox", "success.sandbox").await?, 0);
    checks.push(
        json!({"check":"cutoff_refund_and_success_bonus_seller_reconciliation","passed":true}),
    );

    assert!(
        !world
            .view("success.sandbox", "get_placement_rights", json!({}))
            .await?["active"]
            .as_bool()
            .unwrap()
    );

    world
        .ok(
            "arbiter.sandbox",
            "failure.sandbox",
            "finalize_failure",
            json!({}),
            0,
        )
        .await?;
    assert_eq!(
        number(&world.credit("failure.sandbox", "alice.sandbox").await?["available"]),
        100 * USDC
    );
    assert_eq!(
        number(&world.credit("failure.sandbox", "alice.sandbox").await?["conditional_bonus"]),
        0
    );
    assert_eq!(
        number(&world.credit("failure.sandbox", "bob.sandbox").await?["available"]),
        150 * USDC
    );
    for owner in ["alice.sandbox", "bob.sandbox"] {
        world
            .ok(owner, "failure.sandbox", "withdraw", json!({}), 0)
            .await?;
    }
    assert_eq!(world.balance("usdc.sandbox", "failure.sandbox").await?, 0);
    assert_eq!(
        number(&world.credit("failure.sandbox", "seller.sandbox").await?["available"]),
        0
    );
    checks.push(json!({"check":"failed_fulfillment_full_principal_refunds_bonus_cancelled_solvent","passed":true}));

    let report = json!({"network":"local NEAR Sandbox","node_version":"2.14.0","funded_public_transactions":0,"checks":checks});
    std::fs::create_dir_all(root().join("docs/proofs/artifacts"))?;
    std::fs::write(
        root().join("docs/proofs/artifacts/sandbox-results.json"),
        serde_json::to_string_pretty(&report)?,
    )?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

/// Qualify cent-sized financial flows against the hash-verified deployed
/// Intents binary. Funding is a local test-token deposit, not a public bridge.
#[tokio::test]
async fn real_cent_principal_intents_proof() -> Result<()> {
    let mut world = World::start().await?;
    world.bounded_gas = true;
    for name in [
        "seller.sandbox",
        "arbiter.sandbox",
        "alice.sandbox",
        "bob.sandbox",
        "carol.sandbox",
    ] {
        world.account(name).await?;
    }
    world.ft("usdc.sandbox").await?;
    for owner in ["alice.sandbox", "bob.sandbox"] {
        world.mint("usdc.sandbox", owner, USDC).await?;
    }
    let actual =
        std::fs::read(root().join("proofs/intents-compatibility/artifacts/intents-mainnet.wasm"))?;
    let pinned: Value = serde_json::from_slice(&std::fs::read(
        root().join("proofs/intents-compatibility/pin.json"),
    )?)?;
    let code_hash = near_api::types::CryptoHash::hash(&actual).to_string();
    assert_eq!(
        code_hash,
        pinned["intents_account"]["response"]["result"]["code_hash"]
            .as_str()
            .unwrap()
    );
    world.deploy_bytes("verifier.sandbox", actual).await?;
    world
        .ok(
            "verifier.sandbox",
            "verifier.sandbox",
            "new",
            json!({"config":{
                "wnear_id":"usdc.sandbox", "fees":{"fee":1,"fee_collector":"seller.sandbox"},
                "roles":{"super_admins":["sandbox"],"admins":{},"grantees":{}}
            }}),
            0,
        )
        .await?;
    world.mint("usdc.sandbox", "verifier.sandbox", 0).await?;
    let mut checks = Vec::new();
    for (name, cents, first, second, success) in [
        ("tiny-failure.sandbox", 1u128, 10_000u128, 20_000u128, false),
        (
            "tiny-success.sandbox",
            10u128,
            100_000u128,
            150_000u128,
            true,
        ),
    ] {
        world.deploy(name, "marketplace.wasm").await?;
        let block = Chain::block().fetch_from(&world.net).await?;
        let now: u64 = block.header.timestamp_nanosec.parse()?;
        world.ok(name, name, "new", json!({
            "seller_id":"seller.sandbox", "arbiter_id":"arbiter.sandbox", "ft_contract_id":"usdc.sandbox",
            "intents_contract_id":"verifier.sandbox", "settlement":"intents", "initial_price_cents":cents.to_string(),
            "cutoff_ns":(now+600_000_000_000).to_string(), "refund_end_ns":(now+1_200_000_000_000).to_string()
        }), 0).await?;
        let intent = |amount: u128, label: &str, round: u64| {
            json!([{"intent":"transfer","receiver_id":name,
                "tokens":{"nep141:usdc.sandbox":amount.to_string()},
                "msg":invoice(label,round),"min_gas":"25000000000000"}])
        };
        let a = sdk_envelope(
            &world,
            "erc191",
            "unused.sandbox",
            intent(first, "tiny-first", 0),
        )?;
        let b = sdk_envelope(
            &world,
            "erc191",
            "unused.sandbox",
            intent(second, "tiny-takeover", 1),
        )?;
        let a_id = a["signerId"].as_str().unwrap();
        let b_id = b["signerId"].as_str().unwrap();
        assert_ne!(a_id, b_id);
        for (funder, buyer) in [("alice.sandbox", a_id), ("bob.sandbox", b_id)] {
            world.ok(funder, "usdc.sandbox", "ft_transfer_call", json!({
                "receiver_id":"verifier.sandbox", "amount":"250000", "msg":buyer, "memo":null
            }), 1).await?;
        }
        for signed in [&a, &b] {
            world
                .ok(
                    "carol.sandbox",
                    "verifier.sandbox",
                    "execute_intents",
                    signed["executeArgs"].clone(),
                    0,
                )
                .await?;
        }
        assert_eq!(world.state(name).await?["round"], "2");
        assert_eq!(world.state(name).await?["holder"]["account_id"], b_id);
        assert_eq!(number(&world.credit(name, a_id).await?["available"]), first);
        assert_eq!(
            number(&world.credit(name, a_id).await?["conditional_bonus"]),
            10_000
        );
        let balance =
            |account: &str| json!({"account_id":account,"token_id":"nep141:usdc.sandbox"});
        let before_claim = number(
            &world
                .view("verifier.sandbox", "mt_balance_of", balance(a_id))
                .await?,
        );
        world
            .ok(
                "carol.sandbox",
                name,
                "release_credit",
                json!({"account_id":a_id}),
                0,
            )
            .await?;
        assert_eq!(
            number(
                &world
                    .view("verifier.sandbox", "mt_balance_of", balance(a_id))
                    .await?
            ),
            before_claim + first
        );
        assert_eq!(world.state(name).await?["total_pending"], "0");
        let deadline = if success {
            "refund_end_ns"
        } else {
            "cutoff_ns"
        };
        advance_to(&world, number(&world.state(name).await?[deadline]) as u64).await?;
        world
            .ok(
                "arbiter.sandbox",
                name,
                if success {
                    "finalize_success"
                } else {
                    "finalize_failure"
                },
                json!({}),
                0,
            )
            .await?;
        if success {
            assert_eq!(
                number(&world.credit(name, a_id).await?["available"]),
                10_000
            );
            assert_eq!(
                number(&world.credit(name, "seller.sandbox").await?["available"]),
                140_000
            );
            world
                .ok(
                    "carol.sandbox",
                    name,
                    "release_credit",
                    json!({"account_id":a_id}),
                    0,
                )
                .await?;
            world
                .ok(
                    "carol.sandbox",
                    name,
                    "release_credit",
                    json!({"account_id":"seller.sandbox"}),
                    0,
                )
                .await?;
        } else {
            assert_eq!(number(&world.credit(name, a_id).await?["available"]), 0);
            assert_eq!(
                number(&world.credit(name, a_id).await?["conditional_bonus"]),
                0
            );
            assert_eq!(
                number(&world.credit(name, b_id).await?["available"]),
                second
            );
            assert_eq!(
                number(&world.credit(name, "seller.sandbox").await?["available"]),
                0
            );
            world
                .ok(
                    "carol.sandbox",
                    name,
                    "release_credit",
                    json!({"account_id":b_id}),
                    0,
                )
                .await?;
        }
        assert_eq!(
            number(
                &world
                    .view("verifier.sandbox", "mt_balance_of", balance(name))
                    .await?
            ),
            0
        );
        assert_eq!(world.state(name).await?["total_pending"], "0");
        assert_eq!(
            number(&world.state(name).await?["total_withdrawn"]),
            first + second
        );
        checks.push(json!({"market":name,"initial_micro_usdc":first.to_string(),"takeover_micro_usdc":second.to_string(),
            "outcome":if success {"success"} else {"failure"},"two_distinct_erc191_buyers":true,
            "released_principal":true,"bonus_resolved":true,"storefront_balance_zero":true}));
    }
    let exit = sdk_envelope(&world, "erc191", "unused.sandbox", json!([
        {"intent":"ft_withdraw","token":"usdc.sandbox","receiver_id":"alice.sandbox","amount":"10000","min_gas":"15000000000000"}
    ]))?;
    let exit_owner = exit["signerId"].as_str().unwrap();
    // The canonical fixture creates a fresh ephemeral key per invocation.
    // Fund that exact public identity before asking it to withdraw.
    world.ok("alice.sandbox", "usdc.sandbox", "ft_transfer_call", json!({"receiver_id":"verifier.sandbox","amount":"10000","msg":exit_owner,"memo":null}), 1).await?;
    let native_before = world.balance("usdc.sandbox", "alice.sandbox").await?;
    let credit_before = number(&world.view("verifier.sandbox", "mt_balance_of", json!({"account_id":exit_owner,"token_id":"nep141:usdc.sandbox"})).await?);
    world.ok("carol.sandbox", "verifier.sandbox", "execute_intents", exit["executeArgs"].clone(), 0).await?;
    assert_eq!(world.balance("usdc.sandbox", "alice.sandbox").await?, native_before + 10_000);
    world.ok("alice.sandbox", "usdc.sandbox", "ft_transfer_call", json!({"receiver_id":"verifier.sandbox","amount":"10000","msg":exit_owner,"memo":null}), 1).await?;
    assert_eq!(world.balance("usdc.sandbox", "alice.sandbox").await?, native_before);
    assert_eq!(number(&world.view("verifier.sandbox", "mt_balance_of", json!({"account_id":exit_owner,"token_id":"nep141:usdc.sandbox"})).await?), credit_before);
    checks.push(json!({"native_ft_withdrawal_and_return_deposit":true,"principal_micro_usdc":"10000","execute_intents_gas_tgas":60,"withdraw_min_gas_tgas":15}));
    let report = json!({"network":"local NEAR Sandbox","node_version":"2.14.0","funded_public_transactions":0,
        "intents_code_hash":code_hash,"intents_fee":1,"funding":"synthetic local test token; no public bridge", "checks":checks});
    std::fs::create_dir_all(root().join(".local/low-cost-review"))?;
    std::fs::write(
        root().join(".local/low-cost-review/sandbox-cent-results.json"),
        serde_json::to_string_pretty(&report)?,
    )?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

#[tokio::test]
async fn dated_campaign_terms_and_fulfillment_proof() -> Result<()> {
    let mut world = World::start().await?;
    world.bounded_gas = true;
    for name in [
        "seller.sandbox",
        "arbiter.sandbox",
        "alice.sandbox",
        "bob.sandbox",
        "carol.sandbox",
    ] {
        world.account(name).await?;
    }
    world.ft("usdc.sandbox").await?;
    for owner in ["alice.sandbox", "bob.sandbox"] {
        world.mint("usdc.sandbox", owner, USDC).await?;
    }
    let terms_hash = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
    let terms = |now: u64, takeovers: bool| {
        json!({
            "sale_id":"sale-1","asset_id":"vehicle-1","spot_id":"door-left","published_terms_sha256":terms_hash,
            "takeover_enabled":takeovers,"bidding_close_ns":(now+600_000_000_000).to_string(),
            "artwork_due_ns":(now+900_000_000_000).to_string(),"installation_due_ns":(now+1_200_000_000_000).to_string(),
            "service_start_ns":(now+1_300_000_000_000).to_string(),"service_end_ns":(now+1_500_000_000_000).to_string(),
            "review_end_ns":(now+1_700_000_000_000).to_string()
        })
    };
    let message = |invoice: &str, round: u64| {
        json!({"invoice_id":invoice,"expected_round":round.to_string(),"published_terms_sha256":terms_hash}).to_string()
    };
    let initialize = |terms: Value, settlement: &str| {
        json!({"seller_id":"seller.sandbox","arbiter_id":"arbiter.sandbox",
        "ft_contract_id":"usdc.sandbox","intents_contract_id":"verifier.sandbox","settlement":settlement,"initial_price_cents":"10","terms":terms})
    };

    world
        .deploy("fixed-campaign.sandbox", "campaign-marketplace.wasm")
        .await?;
    let now: u64 = Chain::block()
        .fetch_from(&world.net)
        .await?
        .header
        .timestamp_nanosec
        .parse()?;
    world
        .ok(
            "fixed-campaign.sandbox",
            "fixed-campaign.sandbox",
            "new_campaign",
            initialize(terms(now, false), "native"),
            0,
        )
        .await?;
    world
        .mint("usdc.sandbox", "fixed-campaign.sandbox", 0)
        .await?;
    let before = world.balance("usdc.sandbox", "alice.sandbox").await?;
    world.ok("alice.sandbox","usdc.sandbox","ft_transfer_call",json!({"receiver_id":"fixed-campaign.sandbox","amount":"100000","msg":invoice("unbound",0),"memo":null}),1).await?;
    assert_eq!(
        world.balance("usdc.sandbox", "alice.sandbox").await?,
        before
    );
    world.ok("alice.sandbox","usdc.sandbox","ft_transfer_call",json!({"receiver_id":"fixed-campaign.sandbox","amount":"100000","msg":message("fixed-first",0),"memo":null}),1).await?;
    let bob_before = world.balance("usdc.sandbox", "bob.sandbox").await?;
    world.ok("bob.sandbox","usdc.sandbox","ft_transfer_call",json!({"receiver_id":"fixed-campaign.sandbox","amount":"150000","msg":message("fixed-second",1),"memo":null}),1).await?;
    assert_eq!(
        world.balance("usdc.sandbox", "bob.sandbox").await?,
        bob_before
    );
    assert_eq!(world.state("fixed-campaign.sandbox").await?["round"], "1");
    advance_to(&world, now + 600_000_000_000).await?;
    world
        .ok(
            "arbiter.sandbox",
            "fixed-campaign.sandbox",
            "finalize_failure",
            json!({}),
            0,
        )
        .await?;
    world
        .ok(
            "alice.sandbox",
            "fixed-campaign.sandbox",
            "withdraw",
            json!({}),
            0,
        )
        .await?;
    assert_eq!(
        world
            .balance("usdc.sandbox", "fixed-campaign.sandbox")
            .await?,
        0
    );

    let actual =
        std::fs::read(root().join("proofs/intents-compatibility/artifacts/intents-mainnet.wasm"))?;
    let pin: Value = serde_json::from_slice(&std::fs::read(
        root().join("proofs/intents-compatibility/pin.json"),
    )?)?;
    assert_eq!(
        near_api::types::CryptoHash::hash(&actual).to_string(),
        pin["intents_account"]["response"]["result"]["code_hash"]
            .as_str()
            .unwrap()
    );
    world.deploy_bytes("verifier.sandbox", actual).await?;
    world.ok("verifier.sandbox","verifier.sandbox","new",json!({"config":{"wnear_id":"usdc.sandbox","fees":{"fee":1,"fee_collector":"seller.sandbox"},"roles":{"super_admins":["sandbox"],"admins":{},"grantees":{}}}}),0).await?;
    world.mint("usdc.sandbox", "verifier.sandbox", 0).await?;
    let campaign = "dated-campaign.sandbox";
    world.deploy(campaign, "campaign-marketplace.wasm").await?;
    let now: u64 = Chain::block()
        .fetch_from(&world.net)
        .await?
        .header
        .timestamp_nanosec
        .parse()?;
    world
        .ok(
            campaign,
            campaign,
            "new_campaign",
            initialize(terms(now, true), "intents"),
            0,
        )
        .await?;
    let transfer = |amount: &str, label: &str, round: u64| {
        json!([{"intent":"transfer","receiver_id":campaign,
        "tokens":{"nep141:usdc.sandbox":amount},"msg":message(label,round),"min_gas":"25000000000000"}])
    };
    let a = sdk_envelope(
        &world,
        "erc191",
        "unused.sandbox",
        transfer("100000", "dated-first", 0),
    )?;
    let b = sdk_batches(
        &world,
        "erc191",
        "unused.sandbox",
        transfer("150000", "dated-second", 1),
        json!([
            [{"intent":"auth_call","contract_id":campaign,"msg":json!({"action":"nominate_nft_recipient","recipient_id":"bob.sandbox"}).to_string(),"min_gas":"25000000000000"}]
        ]),
    )?;
    let a_id = a["signerId"].as_str().unwrap();
    let b_id = b["signerId"].as_str().unwrap();
    assert_ne!(a_id, b_id);
    for (funder, buyer, signed) in [("alice.sandbox", a_id, &a), ("bob.sandbox", b_id, &b)] {
        world
            .ok(
                funder,
                "usdc.sandbox",
                "ft_transfer_call",
                json!({"receiver_id":"verifier.sandbox","amount":"250000","msg":buyer,"memo":null}),
                1,
            )
            .await?;
        world
            .ok(
                "carol.sandbox",
                "verifier.sandbox",
                "execute_intents",
                signed["executeArgs"].clone(),
                0,
            )
            .await?;
    }
    assert_eq!(world.state(campaign).await?["holder"]["account_id"], b_id);
    world
        .ok(
            "carol.sandbox",
            campaign,
            "release_credit",
            json!({"account_id":a_id}),
            0,
        )
        .await?;
    assert_eq!(
        number(&world.credit(campaign, a_id).await?["conditional_bonus"]),
        10_000
    );
    advance_to(&world, now + 600_000_000_000).await?;
    world
        .ok(
            "carol.sandbox",
            "verifier.sandbox",
            "execute_intents",
            b["followupExecuteArgs"][0].clone(),
            0,
        )
        .await?;
    world
        .ok(
            "bob.sandbox",
            campaign,
            "accept_nft_nomination",
            json!({}),
            0,
        )
        .await?;
    world
        .ok(
            "carol.sandbox",
            campaign,
            "mint_final_placement",
            json!({}),
            100_000_000_000_000_000_000_000,
        )
        .await?;
    world.ok("bob.sandbox",campaign,"nft_transfer",json!({"receiver_id":"carol.sandbox","token_id":campaign,"approval_id":null,"memo":null}),1).await?;
    for uri in ["ipfs://draft-one", "ipfs://draft-two"] {
        world
            .ok(
                "carol.sandbox",
                campaign,
                "submit_artwork",
                json!({"token_id":campaign,"artifact_uri":uri,"artifact_sha256":terms_hash}),
                100_000_000_000_000_000_000_000,
            )
            .await?;
    }
    assert!(
        world
            .call(
                "seller.sandbox",
                campaign,
                "lock_artwork",
                json!({"expected_revision":"1"}),
                1
            )
            .await?
            .is_failure()
    );
    world
        .ok(
            "seller.sandbox",
            campaign,
            "lock_artwork",
            json!({"expected_revision":"2"}),
            1,
        )
        .await?;
    world
        .ok(
            "seller.sandbox",
            campaign,
            "submit_delivery_proof",
            json!({"artifact_uri":"ipfs://installation-proof","artifact_sha256":terms_hash}),
            100_000_000_000_000_000_000_000,
        )
        .await?;
    assert!(
        world
            .call(
                "arbiter.sandbox",
                campaign,
                "finalize_success",
                json!({}),
                0
            )
            .await?
            .is_failure()
    );
    world
        .ok(
            "arbiter.sandbox",
            campaign,
            "record_issue_decision",
            json!({"case_id":"proof-review","open":true,"evidence_sha256":terms_hash}),
            100_000_000_000_000_000_000_000,
        )
        .await?;
    advance_to(&world, now + 1_700_000_000_000).await?;
    assert!(
        world
            .call(
                "arbiter.sandbox",
                campaign,
                "finalize_success",
                json!({}),
                0
            )
            .await?
            .is_failure()
    );
    assert!(
        world
            .call(
                "seller.sandbox",
                campaign,
                "record_issue_decision",
                json!({"case_id":"proof-review","open":false,"evidence_sha256":terms_hash}),
                100_000_000_000_000_000_000_000
            )
            .await?
            .is_failure()
    );
    world
        .ok(
            "arbiter.sandbox",
            campaign,
            "record_issue_decision",
            json!({"case_id":"proof-review","open":false,"evidence_sha256":terms_hash}),
            100_000_000_000_000_000_000_000,
        )
        .await?;
    world
        .ok(
            "arbiter.sandbox",
            campaign,
            "finalize_success",
            json!({}),
            0,
        )
        .await?;
    assert_eq!(
        number(&world.credit(campaign, a_id).await?["available"]),
        10_000
    );
    assert_eq!(
        number(&world.credit(campaign, "seller.sandbox").await?["available"]),
        140_000
    );
    for creditor in [a_id, "seller.sandbox"] {
        world
            .ok(
                "carol.sandbox",
                campaign,
                "release_credit",
                json!({"account_id":creditor}),
                0,
            )
            .await?;
    }
    let remaining = world
        .view(
            "verifier.sandbox",
            "mt_balance_of",
            json!({"account_id":campaign,"token_id":"nep141:usdc.sandbox"}),
        )
        .await?;
    assert_eq!(number(&remaining), 0);
    assert_eq!(world.state(campaign).await?["total_pending"], "0");
    let bytes = std::fs::read(root().join("target/proof-artifacts/campaign-marketplace.wasm"))?;
    let report = json!({"network":"local NEAR Sandbox","funded_public_transactions":0,"campaign_code_hash":near_api::types::CryptoHash::hash(&bytes).to_string(),
        "artifact_bytes":bytes.len(),"checks":["committed terms required","fixed spot rejects takeover and refunds","fixed cancellation and native refund",
        "two EVM wallets purchase and takeover through pinned Intents","original-payer principal release","final NFT nomination acceptance and mint",
        "NFT transfer grants artwork authority","stale artwork lock rejected","exact revision locked","delivery proof committed",
        "no payout before review end","open dispute blocks payout","seller cannot resolve own dispute","successful seller and reward release","zero remaining escrow"]});
    std::fs::create_dir_all(root().join(".local/campaign-proof"))?;
    std::fs::write(
        root().join(".local/campaign-proof/sandbox-results.json"),
        serde_json::to_string_pretty(&report)?,
    )?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
