//! Local-only two-phase deployment proof. An ordinary parent Transfer activates
//! a classic Ed25519 implicit account; its own fresh in-memory key then deploys.
use anyhow::{Context, Result};
use near_api::types::{AccountId, CryptoHash, Data, transaction::result::TransactionResult};
use near_api::{Account, Chain, Contract, NearGas, NearToken, NetworkConfig, Signer, Tokens};
use near_sandbox::{Sandbox, config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY};
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::Arc,
};

const ARTIFACT_SHA: &str = "1422e57656708a95416a75eb0f7132f7715b5937be45e4cb0060e2218d86ed77";
const ALLOCATION: u128 = 7_500_000_000_000_000_000_000_000;
const USDC: u128 = 1_000_000;
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn amount(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}

// The newly generated private key never leaves this process, is never written
// to a file, and is never output. Only loopback Sandbox RPC is accepted.
const NODE_DEV: &str = r#"
const { createRequire } = await import('node:module');
const require = createRequire(new URL('./package.json', `file://${process.cwd()}/`));
const {KeyPair,connect,keyStores,transactions} = require('near-api-js');
const {readFile} = await import('node:fs/promises');
const {createHash} = await import('node:crypto');
const {createInterface} = await import('node:readline');
const key=KeyPair.fromRandom('ed25519');
const publicKey=key.getPublicKey().toString();
const accountId=Buffer.from(key.getPublicKey().data).toString('hex');
const emit=(value)=>process.stdout.write('LOCAL_PROOF:'+JSON.stringify(value)+'\n');
emit({publicKey,accountId,keyMaterialPersisted:false});
let account;
for await (const line of createInterface({input:process.stdin,crlfDelay:Infinity})) {
  const cfg=JSON.parse(line);
  if(cfg.mode==='deploy') {
    const url=new URL(cfg.rpcUrl);
    if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw new Error('loopback Sandbox RPC only');
    const code=await readFile(cfg.artifact);
    if(code.length!==625972||createHash('sha256').update(code).digest('hex')!=='1422e57656708a95416a75eb0f7132f7715b5937be45e4cb0060e2218d86ed77') throw new Error('exact normal artifact required');
    const store=new keyStores.InMemoryKeyStore();
    await store.setKey('local-implicit-deploy',accountId,key);
    const near=await connect({networkId:'local-implicit-deploy',nodeUrl:cfg.rpcUrl,deps:{keyStore:store}});
    account=await near.account(accountId);
    const result=await account.signAndSendTransaction({receiverId:accountId,actions:[
      transactions.deployContract(Uint8Array.from(code)),
      transactions.functionCall('new',cfg.args,100_000_000_000_000n,0n)
    ]});
    if(result.status?.Failure) throw new Error('local deployment failed');
    const status=await near.connection.provider.status();
    const gas=[result.transaction_outcome,...result.receipts_outcome].reduce((n,x)=>n+BigInt(x.outcome.gas_burnt),0n);
    emit({mode:'deployed',accountId,publicKey,transactionHash:result.transaction.hash,
      actionCount:result.transaction.actions.length,gasBurnt:gas.toString(),protocolVersion:status.protocol_version,
      nearApiJsVersion:'5.1.1',privateKeyOutput:false});
  } else throw new Error('unsupported local mode');
}
process.exit(0);
"#;

