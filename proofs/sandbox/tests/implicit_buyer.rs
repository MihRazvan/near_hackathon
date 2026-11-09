//! Local-only proof: a 64-hex Ed25519 Intents buyer needs neither native account
//! creation nor add_public_key. A separate native relayer submits NEP-413.
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

const UNIT: u128 = 1_000_000;
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn id(name: &str) -> AccountId {
    name.parse().unwrap()
}
fn amount(value: &Value) -> u128 {
    value.as_str().unwrap().parse().unwrap()
}

struct Local {
    sandbox: Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
}
impl Local {
    async fn account(&self, name: &str) -> Result<()> {
        self.sandbox
            .create_account(id(name))
            .initial_balance(NearToken::from_near(100))
            .send()
            .await?;
        Ok(())
    }
    async fn call(
        &self,
        sender: &str,
        contract: &str,
        method: &str,
        args: Value,
        deposit: u128,
    ) -> Result<TransactionResult> {
        Ok(Contract(id(contract))
            .call_function(method, args)
            .transaction()
            .gas(NearGas::from_tgas(280))
            .deposit(NearToken::from_yoctonear(deposit))
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
        deposit: u128,
    ) -> Result<()> {
        self.call(sender, contract, method, args, deposit)
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
    async fn deploy(&self, name: &str, bytes: Vec<u8>) -> Result<()> {
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
    async fn balance(&self, owner: &str) -> Result<u128> {
        Ok(amount(
            &self
                .view(
                    "implicit-verifier.sandbox",
                    "mt_balance_of",
                    json!({"account_id":owner,"token_id":"nep141:implicit-usdc.sandbox"}),
                )
                .await?,
        ))
    }
    async fn fund(&self, owner: &str, value: u128) -> Result<()> {
        self.ok("funder.sandbox","implicit-usdc.sandbox","ft_transfer_call",json!({"receiver_id":"implicit-verifier.sandbox","amount":value.to_string(),"msg":owner,"memo":null}),1).await
    }
}
fn sign(local: &Local, script: &str, extra: Value) -> Result<Value> {
    let mut config =
        json!({"rpcUrl":local.sandbox.rpc_addr,"verifyingContract":"implicit-verifier.sandbox"});
    for (key, value) in extra.as_object().unwrap() {
        config[key] = value.clone();
    }
    let mut child = Command::new("node")
        .arg(root().join(script))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    child
        .stdin
        .take()
        .unwrap()
        .write_all(config.to_string().as_bytes())?;
    let output = child.wait_with_output()?;
    anyhow::ensure!(
        output.status.success(),
        "Local signer failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(serde_json::from_slice(&output.stdout)?)
}
fn transfer(invoice: &str, round: u64, value: u128) -> Value {
    json!([{ "intent":"transfer","receiver_id":"implicit-market.sandbox",
        "tokens":{"nep141:implicit-usdc.sandbox":value.to_string()},
        "msg":json!({"invoice_id":invoice,"expected_round":round.to_string()}).to_string(),"min_gas":"65000000000000" }])
}

#[tokio::test]
async fn implicit_ed25519_buyer_takes_over_and_recovers_credit_without_native_account() -> Result<()>
{
    let sandbox = Sandbox::start_sandbox_with_version("2.14.0").await?;
    let local = Local {
        net: NetworkConfig::from_rpc_url("implicit-local-proof", sandbox.rpc_addr.parse()?),
        sandbox,
        signer: Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?,
    };
    for account in [
        "seller.sandbox",
        "arbiter.sandbox",
        "relayer.sandbox",
        "funder.sandbox",
    ] {
        local.account(account).await?;
    }
    local
        .deploy(
            "implicit-usdc.sandbox",
            std::fs::read(root().join("target/proof-artifacts/test-token.wasm"))?,
        )
        .await?;
    local
        .ok(
            "implicit-usdc.sandbox",
            "implicit-usdc.sandbox",
            "new",
            json!({"owner_id":"implicit-usdc.sandbox"}),
            0,
        )
        .await?;
    local
        .ok(
            "implicit-usdc.sandbox",
            "implicit-usdc.sandbox",
            "mint",
            json!({"account_id":"funder.sandbox","amount":(475*UNIT).to_string()}),
            0,
        )
        .await?;

    let actual =
        std::fs::read(root().join("proofs/intents-compatibility/artifacts/intents-mainnet.wasm"))?;
    let pinned: Value = serde_json::from_slice(&std::fs::read(
        root().join("proofs/intents-compatibility/pin.json"),
    )?)?;
    let hash = near_api::types::CryptoHash::hash(&actual).to_string();
    assert_eq!(
        hash,
        pinned["intents_account"]["response"]["result"]["code_hash"]
            .as_str()
            .context("Pinned WASM hash")?
    );
    local.deploy("implicit-verifier.sandbox", actual).await?;
    local.ok("implicit-verifier.sandbox","implicit-verifier.sandbox","new",json!({"config":{
        "wnear_id":"implicit-usdc.sandbox","fees":{"fee":1,"fee_collector":"seller.sandbox"},
        "roles":{"super_admins":["sandbox"],"admins":{},"grantees":{}}
    }}),0).await?;
    let marketplace_wasm = std::fs::read(root().join("target/proof-artifacts/marketplace.wasm"))?;
    let marketplace_hash = near_api::types::CryptoHash::hash(&marketplace_wasm);
    let marketplace_sha256: String = marketplace_hash
        .0
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    local
        .ok(
            "implicit-usdc.sandbox",
            "implicit-usdc.sandbox",
            "mint",
            json!({"account_id":"implicit-verifier.sandbox","amount":"0"}),
            0,
        )
        .await?;
    local
        .deploy("implicit-market.sandbox", marketplace_wasm)
        .await?;
    let now: u64 = Chain::block()
        .fetch_from(&local.net)
        .await?
        .header
        .timestamp_nanosec
        .parse()?;
    local.ok("implicit-market.sandbox","implicit-market.sandbox","new",json!({
        "seller_id":"seller.sandbox","arbiter_id":"arbiter.sandbox","ft_contract_id":"implicit-usdc.sandbox",
        "intents_contract_id":"implicit-verifier.sandbox","settlement":"intents","initial_price_cents":"10000",
        "cutoff_ns":(now+600_000_000_000).to_string(),"refund_end_ns":(now+1_200_000_000_000).to_string()
    }),0).await?;

    let buyer_a = sign(
        &local,
        "proofs/intents-compatibility/sign-local-intent.mjs",
        json!({
            "standard":"erc191","intents":transfer("evm-a-first",0,100*UNIT),
            "followupIntents":[transfer("evm-a-third",2,225*UNIT)]
        }),
    )?;
    let buyer_b = sign(
        &local,
        "proofs/mainnet/local-wallet-proof.mjs",
        json!({
            "intents":transfer("implicit-b-takeover",1,150*UNIT),
            "followupIntents":[transfer("implicit-b-stale",0,150*UNIT)]
        }),
    )?;
    let a = buyer_a["signerId"].as_str().unwrap();
    let b = buyer_b["signerId"].as_str().unwrap();
    assert_eq!(b.len(), 64);
    assert_eq!(buyer_b["identityDerivation"], "hex(raw_ed25519_public_key)");
    // No native account is created for either external/implicit buyer; no
    // add_public_key call occurs anywhere in this integration test.
    assert!(
        near_api::Account(id(b))
            .view()
            .fetch_from(&local.net)
            .await
            .is_err()
    );
    local.fund(a, 325 * UNIT).await?;
    local.fund(b, 150 * UNIT).await?;
    local
        .ok(
            "relayer.sandbox",
            "implicit-verifier.sandbox",
            "execute_intents",
            buyer_a["executeArgs"].clone(),
            0,
        )
        .await?;
    local
        .ok(
            "relayer.sandbox",
            "implicit-verifier.sandbox",
            "execute_intents",
            buyer_b["executeArgs"].clone(),
            0,
        )
        .await?;
    let state = local
        .view("implicit-market.sandbox", "get_state", json!({}))
        .await?;
    assert_eq!(state["holder"]["account_id"], b);
    assert_eq!(state["round"], "2");
    assert_eq!(local.balance(b).await?, 0);
    local
        .call(
            "relayer.sandbox",
            "implicit-verifier.sandbox",
            "execute_intents",
            buyer_b["executeArgs"].clone(),
            0,
        )
        .await?
        .assert_failure();
    local
        .ok(
            "relayer.sandbox",
            "implicit-verifier.sandbox",
            "execute_intents",
            buyer_a["followupExecuteArgs"][0].clone(),
            0,
        )
        .await?;
    let credit = local
        .view(
            "implicit-market.sandbox",
            "get_credit",
            json!({"account_id":b}),
        )
        .await?;
    assert_eq!(credit["available"], (150 * UNIT).to_string());
    assert_eq!(credit["conditional_bonus"], (15 * UNIT).to_string());
    local
        .ok(
            "relayer.sandbox",
            "implicit-market.sandbox",
            "release_credit",
            json!({"account_id":b}),
            0,
        )
        .await?;
    assert_eq!(local.balance(b).await?, 150 * UNIT);
    let credit = local
        .view(
            "implicit-market.sandbox",
            "get_credit",
            json!({"account_id":b}),
        )
        .await?;
    assert_eq!(credit["available"], "0");
    assert_eq!(credit["conditional_bonus"], (15 * UNIT).to_string());
    // Fresh signed nonce with a stale business round: receiver refunds the full
    // 150 principal to the same implicit identity without changing holder/round.
    local
        .ok(
            "relayer.sandbox",
            "implicit-verifier.sandbox",
            "execute_intents",
            buyer_b["followupExecuteArgs"][0].clone(),
            0,
        )
        .await?;
    assert_eq!(local.balance(b).await?, 150 * UNIT);
    assert_eq!(
        local
            .view("implicit-market.sandbox", "get_state", json!({}))
            .await?["round"],
        "3"
    );
    assert!(
        near_api::Account(id(b))
            .view()
            .fetch_from(&local.net)
            .await
            .is_err()
    );
    let report = json!({"network":"local NEAR Sandbox","node_version":"2.14.0","intents_wasm_code_hash":hash,
        "artifactSha256":marketplace_sha256,"intents_fee_pips":1,
        "signing_standard":"nep413","buyer_b":b,"public_key":buyer_b["publicKey"],
        "identity_derivation":"hex(raw_ed25519_public_key)","buyer_native_account_created":false,
        "public_key_registration_called":false,"takeover_principal":"150000000","released_principal":"150000000",
        "conditional_bonus":"15000000","checks":{"implicit_key_authentication":true,"1_5x_takeover":true,
        "permissionless_original_beneficiary_credit_release":true,"replay_rejected":true,"stale_round_refund":true},
        "funded_public_transactions":0,"private_keys_persisted":false});
    std::fs::create_dir_all(root().join("docs/proofs/artifacts"))?;
    std::fs::write(
        root().join("docs/proofs/artifacts/implicit-buyer-results.json"),
        serde_json::to_vec_pretty(&report)?,
    )?;
    Ok(())
}
