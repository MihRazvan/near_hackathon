use anyhow::{Context, Result};
use near_api::types::{AccountId, CryptoHash, Data, transaction::result::TransactionResult};
use near_api::{Account, Chain, Contract, NearGas, NearToken, NetworkConfig, Signer};
use near_sandbox::{Sandbox, config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY};
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Arc};

const CHILD_FUNDS: u128 = 1_000_000_000_000_000_000_000_000;
const FT_STORAGE: u128 = 1_250_000_000_000_000_000_000;
const RECORD_RESERVE: u128 = 10_000_000_000_000_000_000_000;
const USDC: u128 = 1_000_000;
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let n = ((chunk[0] as u32) << 16)
            | ((chunk.get(1).copied().unwrap_or(0) as u32) << 8)
            | (chunk.get(2).copied().unwrap_or(0) as u32);
        out.push(ALPHABET[((n >> 18) & 63) as usize] as char);
        out.push(ALPHABET[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}
struct World {
    sandbox: Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
}
impl World {
    async fn start() -> Result<Self> {
        let sandbox = Sandbox::start_sandbox_with_version("2.14.0").await?;
        let net = NetworkConfig::from_rpc_url("factory-proof", sandbox.rpc_addr.parse()?);
        let signer = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
        Ok(Self {
            sandbox,
            net,
            signer,
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
        self.account(name).await?;
        let bytes = std::fs::read(root().join("target/proof-artifacts").join(artifact))
            .with_context(|| format!("Run scripts/build-proof.sh first: {artifact}"))?;
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
        target: &str,
        method: &str,
        args: Value,
        deposit: u128,
    ) -> Result<TransactionResult> {
        Ok(Contract(id(target))
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
        target: &str,
        method: &str,
        args: Value,
        deposit: u128,
    ) -> Result<()> {
        self.call(sender, target, method, args, deposit)
            .await?
            .assert_success();
        Ok(())
    }
    async fn view(&self, target: &str, method: &str, args: Value) -> Result<Value> {
        let value: Data<Value> = Contract(id(target))
            .call_function(method, args)
            .read_only()
            .fetch_from(&self.net)
            .await?;
        Ok(value.data)
    }
    async fn init_factory(&self, name: &str, hash: &[u8], storage: u128) -> Result<()> {
        self.deploy(name, "storefront-factory.wasm").await?;
        self.ok(name,name,"new",json!({"marketplace_code_hash":base64(hash),"ft_contract_id":"usdc.sandbox",
            "intents_contract_id":"intents.sandbox","arbiter_id":"arbiter.sandbox","child_funding":CHILD_FUNDS.to_string(),"ft_storage_deposit":storage.to_string()}),0).await
    }
}

#[tokio::test]
async fn immutable_global_factory_creates_keyless_registered_isolated_storefronts() -> Result<()> {
    let w = World::start().await?;
    for name in [
        "publisher.sandbox",
        "sellerone.sandbox",
        "sellertwo.sandbox",
        "buyer.sandbox",
        "arbiter.sandbox",
        "intruder.sandbox",
    ] {
        w.account(name).await?;
    }
    w.deploy("usdc.sandbox", "test-token.wasm").await?;
    w.ok(
        "usdc.sandbox",
        "usdc.sandbox",
        "new",
        json!({"owner_id":"usdc.sandbox"}),
        0,
    )
    .await?;
    let wasm = std::fs::read(root().join("target/proof-artifacts/marketplace.wasm"))?;
    let hash = CryptoHash::hash(&wasm);
    Contract::deploy_global_contract_code(wasm)
        .as_hash()
        .with_signer(id("publisher.sandbox"), w.signer.clone())
        .send_to(&w.net)
        .await?
        .assert_success();
    w.init_factory("factory.sandbox", &hash.0, FT_STORAGE)
        .await?;
    let now: u64 = Chain::block()
        .fetch_from(&w.net)
        .await?
        .header
        .timestamp_nanosec
        .parse()?;
    let params = |name: &str| json!({"name":name,"initial_price_cents":"10000","cutoff_ns":(now+600_000_000_000).to_string(),"refund_end_ns":(now+1_200_000_000_000).to_string()});
    let deposit = CHILD_FUNDS + FT_STORAGE + RECORD_RESERVE;
    for (seller, name) in [
        ("sellerone.sandbox", "car1"),
        ("sellertwo.sandbox", "bike2"),
    ] {
        w.ok(
            seller,
            "factory.sandbox",
            "create_storefront",
            params(name),
            deposit,
        )
        .await?;
        let row = w
            .view("factory.sandbox", "get_storefront", json!({"name":name}))
            .await?;
        assert_eq!(
            row["status"], "ready",
            "creation chain must reach verified registration: {row}"
        );
        assert_eq!(row["seller_id"], seller);
        let child = format!("{name}.factory.sandbox");
        let state = w.view(&child, "get_state", json!({})).await?;
        assert_eq!(state["seller_id"], seller);
        assert_eq!(state["arbiter_id"], "arbiter.sandbox");
        assert_eq!(state["ft_contract_id"], "usdc.sandbox");
        assert_eq!(state["settlement"], "native");
        let account = Account(id(&child)).view().fetch_from(&w.net).await?;
        let account_json = serde_json::to_value(account.data)?;
        assert_eq!(account_json["global_contract_hash"], hash.to_string());
        assert!(account_json["global_contract_account_id"].is_null());
        assert!(
            Account(id(&child))
                .list_keys()
                .fetch_from(&w.net)
                .await?
                .data
                .is_empty()
        );
        assert!(
            !w.view(
                "usdc.sandbox",
                "storage_balance_of",
                json!({"account_id":child})
            )
            .await?
            .is_null()
        );
    }
    // The authenticated caller cannot nominate another seller or override fixed roles.
    assert!(
        w.call(
            "intruder.sandbox",
            "factory.sandbox",
            "create_storefront",
            params("car1"),
            deposit
        )
        .await?
        .is_failure()
    );
    assert!(
        w.call(
            "intruder.sandbox",
            "factory.sandbox",
            "create_storefront",
            params("bad.name"),
            deposit
        )
        .await?
        .is_failure()
    );
    assert!(
        w.call(
            "intruder.sandbox",
            "factory.sandbox",
            "on_created",
            json!({"name":"car1"}),
            0
        )
        .await?
        .is_failure()
    );
    assert!(w.call("intruder.sandbox","car1.factory.sandbox","new",json!({"seller_id":"intruder.sandbox","arbiter_id":"intruder.sandbox","ft_contract_id":"usdc.sandbox","intents_contract_id":"intents.sandbox","settlement":"native","initial_price_cents":"1","cutoff_ns":(now+600_000_000_000).to_string(),"refund_end_ns":(now+1_200_000_000_000).to_string()}),0).await?.is_failure());
    assert!(
        w.call(
            "sellerone.sandbox",
            "car1.factory.sandbox",
            "finalize_success",
            json!({}),
            0
        )
        .await?
        .is_failure()
    );
    w.ok(
        "usdc.sandbox",
        "usdc.sandbox",
        "mint",
        json!({"account_id":"buyer.sandbox","amount":(1_000*USDC).to_string()}),
        0,
    )
    .await?;
    w.ok("buyer.sandbox","usdc.sandbox","ft_transfer_call",json!({"receiver_id":"car1.factory.sandbox","amount":(100*USDC).to_string(),"msg":json!({"invoice_id":"car","expected_round":"0"}).to_string(),"memo":null}),1).await?;
    assert_eq!(
        w.view("car1.factory.sandbox", "get_state", json!({}))
            .await?["round"],
        "1"
    );
    assert_eq!(
        w.view("bike2.factory.sandbox", "get_state", json!({}))
            .await?["round"],
        "0"
    );
    assert_eq!(
        w.view(
            "usdc.sandbox",
            "ft_balance_of",
            json!({"account_id":"car1.factory.sandbox"})
        )
        .await?,
        (100 * USDC).to_string()
    );
    assert_eq!(
        w.view(
            "usdc.sandbox",
            "ft_balance_of",
            json!({"account_id":"bike2.factory.sandbox"})
        )
        .await?,
        "0"
    );

    // An initialized child with failed FT registration is never published ready.
    w.init_factory("underfunded.sandbox", &hash.0, 1).await?;
    w.ok(
        "sellerone.sandbox",
        "underfunded.sandbox",
        "create_storefront",
        params("car3"),
        CHILD_FUNDS + 1 + RECORD_RESERVE,
    )
    .await?;
    let failed = w
        .view(
            "underfunded.sandbox",
            "get_storefront",
            json!({"name":"car3"}),
        )
        .await?;
    assert_eq!(failed["status"], "registration_failed");
    assert!(
        w.view(
            "usdc.sandbox",
            "storage_balance_of",
            json!({"account_id":"car3.underfunded.sandbox"})
        )
        .await?
        .is_null()
    );
    assert!(w.call("buyer.sandbox","usdc.sandbox","ft_transfer_call",json!({"receiver_id":"car3.underfunded.sandbox","amount":(100*USDC).to_string(),"msg":json!({"invoice_id":"blocked","expected_round":"0"}).to_string(),"memo":null}),1).await?.is_failure());
    assert_eq!(
        w.view("car3.underfunded.sandbox", "get_state", json!({}))
            .await?["round"],
        "0"
    );
    assert!(
        w.call(
            "intruder.sandbox",
            "underfunded.sandbox",
            "retry_registration",
            json!({"name":"car3"}),
            1
        )
        .await?
        .is_failure()
    );
    // The seller can fund the exact token's registration externally, then retry
    // the known-failed stage; the factory independently verifies the balance.
    w.ok(
        "sellerone.sandbox",
        "usdc.sandbox",
        "storage_deposit",
        json!({"account_id":"car3.underfunded.sandbox","registration_only":true}),
        FT_STORAGE,
    )
    .await?;
    w.ok(
        "sellerone.sandbox",
        "underfunded.sandbox",
        "retry_registration",
        json!({"name":"car3"}),
        1,
    )
    .await?;
    assert_eq!(
        w.view(
            "underfunded.sandbox",
            "get_storefront",
            json!({"name":"car3"})
        )
        .await?["status"],
        "ready"
    );

    // Unknown global hash: failed creation is not silently treated as live.
    w.init_factory("badhash.sandbox", &[99; 32], FT_STORAGE)
        .await?;
    let invalid_global = w
        .call(
            "sellertwo.sandbox",
            "badhash.sandbox",
            "create_storefront",
            params("car4"),
            deposit,
        )
        .await;
    // near-api 0.8.6's RPC schema cannot decode Sandbox 2.14.0's newer
    // GlobalContractDoesNotExist action-error variant. Never accept an
    // arbitrary transport error: the state query below must confirm failure.
    let expected_rpc_decode_limit = match invalid_global {
        Ok(tx) => {
            tx.assert_success();
            false
        }
        Err(err) => {
            let message = err.to_string();
            anyhow::ensure!(
                message.contains("Invalid Response Payload")
                    && message.contains("GlobalContractDoesNotExist"),
                "unexpected send error: {message}"
            );
            true
        }
    };
    assert_eq!(
        w.view("badhash.sandbox", "get_storefront", json!({"name":"car4"}))
            .await?["status"],
        "creation_failed"
    );
    let report = json!({"network":"local NEAR Sandbox","node_version":"2.14.0","global_code_hash":hash.to_string(),"public_transactions":0,"expected_unknown_global_rpc_decode_limit":expected_rpc_decode_limit,
        "checks":["actual immutable global code shared by two accounts","keyless child accounts","authenticated seller binding and fixed token/arbiter","verified token registration readiness","independent state and USDC balances","reinitialization and unauthorized admin rejected","registration failure stays unready; seller-only retry verified","unknown global hash creation stays failed"]});
    std::fs::create_dir_all(root().join("docs/proofs/artifacts"))?;
    std::fs::write(
        root().join("docs/proofs/artifacts/factory-results.json"),
        serde_json::to_string_pretty(&report)?,
    )?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
