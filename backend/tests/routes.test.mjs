import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { parseTransaction, keccak256, encodeEventTopics, encodeAbiParameters } from 'viem';
import { routeRequest, validateQuote, validateRoutePlan, OneClick } from '../src/oneclick.mjs';
import { hashObject } from '../src/core.mjs';
import { Store } from '../src/store.mjs';
import { Budget } from '../src/budget.mjs';
import { BaseExecutor, USDC_ABI } from '../src/base-executor.mjs';
import { MAINNET } from '../src/config.mjs';
const account=privateKeyToAccount('0x'+'01'.repeat(32)),wallet=account.address.toLowerCase(),deposit='0x'+'22'.repeat(20);
function fixture(){const now=Date.now(),request=routeRequest({direction:'fund',wallet,amount:'250000',dry:false,now});
 const response={quoteRequest:{...request,appFees:[{recipient:'5880ad2b362620fadf759cbceb1cd5737ce8c6ed7fb8e9942881e6731f9247dd',fee:1,limitOrderId:null}]},
  quote:{amountIn:'252579',minAmountIn:'250053',amountOut:'250000',minAmountOut:'250000',depositAddress:deposit}};
 const body={schema:'everywhere-route/v1',direction:'fund',wallet,request,response,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+120000).toISOString()};return {...body,planId:hashObject(body)};}
test('1Click quotes bind both original-wallet destinations, exact principal, upstream fee and callback-free routing',()=>{
 const p=fixture();validateRoutePlan(p,{maxInput:'300000'});
 for(const change of [q=>q.quoteRequest.refundTo=deposit,q=>q.quoteRequest.recipient=deposit,q=>q.quoteRequest.appFees[0].fee=2,
 q=>q.quoteRequest.customRecipientMsg='steal',q=>q.quote.amountIn='300001',q=>q.quote.amountOut='249999',q=>q.quote.depositMemo='memo']){
  const q=structuredClone(p.response);change(q);assert.throws(()=>validateQuote(q,p.request,{maxInput:'300000'}));
 }
 const exit=routeRequest({direction:'exit',wallet,amount:'10000'});assert.equal(exit.depositType,'INTENTS');assert.equal(exit.refundTo,wallet);assert.equal(exit.recipient,wallet);
});
function setup(){
 const store=new Store(),budget=new Budget(store,{sourceUsdc:'1000000',baseGas:'100000000000000',nearFees:'0',nearAllocation:'0',nearAllocationGross:'0'});
 let sends=0,finalized=false,timeout=false,receipt,tx;
 const client={getChainId:async()=>8453,readContract:async({functionName})=>functionName==='decimals'?6:15000000n,getBalance:async()=>1000000000000000n,
  estimateFeesPerGas:async()=>({maxFeePerGas:10000000n,maxPriorityFeePerGas:1000000n}),getTransactionCount:async()=>0,estimateGas:async()=>60000n,
  sendRawTransaction:async({serializedTransaction})=>{sends++;const p=parseTransaction(serializedTransaction),hash=keccak256(serializedTransaction);tx={...p,value:p.value??0n,hash,from:account.address,input:p.data,blockHash:'block'};
   receipt={transactionHash:hash,blockHash:'block',blockNumber:10n,status:'success',gasUsed:50000n,effectiveGasPrice:10000000n,l1Fee:100n,
    logs:[{address:MAINNET.baseUsdc,topics:encodeEventTopics({abi:USDC_ABI,eventName:'Transfer',args:{from:account.address,to:deposit}}),data:encodeAbiParameters([{type:'uint256'}],[252579n])}]};
   if(timeout)throw Error('timeout');return hash;},
  getTransaction:async()=>tx,getTransactionReceipt:async()=>receipt,getBlock:async({blockTag})=>blockTag?{number:finalized?11n:9n}:{hash:'block'}};
 const executor=new BaseExecutor({store,budget,client,config:{enabled:true}});
 return {store,budget,client,executor,sends:()=>sends,finalize:()=>finalized=true,timeout:()=>timeout=true,receipt:()=>receipt};
}
test('Base funding waits for finality and exact USDC Transfer evidence before settling the durable budget',async()=>{
 const s=setup();try{const plan=fixture();assert.equal((await s.executor.fund({id:'a',plan,account})).phase,'broadcast');
  assert.equal(s.budget.totals().sourceUsdc,'252579');s.finalize();
  assert.equal((await s.executor.reconcile('a')).phase,'confirmed');assert.equal(s.budget.totals().baseGas,'500000000100');
  await s.executor.fund({id:'a',plan,account});assert.equal(s.sends(),1);
 }finally{s.store.close();}
});
test('lost Base response cannot duplicate funding; unproven transfer cannot settle',async()=>{
 const s=setup();s.timeout();try{await s.executor.fund({id:'a',plan:fixture(),account});assert.equal(s.store.operation('a').phase,'broadcast-unknown');
  await assert.rejects(s.executor.fund({id:'b',plan:fixture(),account}),/requires reconciliation/);s.finalize();const logs=s.receipt().logs;s.receipt().logs=[];
  await assert.rejects(s.executor.reconcile('a'),/exact USDC transfer/);assert.equal(s.budget.totals().sourceUsdc,'252579');
  s.receipt().logs=logs;assert.equal((await s.executor.reconcile('a')).phase,'confirmed');assert.equal(s.sends(),1);
 }finally{s.store.close();}
});

test('a bridge minimum is shown in USDC without exposing an arbitrary provider payload',async()=>{
 const api=new OneClick({fetchImpl:async()=>({ok:false,status:400,json:async()=>({message:'Amount is too low for bridge, try at least 149983',internal:'omitted'})})});
 await assert.rejects(api.request('/quote',{}),e=>e.code==='ROUTE_MINIMUM'&&e.status===409&&e.message.includes('0.149983 USDC')&&!e.message.includes('omitted'));
});
