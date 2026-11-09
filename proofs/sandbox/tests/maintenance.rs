//! Empty-fixture-only timing refresh: all three actions are one self receipt.
use anyhow::{Context, Result};
use near_api::types::{
    AccountId, Action, CryptoHash, Data,
    transaction::actions::{DeployContractAction, FunctionCallAction},
    transaction::result::TransactionResult,
};
use near_api::{Account, Chain, Contract, NearGas, NearToken, NetworkConfig, Signer, Transaction};
use near_sandbox::{Sandbox, config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY};
use serde_json::{Value, json};
use std::{collections::BTreeMap, path::PathBuf, sync::Arc};

const NORMAL_SHA: &str = "1422e57656708a95416a75eb0f7132f7715b5937be45e4cb0060e2218d86ed77";
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn digest(bytes: &[u8]) -> String {
    hex(&CryptoHash::hash(bytes).0)
}
fn decode(text: &str) -> Vec<u8> {
    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut bits = 0u32;
    let mut n = 0;
    let mut out = Vec::new();
    for byte in text.bytes().take_while(|b| *b != b'=') {
        let v = alphabet.iter().position(|b| *b == byte).expect("base64") as u32;
        bits = (bits << 6) | v;
        n += 6;
        if n >= 8 {
            n -= 8;
            out.push((bits >> n) as u8);
            bits &= (1 << n) - 1;
        }
    }
    out
}
fn time_offset(bytes: &[u8]) -> usize {
    let mut n = 0;
    for _ in 0..4 {
        let len = u32::from_le_bytes(bytes[n..n + 4].try_into().unwrap()) as usize;
        n += 4 + len;
    }
    assert_eq!(bytes[n], 1);
    n + 1
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
    async fn deploy(&self, name: &str, bytes: Vec<u8>) -> Result<()> {
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
            .gas(NearGas::from_tgas(200))
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
        let r: Data<Value> = Contract(id(target))
            .call_function(method, args)
            .read_only()
            .fetch_from(&self.net)
            .await?;
        Ok(r.data)
    }
    async fn storage(&self, target: &str) -> Result<BTreeMap<Vec<u8>, Vec<u8>>> {
        let r = Contract(id(target))
            .view_storage()
            .fetch_from(&self.net)
            .await?;
        let v = serde_json::to_value(r.data)?;
        Ok(v["values"]
            .as_array()
            .unwrap()
            .iter()
            .map(|pair| {
                (
                    decode(pair["key"].as_str().unwrap()),
                    decode(pair["value"].as_str().unwrap()),
                )
            })
            .collect())
    }
    async fn market(&self, name: &str, normal: &[u8], now: u64) -> Result<()> {
        self.account(name).await?;
        self.deploy(name, normal.to_vec()).await?;
        self.ok(name,name,"new",json!({"seller_id":"seller.sandbox","arbiter_id":name,"ft_contract_id":"maintenance-usdc.sandbox","intents_contract_id":"maintenance-intents.sandbox","settlement":"intents","initial_price_cents":"100","cutoff_ns":(now+600_000_000_000).to_string(),"refund_end_ns":(now+1_500_000_000_000).to_string()}),0).await
    }
    async fn batch(
        &self,
        name: &str,
        helper: &[u8],
        normal: &[u8],
        args: Value,
    ) -> Result<TransactionResult> {
        Ok(Transaction::construct(id(name), id(name))
            .add_actions(vec![
                Action::DeployContract(DeployContractAction {
                    code: helper.to_vec(),
                }),
                Action::FunctionCall(Box::new(FunctionCallAction {
                    method_name: "refresh".into(),
                    args: serde_json::to_vec(&args)?,
                    gas: NearGas::from_tgas(100),
                    deposit: NearToken::from_yoctonear(0),
                })),
                Action::DeployContract(DeployContractAction {
                    code: normal.to_vec(),
                }),
            ])
            .with_signer(self.signer.clone())
            .send_to(&self.net)
            .await?)
    }
}

