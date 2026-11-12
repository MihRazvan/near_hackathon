import test from 'node:test';
import assert from 'node:assert/strict';
import { Rpc,NearReads } from '../src/rpc.mjs';
const transient=status=>new Response('temporary',{status});
function fixture(fetchImpl,{intervalMs=0}={}){
 let time=1800000000000;const waits=[],calls=[];
 const rpc=new Rpc('https://rpc.invalid',{fetchImpl:async(url,options)=>{calls.push({url,body:options.body,signal:options.signal});return fetchImpl(calls.length,options);},intervalMs,now:()=>time,sleep:async ms=>{waits.push(ms);time+=ms;}});
 return {rpc,calls,waits,advance:ms=>time+=ms,time:()=>time};
}
test('concurrent identical reads share one request, return separate values and expire on completion',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),f=fixture(async()=>{await gate;return Response.json({result:{amount:'1'}});});
 const a=f.rpc.call('query',{block_id:'final',account_id:'hub.near'}),b=f.rpc.call('query',{block_id:'final',account_id:'hub.near'});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,1);release();const [first,second]=await Promise.all([a,b]);first.amount='changed';assert.equal(second.amount,'1');
 await f.rpc.call('query',{block_id:'final',account_id:'hub.near'});assert.equal(f.calls.length,2);
});
test('different finalized blocks and transaction broadcasts never share a pending request',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),f=fixture(async()=>{await gate;return Response.json({result:{ok:true}});});
 const pending=[f.rpc.call('query',{block_id:'a'}),f.rpc.call('query',{block_id:'b'}),f.rpc.call('send_tx',{signed_tx_base64:'same'}),f.rpc.call('send_tx',{signed_tx_base64:'same'})];
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,4);release();await Promise.all(pending);
});
test('transient read retries preserve the exact serialized finalized block query even if caller params change',async()=>{
 const params={request_type:'view_account',account_id:'owner.near',block_id:'pinned-final-block'};
 const f=fixture(async attempt=>{if(attempt===1){params.block_id='new-block';return transient(429);}if(attempt===2)throw Error('connection reset');return Response.json({result:{block_hash:'pinned-final-block',block_height:123,amount:'1'}});});
 const result=await f.rpc.call('query',params);assert.equal(result.block_hash,'pinned-final-block');assert.deepEqual(f.waits,[500,1000]);assert.equal(f.calls.length,3);assert.equal(new Set(f.calls.map(call=>call.body)).size,1);assert.equal(JSON.parse(f.calls[2].body).params.block_id,'pinned-final-block');
});
test('only the explicit read methods retry HTTP or transport failures',async()=>{
 for(const method of ['status','block','query','tx','EXPERIMENTAL_protocol_config','gas_price']){
  const f=fixture(async attempt=>attempt===1?transient(503):Response.json({result:{ok:true}}));assert.deepEqual(await f.rpc.call(method,{tx_hash:'original-hash',block_id:'final'}),{ok:true});assert.equal(f.calls.length,2);
 }
 for(const method of ['send_tx','broadcast_tx_async','broadcast_tx_commit','sandbox_fast_forward','EXPERIMENTAL_receipt','unknown_method'])for(const failure of ['http','transport']){
  const f=fixture(async()=>{if(failure==='transport')throw Error('network failed');return transient(429);});await assert.rejects(f.rpc.call(method,{signed_tx_base64:'fixed'}),{code:'RPC_UNAVAILABLE'});assert.equal(f.calls.length,1,method+' must never redispatch');assert.deepEqual(f.waits,[]);
 }
});
test('transient 429, 502, 503 and 504 responses stop after three attempts with bounded backoff',async()=>{
 for(const status of [429,502,503,504]){const f=fixture(async()=>transient(status));await assert.rejects(f.rpc.call('block',{finality:'final'}),{code:'RPC_UNAVAILABLE',status:503});assert.equal(f.calls.length,3);assert.deepEqual(f.waits,[500,1000]);}
 for(const status of [400,401,404,500]){const f=fixture(async()=>transient(status));await assert.rejects(f.rpc.call('block',{}),{code:'RPC_UNAVAILABLE'});assert.equal(f.calls.length,1);}
});
test('Retry-After accepts seconds or HTTP dates, caps at two seconds and falls back for malformed headers',async()=>{
 for(const [header,expected] of [['20',2000],['0.25',250],['0',0],['invalid',500]]){
  const f=fixture(async attempt=>attempt===1?new Response('limited',{status:429,headers:{'Retry-After':header}}):Response.json({result:'ok'}));assert.equal(await f.rpc.call('status',[]),'ok');assert.deepEqual(f.waits,expected?[expected]:[]);
 }
 const f=fixture(async attempt=>attempt===1?new Response('limited',{status:429,headers:{'Retry-After':new Date(f.time()+10000).toUTCString()}}):Response.json({result:'ok'}));assert.equal(await f.rpc.call('status',[]),'ok');assert.deepEqual(f.waits,[2000]);
});
test('application query errors are never retried or rewritten as a transport success',async()=>{
 for(const [name,code] of [['UNKNOWN_ACCOUNT','UNKNOWN_ACCOUNT'],['UNKNOWN_TRANSACTION','UNKNOWN_TRANSACTION'],['TIMEOUT_ERROR','RPC_UNAVAILABLE'],['DOES_NOT_TRACK_SHARD','RPC_UNAVAILABLE'],['INTERNAL_ERROR','RPC_UNAVAILABLE'],['CONTRACT_EXECUTION_ERROR','RPC_REJECTED']]){
  const f=fixture(async()=>Response.json({error:{cause:{name},code:-32000}}));await assert.rejects(f.rpc.call('query',{block_id:'pinned'}),{code,status:409});assert.equal(f.calls.length,1);assert.deepEqual(f.waits,[]);
 }
});
test('malformed JSON or malformed RPC envelopes become unavailable without retries',async()=>{
 for(const value of ['{not-json','null','[]','{}','{"error":null}']){
  const f=fixture(async()=>new Response(value,{status:200}));await assert.rejects(f.rpc.call('query',{}),{code:'RPC_UNAVAILABLE',status:503});assert.equal(f.calls.length,1);
 }
 const f=fixture(async()=>Response.json({result:null}));assert.equal(await f.rpc.call('query',{}),null);
});
test('the overall deadline includes retry backoff and request scheduling',async()=>{
 const f=fixture(async()=>transient(429));await assert.rejects(f.rpc.call('query',{}, {timeoutMs:500}),{code:'RPC_UNAVAILABLE'});assert.equal(f.calls.length,1);assert.deepEqual(f.waits,[]);
 const scheduled=fixture(async()=>Response.json({result:1}),{intervalMs:1000});assert.equal(await scheduled.rpc.call('status',[]),1);await assert.rejects(scheduled.rpc.call('status',[],{timeoutMs:500}),{code:'RPC_UNAVAILABLE'});assert.equal(scheduled.calls.length,1);
 const slow=fixture(async()=>{slow.advance(400);throw Error('connection failed');});await assert.rejects(slow.rpc.call('block',{}, {timeoutMs:500}),{code:'RPC_UNAVAILABLE'});assert.equal(slow.calls.length,1);
});
test('stalled transports and incomplete response bodies are aborted within the original deadline',async()=>{
 let signal,requests=0;
 const stalled=new Rpc('https://rpc.invalid',{intervalMs:0,fetchImpl:async(url,options)=>{requests++;signal=options.signal;return new Promise(()=>{});}});
 await assert.rejects(stalled.call('status',[],{timeoutMs:15}),{code:'RPC_UNAVAILABLE'});assert.equal(signal.aborted,true);assert.equal(requests,1);
 const incomplete=new Rpc('https://rpc.invalid',{intervalMs:0,fetchImpl:async(url,options)=>{signal=options.signal;return {ok:true,json:()=>new Promise(()=>{})};}});
 await assert.rejects(incomplete.call('query',{}, {timeoutMs:15}),{code:'RPC_UNAVAILABLE'});assert.equal(signal.aborted,true);
});
test('retried chain reads still enforce finalized block binding through NearReads',async()=>{
 const f=fixture(async attempt=>attempt===1?transient(502):Response.json({result:{block_hash:'wrong-block',block_height:123}}));
 await assert.rejects(new NearReads(f.rpc).account('owner.near',{header:{hash:'original-block',height:123}}),{code:'UNBOUND_QUERY'});assert.equal(f.calls.length,2);for(const call of f.calls)assert.equal(JSON.parse(call.body).params.block_id,'original-block');
});

test('a transport interruption while reading a response body retries reads without retrying malformed JSON',async()=>{
 const f=fixture(async attempt=>attempt===1?{ok:true,json:async()=>{throw new TypeError('terminated');}}:Response.json({result:'complete'}));assert.equal(await f.rpc.call('query',{block_id:'original'}),'complete');assert.equal(f.calls.length,2);assert.deepEqual(f.waits,[500]);assert.equal(f.calls[0].body,f.calls[1].body);
 const write=fixture(async()=>({ok:true,json:async()=>{throw new TypeError('terminated');}}));await assert.rejects(write.rpc.call('send_tx',{}),{code:'RPC_UNAVAILABLE'});assert.equal(write.calls.length,1);
});
