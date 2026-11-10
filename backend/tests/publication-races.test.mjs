import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { Marketplace } from '../src/marketplace.mjs';
import { ChainService } from '../src/chain-service.mjs';
import { HubPublication } from '../src/hub-publication.mjs';

const owner='seller.near',arbiter='arbiter.near';
function barrier(){let count=0,release;const gate=new Promise(resolve=>{release=resolve;});return async()=>{if(++count===2)release();if(count<=2)await gate;};}
function fixtureReads(config,now,offer,termsRef){
 let pause;const block={header:{hash:'block',height:42,timestamp_nanosec:String(BigInt(now)*1000000n)}};
 const reads={now:()=>now,pauseNextPair(){pause=barrier();},block:async()=>{if(pause)await pause();return block;},
  account:async account=>({code_hash:{'hub.near':'hub-code','intents.near':'intents-code','usdc.near':'usdc-code'}[account]}),
  view:async(_account,method,args)=>{
   const terms=termsRef.value;const state={offer_id:offer.value,receiver_id:'hub.near',seller_id:owner,arbiter_id:arbiter,ft_contract_id:'usdc.near',intents_contract_id:'intents.near',intents_token_id:'nep141:usdc.near',settlement:'intents',outcome:'open',round:'0',next_price:'10000',cutoff_ns:terms?.bidding_close_ns,refund_end_ns:terms?.review_end_ns,total_received:'0',total_withdrawn:'0',total_pending:'0'};
   return {get_config:{owner_id:'operator.near',arbiter_id:arbiter,ft_contract_id:'usdc.near',intents_contract_id:'intents.near',offer_storage_deposit:'600000000000000000000000',sponsor_available:'2400000000000000000000000'},get_state:state,get_campaign:{terms,open_issues:0},get_placement_rights:{minted:false},get_totals:{total_received:'0',total_withdrawn:'0',total_pending:'0'},mt_balance_of:'0',fee:1,pa_all_paused:null}[method];
  }};
 return reads;
}

