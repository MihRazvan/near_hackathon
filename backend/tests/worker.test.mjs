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

test('historical bookings reconcile once per contract at a durable minimum one-minute interval',async()=>{
 const store=new Store();let now=1000000;const groups=[];
 for(const [id,contractId] of [['a','first.near'],['b','first.near'],['c','second.near']])store.insert('booking',id,'buyer.near',{contractId,status:'accepted'});
 const args={store,marketplace:{syncBookingGroup:async(contractId,ids)=>groups.push({contractId,ids})},now:()=>now,intervalMs:1000000,bookingIntervalMs:1};let worker=reconciliationWorker(args);
 try{await worker.tick();assert.equal(groups.length,2);assert.deepEqual(groups.find(g=>g.contractId==='first.near').ids,['a','b']);await worker.tick();assert.equal(groups.length,2);worker.stop();worker=reconciliationWorker(args);await worker.tick();assert.equal(groups.length,2);now+=59999;await worker.tick();assert.equal(groups.length,2);now++;await worker.tick();assert.equal(groups.length,4);}finally{worker.stop();store.close();}
});
test('five-group rounds rotate through later contracts and terminal outbid campaigns stop historical polling',async()=>{
 const store=new Store();let now=1000000;const calls=[];
 for(let i=0;i<12;i++)store.insert('booking','booking-'+i,'buyer.near',{contractId:'offer-'+String(i).padStart(2,'0'),status:'outbid',...(i===11?{statusOutcome:'success'}:{})});
 const worker=reconciliationWorker({store,marketplace:{syncBookingGroup:async id=>calls.push(id)},now:()=>now,intervalMs:1000000,bookingBatchSize:20});
 try{await worker.tick();assert.equal(calls.length,5);await worker.tick();assert.equal(calls.length,10);await worker.tick();assert.equal(calls.length,11);assert.equal(new Set(calls).size,11);assert.equal(calls.includes('offer-11'),false);now+=60000;await worker.tick();assert.equal(calls.length,16);}finally{worker.stop();store.close();}
});
test('read failures back off persistently instead of retrying every worker tick',async()=>{
 const store=new Store();let now=1000000,calls=0,fail=true;store.insert('booking','booking','buyer.near',{contractId:'offer',status:'accepted'});
 const args={store,marketplace:{syncBookingGroup:async()=>{calls++;if(fail)throw Error('HTTP 429');}},now:()=>now,intervalMs:1000000};let worker=reconciliationWorker(args);
 try{assert.equal((await worker.tick()).unavailable,1);assert.equal(calls,1);now+=60000;await worker.tick();assert.equal(calls,1);worker.stop();worker=reconciliationWorker(args);await worker.tick();assert.equal(calls,1);now+=60000;await worker.tick();assert.equal(calls,2);now+=120000;await worker.tick();assert.equal(calls,2);now+=120000;fail=false;await worker.tick();assert.equal(calls,3);assert.equal(store.get('booking-reconciliation','offer').failures,0);}finally{worker.stop();store.close();}
});
test('original wallet recovery stays prompt and a newly finalized submitted booking bypasses historical cooldown',async()=>{
 const store=new Store(),budget=new Budget(store,Object.fromEntries(['sourceUsdc','baseGas','nearFees','nearAllocation','nearAllocationGross'].map(k=>[k,'1'])));let now=1000000;const order=[];
 store.insert('booking','old','buyer.near',{contractId:'offer',status:'accepted'});
 const marketplace={syncBookingGroup:async(contractId,ids)=>{order.push('group:'+ids.join(','));for(const id of ids){const row=store.get('booking',id);if(row.status==='submitted')store.update('booking',id,row.owner,row.version,{...row,status:'accepted'});}}};
 const worker=reconciliationWorker({store,marketplace,now:()=>now,intervalMs:1000000,nativeActions:{confirm:async()=>order.push('native')},walletRequests:{reconcile:async()=>order.push('wallet')}});
 try{await worker.tick();assert.equal(order.length,1);budget.reserve({id:'original-purchase',kind:'near',scope:'relayer.near',plan:{},amounts:{}});store.transition('original-purchase',['reserved'],'confirmed');store.insert('booking','new','buyer.near',{contractId:'offer',status:'submitted',operationId:'original-purchase'});store.insert('native-plan','native','buyer.near',{status:'submitted',transactionHash:'hash'});store.insert('wallet-request','request','buyer.near',{status:'submitted'});now+=10000;
 await worker.tick();assert.deepEqual(order.slice(1,3),['native','wallet']);assert.match(order[3],/^group:/);assert.ok(order[3].includes('new'));assert.ok(order[3].includes('old'));await worker.tick();assert.deepEqual(order.slice(4),['native','wallet']);
 }finally{worker.stop();store.close();}
});
test('two worker instances cannot read the same contract group concurrently or repeat a just-completed group',async()=>{
 const store=new Store();let calls=0,release;const pending=new Promise(resolve=>release=resolve);store.insert('booking','accepted','buyer.near',{contractId:'offer',status:'accepted'});
 const args={store,marketplace:{syncBookingGroup:async()=>{calls++;await pending;}},now:()=>1000000,intervalMs:1000000},first=reconciliationWorker(args),second=reconciliationWorker(args);
 try{const running=first.tick();await Promise.resolve();await Promise.resolve();await second.tick();assert.equal(calls,1);release();await running;await second.tick();assert.equal(calls,1);}finally{release();first.stop();second.stop();store.close();}
});
