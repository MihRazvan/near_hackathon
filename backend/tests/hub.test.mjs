import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { offerIdFor, hubSnapshot } from '../src/hub.mjs';
import { purchasePlan, validateIntentPlan } from '../src/intents.mjs';
import { ChainService } from '../src/chain-service.mjs';
import { hubIntentPlan, hubNativePlan } from '../src/hub-actions.mjs';
import { Marketplace } from '../src/marketplace.mjs';
import { HubPublication } from '../src/hub-publication.mjs';

const now=1_800_000_000_000,offerId=offerIdFor({saleId:'sale',version:1,spotId:'door'}),otherId=offerIdFor({saleId:'sale',version:1,spotId:'roof'}),buyer='0x'+'11'.repeat(20);
const ns=delta=>String(BigInt(now+delta)*1000000n);
function snapshot(){return {accountId:offerId,offerId,receiverId:'hub.near',mode:'hub',codeHash:'hub-code',qualified:true,observedAt:new Date(now).toISOString(),state:{offer_id:offerId,receiver_id:'hub.near',seller_id:'seller.near',arbiter_id:'arbiter.near',settlement:'intents',ft_contract_id:'usdc.near',intents_contract_id:'intents.near',intents_token_id:'nep141:usdc.near',outcome:'open',round:'0',next_price:'10000',holder:null,cutoff_ns:ns(600000),refund_end_ns:ns(900000),total_received:'20000',total_withdrawn:'0',total_pending:'0',nft_minted:false,artwork_locked:false},campaign:{terms:{bidding_close_ns:ns(600000),artwork_due_ns:ns(650000),installation_due_ns:ns(700000),review_end_ns:ns(900000),published_terms_sha256:Buffer.alloc(32).toString('base64'),takeover_enabled:true},delivery_proof:null,open_issues:0},rights:{bidding_closed:false,current_owner_id:buyer,locked:false,revision:'0',proposal:null}};}

test('shared offer purchases bind virtual inventory, actual escrow, terms and isolated receipt event',()=>{
 const s=snapshot(),plan=purchasePlan({snapshot:s,buyerId:buyer,invoiceId:'invoice',asset:s.state.intents_token_id,now});
 validateIntentPlan(plan,{now});assert.equal(plan.context.contractId,offerId);assert.equal(plan.context.receiverId,'hub.near');assert.equal(plan.payload.intents[0].receiver_id,'hub.near');assert.equal(JSON.parse(plan.payload.intents[0].msg).offer_id,offerId);
 const service=new ChainService({config:{stateDir:'/unused'}}),data={offer_id:offerId,invoice_id:'invoice',buyer_id:buyer,amount:'10000',round:'1'};
 const event=()=>({phase:'confirmed',result:{outcome:{receipts_outcome:[{outcome:{executor_id:'hub.near',logs:['EVENT_JSON:'+JSON.stringify({standard:'pitboard',version:'1.0.0',event:'purchase_accepted',data:[data]})]}}]}}});
 assert.equal(service.purchaseAccepted(plan,event()),true);data.offer_id=otherId;assert.equal(service.purchaseAccepted(plan,event()),false);data.offer_id=offerId;const wrong=event();wrong.result.outcome.receipts_outcome[0].outcome.executor_id=offerId;assert.equal(service.purchaseAccepted(plan,wrong),false);
});

