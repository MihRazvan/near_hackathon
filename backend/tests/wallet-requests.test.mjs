import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { WalletRequests } from '../src/wallet-requests.mjs';

test('wallet requests survive switching and unknown outcomes; only an explicit pre-send rejection permits a fresh request',async()=>{
 const store=new Store(),a='seller.near',b='other.near';let calls=0;
 const service=new WalletRequests({store,nativeActions:{confirm:async()=>{calls++;return {status:'confirmed'};}}});
 store.insert('native-plan','one',a,{status:'prepared'});store.insert('native-plan','two',a,{status:'prepared'});
 try{
  const r=service.begin(a,{kind:'native',planId:'one'});
  assert.equal(r.dispatchAllowed,true);const duplicate=service.begin(a,{kind:'native',planId:'one'});
  assert.equal(duplicate.id,r.id);assert.equal(duplicate.dispatchAllowed,false);
  assert.throws(()=>service.begin(a,{kind:'native',planId:'two'}),{code:'WALLET_REQUEST_PENDING'});
  await assert.rejects(service.reconcile(b,r.id),{code:'NOT_FOUND'});
  assert.equal((await service.reconcile(a,r.id)).status,'requested');assert.equal(calls,0);
  assert.throws(()=>service.reject(a,r.id,{code:'TIMEOUT'}),{code:'UNKNOWN_WALLET_RESULT'});
  service.reject(a,r.id,{code:4001});const retry=service.begin(a,{kind:'native',planId:'one'});assert.notEqual(retry.id,r.id);
  const hash='1'.repeat(32);assert.equal((await service.reconcile(a,retry.id,hash)).status,'confirmed');assert.equal(calls,1);
  assert.throws(()=>service.reject(a,retry.id,{code:4001}),{code:'ALREADY_SENT'});
  await assert.rejects(service.reconcile(a,retry.id,'2'.repeat(32)),{code:'TRANSACTION_CHANGED'});
  assert.equal(service.begin(a,{kind:'native',planId:'two'}).kind,'native');
 }finally{store.close();}
});

test('durable signed test bytes are never returned by the wallet request API',()=>{
 const store=new Store(),service=new WalletRequests({store});try{
  store.insert('wallet-request','test','seller.near',{kind:'native',planId:'p',status:'submitted',signedTransaction:'private-bytes'});
  assert.equal('signedTransaction' in service.list('seller.near')[0],false);
 }finally{store.close();}
});
test('preparing a later request reconciles final prior actions but never clears an unknown request',async()=>{
 const store=new Store(),actor='seller.near',service=new WalletRequests({store,nativeActions:{confirm:async()=>({status:'confirmed'})}});
 try{
  store.insert('native-plan','first',actor,{status:'prepared'});store.insert('native-plan','second',actor,{status:'prepared'});
  const first=service.begin(actor,{kind:'native',planId:'first'});
  await assert.rejects(service.prepare(actor,{kind:'native',planId:'second'}),{code:'WALLET_REQUEST_PENDING'});
  store.update('wallet-request',first.id,actor,1,{kind:'native',planId:'first',status:'submitted',transactionHash:'1'.repeat(32)});
  const second=await service.prepare(actor,{kind:'native',planId:'second'});assert.equal(second.dispatchAllowed,true);assert.equal(service.list(actor).find(r=>r.id===first.id).status,'confirmed');
 }finally{store.close();}
});
test('wallet dispatch is claimed once and a pre-send expiry cannot leave an active request',()=>{
 const store=new Store(),actor='owner.near',now=1800000000000,service=new WalletRequests({store,now:()=>now});
 try{store.insert('native-plan','fresh',actor,{plan:{expiresAt:new Date(now+60000).toISOString()},status:'prepared'});
  const r=service.begin(actor,{kind:'native',planId:'fresh'});assert.equal(service.dispatch(actor,r.id).dispatched,true);assert.throws(()=>service.dispatch(actor,r.id),{code:'WALLET_REQUEST_PENDING'});
  service.reject(actor,r.id,{code:4001});store.insert('native-plan','expired',actor,{plan:{expiresAt:new Date(now-1).toISOString()},status:'prepared'});
  const expired=service.begin(actor,{kind:'native',planId:'expired'});assert.throws(()=>service.dispatch(actor,expired.id),{code:'EXPIRED_PLAN'});assert.equal(service.owned(actor,expired.id).status,'failed');
 }finally{store.close();}
});
test('a signature rejected before broadcast releases its request and marks its booking failed',async()=>{
 const store=new Store(),actor='0x'+'11'.repeat(20);const service=new WalletRequests({store,chain:{store,relay:async()=>{throw Object.assign(new Error('Price changed'),{code:'PRICE_CHANGED'});}}});
 try{store.insert('intent','plan',actor,{plan:{},status:'prepared'});store.insert('booking','b',actor,{planId:'plan',status:'prepared'});
  const request=service.begin(actor,{kind:'intent',planId:'plan'});await assert.rejects(service.submitIntent(actor,request.id,'signature'),{code:'PRICE_CHANGED'});
  assert.equal(service.owned(actor,request.id).status,'failed');assert.equal(store.get('booking','b').status,'failed');
 }finally{store.close();}
});
