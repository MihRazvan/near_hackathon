import test from 'node:test';import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';import {AIJobs} from '../src/ai-jobs.mjs';import {NearAI} from '../src/near-ai.mjs';
const draft={title:'Van',description:'White van',assetType:'van',assumptions:['Check measurements'],spots:[{name:'Cargo panel',side:'left',box:{x:.2,y:.3,width:.4,height:.2},suggestedPriceCents:'100',confidence:'medium'}]};
test('AI jobs recover original output, isolate wallets and charge quota once for duplicate requests',async()=>{
 const store=new Store();let release,calls=0;
 const jobs=new AIJobs({store,config:{aiDailyLimit:5,aiGlobalDailyLimit:10},assetAI:{draft:async()=>{calls++;await new Promise(r=>release=r);return {draft};}}});
 const input={requestId:'request-0000000001',prompt:'White van'};
 const first=jobs.start('owner.near',input);assert.equal(first.status,'processing');
 assert.equal(jobs.start('owner.near',input).id,first.id);await Promise.resolve();assert.equal(calls,1);
 assert.throws(()=>jobs.start('owner.near',{...input,prompt:'Changed van'}),{code:'AI_REQUEST_CHANGED'});
 assert.throws(()=>jobs.read('other.near',first.id),{code:'NOT_FOUND'});
 assert.throws(()=>jobs.start('other.near',input),{code:'AI_REQUEST_CHANGED'});
 release();await jobs.running.get(first.id);assert.equal(jobs.read('owner.near',first.id).status,'completed');
 assert.equal(jobs.start('owner.near',input).status,'completed');assert.equal(calls,1);store.close();
});
test('offline AI does not consume quota; interrupted jobs are never resent on restart',()=>{
 const store=new Store();const offline=new AIJobs({store,config:{}});
 assert.throws(()=>offline.start('owner.near',{requestId:'request-0000000001',prompt:'Car'}),{code:'AI_UNAVAILABLE'});assert.equal(store.list('ai-quota').length,0);
 store.insert('ai-job','request-interrupted','owner.near',{status:'processing',fingerprint:'test'});
 const restarted=new AIJobs({store,config:{}});assert.equal(restarted.read('owner.near','request-interrupted').status,'uncertain');store.close();
});
test('NEAR provider sends structured requests without exposing credentials or retrying incomplete results',async()=>{
 let calls=0;const client=new NearAI({apiKey:'private-test',fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://cloud-api.near.ai/v1/chat/completions');const b=JSON.parse(options.body);assert.equal(b.max_tokens,3000);assert.equal(b.response_format.type,'json_schema');return Response.json({status:'incomplete'});}});
 assert.equal(JSON.stringify(client).includes('private-test'),false);await assert.rejects(client.complete({input:[],schema:{type:'object'}}),{code:'AI_INCOMPLETE'});assert.equal(calls,1);
});