test('shared snapshots prove pooled solvency while another offer withdrawal is pending',async()=>{
 const s=snapshot(),config={hub:{accountId:'hub.near',codeHash:'hub-code'},assets:{nearUsdc:'usdc.near',intentsId:'intents.near',nearAsset:'nep141:usdc.near',intentsCodeHash:'intents-code',usdcCodeHash:'usdc-code'}},totals={total_received:'90000',total_withdrawn:'10000',total_pending:'50000'};let balance='30000';
 const requests=[],reads={now:()=>now,block:async()=>({header:{hash:'block',height:4,timestamp_nanosec:ns(0)}}),account:async id=>({code_hash:{'hub.near':'hub-code','intents.near':'intents-code','usdc.near':'usdc-code'}[id]}),view:async(id,method,args)=>{requests.push({id,method,args});return {get_config:{arbiter_id:'arbiter.near',ft_contract_id:'usdc.near',intents_contract_id:'intents.near'},get_state:s.state,get_campaign:s.campaign,get_placement_rights:s.rights,get_totals:totals,mt_balance_of:balance,fee:1,pa_all_paused:null,get_credit:{available:'0',conditional_bonus:'0'}}[method];}};
 const deployment={id:offerId,offerId,hubId:'hub.near',codeHash:'hub-code'};
 const result=await hubSnapshot(reads,config,deployment,[buyer]);assert.equal(result.globalLiabilities,'30000');assert.equal(result.liabilities,'20000');assert.equal(result.receiverId,'hub.near');assert(requests.filter(r=>['get_state','get_credit'].includes(r.method)).every(r=>r.args.offer_id===offerId));
 balance='29999';await assert.rejects(hubSnapshot(reads,config,deployment),{code:'INSOLVENT_ESCROW'});balance='30000';s.state.offer_id=otherId;await assert.rejects(hubSnapshot(reads,config,deployment),{code:'OFFER_CHANGED'});
});

test('EVM final holder submits prepaid artwork directly; participants must sign to open their issue',async()=>{
 const store=new Store(),s=snapshot();s.rights.bidding_closed=true;s.campaign.terms.artwork_due_ns=ns(100000);store.insert('media','image',buyer,{status:'verified',uri:'ipfs://test',sha256:'11'.repeat(32)});store.insert('issue','case',buyer,{contractId:offerId,mediaId:'image'});
 const reads={view:async()=>true};
 try{const plan=await hubIntentPlan({store,reads,snapshot:s,wallet:buyer,input:{kind:'artwork',mediaId:'image'},now});validateIntentPlan(plan,{now});const call=plan.payload.intents[0],msg=JSON.parse(call.msg);assert.equal(call.contract_id,'hub.near');assert.equal(msg.offer_id,offerId);assert.equal(msg.token_id,offerId);assert.equal(msg.action,'submit_artwork');assert.equal(plan.context.contractId,offerId);
  const issue=await hubIntentPlan({store,reads,snapshot:s,wallet:buyer,input:{kind:'open-issue',caseId:'case'},now});assert.equal(JSON.parse(issue.payload.intents[0].msg).case_id,'case');reads.view=async()=>false;await assert.rejects(hubIntentPlan({store,reads,snapshot:s,wallet:buyer,input:{kind:'open-issue',caseId:'case'},now}),{code:'PARTICIPANT_REQUIRED'});
  await assert.rejects(hubIntentPlan({store,reads,snapshot:s,wallet:'0x'+'22'.repeat(20),input:{kind:'artwork',mediaId:'image'},now}),{code:'NFT_OWNER_REQUIRED'});
 }finally{store.close();}
});

test('native hub mint uses the real receiver and prepaid zero deposit; unsettled issues block public success',async()=>{
 const store=new Store(),s=snapshot();s.state.holder={account_id:buyer};s.rights.bidding_closed=true;
 try{const plan=await hubNativePlan({store,reads:{},snapshot:s,wallet:'anyone.near',input:{kind:'mint'},now});assert.equal(plan.transaction.receiverId,'hub.near');assert.equal(plan.transaction.actions[0].params.deposit,'0');assert.equal(plan.transaction.actions[0].params.args.offer_id,offerId);
 s.state.artwork_locked=true;s.campaign.delivery_proof={};s.campaign.open_issues=1;s.campaign.terms.review_end_ns=ns(-1000);
 await assert.rejects(hubNativePlan({store,reads:{},snapshot:s,wallet:'anyone.near',input:{kind:'finalize-success'},now}),{code:'OPEN_ISSUES'});s.campaign.open_issues=0;assert.equal((await hubNativePlan({store,reads:{},snapshot:s,wallet:'anyone.near',input:{kind:'finalize-success'},now})).transaction.actions[0].params.methodName,'finalize_success');
 }finally{store.close();}
});

