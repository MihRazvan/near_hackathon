use anyhow::Result;
use base64::Engine;
use near_api::{Contract, NearGas, NearToken, NetworkConfig, Signer};
use near_api::types::{AccountId, CryptoHash};
use near_sandbox::{Sandbox, config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY};
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Arc, io::{self, BufRead}};
use std::os::unix::fs::PermissionsExt;

fn id(value: &str) -> AccountId { value.parse().unwrap() }
#[tokio::main]
async fn main() -> Result<()> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let output = std::env::args().nth(1).expect("private output path required");
    let sandbox = Sandbox::start_sandbox_with_version("2.14.0").await?;
    let net = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
    for name in ["seller.sandbox", "arbiter.sandbox", "recipient.sandbox", "transferee.sandbox", "treasury.sandbox", "publisher.sandbox", "usdc.sandbox", "verifier.sandbox", "factory.sandbox"] {
        sandbox.create_account(id(name)).initial_balance(NearToken::from_near(10_000)).send().await?;
    }
    async fn call(net: &NetworkConfig, signer: Arc<Signer>, sender: &str, receiver: &str, method: &str, args: Value) -> Result<()> {
        Contract(id(receiver)).call_function(method, args).transaction().gas(NearGas::from_tgas(30))
            .with_signer(id(sender), signer).send_to(net).await?.assert_success(); Ok(())
    }
    let artifacts = root.join("target/proof-artifacts");
    let token = std::fs::read(artifacts.join("test-token.wasm"))?;
    let intents = std::fs::read(root.join("proofs/intents-compatibility/artifacts/intents-mainnet.wasm"))?;
    let pin: Value = serde_json::from_slice(&std::fs::read(root.join("proofs/intents-compatibility/pin.json"))?)?;
    assert_eq!(CryptoHash::hash(&intents).to_string(), pin["intents_account"]["response"]["result"]["code_hash"].as_str().unwrap());
    let campaign = std::fs::read(artifacts.join("campaign-marketplace.wasm"))?;
    let campaign_hash = CryptoHash::hash(&campaign);
    let factory = std::fs::read(artifacts.join("campaign-factory.wasm"))?;
    for (name, code) in [("usdc.sandbox", token.clone()), ("verifier.sandbox", intents.clone()), ("factory.sandbox", factory.clone())] {
        Contract::deploy(id(name)).use_code(code).without_init_call().with_signer(signer.clone()).send_to(&net).await?.assert_success();
    }
    call(&net, signer.clone(), "usdc.sandbox", "usdc.sandbox", "new", json!({"owner_id":"usdc.sandbox"})).await?;
    call(&net, signer.clone(), "verifier.sandbox", "verifier.sandbox", "new", json!({"config":{
        "wnear_id":"usdc.sandbox", "fees":{"fee":1,"fee_collector":"seller.sandbox"},
        "roles":{"super_admins":["sandbox"],"admins":{},"grantees":{}}
    }})).await?;
    call(&net, signer.clone(), "usdc.sandbox", "usdc.sandbox", "mint", json!({"account_id":"verifier.sandbox","amount":"0"})).await?;
    Contract::deploy_global_contract_code(campaign).as_hash().with_signer(id("publisher.sandbox"), signer.clone()).send_to(&net).await?.assert_success();
    // Encode the immutable code hash using NEAR's Base64VecU8 JSON representation.
    let hash_bytes = base64::engine::general_purpose::STANDARD.encode(campaign_hash.0);
    call(&net, signer.clone(), "factory.sandbox", "factory.sandbox", "new", json!({
        "campaign_code_hash":hash_bytes,"ft_contract_id":"usdc.sandbox","intents_contract_id":"verifier.sandbox",
        "arbiter_id":"arbiter.sandbox","child_funding":"500000000000000000000000"
    })).await?;
    let data = json!({"network":"sandbox","rpc":sandbox.rpc_addr,"testSecretKey":DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY,
        "campaignCodeHash":campaign_hash.to_string(),"factoryCodeHash":CryptoHash::hash(&factory).to_string(),
        "intentsCodeHash":CryptoHash::hash(&intents).to_string(),"usdcCodeHash":CryptoHash::hash(&token).to_string()});
    std::fs::write(&output, serde_json::to_vec_pretty(&data)?)?;
    std::fs::set_permissions(&output, std::fs::Permissions::from_mode(0o600))?;
    println!("Sandbox ready; private fixture metadata saved");
    // The parent keeps stdin open. Dropping Sandbox stops the node, including on parent exit.
    for line in io::stdin().lock().lines() { if line? == "stop" { break; } }
    Ok(())
}
