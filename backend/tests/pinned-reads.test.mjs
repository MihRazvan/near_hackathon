import test from 'node:test';
import assert from 'node:assert/strict';
import {NearReads} from '../src/rpc.mjs';
const block=(hash='final-A',height=10)=>({header:{hash,height}});

test('concurrent offer qualification shares only identical pinned reads and isolates returned objects',async()=>{
 let calls=0,release;const wait=new Promise(resolve=>release=resolve);
 const reads=new NearReads({call:async(method,request)=>{calls++;await wait;return{block_hash:request.block_id,block_height:10,result:[1,2],amount:'123'};}});
 const a=reads.account('hub.near',block()),b=reads.account('hub.near',block());release();
 const [first,second]=await Promise.all([a,b]);assert.equal(calls,1);first.result.push(99);first.amount='0';
 assert.deepEqual(second.result,[1,2]);assert.equal((await reads.account('hub.near',block())).amount,'123');assert.equal(calls,1);
});

test('fresh head, changed block, changed account and changed view arguments never reuse another state',async()=>{
 let calls=0;
 const reads=new NearReads({call:async(method,request)=>({block_hash:request.block_id??'head',block_height:10,result:[++calls]})});
 await reads.account('hub.near');await reads.account('hub.near');assert.equal(calls,2);
 await reads.account('hub.near',block());await reads.account('other.near',block());await reads.account('hub.near',block('final-B'));
 await reads.query({request_type:'call_function',account_id:'hub.near',method_name:'get_credit',args_base64:'payer-A'},block());
 await reads.query({request_type:'call_function',account_id:'hub.near',method_name:'get_credit',args_base64:'payer-B'},block());
 assert.equal(calls,7);
 await assert.rejects(reads.account('hub.near',block('final-A',999)),{code:'UNBOUND_QUERY'});assert.equal(calls,7);
});

test('failed or unbound pinned reads are never retained or supplied to a later reader',async()=>{
 let calls=0;
 const reads=new NearReads({call:async()=>{calls++;if(calls===1)throw Error('outage');return{block_hash:calls===2?'wrong':'final-A',block_height:10,result:[42]};}});
 await assert.rejects(reads.account('hub.near',block()),/outage/);
 await assert.rejects(reads.account('hub.near',block()),{code:'UNBOUND_QUERY'});
 assert.deepEqual((await reads.account('hub.near',block())).result,[42]);assert.equal(calls,3);
});

test('pinned read retention has bounded entries and bytes without dropping block verification',async()=>{
 let calls=0;const payload='x'.repeat(1000000);
 const reads=new NearReads({call:async(method,request)=>{calls++;return{block_hash:request.block_id,block_height:10,payload};}});
 for(let i=0;i<6;i++)await reads.account('owner-'+i+'.near',block());
 assert.ok(reads.pinnedBytes<=4194304);assert.ok(reads.pinnedQueries.size<=4);
 await reads.account('owner-0.near',block());assert.equal(calls,7);
 const small=new NearReads({call:async(method,request)=>({block_hash:request.block_id,block_height:10,amount:'1'})});
 for(let i=0;i<300;i++)await small.account('owner-'+i+'.near',block());
 assert.equal(small.pinnedQueries.size,256);
});