test('hub publication supports native deposits and EVM sponsored ownership with original signature plans',async()=>{
 const store=new Store(),config={hub:{accountId:'hub.near',codeHash:'hub-code'},assets:{nearUsdc:'usdc.near',intentsId:'intents.near'}};
 const c={ft_contract_id:'usdc.near',intents_contract_id:'intents.near',arbiter_id:'arbiter.near',offer_storage_deposit:'600000000000000000000000',sponsor_available:'1200000000000000000000000'};
 const reads={block:async()=>({}),account:async()=>({code_hash:'hub-code'}),view:async()=>c},terms={spot_id:'door',review_end_ns:ns(100000)};store.insert('sale','native','seller.near',{spots:[{id:'door',priceCents:'1'}],arbiterId:'arbiter.near'});store.insert('sale','evm',buyer,{spots:[{id:'door',priceCents:'1'}],arbiterId:'arbiter.near'});
 const service=new HubPublication({store,config,reads,marketplace:{publication:()=>({terms:[terms]})},now:()=>now});
 try{const native=(await service.prepare('seller.near','native')).plans[0];assert.equal(native.plan.transaction.receiverId,'hub.near');assert.equal(native.plan.transaction.actions[0].params.deposit,'0');assert.equal(native.plan.sponsored,true);
 const evm=(await service.prepare(buyer,'evm')).plans[0],again=(await service.prepare(buyer,'evm')).plans[0];assert.equal(evm.id,again.id);assert.equal(evm.plan.intentPlanId,again.plan.intentPlanId);validateIntentPlan(evm.plan.intent,{now});assert.equal(evm.plan.intent.signerId,buyer);assert.equal(JSON.parse(evm.plan.intent.payload.intents[0].msg).offer_id,evm.plan.contractId);assert.notEqual(evm.plan.contractId,native.plan.contractId);assert.equal(store.list('intent',buyer).length,1);
 }finally{store.close();}
});

test('shared claims keep the original creditor and real escrow even when multiple offers share one account',async()=>{
 const payer=buyer,s=snapshot();s.credits={[payer]:{available:'10000'}};let sent;
 const service=Object.assign(Object.create(ChainService.prototype),{config:{treasury:'treasury.near'},snapshot:async id=>{assert.equal(id,offerId);return s;},treasurySigner:async()=>({}),call:async plan=>{sent=plan;return {phase:'confirmed'};}});
 await service.release({contractId:offerId,creditorId:payer,id:'claim'});assert.equal(sent.receiverId,'hub.near');assert.equal(sent.args.offer_id,offerId);assert.equal(sent.args.account_id,payer);assert.equal(sent.deposit,undefined);assert.equal(sent.gas,'100000000000000');
});

test('EVM NFT transfer is signed by its actual owner and never moves financial claims',async()=>{
 const store=new Store(),s=snapshot();s.rights.bidding_closed=true;s.state.nft_minted=true;const recipient='0x'+'22'.repeat(20);
 try{const plan=await hubIntentPlan({store,reads:{},snapshot:s,wallet:buyer,input:{kind:'transfer',receiverId:recipient},now}),msg=JSON.parse(plan.payload.intents[0].msg);validateIntentPlan(plan,{now});assert.equal(msg.action,'transfer_placement');assert.equal(msg.offer_id,offerId);assert.equal(msg.receiver_id,recipient);assert.equal(plan.context.action,'transfer');assert.equal(plan.payload.intents[0].tokens,undefined);
 }finally{store.close();}
});