#[tokio::test]
async fn hash_bound_empty_fixture_refresh_changes_only_deadline_bytes_and_restores_code()
-> Result<()> {
    let sandbox = Sandbox::start_sandbox_with_version("2.14.0").await?;
    let l = Local {
        net: NetworkConfig::from_rpc_url("maintenance-local", sandbox.rpc_addr.parse()?),
        sandbox,
        signer: Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?,
    };
    let normal = std::fs::read(root().join("target/proof-artifacts/marketplace.wasm"))?;
    assert_eq!(normal.len(), 625972);
    assert_eq!(digest(&normal), NORMAL_SHA);
    let helper = std::fs::read(root().join("target/proof-artifacts/empty-campaign-refresh.wasm"))
        .context("Build empty-campaign-refresh first")?;
    assert!(
        normal.len() + helper.len() + 16_384 < 1_572_864,
        "combined transaction byte budget"
    );
    l.account("seller.sandbox").await?;
    l.account("outsider.sandbox").await?;
    let now: u64 = Chain::block()
        .fetch_from(&l.net)
        .await?
        .header
        .timestamp_nanosec
        .parse()?;
    for name in [
        "maintenance-market.sandbox",
        "maintenance-guard.sandbox",
        "maintenance-stale.sandbox",
    ] {
        l.market(name, &normal, now).await?;
    }
    let before = l.storage("maintenance-market.sandbox").await?;
    let raw = before.get(b"STATE".as_slice()).unwrap();
    let offset = time_offset(raw);
    let old_cutoff = u64::from_le_bytes(raw[offset..offset + 8].try_into().unwrap());
    let old_refund = u64::from_le_bytes(raw[offset + 8..offset + 16].try_into().unwrap());
    let decoded_before = l
        .view("maintenance-market.sandbox", "get_state", json!({}))
        .await?;
    assert_eq!(decoded_before["cutoff_ns"], old_cutoff.to_string());
    assert_eq!(decoded_before["refund_end_ns"], old_refund.to_string());
    let next = now + 7_200_000_000_000;
    let args = json!({"expected_state_sha256":digest(raw),"expected_old_cutoff_ns":old_cutoff.to_string(),"expected_old_refund_end_ns":old_refund.to_string(),"new_cutoff_ns":next.to_string(),"new_refund_end_ns":(next+900_000_000_000).to_string()});
    let changed = l
        .batch("maintenance-market.sandbox", &helper, &normal, args.clone())
        .await?;
    assert!(changed.is_success());
    assert_eq!(changed.transaction().actions().len(), 3);
    let after = l.storage("maintenance-market.sandbox").await?;
    assert_eq!(
        before.keys().collect::<Vec<_>>(),
        after.keys().collect::<Vec<_>>()
    );
    for (key, value) in &before {
        if key.as_slice() != b"STATE" {
            assert_eq!(after.get(key), Some(value));
        }
    }
    let updated = after.get(b"STATE".as_slice()).unwrap();
    assert_eq!(raw.len(), updated.len());
    let mut masked = updated.clone();
    masked[offset..offset + 16].copy_from_slice(&raw[offset..offset + 16]);
    assert_eq!(&masked, raw);
    assert_eq!(
        u64::from_le_bytes(updated[offset..offset + 8].try_into().unwrap()),
        next
    );
    assert_eq!(
        u64::from_le_bytes(updated[offset + 8..offset + 16].try_into().unwrap()),
        next + 900_000_000_000
    );
    let state = l
        .view("maintenance-market.sandbox", "get_state", json!({}))
        .await?;
    assert_eq!(state["cutoff_ns"], next.to_string());
    assert_eq!(state["refund_end_ns"], (next + 900_000_000_000).to_string());
    assert_eq!(state["round"], "0");
    assert_eq!(state["holder"], Value::Null);
    assert_eq!(state["total_received"], "0");
    assert_eq!(state["total_pending"], "0");
    assert_eq!(state["total_withdrawn"], "0");
    assert_eq!(state["nft_minted"], false);
    let code = Account(id("maintenance-market.sandbox"))
        .view()
        .fetch_from(&l.net)
        .await?;
    assert_eq!(
        code.data.contract_state,
        near_api::types::account::ContractState::LocalHash(CryptoHash::hash(&normal))
    );

    // Actual caller authentication in a separate disposable helper fixture.
    l.deploy("maintenance-guard.sandbox", helper.clone())
        .await?;
    let guard_before = l.storage("maintenance-guard.sandbox").await?;
    assert!(
        l.call(
            "outsider.sandbox",
            "maintenance-guard.sandbox",
            "refresh",
            args.clone(),
            0
        )
        .await?
        .is_failure()
    );
    assert_eq!(l.storage("maintenance-guard.sandbox").await?, guard_before);
    l.deploy("maintenance-guard.sandbox", normal.clone())
        .await?;

    // A real accepted purchase changes STATE. The earlier empty-state hash must
    // reject, and failure must roll back even the preceding helper deployment.
    let stale_before = l.storage("maintenance-stale.sandbox").await?;
    let stale_raw = stale_before.get(b"STATE".as_slice()).unwrap();
    let mut stale_args = args.clone();
    stale_args["expected_state_sha256"] = json!(digest(stale_raw));
    l.account("maintenance-usdc.sandbox").await?;
    l.account("maintenance-intents.sandbox").await?;
    l.deploy(
        "maintenance-intents.sandbox",
        std::fs::read(root().join("target/proof-artifacts/test-intents.wasm"))?,
    )
    .await?;
    l.ok(
        "maintenance-intents.sandbox",
        "maintenance-intents.sandbox",
        "new",
        json!({"owner_id":"maintenance-intents.sandbox"}),
        0,
    )
    .await?;
    l.ok("maintenance-intents.sandbox","maintenance-intents.sandbox","mint",json!({"account_id":"seller.sandbox","token_id":"nep141:maintenance-usdc.sandbox","amount":"1000000"}),0).await?;
    l.ok("seller.sandbox","maintenance-intents.sandbox","mt_transfer_call",json!({"receiver_id":"maintenance-stale.sandbox","token_id":"nep141:maintenance-usdc.sandbox","amount":"1000000","msg":json!({"invoice_id":"paid","expected_round":"0"}).to_string()}),1).await?;
    assert_eq!(
        l.view("maintenance-stale.sandbox", "get_state", json!({}))
            .await?["round"],
        "1"
    );
    let paid = l.storage("maintenance-stale.sandbox").await?;
    assert!(
        l.batch("maintenance-stale.sandbox", &helper, &normal, stale_args)
            .await?
            .is_failure()
    );
    assert_eq!(l.storage("maintenance-stale.sandbox").await?, paid);
    let stale_code = Account(id("maintenance-stale.sandbox"))
        .view()
        .fetch_from(&l.net)
        .await?;
    assert_eq!(
        stale_code.data.contract_state,
        near_api::types::account::ContractState::LocalHash(CryptoHash::hash(&normal))
    );
    assert_eq!(
        l.view("maintenance-stale.sandbox", "get_state", json!({}))
            .await?["round"],
        "1"
    );
    let report = json!({"network":"local NEAR Sandbox","node_version":"2.14.0","funded_public_transactions":0,
        "normal_bytes":normal.len(),"normal_sha256":digest(&normal),"normal_code_hash":CryptoHash::hash(&normal).to_string(),
        "helperBytes":helper.len(),"helperSha256":digest(&helper),"marketplaceSha256":digest(&normal),"helperSourceSha256":digest(&std::fs::read(root().join("contracts/empty-campaign-refresh/src/lib.rs"))?),"helper_code_hash":CryptoHash::hash(&helper).to_string(),
        "empty_state_sha256_before":digest(raw),"state_sha256_after":digest(updated),"timestamp_byte_offset":offset,
        "checks":{"same_original_code_restored":true,"only_two_timestamps_changed":true,"self_only":true,"stale_hash_rolls_back":true,"exact_three_self_actions_no_transfers":true,"all_storage_except_two_u64_fields_identical":true,"original_code_hash_restored":true,"unauthorized_caller_rejected":true,"real_purchase_invalidates_empty_hash":true,"stale_hash_failure_rolls_back_helper_deployment_and_all_state":true}});
    std::fs::write(
        root().join("docs/proofs/artifacts/empty-campaign-refresh-results.json"),
        serde_json::to_vec_pretty(&report)?,
    )?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