struct Developer {
    child: Child,
    input: Option<ChildStdin>,
    output: BufReader<ChildStdout>,
}
impl Developer {
    fn start() -> Result<(Self, Value)> {
        let mut child = Command::new("node")
            .args(["--input-type=module", "-e", NODE_DEV])
            .current_dir(root().join("proofs/mainnet"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        let input = child.stdin.take();
        let output = BufReader::new(child.stdout.take().unwrap());
        let mut dev = Self {
            child,
            input,
            output,
        };
        let identity = dev.response()?;
        Ok((dev, identity))
    }
    fn response(&mut self) -> Result<Value> {
        for _ in 0..100 {
            let mut line = String::new();
            let count = self.output.read_line(&mut line)?;
            if count == 0 {
                let mut error = String::new();
                self.child
                    .stderr
                    .take()
                    .unwrap()
                    .read_to_string(&mut error)?;
                anyhow::bail!("Local near-api-js developer process ended: {error}");
            }
            if let Some(json) = line.strip_prefix("LOCAL_PROOF:") {
                return serde_json::from_str(json).context("Public developer-process response");
            }
            // near-api-js prints public receipt logs to stdout. Those are not
            // protocol messages and contain no private key generated above.
        }
        anyhow::bail!("Too many non-protocol SDK output lines")
    }
    fn command(&mut self, config: Value) -> Result<Value> {
        let input = self.input.as_mut().unwrap();
        writeln!(input, "{config}")?;
        input.flush()?;
        self.response()
    }
    fn finish(mut self) -> Result<()> {
        drop(self.input.take());
        let status = self.child.wait()?;
        anyhow::ensure!(status.success(), "local developer process failed");
        Ok(())
    }
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
        let data: Data<Value> = Contract(id(target))
            .call_function(method, args)
            .read_only()
            .fetch_from(&self.net)
            .await?;
        Ok(data.data)
    }
    async fn deploy(&self, name: &str, code: Vec<u8>) -> Result<()> {
        self.account(name).await?;
        Contract::deploy(id(name))
            .use_code(code)
            .without_init_call()
            .with_signer(self.signer.clone())
            .send_to(&self.net)
            .await?
            .assert_success();
        Ok(())
    }
}

#[tokio::test]
async fn transfer_activates_implicit_account_then_own_key_deploys_exact_marketplace() -> Result<()>
{
    let sandbox = Sandbox::start_sandbox_with_version("2.14.0").await?;
    let local = Local {
        net: NetworkConfig::from_rpc_url("implicit-deployment", sandbox.rpc_addr.parse()?),
        sandbox,
        signer: Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?,
    };
    local.account("parent.sandbox").await?;
    let (mut dev, identity) = Developer::start()?;
    let implicit = identity["accountId"].as_str().unwrap();
    let public_key = identity["publicKey"].as_str().unwrap();
    assert_eq!(implicit.len(), 64);
    assert!(
        implicit
            .bytes()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
    );
    assert!(
        Account(id(implicit))
            .view()
            .fetch_from(&local.net)
            .await
            .is_err()
    );
    let funding = Tokens::account(id("parent.sandbox"))
        .send_to(id(implicit))
        .near(NearToken::from_yoctonear(ALLOCATION))
        .with_signer(local.signer.clone())
        .send_to(&local.net)
        .await?;
    assert!(funding.is_success());
    assert_eq!(funding.transaction().actions().len(), 1);
    assert!(matches!(
        funding.transaction().actions()[0],
        near_api::types::Action::Transfer(_)
    ));
    let activated = Account(id(implicit)).view().fetch_from(&local.net).await?;
    assert_eq!(activated.data.amount.as_yoctonear(), ALLOCATION);
    assert!(matches!(
        activated.data.contract_state,
        near_api::types::account::ContractState::None
    ));
    let keys = Account(id(implicit))
        .list_keys()
        .fetch_from(&local.net)
        .await?;
    assert_eq!(keys.data.len(), 1);
    assert_eq!(keys.data[0].0.to_string(), public_key);
    assert!(format!("{:?}", keys.data[0].1).contains("FullAccess"));

    local
        .deploy(
            "deploy-usdc.sandbox",
            std::fs::read(root().join("target/proof-artifacts/test-token.wasm"))?,
        )
        .await?;
    local
        .ok(
            "deploy-usdc.sandbox",
            "deploy-usdc.sandbox",
            "new",
            json!({"owner_id":"deploy-usdc.sandbox"}),
            0,
        )
        .await?;
    let actual =
        std::fs::read(root().join("proofs/intents-compatibility/artifacts/intents-mainnet.wasm"))?;
    assert_eq!(
        CryptoHash::hash(&actual).to_string(),
        "BtA1BEFNS619KkvXFsgcpQ21Tb5yMm32aaUkn7xNothk"
    );
    local.deploy("deploy-verifier.sandbox", actual).await?;
    local
        .ok(
            "deploy-verifier.sandbox",
            "deploy-verifier.sandbox",
            "new",
            json!({"config":{
                "wnear_id":"deploy-usdc.sandbox","fees":{"fee":1,"fee_collector":"parent.sandbox"},
                "roles":{"super_admins":["sandbox"],"admins":{},"grantees":{}}
            }}),
            0,
        )
        .await?;
    let now: u64 = Chain::block()
        .fetch_from(&local.net)
        .await?
        .header
        .timestamp_nanosec
        .parse()?;
    let artifact = root().join("target/proof-artifacts/marketplace.wasm");
    let code = std::fs::read(&artifact)?;
    assert_eq!(code.len(), 625972);
    let code_hash = CryptoHash::hash(&code);
    let sha: String = code_hash.0.iter().map(|b| format!("{b:02x}")).collect();
    assert_eq!(sha, ARTIFACT_SHA);
    let deployed=dev.command(json!({"mode":"deploy","rpcUrl":local.sandbox.rpc_addr,"artifact":artifact,
        "args":{"seller_id":"parent.sandbox","arbiter_id":implicit,"ft_contract_id":"deploy-usdc.sandbox",
        "intents_contract_id":"deploy-verifier.sandbox","settlement":"intents","initial_price_cents":"100",
        "cutoff_ns":(now+120_000_000_000).to_string(),"refund_end_ns":(now+180_000_000_000).to_string()}}))?;
    assert_eq!(deployed["actionCount"], 2);
    assert!(deployed["protocolVersion"].as_u64().unwrap() >= 88);
    let deployed_account = Account(id(implicit)).view().fetch_from(&local.net).await?;
    assert_eq!(
        deployed_account.data.contract_state,
        near_api::types::account::ContractState::LocalHash(code_hash)
    );
    assert!(deployed_account.data.amount.as_yoctonear() < ALLOCATION);
    let state = local.view(implicit, "get_state", json!({})).await?;
    assert_eq!(state["seller_id"], "parent.sandbox");
    assert_eq!(state["arbiter_id"], implicit);
    assert_eq!(state["settlement"], "intents");
    assert_eq!(state["next_price"], USDC.to_string());
    // No native FT registration is needed for an Intents-backed marketplace.
    assert!(
        local
            .view(
                "deploy-usdc.sandbox",
                "storage_balance_of",
                json!({"account_id":implicit})
            )
            .await?
            .is_null()
    );
    for (owner, value) in [("parent.sandbox", 2 * USDC), ("deploy-verifier.sandbox", 0)] {
        local
            .ok(
                "deploy-usdc.sandbox",
                "deploy-usdc.sandbox",
                "mint",
                json!({"account_id":owner,"amount":value.to_string()}),
                0,
            )
            .await?;
    }
    local.ok("parent.sandbox","deploy-usdc.sandbox","ft_transfer_call",json!({"receiver_id":"deploy-verifier.sandbox","amount":USDC.to_string(),"msg":"parent.sandbox","memo":null}),1).await?;
    local.ok("parent.sandbox","deploy-verifier.sandbox","mt_transfer_call",json!({"receiver_id":implicit,"token_id":"nep141:deploy-usdc.sandbox","amount":USDC.to_string(),"approval":null,"memo":null,"msg":json!({"invoice_id":"implicit-deploy-first","expected_round":"0"}).to_string()}),1).await?;
    let state = local.view(implicit, "get_state", json!({})).await?;
    assert_eq!(state["round"], "1");
    assert_eq!(state["holder"]["account_id"], "parent.sandbox");
    assert_eq!(
        amount(
            &local
                .view(
                    "deploy-verifier.sandbox",
                    "mt_balance_of",
                    json!({"account_id":implicit,"token_id":"nep141:deploy-usdc.sandbox"})
                )
                .await?
        ),
        USDC
    );
    dev.finish()?;
    let report = json!({"network":"local NEAR Sandbox","node_version":"2.14.0","protocol_version":deployed["protocolVersion"],
        "near_api_js":"5.1.1","implicit_account":implicit,"public_key":public_key,
        "allocation_yocto":ALLOCATION.to_string(),"artifact_bytes":625972,"artifact_sha256":ARTIFACT_SHA,
        "marketplace_code_hash":code_hash.to_string(),"deployment_gas_burnt":deployed["gasBurnt"],
        "funded_public_transactions":0,"existing_private_keys_read":false,"ephemeral_dev_private_key_persisted":false,
        "checks":{"parent_single_transfer_only":true,"implicit_auto_activation_with_correct_full_access_key":true,
        "dev_own_account_deploy_and_initialize":true,"exact_code_and_1_usdc_constructor":true,
        "actual_intents_wasm_fee_1_receiver_purchase":true,"no_native_ft_registration":true,
        "cancellation_covered_by_separate_settlement_suite":true},
        "immutable_customer_escrow":false});
    std::fs::create_dir_all(root().join("docs/proofs/artifacts"))?;
    std::fs::write(
        root().join("docs/proofs/artifacts/implicit-deploy-results.json"),
        serde_json::to_vec_pretty(&report)?,
    )?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