test('publication checks whole-sale sponsor capacity and preserves existing reviews after the pool is consumed',async()=>{
 const store=new Store(),config={hub:{accountId:'hub.near',codeHash:'hub-code'},assets:{nearUsdc:'usdc.near',intentsId:'intents.near'}},reserve='600000000000000000000000';
 const c={ft_contract_id:'usdc.near',intents_contract_id:'intents.near',arbiter_id:'arbiter.near',offer_storage_deposit:reserve,sponsor_available:reserve,sponsored_offer_limit:'8',sponsored_offers:'0',sponsored_per_owner_limit:'8'};
 const reads={block:async()=>({}),account:async()=>({code_hash:'hub-code'}),view:async(_id,method)=>method==='get_sponsor_usage'?'0':c},terms=[{spot_id:'door',review_end_ns:ns(100000)},{spot_id:'roof',review_end_ns:ns(100000)}];
 store.insert('sale','evm',buyer,{spots:[{id:'door',priceCents:'1'},{id:'roof',priceCents:'2'}],arbiterId:'arbiter.near'});
 const service=new HubPublication({store,config,reads,marketplace:{publication:()=>({terms})},now:()=>now});
 try{await assert.rejects(service.prepare(buyer,'evm'),{code:'SPONSOR_UNAVAILABLE'});assert.equal(store.list('publication-plan').length,0);c.sponsor_available=String(BigInt(reserve)*2n);const ready=await service.prepare(buyer,'evm');assert.equal(ready.plans.length,2);c.sponsor_available='0';assert.deepEqual((await service.prepare(buyer,'evm')).plans.map(p=>p.id),ready.plans.map(p=>p.id));
 }finally{store.close();}
});

test('empty listings can be cancelled by their owner but never after receiving customer money',async()=>{
 const store=new Store(),s=snapshot();s.state.total_received='0';
 try{const plan=await hubNativePlan({store,reads:{},snapshot:s,wallet:'seller.near',input:{kind:'cancel-empty'},now});assert.equal(plan.transaction.actions[0].params.methodName,'cancel_empty_offer');assert.equal(plan.transaction.actions[0].params.deposit,'0');
 await assert.rejects(hubNativePlan({store,reads:{},snapshot:s,wallet:'attacker.near',input:{kind:'cancel-empty'},now}),{code:'CANCELLATION_FORBIDDEN'});s.state.total_received='10000';s.state.round='1';await assert.rejects(hubNativePlan({store,reads:{},snapshot:s,wallet:'seller.near',input:{kind:'cancel-empty'},now}),{code:'CAMPAIGN_BOOKED'});
 }finally{store.close();}
});

test('an expired unopened publication can refresh, while any original relayed or unknown signature stays locked',async()=>{
 const store=new Store(),config={hub:{accountId:'hub.near',codeHash:'hub-code'},assets:{nearUsdc:'usdc.near',intentsId:'intents.near'}};let clock=now;
 const c={ft_contract_id:'usdc.near',intents_contract_id:'intents.near',arbiter_id:'arbiter.near',offer_storage_deposit:'600000000000000000000000',sponsor_available:'1200000000000000000000000'};
 const reads={block:async()=>({}),account:async()=>({code_hash:'hub-code'}),view:async()=>c};store.insert('sale','evm',buyer,{spots:[{id:'door',priceCents:'1'}],arbiterId:'arbiter.near'});
 const service=new HubPublication({store,config,reads,marketplace:{publication:()=>({terms:[{spot_id:'door',review_end_ns:ns(100000)}]})},now:()=>clock});
 try{const original=(await service.prepare(buyer,'evm')).plans[0];clock+=121000;const refreshed=(await service.prepare(buyer,'evm')).plans[0];assert.equal(refreshed.id,original.id);assert.notEqual(refreshed.plan.intentPlanId,original.plan.intentPlanId);assert.equal(store.get('intent',original.plan.intentPlanId).status,'expired');assert.equal(store.list('intent',buyer).length,2);
 store.insert('wallet-request','unknown',buyer,{planId:refreshed.plan.intentPlanId,dispatched:true,status:'authorizing'});clock+=121000;await assert.rejects(service.prepare(buyer,'evm'),{code:'PUBLICATION_RECONCILIATION_REQUIRED'});assert.equal(store.list('intent',buyer).length,2);
 const request=store.get('wallet-request','unknown');store.update('wallet-request',request.id,buyer,request.version,{...request,status:'rejected'});const ready=(await service.prepare(buyer,'evm')).plans[0];const intent=store.get('intent',ready.plan.intentPlanId);store.update('intent',intent.id,buyer,intent.version,{...intent,operationId:'original-relay'});clock+=121000;await assert.rejects(service.prepare(buyer,'evm'),{code:'PUBLICATION_RECONCILIATION_REQUIRED'});
 }finally{store.close();}
});

