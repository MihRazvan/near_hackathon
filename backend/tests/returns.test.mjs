import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeEventTopics, encodeAbiParameters } from 'viem';
import { ReturnVerifier } from '../src/returns.mjs';
import { routeRequest } from '../src/oneclick.mjs';
import { hashObject } from '../src/core.mjs';
import { Store } from '../src/store.mjs';
import { MAINNET } from '../src/config.mjs';
import { USDC_ABI } from '../src/base-executor.mjs';

test('provider success needs canonical finalized USDC receipts to the exact original wallet; wrong routes and output shortfalls remain unverified',async()=>{
 const now=Date.now(),store=new Store(),wallet='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20),hash='0x'+'33'.repeat(32),request=routeRequest({direction:'exit',wallet,amount:'100000',dry:false,now});
 const quote={amountIn:'100000',minAmountIn:'100000',amountOut:'97600',minAmountOut:'96624',depositAddress:'deposit.near'};
 const body={schema:'everywhere-route/v1',direction:'exit',wallet,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+120000).toISOString(),request,response:{quoteRequest:request,quote}};
 const plan={...body,planId:hashObject(body)};store.insert('route','route',wallet,{plan});let final=9n;
 const status={status:'SUCCESS',quoteResponse:{quoteRequest:{...request},quote:{...quote}},swapDetails:{amountOut:'97600',destinationChainTxHashes:[{hash}]}};
 const receipt={transactionHash:hash,status:'success',blockNumber:10n,blockHash:'block',logs:[{address:MAINNET.baseUsdc,
  topics:encodeEventTopics({abi:USDC_ABI,eventName:'Transfer',args:{from:other,to:wallet}}),data:encodeAbiParameters([{type:'uint256'}],[97600n])}]};
 const verifier=new ReturnVerifier({store,routes:{status:async()=>status},client:{getChainId:async()=>8453,getBlock:async({blockTag})=>blockTag?{number:final}:{hash:'block'},getTransactionReceipt:async()=>receipt}});
 try{
  assert.equal((await verifier.verify('route',wallet)).status,'awaiting-destination-finality');assert.equal(store.list('route-result').length,0);final=11n;
  status.quoteResponse.quoteRequest.refundTo=other;await assert.rejects(verifier.verify('route',wallet),/changed refundTo/);status.quoteResponse.quoteRequest.refundTo=wallet;
  const original=receipt.logs[0].data;receipt.logs[0].data=encodeAbiParameters([{type:'uint256'}],[90000n]);await assert.rejects(verifier.verify('route',wallet),/do not prove/);receipt.logs[0].data=original;
  const verified=await verifier.verify('route',wallet);assert.equal(verified.status,'confirmed');assert.equal(verified.deliveredMicroUsdc,'97600');
  assert.equal((await verifier.verify('route',wallet)).id,verified.id);await assert.rejects(verifier.verify('route',other),/not found/);
 }finally{store.close();}
});
