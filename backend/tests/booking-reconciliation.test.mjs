import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {Budget} from '../src/budget.mjs';
import {Marketplace} from '../src/marketplace.mjs';
import {ChainService} from '../src/chain-service.mjs';
import {purchasePlan} from '../src/intents.mjs';
const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20),seller='owner.near';
function fixture(){
 const store=new Store(),budget=new Budget(store,Object.fromEntries(['sourceUsdc','baseGas','nearFees','nearAllocation','nearAllocationGross'].map(k=>[k,'1']))),snapshots=new Map(),reads=[];
 const chain={snapshot:async(id,wallets=[])=>{reads.push({id,wallets});return structuredClone(snapshots.get(id));},purchaseAccepted:ChainService.prototype.purchaseAccepted},app=new Marketplace({store,chain});
 function snapshot(contract='spot.near',round='2',holder=b,height=10,outcome='open'){
  return {qualified:true,accountId:contract,codeHash:'pinned-code',blockHeight:height,blockHash:'block-'+height,observedAt:new Date().toISOString(),state:{seller_id:seller,round,next_price:'10000',outcome,holder:{account_id:holder,principal:'10000'},intents_contract_id:'intents.near',intents_token_id:'nep141:usdc.near'},campaign:{terms:{sale_id:'sale-'+contract,spot_id:'spot',bidding_close_ns:String(BigInt(Date.now()+3600000)*1000000n),published_terms_sha256:'terms-'+contract,takeover_enabled:true}}};
 }
 function booking(id,{contract='spot.near',owner=a,round='0',status='accepted',accepted=true,native=false}={}){
  const s=snapshot(contract,round,owner),plan=purchasePlan({snapshot:{...s,state:{...s.state,holder:null}},buyerId:owner,invoiceId:'invoice-'+id,asset:'nep141:usdc.near'});store.insert('intent',plan.planId,owner,{plan});
  const operationId='relay-'+plan.planId,event={standard:'pitboard',version:'1.0.0',event:'purchase_accepted',data:[{invoice_id:plan.context.invoiceId,buyer_id:owner,amount:plan.context.amount,round:String(BigInt(round)+1n)}]};
  if(!native){budget.reserve({id:operationId,kind:'near',scope:'relayer.near',plan:{},amounts:{}});store.transition(operationId,['reserved'],'confirmed',{result:{outcome:{receipts_outcome:[{outcome:{executor_id:contract,logs:['EVENT_JSON:'+JSON.stringify(event)]}}]}}});}
  const nativePlanId='native-'+id,transactionHash='native-hash-'+id;
  if(native)store.insert('native-plan',nativePlanId,owner,{status:'confirmed',transactionHash,plan:{kind:'purchase',bookingId:id,purchasePlanId:plan.planId}});
  return store.insert('booking',id,owner,{contractId:contract,campaignId:'campaign',saleId:'sale-'+contract,spotId:'spot',sellerId:seller,invoiceId:plan.context.invoiceId,planId:plan.planId,amount:plan.context.amount,status,accepted,...(native?{nativePlanId,transactionHash}:{operationId})});
 }
 return {store,chain,app,reads,snapshots,snapshot,booking};
}
test('all accepted bids for one contract share one qualified wallet-free snapshot and keep independent receipt acceptance',async()=>{
 const f=fixture();try{f.booking('a');f.booking('b',{owner:b,round:'1'});f.snapshots.set('spot.near',f.snapshot());
 const result=await f.app.syncBookingGroup('spot.near',['a','b']);assert.deepEqual(f.reads,[{id:'spot.near',wallets:[]}]);assert.equal(result.snapshotUsed,true);assert.equal(f.store.get('booking','a').status,'outbid');assert.equal(f.store.get('booking','b').status,'accepted');assert.equal(f.store.get('booking','a').accepted,true);
 await f.app.syncBookingGroup('spot.near',['a','b']);assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='booking_status'").get().n,1);
 }finally{f.store.close();}
});
test('shared status snapshots cannot cross contract, code, terms, party or accepted-round boundaries',async()=>{
 for(const mutate of [s=>s.accountId='other.near',s=>s.qualified=false,s=>s.codeHash='different',s=>s.campaign.terms.published_terms_sha256='changed',s=>s.state.seller_id='other.near',s=>s.state.round='0']){
  const f=fixture();try{f.booking('a');const snap=f.snapshot();mutate(snap);f.snapshots.set('spot.near',snap);await assert.rejects(f.app.syncBookingGroup('spot.near',['a']));assert.equal(f.store.get('booking','a').status,'accepted');}finally{f.store.close();}
 }
 const f=fixture();try{f.booking('a');f.booking('other',{contract:'other.near'});await assert.rejects(f.app.syncBookingGroup('spot.near',['a','other']),{code:'BOOKING_CHANGED'});assert.equal(f.reads.length,0);}finally{f.store.close();}
});
test('a later purchase by the same wallet never revives an earlier displaced booking',async()=>{
 const f=fixture();try{f.booking('first');f.booking('latest',{round:'2'});f.snapshots.set('spot.near',f.snapshot('spot.near','3',a,12,'success'));await f.app.syncBookingGroup('spot.near',['first','latest']);assert.equal(f.store.get('booking','first').status,'outbid');assert.equal(f.store.get('booking','first').statusOutcome,'success');assert.equal(f.store.get('booking','latest').status,'completed');}finally{f.store.close();}
});
test('newer booking fields and newer finalized observations survive an older concurrent read',async()=>{
 const f=fixture();try{f.booking('a');let resolveOld;const old=new Promise(resolve=>resolveOld=resolve);f.chain.snapshot=async()=>old;const pending=f.app.syncBookingGroup('spot.near',['a']);
 const before=f.store.get('booking','a');f.store.update('booking','a',a,before.version,{...before,customNote:'newer user field'});
 f.chain.snapshot=async()=>f.snapshot('spot.near','2',b,12);await f.app.syncBookingGroup('spot.near',['a']);resolveOld(f.snapshot('spot.near','1',a,11));await pending;
 const current=f.store.get('booking','a');assert.equal(current.status,'outbid');assert.equal(current.statusBlockHeight,12);assert.equal(current.customNote,'newer user field');assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='booking_status'").get().n,1);
 }finally{f.store.close();}
});
test('parallel status updates emit one transition and reject contradictory states at the same finalized height',async()=>{
 const f=fixture();try{f.booking('a');f.chain.snapshot=async()=>f.snapshot();await Promise.all([f.app.syncBookingGroup('spot.near',['a']),f.app.syncBookingGroup('spot.near',['a'])]);assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='booking_status'").get().n,1);
 f.chain.snapshot=async()=>({...f.snapshot(),blockHash:'conflicting-final-hash'});await assert.rejects(f.app.syncBookingGroup('spot.near',['a']),{code:'SNAPSHOT_CHANGED'});
 }finally{f.store.close();}
});
test('already verified native wallet bookings share the same status-only batch without another transaction query',async()=>{
 const f=fixture();try{f.booking('native',{owner:'buyer.near',native:true});f.snapshots.set('spot.near',f.snapshot('spot.near','1','buyer.near',10,'success'));await f.app.syncBookingGroup('spot.near',['native']);assert.equal(f.store.get('booking','native').status,'completed');assert.equal(f.reads.length,1);assert.equal(f.reads[0].wallets.length,0);}finally{f.store.close();}
});
