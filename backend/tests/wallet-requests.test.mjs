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
  assert.equal(service.begin(a,{kind:'native',planId:'one'}).id,r.id);
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
