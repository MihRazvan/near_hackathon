import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { KeyPair, KeyPairSigner, SignedTransaction, baseEncode } from 'near-api-js';
import { Store } from '../src/store.mjs';
import { Budget } from '../src/budget.mjs';
import { NearExecutor } from '../src/near-executor.mjs';
const near=n=>String(BigInt(n)*10n**24n),zero='11111111111111111111111111111111';
function setup(){
 const store=new Store(),budget=new Budget(store,{sourceUsdc:'1000000',baseGas:'100000000000000',nearFees:'150000000000000000000000',nearAllocation:near(7),nearAllocationGross:near(16)});
 const signer=new KeyPairSigner(KeyPair.fromRandom('ed25519'));
 let calls=0,unknown=false,final;
 const reads={status:async()=>({chain_id:'mainnet'}),block:async()=>({header:{hash:baseEncode(Buffer.alloc(32,1)),height:1}}),
  key:async()=>({permission:'FullAccess',nonce:3}),account:async()=>({amount:near(20),storage_usage:100,code_hash:zero}),
  rpc:{call:async(method,args)=>{
   if(method==='EXPERIMENTAL_protocol_config')return {runtime_config:{storage_amount_per_byte:'10000000000000000000'}};
   if(method==='gas_price')return {gas_price:'100000000'};
   if(method==='tx')return final;
   assert.equal(method,'send_tx');calls++;
   const signed=SignedTransaction.decode(Buffer.from(args.signed_tx_base64,'base64')),tx=signed.transaction;
   const status={SuccessValue:''};
   final={final_execution_status:'FINAL',transaction:{hash:baseEncode(createHash('sha256').update(tx.encode()).digest()),signer_id:tx.signerId,receiver_id:tx.receiverId},
    status,transaction_outcome:{outcome:{status,tokens_burnt:'100'}},receipts_outcome:[{outcome:{status,tokens_burnt:'200'}}]};
   if(unknown)throw Error('timeout');return final;
  }}};
 const config={enabled:true,network:'mainnet',treasury:'treasury.near',treasuryFloor:near(12)};
 const executor=new NearExecutor({store,budget,reads,config});
 const plan={network:'mainnet',signerId:'treasury.near',receiverId:'dedicated.near',allocationAccount:'dedicated.near',actions:[{type:'transfer',amount:near(7)}]};
 return {store,budget,signer,reads,config,executor,plan,calls:()=>calls,unknown:()=>unknown=true,final:()=>final};
}
test('SDK7 transaction encoding is durably bound before broadcast; matching final receipts settle gas and allocations once',async()=>{
 const s=setup();try{
  const op=await s.executor.execute({id:'fund',plan:s.plan,signer:s.signer});assert.equal(op.phase,'confirmed');assert.equal(s.calls(),1);
  assert.equal(s.budget.totals().nearFees,'300');assert.equal(s.budget.totals().nearAllocation,near(7));
  await s.executor.execute({id:'fund',plan:s.plan,signer:s.signer});assert.equal(s.calls(),1);
  await assert.rejects(s.executor.execute({id:'fund',plan:{...s.plan,receiverId:'changed.near'},signer:s.signer}),/committed plan/);
 }finally{s.store.close();}
});
test('timeout preserves signed hash and signer lock; reconciliation never sends a second transfer',async()=>{
 const s=setup();s.unknown();try{
  const op=await s.executor.execute({id:'fund',plan:s.plan,signer:s.signer});assert.equal(op.phase,'broadcast-unknown');
  assert.ok(op.transaction_hash);assert.ok(op.result.signedTransaction);assert.equal(s.budget.totals().nearFees,'60000000000000000000000');
  await assert.rejects(s.executor.execute({id:'another',plan:s.plan,signer:s.signer}),/requires reconciliation/);
  const bad=structuredClone(s.final());bad.transaction.hash='other';assert.throws(()=>s.executor.finish('fund',bad),/does not match/);
  assert.equal(s.budget.totals().nearAllocation,near(7));assert.equal((await s.executor.reconcile('fund')).phase,'confirmed');assert.equal(s.calls(),1);
 }finally{s.store.close();}
});
test('no broadcast happens when disabled, crossing recovery floor, exceeding total budget or targeting changed code',async()=>{
 for(const change of [s=>s.config.enabled=false,s=>s.config.treasuryFloor=near(14),s=>s.budget.limits.nearAllocation=near(6),s=>s.plan.expectedReceiverCodeHash='different']){
  const s=setup();try{change(s);await assert.rejects(s.executor.execute({id:'fund',plan:s.plan,signer:s.signer}));assert.equal(s.calls(),0);}finally{s.store.close();}
 }
});
test('asynchronous failure remains failed and never releases possibly moved native allocations',async()=>{
 const s=setup();s.unknown();try{
  await s.executor.execute({id:'fund',plan:s.plan,signer:s.signer});s.final().receipts_outcome[0].outcome.status={Failure:{ActionError:{}}};
  assert.equal((await s.executor.reconcile('fund')).phase,'failed');assert.equal(s.budget.totals().nearAllocation,near(7));
 }finally{s.store.close();}
});
