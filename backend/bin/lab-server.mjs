#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { baseDecode } from 'near-api-js';
import { ROOT, loadConfig, readPrivateFile } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { Budget } from '../src/budget.mjs';
import { Rpc, NearReads } from '../src/rpc.mjs';
import { NearExecutor } from '../src/near-executor.mjs';
import { ChainService } from '../src/chain-service.mjs';
import { Auth } from '../src/auth.mjs';
import { Marketplace } from '../src/marketplace.mjs';
import { NativeActions } from '../src/native-actions.mjs';
import { Publication } from '../src/publication.mjs';
import { WalletRequests } from '../src/wallet-requests.mjs';
import { IntegrationLab } from '../src/lab.mjs';
import { Product } from '../src/product.mjs';
import { Capture } from '../src/capture.mjs';
import { Provisioning } from '../src/provisioning.mjs';
import { Media } from '../src/media.mjs';
import { AssetAI } from '../src/asset-ai.mjs';
import { ChatGPT } from '../src/chatgpt.mjs';
import { httpApp } from '../src/http.mjs';
import { reconciliationWorker } from '../src/worker.mjs';

const run=process.env.LAB_RUN;
if(!run?.startsWith(join(ROOT,'.local/lab/run-')))throw new Error('Private lab run directory required');
const fixture=join(run,'chain.json');
const f=JSON.parse(await readPrivateFile(fixture));
if(f.network!=='sandbox'||new URL(f.rpc).hostname!=='127.0.0.1')throw new Error('A fresh loopback Sandbox fixture is required');
const rpc=new Rpc(f.rpc,{intervalMs:0}),status=await rpc.call('status',[]);
if(!status.chain_id.startsWith('test-chain-'))throw new Error('The lab cannot sign on a public NEAR chain');
const clock={offset:0,now(){return Date.now()+this.offset;},async refresh(){const b=await rpc.call('block',{finality:'final'});this.offset=Number(BigInt(b.header.timestamp_nanosec)/1000000n)-Date.now();}};
await clock.refresh();
const port=Number(process.env.LAB_PORT??4320);
const config={network:'sandbox',enabled:true,host:'127.0.0.1',port,origin:'http://127.0.0.1:'+port,stateDir:run,
 treasury:'treasury.sandbox',treasuryFloor:'0',artifact:join(ROOT,'target/proof-artifacts/campaign-marketplace.wasm'),
 limits:{sourceUsdc:'0',baseGas:'0',nearFees:'100000000000000000000000000',nearAllocation:'100000000000000000000000000',nearAllocationGross:'100000000000000000000000000'},
 assets:{intentsId:'verifier.sandbox',intentsCodeHash:f.intentsCodeHash,nearUsdc:'usdc.sandbox',nearAsset:'nep141:usdc.sandbox',usdcCodeHash:f.usdcCodeHash},
 factory:{accountId:'factory.sandbox',codeHash:f.factoryCodeHash,campaignSha256:Buffer.from(baseDecode(f.campaignCodeHash)).toString('hex')}};
Object.defineProperty(config,'keys',{value:{near:f.testSecretKey}});
if(process.env.LAB_PUBLICATION_MODE==='recoverable'){config.factory=null;config.allowRecoverablePublication=true;}
const store=new Store(join(run,'state.sqlite')),budget=new Budget(store,config.limits),reads=new NearReads(rpc,{network:status.chain_id,now:()=>clock.now()});
const near=new NearExecutor({store,budget,reads,config}),r={config,store,budget,reads,near,now:()=>clock.now()},chain=new ChainService(r);
const auth=new Auth(store,{origin:config.origin,network:'sandbox',readKeys:account=>reads.keys(account)});
const marketplace=new Marketplace({...r,chain}),nativeActions=new NativeActions({...r,chain});
const publication=new Publication({...r,marketplace}),walletRequests=new WalletRequests({...r,chain,nativeActions,publication});
let keyData;try{keyData=JSON.parse(await readPrivateFile(join(run,'test-evm-keys.json')));}catch(error){if(error.code!=='ENOENT')throw error;keyData={aKey:generatePrivateKey(),bKey:generatePrivateKey()};await writeFile(join(run,'test-evm-keys.json'),JSON.stringify(keyData),{mode:0o600});}
const {aKey,bKey}=keyData;
const testWallets=[{label:'Owner',address:'seller.sandbox'},{label:'Buyer A',account:privateKeyToAccount(aKey)},
 {label:'Buyer B',account:privateKeyToAccount(bKey)},{label:'NFT recipient',address:'recipient.sandbox'},
 {label:'NFT transferee',address:'transferee.sandbox'},{label:'Arbiter',address:'arbiter.sandbox'}].map(w=>({...w,address:w.address??w.account.address.toLowerCase()}));

const lab=new IntegrationLab({...r,chain,auth,marketplace,walletRequests,testWallets,testSecretKey:f.testSecretKey,clock});
// Optional public-artifact/AI providers use their real APIs. No funded signer is passed into this runtime.
const optional=await loadConfig(),media=new Media({store,token:optional.keys.pinata}),assetAI=new AssetAI(new ChatGPT({credentialsFile:optional.chatgptCredentials}));
const product=new Product({...r,chain,marketplace,walletRequests});
const capture=new Capture({...r,now:Date.now});
const provisioning=new Provisioning({...r,chain,marketplace});
const server=httpApp({...r,auth,chain,marketplace,nativeActions,publication,walletRequests,media,assetAI,lab,product,capture,provisioning});
const worker=reconciliationWorker({...r,marketplace,nativeActions,walletRequests,intentOutcomes:chain.updateIntentOutcome.bind(chain)});
server.listen(port,config.host,()=>console.log('Integration lab: '+config.origin+'/lab (valueless local NEAR Sandbox)'));
function stop(){worker.stop();server.close(()=>{if(!worker.isRunning())store.close();process.exit(0);});}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
