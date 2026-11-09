import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeEventTopics, encodeAbiParameters } from 'viem';
import { Store } from '../src/store.mjs';
import { Budget } from '../src/budget.mjs';
import { BrowserFunding } from '../src/browser-funding.mjs';
import { BaseExecutor,USDC_ABI } from '../src/base-executor.mjs';
import { routeRequest } from '../src/oneclick.mjs';
import { hashObject } from '../src/core.mjs';
import { MAINNET } from '../src/config.mjs';
const wallet='0x'+'11'.repeat(20),other='0x'+'33'.repeat(20),recipient='0x'+'22'.repeat(20),hash='0x'+'ab'.repeat(32);
function fixture(){
 const store=new Store(),budget=new Budget(store,{sourceUsdc:'1000000',baseGas:'100000000000000',nearFees:'0',nearAllocation:'0',nearAllocationGross:'0'}),now=Date.now();
 const request=routeRequest({direction:'fund',wallet,amount:'250000',dry:false,now}),body={schema:'everywhere-route/v1',direction:'fund',wallet,request,
  response:{quoteRequest:request,quote:{amountIn:'252579',minAmountIn:'250000',amountOut:'250000',minAmountOut:'250000',depositAddress:recipient}},createdAt:new Date(now).toISOString(),expiresAt:new Date(now+120000).toISOString()};
 const plan={...body,planId:hashObject(body)};store.insert('route',plan.planId,wallet,{plan});
 let transaction,receipt,finalized=false;
 const client={getChainId:async()=>8453,readContract:async({functionName})=>functionName==='decimals'?6:1000000n,getBalance:async()=>1000000000000000n,
  estimateFeesPerGas:async()=>({maxFeePerGas:10000000n,maxPriorityFeePerGas:1000000n}),getTransactionCount:async()=>4,estimateGas:async()=>60000n,
  getTransaction:async()=>{if(!transaction)throw Object.assign(new Error('not found'),{name:'TransactionNotFoundError'});return transaction;},
  getTransactionReceipt:async()=>{if(!receipt)throw Object.assign(new Error('not found'),{name:'TransactionReceiptNotFoundError'});return receipt;},
  getBlock:async({blockTag})=>blockTag?{number:finalized?11n:9n}:{hash:'block'}};
 const config={network:'mainnet',enabled:true},source=new BaseExecutor({store,budget,client,config});let hints=0;
 const funding=new BrowserFunding({store,budget,client,config,source,routes:{submit:async()=>{hints++;}}});
 return {store,budget,plan,funding,source,client,hints:()=>hints,land:tx=>{transaction={hash,from:wallet,to:MAINNET.baseUsdc,input:tx.data,value:0n,nonce:Number(BigInt(tx.nonce)),blockHash:'block'};
  receipt={transactionHash:hash,blockHash:'block',blockNumber:10n,status:'success',gasUsed:50000n,effectiveGasPrice:10000000n,l1Fee:100n,
   logs:[{address:MAINNET.baseUsdc,topics:encodeEventTopics({abi:USDC_ABI,eventName:'Transfer',args:{from:wallet,to:recipient}}),data:encodeAbiParameters([{type:'uint256'}],[252579n])}]};},finalize:()=>finalized=true,changeNonce:()=>transaction.nonce++};
}
test('browser funding persists one exact wallet request, survives an unknown hash, and proves final native USDC delivery without a customer key',async()=>{
 const f=fixture();try{
  const prepared=await f.funding.prepare(wallet,f.plan.planId);assert.equal(prepared.dispatchAllowed,true);assert.equal(prepared.transaction.from,wallet);assert.equal(prepared.transaction.chainId,'0x2105');
  assert.equal((await f.funding.prepare(wallet,f.plan.planId)).dispatchAllowed,false);assert.equal(f.budget.totals().sourceUsdc,'252579');
  await assert.rejects(f.funding.reconcile(wallet,prepared.id,hash),{code:'NOT_DISPATCHED'});
  f.funding.dispatch(wallet,prepared.id);assert.throws(()=>f.funding.dispatch(wallet,prepared.id),{code:'WALLET_REQUEST_PENDING'});
  assert.equal((await f.funding.reconcile(wallet,prepared.id)).phase,'wallet-pending');assert.equal(f.hints(),0);
  f.land(prepared.transaction);assert.equal((await f.funding.reconcile(wallet,prepared.id,hash)).phase,'broadcast-unknown');
  f.finalize();assert.equal((await f.funding.reconcile(wallet,prepared.id)).phase,'confirmed');assert.equal(f.budget.totals().baseGas,'500000000100');
  assert.equal(f.funding.list(wallet)[0].phase,'confirmed');assert.equal(f.store.get('base-lock',wallet),null);
  await assert.rejects(f.funding.reconcile(other,prepared.id),{code:'NOT_FOUND'});
  await assert.rejects(f.funding.reconcile(wallet,prepared.id,'0x'+'cd'.repeat(32)),{code:'TRANSACTION_CHANGED'});
 }finally{f.store.close();}
});
test('only an explicit pre-send wallet rejection releases funding reservations; failed budget preparation is atomic',async()=>{
 const f=fixture();try{
  const r=await f.funding.prepare(wallet,f.plan.planId);f.funding.dispatch(wallet,r.id);
  assert.throws(()=>f.funding.reject(wallet,r.id,{code:-32603}),{code:'RECONCILIATION_REQUIRED'});
  assert.equal(f.funding.reject(wallet,r.id,{code:4001}).phase,'cancelled');assert.equal(f.budget.totals().sourceUsdc,'0');assert.equal(f.store.get('base-lock',wallet),null);
 }finally{f.store.close();}
 const b=fixture();try{b.budget.limits.sourceUsdc='1';await assert.rejects(b.funding.prepare(wallet,b.plan.planId),{code:'BUDGET_EXCEEDED'});assert.equal(b.store.get('base-lock',wallet),null);assert.equal(b.store.operation('wallet-fund-'+b.plan.planId),null);}finally{b.store.close();}
});
test('a hash from a different wallet nonce cannot confirm the prepared transfer',async()=>{
 const f=fixture();try{const r=await f.funding.prepare(wallet,f.plan.planId);f.funding.dispatch(wallet,r.id);f.land(r.transaction);f.changeNonce();f.finalize();
  await assert.rejects(f.funding.reconcile(wallet,r.id,hash),{code:'NONCE_CHANGED'});assert.equal(f.store.operation(r.id).phase,'broadcast-unknown');assert.equal(f.budget.totals().sourceUsdc,'252579');
 }finally{f.store.close();}
});