test('parallel final native publication reconciliation across database connections publishes and indexes exactly once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-publish-race-')),a=new Store(join(dir,'state.sqlite')),b=new Store(join(dir,'state.sqlite')),now=Date.now();
 const config={stateDir:dir,hub:{accountId:'hub.near',codeHash:'hub-code'},assets:{nearUsdc:'usdc.near',intentsId:'intents.near',nearAsset:'nep141:usdc.near',intentsCodeHash:'intents-code',usdcCodeHash:'usdc-code'}},offer={},terms={};
 const reads=fixtureReads(config,now,offer,terms),chainA=new ChainService({store:a,config,reads}),chainB=new ChainService({store:b,config,reads}),marketA=new Marketplace({store:a,chain:chainA,now:()=>now}),marketB=new Marketplace({store:b,chain:chainB,now:()=>now});
 try{const asset=marketA.createAsset(owner,{title:'Test car',description:'Rear ad panel',assetType:'car',city:'Bucharest',spots:[{name:'Rear panel',side:'rear',box:{x:.2,y:.3,width:.5,height:.2},suggestedPriceCents:'1',confidence:'low'}]});
 const schedule=Object.fromEntries(['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map((key,index)=>[key,new Date(now+(index+1)*600000).toISOString()]));
 const sale=marketA.createSale(owner,{assetId:asset.id,title:'Campaign',schedule,spots:[{id:asset.spots[0].id,priceCents:'1'}],takeoverDefault:true,arbiterId:arbiter,rules:'Owner prints and installs.'});
 const first=new HubPublication({store:a,config,reads,marketplace:marketA,now:()=>now}),second=new HubPublication({store:b,config,reads,marketplace:marketB,now:()=>now}),prepared=(await first.prepare(owner,sale.id)).plans[0];
 offer.value=prepared.plan.offerId;terms.value=prepared.plan.transaction.actions[0].params.args.terms;
 const hash='1'.repeat(32),params=prepared.plan.transaction.actions[0].params,event={standard:'pitboard',version:'1.0.0',event:'offer_created',data:[{offer_id:offer.value,seller_id:owner}]},success={SuccessValue:''};
 const outcome={final_execution_status:'FINAL',status:success,transaction_outcome:{outcome:{status:success}},transaction:{hash,signer_id:owner,receiver_id:'hub.near',actions:[{FunctionCall:{method_name:params.methodName,args:Buffer.from(JSON.stringify(params.args)).toString('base64'),gas:Number(params.gas),deposit:params.deposit}}]},receipts_outcome:[{outcome:{executor_id:'hub.near',status:success,logs:['EVENT_JSON:'+JSON.stringify(event)]}}]};
 let racedAfterVerification=0;for(const market of [marketA,marketB]){const original=market.publishedResult.bind(market);market.publishedResult=(...args)=>{if(args[3]?.bound)racedAfterVerification++;return original(...args);};}
 reads.rpc={call:async()=>outcome};reads.pauseNextPair();
 const results=await Promise.all([first.confirm(owner,prepared.id,hash),second.confirm(owner,prepared.id,hash)]);
 assert(results.every(r=>r.status==='confirmed'));assert.equal(racedAfterVerification,1);assert.equal(a.get('publication-plan',prepared.id).version,3);assert.equal(a.get('sale',sale.id).status,'published');assert.equal(a.get('sale',sale.id).version,sale.version+1);assert.equal(a.list('deployment').length,1);assert.equal(a.list('spot-index').length,1);assert.equal(a.db.prepare("SELECT COUNT(*) count FROM events WHERE kind='sale_published'").get().count,1);
 const repeated=await first.confirm(owner,prepared.id,hash);assert.equal(repeated.status,'confirmed');assert.equal(a.db.prepare("SELECT COUNT(*) count FROM events WHERE kind='sale_published'").get().count,1);
 const contracts=[{spotId:asset.spots[0].id,contractId:offer.value}];assert.equal((await marketB.publish(owner,sale.id,{version:sale.version,contracts})).status,'published');
 await assert.rejects(marketA.publish(owner,sale.id,{version:sale.version,contracts:[{spotId:asset.spots[0].id,contractId:'offer-'+'f'.repeat(32)}]}),{code:'PUBLICATION_CHANGED'});
 await assert.rejects(marketA.publish(owner,sale.id,{version:sale.version+1,contracts}),{code:'PUBLICATION_CHANGED'});
 const binding={contractId:offer.value,sellerId:owner,arbiterId:arbiter,terms:terms.value,initialPriceCents:'1'};
 for(const changed of [{initialPriceCents:'2'},{sellerId:'attacker.near'},{terms:{...terms.value,spot_id:'wrong'}}])await assert.rejects(chainB.attachHubDeployment({...binding,...changed}),{code:'DEPLOYMENT_CHANGED'});
 const changedCode=new ChainService({store:b,reads,config:{...config,hub:{...config.hub,codeHash:'different-code'}}});await assert.rejects(changedCode.attachHubDeployment(binding),{code:'DEPLOYMENT_CHANGED'});
 await assert.rejects(second.finish(prepared,outcome,'2'.repeat(32)),{code:'TRANSACTION_CHANGED'});assert.equal(a.get('publication-plan',prepared.id).transactionHash,hash);
 }finally{a.close();b.close();await rm(dir,{recursive:true,force:true});}
});

test('parallel legacy attachment performs one atomic insert and rejects conflicting existing metadata',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-attach-race-')),a=new Store(join(dir,'state.sqlite')),b=new Store(join(dir,'state.sqlite')),gate=barrier(),terms={spot_id:'rear'};
 try{await writeFile(join(dir,'campaign-manifest.json'),JSON.stringify({sha256:'07'.repeat(32)}));const config={stateDir:dir,artifact:join(dir,'campaign.wasm'),assets:{}},reads={snapshot:async()=>{await gate();return {state:{seller_id:owner,arbiter_id:arbiter,round:'0',next_price:'10000',outcome:'open'},campaign:{terms}};}};
 const first=new ChainService({store:a,config,reads}),second=new ChainService({store:b,config,reads}),args={contractId:'campaign.near',sellerId:owner,arbiterId:arbiter,terms,initialPriceCents:'1'};
 const results=await Promise.all([first.attachDeployment(args),second.attachDeployment(args)]);assert.equal(results[0].id,results[1].id);assert.equal(a.list('deployment').length,1);
 await assert.rejects(second.attachDeployment({...args,initialPriceCents:'2'}),{code:'DEPLOYMENT_CHANGED'});await assert.rejects(second.attachDeployment({...args,arbiterId:'other.near'}),{code:'DEPLOYMENT_CHANGED'});assert.equal(a.get('deployment','campaign.near').initialPriceCents,'1');
 }finally{a.close();b.close();await rm(dir,{recursive:true,force:true});}
});
