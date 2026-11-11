#!/usr/bin/env node
// Isolated production-interface qualification. This harness never loads .env,
// personal wallets, mainnet configuration, external pinning or public RPCs.
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KeyPair, KeyPairSigner, actions, createTransaction, baseDecode, baseEncode } from 'near-api-js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ROOT, readPrivateFile } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { Budget } from '../src/budget.mjs';
import { Rpc, NearReads, successfulNearOutcome } from '../src/rpc.mjs';
import { NearExecutor } from '../src/near-executor.mjs';
import { ChainService } from '../src/chain-service.mjs';
import { Auth, nep413Digest } from '../src/auth.mjs';
import { Marketplace } from '../src/marketplace.mjs';
import { NativeActions } from '../src/native-actions.mjs';
import { Publication } from '../src/publication.mjs';
import { WalletRequests } from '../src/wallet-requests.mjs';
import { Product } from '../src/product.mjs';
import { Capture } from '../src/capture.mjs';
import { Media } from '../src/media.mjs';
import { httpApp } from '../src/http.mjs';
import { ServiceSupport } from '../src/support.mjs';
import { reconciliationWorker } from '../src/worker.mjs';
import { productionKeeper } from '../src/keeper.mjs';
import { assert, sha256 } from '../src/core.mjs';
const {Response}=globalThis;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const zeroLimits={sourceUsdc:'0',baseGas:'0',nearFees:'100000000000000000000000000',nearAllocation:'0',nearAllocationGross:'0'};
function rawCid(bytes){const alphabet='abcdefghijklmnopqrstuvwxyz234567',v=Buffer.concat([Buffer.from([1,85,18,32]),Buffer.from(sha256(bytes),'hex')]);let bits=0,n=0,out='b';for(const b of v){n=(n<<8)|b;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(n>>bits)&31];}}if(bits)out+=alphabet[(n<<(5-bits))&31];return out;}
function isolatedPinata(directory){
 return async(url,options={})=>{
  if(url==='https://uploads.pinata.cloud/v3/files'){
   const file=options.body.get('file'),bytes=Buffer.from(await file.arrayBuffer()),cid=rawCid(bytes),id='fixture-'+cid;
   await writeFile(join(directory,cid),bytes,{mode:0o600});return Response.json({data:{id,cid,size:bytes.length}});
  }
  const metadata=String(url).match(/^https:\/\/api.pinata.cloud\/v3\/files\/public\/fixture-(baf[a-z2-7]+)$/);
  if(metadata){const bytes=await readFile(join(directory,metadata[1]));return Response.json({data:{id:'fixture-'+metadata[1],cid:metadata[1],size:bytes.length}});}
  const gateway=String(url).match(/^https:\/\/gateway.pinata.cloud\/ipfs\/(baf[a-z2-7]+)$/);
  if(gateway)return new Response(await readFile(join(directory,gateway[1])));
  throw new Error('Sandbox media transport refuses external requests');
 };
}
export async function startProductSandbox({fixturePath,stateDir,port=4330}){
 const f=JSON.parse(await readPrivateFile(fixturePath)),endpoint=new URL(f.rpc);
 assert(f.network==='sandbox'&&endpoint.hostname==='127.0.0.1','SANDBOX_ONLY','A private fresh loopback fixture is required');
 const rpc=new Rpc(f.rpc,{intervalMs:0}),status=await rpc.call('status',[]);
 assert(status.chain_id.startsWith('test-chain-'),'SANDBOX_ONLY','This harness cannot run against a public chain');
 const clock={offset:0,now(){return Date.now()+this.offset;},async refresh(){const b=await rpc.call('block',{finality:'final'});this.offset=Number(BigInt(b.header.timestamp_nanosec)/1000000n)-Date.now();}};await clock.refresh();
 const config={production:true,environment:'production',network:'sandbox',enabled:true,keeperEnabled:true,host:'127.0.0.1',port,origin:'http://127.0.0.1:'+port,apiOrigin:'http://127.0.0.1:'+port,stateDir,authSessionMs:86400000,aiAvailable:false,defaultArbiter:'arbiter.sandbox',treasury:'treasury.sandbox',treasuryFloor:'0',limits:zeroLimits,
  assets:{intentsId:'verifier.sandbox',intentsCodeHash:f.intentsCodeHash,nearUsdc:'usdc.sandbox',nearAsset:'nep141:usdc.sandbox',usdcCodeHash:f.usdcCodeHash},hub:{accountId:f.hubId,codeHash:f.hubCodeHash}};
 Object.defineProperty(config,'keys',{value:{near:f.testSecretKey}});
 const store=new Store(join(stateDir,'state.sqlite')),budget=new Budget(store,config.limits),reads=new NearReads(rpc,{network:status.chain_id,now:()=>clock.now()}),near=new NearExecutor({store,budget,reads,config});
 const r={config,store,budget,reads,near,now:()=>clock.now()},chain=new ChainService(r),auth=new Auth(store,{origin:config.origin,network:'sandbox',readKeys:account=>reads.keys(account)});
 const marketplace=new Marketplace({...r,chain}),nativeActions=new NativeActions({...r,chain}),publication=new Publication({...r,marketplace}),walletRequests=new WalletRequests({...r,chain,nativeActions,publication});
 const mediaDir=join(stateDir,'fixture-media');await mkdir(mediaDir,{recursive:true,mode:0o700});
 const media=new Media({store,token:'ISOLATED_SYNTHETIC_TEST_TRANSPORT',fetchImpl:isolatedPinata(mediaDir),maxFiles:100});
 const supportService=new ServiceSupport({store,config}),product=new Product({...r,chain,marketplace,walletRequests,supportService}),capture=new Capture({...r,now:Date.now});
 const server=httpApp({...r,auth,chain,marketplace,nativeActions,publication,walletRequests,media,product,capture,supportService});
 // Sandbox clock jumps are test infrastructure; synchronize without weakening
 // the production finalized-block freshness assertions. No public control route.
 const handler=server.listeners('request')[0];server.removeAllListeners('request');server.on('request',async(request,response)=>{if(clock.pause)await clock.pause;await clock.refresh();await handler(request,response);});
 const worker=reconciliationWorker({...r,marketplace,nativeActions,walletRequests,intentOutcomes:chain.updateIntentOutcome.bind(chain),intervalMs:1000});
 const keeper=productionKeeper({...r,chain,intervalMs:10000,sandboxQualification:async()=>{if(clock.pause)await clock.pause;await clock.refresh();return {chainId:status.chain_id};}});
 await new Promise(resolve=>server.listen(port,config.host,resolve));
 async function direct(actor,receiverId,method,args={},deposit='0',gas='120000000000000'){
  await reads.status();const signer=KeyPairSigner.fromSecretKey(f.testSecretKey),key=await signer.getPublicKey(),block=await reads.block(),access=await reads.key(actor,key.toString(),block);
  const tx=createTransaction(actor,key,receiverId,BigInt(access.nonce)+1n,[actions.functionCall(method,args,BigInt(gas),BigInt(deposit))],baseDecode(block.header.hash)),signed=await signer.signTransaction(tx),hash=baseEncode(signed.txHash);
  await rpc.call('send_tx',{signed_tx_base64:Buffer.from(signed.signedTransaction.encode()).toString('base64'),wait_until:'NONE'});
  for(let i=0;i<150;i++){try{const outcome=await rpc.call('tx',{tx_hash:hash,sender_account_id:actor,wait_until:'NONE'});if(outcome.final_execution_status==='FINAL'){assert(successfulNearOutcome(outcome),'FIXTURE_TRANSACTION_FAILED',JSON.stringify(outcome.receipts_outcome.filter(o=>o.outcome.status.Failure)));return {transactionHash:hash,outcome};}}catch(error){if(!['RPC_UNAVAILABLE','UNKNOWN_TRANSACTION'].includes(error.code))throw error;}await sleep(100);}
  throw new Error('Fixture transaction receipt did not become final');
 }
 async function advance(target){
  for(let attempt=0;attempt<150;attempt++){const pending=store.db.prepare("SELECT id FROM operations WHERE phase NOT IN ('confirmed','failed','superseded')").all();if(!pending.length)break;for(const op of pending)await near.reconcile(op.id);if(attempt===149)throw new Error('Reconcile original operations before fast-forwarding Sandbox');await sleep(100);}
  let finish;clock.pause=new Promise(resolve=>{finish=resolve;});
  try{for(let i=0;i<3000;i++){await clock.refresh();if(clock.now()>target){await sleep(700);await clock.refresh();product.publicSnapshots.clear();return;}
   await rpc.call('sandbox_fast_forward',{delta_height:Math.max(1,Math.min(25,Math.ceil((target-clock.now())/300)))},{timeoutMs:60000});
  }throw new Error('Sandbox clock did not reach the requested stage');}finally{clock.pause=null;finish();}
 }
 async function fund(wallet){await direct('usdc.sandbox','usdc.sandbox','mint',{account_id:'usdc.sandbox',amount:'1000000'});await direct('usdc.sandbox','usdc.sandbox','ft_transfer_call',{receiver_id:'verifier.sandbox',amount:'1000000',msg:wallet,memo:null},'1');}
 async function api(path,body,cookie){const response=await fetch(config.origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:config.origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert(response.ok,'FIXTURE_API_FAILED',path+': '+JSON.stringify(value));return {value,response};}
 async function nativeSession(account){const {value:c}=await api('auth/challenge',{wallet:account}),key=KeyPair.fromString(f.testSecretKey),signed=key.sign(nep413Digest(c));const {response}=await api('auth/verify',{challengeId:c.id,accountId:account,publicKey:key.getPublicKey().toString(),signature:Buffer.from(signed.signature).toString('base64')});return response.headers.getSetCookie()[0].split(';')[0];}
 async function close(){keeper.stop();worker.stop();await new Promise(resolve=>server.close(resolve));while(keeper.isRunning()||worker.isRunning())await sleep(20);store.close();}
 return {config,store,chain,reads,clock,keeper,worker,product,walletRequests,api,direct,advance,fund,nativeSession,close,fixture:f};
}
async function main(){
 await mkdir(join(ROOT,'.local/product-sandbox'),{recursive:true,mode:0o700});
 const run=await mkdtemp(join(ROOT,'.local/product-sandbox/run-')),fixturePath=join(run,'chain.json'),binary=join(ROOT,'target/debug/hub-lab-chain');await access(binary);
 const child=spawn(binary,[fixturePath],{cwd:ROOT,stdio:['pipe','inherit','inherit']});let fixtureReady=false,harness,browser,page;
 try{
  for(let i=0;i<1200;i++){if(child.exitCode!==null)throw new Error('Sandbox fixture exited');try{await access(fixturePath);fixtureReady=true;break;}catch{}await sleep(100);}
  assert(fixtureReady,'SANDBOX_SETUP_FAILED','Sandbox fixture did not become ready');
  harness=await startProductSandbox({fixturePath,stateDir:run});
  const addressesFile=join(run,'evm-test-addresses.json'),wallets=Object.fromEntries(['owner','a','b'].map(label=>[label,privateKeyToAccount(generatePrivateKey())]));
  // Only public addresses and signatures cross into the browser; keys stay in this process.
  await writeFile(addressesFile,JSON.stringify({addresses:Object.fromEntries(Object.entries(wallets).map(([k,v])=>[k,v.address.toLowerCase()]))}),{mode:0o600});
  for(const label of ['a','b'])await harness.fund(wallets[label].address.toLowerCase());
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
  try{
   const context=await browser.newContext();page=await context.newPage();page.setDefaultTimeout(60000);
   const {productionBrowser}=await import(pathToFileURL(join(ROOT,'prototype/tests/production-browser.mjs')));
   const result=await productionBrowser({page,wallets,getHarness:()=>harness,restart:async()=>{await harness.close();harness=await startProductSandbox({fixturePath,stateDir:run});}});
   await writeFile(join(run,'result.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result,null,2));
  }catch(error){if(page){await page.screenshot({path:join(run,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(join(run,'failure.txt'),await page.locator('body').innerText()).catch(()=>{});}throw error;}
 }finally{await browser?.close();await harness?.close();child.stdin.end('stop\n');}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname))main().catch(error=>{console.error(error);process.exitCode=1;});
