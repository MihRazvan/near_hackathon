import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { Budget } from '../src/budget.mjs';
import { reconciliationWorker } from '../src/worker.mjs';

test('restart reconciliation only reads existing hashes, never dispatches, and overlapping ticks do not duplicate work',async()=>{
 const store=new Store(),budget=new Budget(store,{sourceUsdc:'1',baseGas:'1',nearFees:'1',nearAllocation:'1',nearAllocationGross:'1'});
 for(const [id,kind] of [['near-op','near'],['base-op','base-fund']]){budget.reserve({id,kind,scope:'wallet',plan:{},amounts:{}});store.transition(id,['reserved'],'broadcast',{transactionHash:id+'-hash'});}
 let release;const pending=new Promise(resolve=>release=resolve);let queries=0,syncs=0,confirms=0;
 const worker=reconciliationWorker({store,near:{reconcile:async id=>{queries++;await pending;store.transition(id,['broadcast'],'confirmed');},execute:()=>assert.fail('must not send')},
  source:{reconcile:async id=>{queries++;store.transition(id,['broadcast'],'confirmed');},fund:()=>assert.fail('must not fund')},
  marketplace:{syncBooking:async()=>syncs++},nativeActions:{confirm:async()=>confirms++},intervalMs:1000000});
 store.insert('booking','booking','wallet',{status:'submitted'});store.insert('native-plan','native','wallet',{status:'submitted',transactionHash:'native-hash'});
 try{const first=worker.tick();assert.equal(worker.isRunning(),true);assert.equal(await worker.tick(),undefined);release();assert.deepEqual(await first,{checked:2,unavailable:0});
  assert.equal(queries,2);assert.equal(syncs,1);assert.equal(confirms,1);await worker.tick();assert.equal(queries,2);worker.stop();assert.equal(await worker.tick(),undefined);
 }finally{worker.stop();store.close();}
});
test('submitted wallet journals reconcile after a final transaction without sending another request',async()=>{
 const store=new Store();let reads=0;store.insert('wallet-request','submitted','owner.near',{status:'submitted'});store.insert('wallet-request','unopened','owner.near',{status:'requested'});
 const worker=reconciliationWorker({store,marketplace:{},nativeActions:{},near:{execute:()=>assert.fail('no sends')},walletRequests:{reconcile:async(owner,id)=>{assert.equal(id,'submitted');reads++;const r=store.get('wallet-request',id);store.update('wallet-request',id,owner,r.version,{...r,status:'confirmed'});}},intervalMs:1000000});
 try{await worker.tick();await worker.tick();assert.equal(reads,1);assert.equal(store.get('wallet-request','submitted').status,'confirmed');assert.equal(store.get('wallet-request','unopened').status,'requested');}finally{worker.stop();store.close();}
});