test('a native owner can publish with an independent EVM arbiter, whose decisions require its own verified signature',async()=>{
 const store=new Store(),admin='0x'+'44'.repeat(20),owner='magentooo.near',chain={config:{hub:{accountId:'hub.near'}}},app=new Marketplace({store,chain,now:()=>now});
 try{const asset=app.createAsset(owner,{title:'Synthetic vehicle',description:'Rear panel',assetType:'car',city:'Bucharest',spots:[{name:'Rear panel',side:'rear',box:{x:.2,y:.3,width:.5,height:.2},suggestedPriceCents:'1',confidence:'low'}]});
 const schedule=Object.fromEntries(['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map((key,index)=>[key,new Date(now+(index+1)*600000).toISOString()]));
 const sale=app.createSale(owner,{assetId:asset.id,title:'A real listing',schedule,spots:[{id:asset.spots[0].id,priceCents:'1'}],takeoverDefault:true,arbiterId:admin,rules:'Owner prints and installs approved artwork.'});assert.equal(sale.owner,owner);assert.equal(sale.arbiterId,admin);
 const s=snapshot();s.state.arbiter_id=admin;s.rights.bidding_closed=true;const decision=await hubIntentPlan({store,reads:{},snapshot:s,wallet:admin,input:{kind:'finalize-failure'},now});validateIntentPlan(decision,{now});assert.equal(JSON.parse(decision.payload.intents[0].msg).action,'finalize_failure');assert.equal(decision.signerId,admin);await assert.rejects(hubIntentPlan({store,reads:{},snapshot:s,wallet:buyer,input:{kind:'finalize-failure'},now}),{code:'ARBITER_REQUIRED'});
 }finally{store.close();}
});

test('creative-control transfers bind the acknowledged controller and revision, with deadline-bounded EVM or native plans',async()=>{
 const store=new Store(),s=snapshot(),recipient='receiver.near',input={kind:'transfer',purpose:'creative-control',controlAcknowledged:true,expectedController:buyer,expectedRevision:'2',receiverId:recipient},accounts=[];
 Object.assign(s.state,{nft_minted:true,cutoff_ns:ns(-1000),holder:{account_id:'payer.near'}});Object.assign(s.rights,{active:true,bidding_closed:true,revision:'2'});s.campaign.terms.artwork_due_ns=ns(60000);const finance=JSON.stringify(s.state),reads={account:async id=>accounts.push(id)};
 try{
  const evm=await hubIntentPlan({store,reads,snapshot:s,wallet:buyer,input,now});validateIntentPlan(evm,{now});const call=evm.payload.intents[0],msg=JSON.parse(call.msg);
  assert.equal(evm.context.purpose,'creative-control');assert.equal(evm.context.expectedController,buyer);assert.equal(evm.context.expectedRevision,'2');assert.equal(evm.context.controlAcknowledged,true);assert.equal(evm.context.artworkDueNs,ns(60000));assert.equal(evm.expiresAt,new Date(now+55000).toISOString());assert.equal(msg.action,'transfer_placement');assert.equal(msg.receiver_id,recipient);assert.equal(msg.offer_id,offerId);assert.equal(call.tokens,undefined);assert.deepEqual(accounts,[recipient]);assert.equal(JSON.stringify(s.state),finance);
  s.rights.current_owner_id='native.near';const native=await hubNativePlan({store,reads,snapshot:s,wallet:'native.near',input:{...input,expectedController:'native.near',receiverId:buyer},now});assert.equal(native.purpose,'creative-control');assert.equal(native.expiresAt,evm.expiresAt);assert.equal(native.transaction.receiverId,'hub.near');assert.equal(native.transaction.actions[0].params.methodName,'nft_transfer');assert.equal(native.transaction.actions[0].params.deposit,'1');assert.equal(native.transaction.actions[0].params.args.receiver_id,buyer);assert.deepEqual(accounts,[recipient]);
  await assert.rejects(hubIntentPlan({store,reads,snapshot:s,wallet:buyer,input,now}),{code:'NFT_OWNER_REQUIRED'});
  store.insert('media','new-art','native.near',{status:'verified',uri:'ipfs://new-art',sha256:'22'.repeat(32)});const artwork=await hubNativePlan({store,reads,snapshot:s,wallet:'native.near',input:{kind:'artwork',mediaId:'new-art'},now});assert.equal(artwork.transaction.actions[0].params.methodName,'submit_artwork');assert.equal(JSON.stringify(s.state),finance);
 }finally{store.close();}
});

test('creative-control policy rejects stale/closed transfers while standard archival NFT transfers remain valid',async()=>{
 const {assertCreativeTransfer}=await import('../src/hub-actions.mjs'),store=new Store(),s=snapshot(),input={kind:'transfer',purpose:'creative-control',controlAcknowledged:true,expectedController:buyer,expectedRevision:'0',receiverId:'0x'+'22'.repeat(20)};
 Object.assign(s.state,{nft_minted:true,cutoff_ns:ns(-1000)});Object.assign(s.rights,{active:true,bidding_closed:true});s.campaign.terms.artwork_due_ns=ns(60000);
 try{
  assertCreativeTransfer(s,buyer,input,now);
  for(const bad of [{...input,controlAcknowledged:false},{...input,controlAcknowledged:undefined}])assert.throws(()=>assertCreativeTransfer(s,buyer,bad,now),{code:'TRANSFER_ACKNOWLEDGEMENT_REQUIRED'});
  assert.throws(()=>assertCreativeTransfer(s,buyer,{...input,expectedController:'other.near'},now),{code:'NFT_OWNER_REQUIRED'});assert.throws(()=>assertCreativeTransfer(s,buyer,{...input,expectedRevision:'old'},now),{code:'STALE_ARTWORK'});
  for(const change of [s=>s.state.nft_minted=false,s=>s.state.outcome='success',s=>s.state.outcome='failure',s=>s.state.artwork_locked=true,s=>s.rights.locked=true,s=>s.rights.active=false,s=>s.rights.bidding_closed=false,s=>s.state.cutoff_ns=ns(1),s=>s.campaign.terms.artwork_due_ns=ns(5000)]){const changed=structuredClone(s);change(changed);assert.throws(()=>assertCreativeTransfer(changed,buyer,input,now),{code:'CREATIVE_TRANSFER_CLOSED'});}
  s.state.outcome='success';s.state.artwork_locked=true;s.rights.locked=true;s.rights.active=false;s.campaign.terms.artwork_due_ns=ns(-1000);
  const archival=await hubIntentPlan({store,reads:{},snapshot:s,wallet:buyer,input:{kind:'transfer',receiverId:input.receiverId},now});assert.equal(JSON.parse(archival.payload.intents[0].msg).action,'transfer_placement');assert.equal(archival.context.purpose,undefined);
 }finally{store.close();}
});
