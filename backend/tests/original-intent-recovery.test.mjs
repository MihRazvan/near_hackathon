import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {Budget} from '../src/budget.mjs';
import {WalletRequests} from '../src/wallet-requests.mjs';
import {intentPlan} from '../src/intents.mjs';
import {sha256} from '../src/core.mjs';
const actor='0x'+'11'.repeat(20);
function fixture(){
 const store=new Store();let now=Date.now(),relays=0;
 const plan=intentPlan({signerId:actor,verifier:'intents.near',now,intents:[{intent:'transfer',receiver_id:'spot.near',tokens:{'nep141:usdc.near':'10000'}}],context:{kind:'purchase',amount:'10000',contractId:'spot.near'}});
 const chain={store,relay:async()=>{relays++;throw Object.assign(new Error('HTTP 429'),{code:'RPC_UNAVAILABLE'});}},service=new WalletRequests({store,chain,now:()=>now});
 store.insert('intent',plan.planId,actor,{plan,status:'prepared'});store.insert('booking','booking',actor,{planId:plan.planId,status:'prepared',amount:'10000'});
 return {store,chain,service,plan,relays:()=>relays,setNow:value=>now=value,fail:async()=>{const request=service.begin(actor,{kind:'intent',planId:plan.planId});service.dispatch(actor,request.id);await assert.rejects(service.submitIntent(actor,request.id,'original-wallet-signature'),{code:'RPC_UNAVAILABLE'});return service.owned(actor,request.id);}};
}
test('a proven prebroadcast read failure retries only the exact unexpired original plan and restores its booking',async()=>{
 const f=fixture();try{const failed=await f.fail(),before=structuredClone(f.store.get('intent',f.plan.planId).plan);assert.equal(failed.status,'failed');assert.equal(f.store.get('booking','booking').status,'failed');assert.equal(f.service.list(actor)[0].canRetryOriginal,true);
 const result=await f.service.resumeIntent(actor,failed.id);assert.equal(result.status,'rejected');assert.equal(result.planId,before.planId);assert.equal(result.originalNonce,before.payload.nonce);assert.equal(result.originalMessageHash,sha256(before.message));assert.equal(f.store.get('booking','booking').status,'prepared');assert.deepEqual(f.store.get('intent',before.planId).plan,before);
 const retry=await f.service.prepare(actor,{kind:'intent',planId:before.planId});assert.notEqual(retry.id,failed.id);assert.equal(retry.planId,failed.planId);assert.equal(retry.dispatchAllowed,true);assert.equal(f.relays(),1,'resuming a request must not relay or sign anything');assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM operations').get().n,0);
 }finally{f.store.close();}
});
test('expired original plans remain failed and cannot generate a replacement nonce',async()=>{
 const f=fixture();try{const failed=await f.fail();f.setNow(Date.parse(f.plan.expiresAt));assert.equal(f.service.list(actor)[0].canRetryOriginal,false);await assert.rejects(f.service.resumeIntent(actor,failed.id),{code:'ORIGINAL_INTENT_NOT_RETRYABLE'});assert.equal(f.service.owned(actor,failed.id).status,'failed');assert.equal(f.store.get('booking','booking').status,'failed');assert.equal(f.store.list('intent').length,1);assert.equal(f.store.get('intent',f.plan.planId).plan.payload.nonce,f.plan.payload.nonce);}finally{f.store.close();}
});
test('broadcast evidence, any original operation, active dispatch lease or conflicting request all forbid retry',async()=>{
 for(const blocker of ['hash','signed','operation','intent-operation','lease','conflict','accepted-booking','booking-hash']){
  const f=fixture();try{const failed=await f.fail();
   if(blocker==='hash'||blocker==='signed'){const r=f.service.owned(actor,failed.id);f.store.update('wallet-request',r.id,actor,r.version,{...r,...(blocker==='hash'?{transactionHash:'1'.repeat(44)}:{signedTransaction:'private-signed-bytes'})});}
   if(blocker==='operation'){const budget=new Budget(f.store,Object.fromEntries(['sourceUsdc','baseGas','nearFees','nearAllocation','nearAllocationGross'].map(k=>[k,'1'])));budget.reserve({id:'relay-'+f.plan.planId,kind:'near',scope:'relayer.near',plan:{},amounts:{}});}
   if(blocker==='intent-operation'){const i=f.store.get('intent',f.plan.planId);f.store.update('intent',i.id,actor,i.version,{...i,operationId:'original-operation'});}
   if(blocker==='lease')f.store.insert('intent-dispatch',f.plan.planId,actor,{pid:process.pid});
   if(blocker==='conflict')f.store.insert('wallet-request','newer',actor,{kind:'intent',planId:f.plan.planId,status:'authorizing',dispatched:true});
   if(blocker==='accepted-booking'||blocker==='booking-hash'){const b=f.store.get('booking','booking');f.store.update('booking',b.id,actor,b.version,{...b,...(blocker==='accepted-booking'?{accepted:true}:{transactionHash:'original-hash'})});}
   assert.equal(f.service.list(actor).find(r=>r.id===failed.id).canRetryOriginal,false,blocker);await assert.rejects(f.service.resumeIntent(actor,failed.id),{code:'ORIGINAL_INTENT_NOT_RETRYABLE'});assert.equal(f.store.get('booking','booking').status,'failed');
  }finally{f.store.close();}
 }
});
test('different wallets, other failures and mutated original messages cannot recover a failed payment',async()=>{
 const f=fixture();try{const failed=await f.fail();await assert.rejects(f.service.resumeIntent('other.near',failed.id),{code:'NOT_FOUND'});let r=f.service.owned(actor,failed.id);f.store.update('wallet-request',r.id,actor,r.version,{...r,errorCode:'PRICE_CHANGED'});assert.equal(f.service.list(actor)[0].canRetryOriginal,false);await assert.rejects(f.service.resumeIntent(actor,failed.id),{code:'ORIGINAL_INTENT_NOT_RETRYABLE'});
 r=f.service.owned(actor,failed.id);f.store.update('wallet-request',r.id,actor,r.version,{...r,errorCode:'RPC_UNAVAILABLE'});const i=f.store.get('intent',f.plan.planId);f.store.update('intent',i.id,actor,i.version,{...i,plan:{...i.plan,message:i.plan.message+' '}});assert.equal(f.service.list(actor)[0].canRetryOriginal,false);await assert.rejects(f.service.resumeIntent(actor,failed.id),{code:'ORIGINAL_INTENT_NOT_RETRYABLE'});
 }finally{f.store.close();}
});
