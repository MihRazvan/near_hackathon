//! Private browser-regression fixture. Starts a fresh valueless local chain and
//! uses the pinned production Intents verifier, never a public RPC or wallet.
use anyhow::Result;
use near_api::types::{AccountId, CryptoHash};
use near_api::{Contract, NearGas, NearToken, NetworkConfig, Signer};
use near_sandbox::{Sandbox, config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY};
use serde_json::{Value, json};
use std::os::unix::fs::PermissionsExt;
use std::{
    io::{self, BufRead},
    path::PathBuf,
    sync::Arc,
};
fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}
async fn call(
    net: &NetworkConfig,
    signer: Arc<Signer>,
    sender: &str,
    receiver: &str,
    method: &str,
    args: Value,
    deposit: u128,
) -> Result<()> {
    Contract(id(receiver))
        .call_function(method, args)
        .transaction()
        .gas(NearGas::from_tgas(100))
        .deposit(NearToken::from_yoctonear(deposit))
        .with_signer(id(sender), signer)
        .send_to(net)
        .await?
        .assert_success();
    Ok(())
}
#[tokio::main]
async fn main() -> Result<()> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let output = std::env::args()
        .nth(1)
        .expect("private fixture output required");
    let sandbox = Sandbox::start_sandbox_with_version("2.14.0").await?;
    let net = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
    for name in [
        "treasury.sandbox",
        "arbiter.sandbox",
        "recipient.sandbox",
        "usdc.sandbox",
        "verifier.sandbox",
        "hub.sandbox",
    ] {
        sandbox
            .create_account(id(name))
            .initial_balance(NearToken::from_near(10_000))
            .send()
            .await?;
    }
    let artifacts = root.join("target/proof-artifacts");
    let token = std::fs::read(artifacts.join("test-token.wasm"))?;
    let intents =
        std::fs::read(root.join("proofs/intents-compatibility/artifacts/intents-mainnet.wasm"))?;
    let pin: Value = serde_json::from_slice(&std::fs::read(
        root.join("proofs/intents-compatibility/pin.json"),
    )?)?;
    assert_eq!(
        CryptoHash::hash(&intents).to_string(),
        pin["intents_account"]["response"]["result"]["code_hash"]
            .as_str()
            .unwrap()
    );
    let hub = std::fs::read(artifacts.join("marketplace-hub.wasm"))?;
    for (name, code) in [
        ("usdc.sandbox", token.clone()),
        ("verifier.sandbox", intents.clone()),
        ("hub.sandbox", hub.clone()),
    ] {
        Contract::deploy(id(name))
            .use_code(code)
            .without_init_call()
            .with_signer(signer.clone())
            .send_to(&net)
            .await?
            .assert_success();
    }
    call(
        &net,
        signer.clone(),
        "usdc.sandbox",
        "usdc.sandbox",
        "new",
        json!({"owner_id":"usdc.sandbox"}),
        0,
    )
    .await?;
    call(&net,signer.clone(),"verifier.sandbox","verifier.sandbox","new",json!({"config":{"wnear_id":"usdc.sandbox","fees":{"fee":1,"fee_collector":"treasury.sandbox"},"roles":{"super_admins":["sandbox"],"admins":{},"grantees":{}}}}),0).await?;
    call(
        &net,
        signer.clone(),
        "usdc.sandbox",
        "usdc.sandbox",
        "mint",
        json!({"account_id":"verifier.sandbox","amount":"0"}),
        0,
    )
    .await?;
    call(&net,signer.clone(),"hub.sandbox","hub.sandbox","new",json!({"owner_id":"treasury.sandbox","arbiter_id":"arbiter.sandbox","ft_contract_id":"usdc.sandbox","intents_contract_id":"verifier.sandbox"}),0).await?;
    call(
        &net,
        signer.clone(),
        "treasury.sandbox",
        "hub.sandbox",
        "fund_sponsor_pool",
        json!({"sponsored_offer_limit":"16","per_owner_limit":"8"}),
        9_600_000_000_000_000_000_000_000,
    )
    .await?;
    std::fs::write(
        &output,
        serde_json::to_vec_pretty(
            &json!({"network":"sandbox","rpc":sandbox.rpc_addr,"testSecretKey":DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY,
        "hubId":"hub.sandbox","hubCodeHash":CryptoHash::hash(&hub).to_string(),"intentsCodeHash":CryptoHash::hash(&intents).to_string(),"usdcCodeHash":CryptoHash::hash(&token).to_string()}),
        )?,
    )?;
    std::fs::set_permissions(&output, std::fs::Permissions::from_mode(0o600))?;
    println!("Isolated shared-hub browser fixture ready");
    for line in io::stdin().lock().lines() {
        if line? == "stop" {
            break;
        }
    }
    Ok(())
}
