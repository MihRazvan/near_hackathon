import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapacityReader} from '../src/integration/publication-capacity.mjs';
test('repeated offer renders share one pending hint, while publishing and wallet switches use new checks',async()=>{
 let wallet={wallet:'a.near'},time=0,release;const calls=[];
 const capacity=createCapacityReader({session:()=>wallet,now:()=>time,request:async path=>{calls.push(path);if(calls.length===1)await new Promise(resolve=>release=resolve);return {sponsoredSlots:calls.length};}});
 const a=capacity(),b=capacity();await Promise.resolve();time=10000;const c=capacity();assert.equal(calls.length,1);release();assert.deepEqual(await a,await b);await c;
 await capacity();assert.equal(calls.length,1);await capacity({force:true,background:false});assert.equal(calls[1],'publication-capacity');
 wallet={wallet:'b.near'};await capacity();assert.equal(calls.length,3);assert.equal(calls[2],'publication-capacity?preview=1');
 time+=5001;await capacity();assert.equal(calls.length,4);
});
test('failed publication hints are retryable and never cached as unavailable capacity',async()=>{
 let count=0;const wallet={wallet:'a.near'},capacity=createCapacityReader({session:()=>wallet,request:async()=>{if(++count===1)throw Error('offline');return {sponsoredSlots:1};}});
 await assert.rejects(capacity(),/offline/);assert.equal((await capacity()).sponsoredSlots,1);
});
