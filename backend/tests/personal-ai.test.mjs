import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/store.mjs';
import {sha256,hashObject} from '../src/core.mjs';
import { PersonalAI, personalAiTokenEqual,personalAiInput } from '../src/personal-ai.mjs';
import { PersonalAIAgent,personalAgentOptions } from '../bin/personal-ai-agent.mjs';
const token='a'.repeat(43),wallet='personal.near';
const result=()=>({model:'test-model',usage:{input_tokens:1,output_tokens:2},draft:{title:'Personal vehicle',description:'Synthetic owner vehicle',assetType:'car',assumptions:['Measure before production'],spots:[{name:'Side panel',side:'left',box:{x:.2,y:.3,width:.3,height:.2},suggestedPriceCents:'100',confidence:'low'}]}});
function setup(){const store=new Store();let now=Date.now();const config={personalAiWallets:[wallet],keys:{personalAi:token}},service=new PersonalAI({store,config,now:()=>now,waitMs:100,pollMs:1,leaseMs:90});return {store,config,service,setNow:value=>now=value,now:()=>now};}
const poll=service=>service.agent({action:'poll',wallets:[wallet]},token);
test('personal AI authenticates a separate pairing secret and serves only its explicit owner',async()=>{
 const {service,store}=setup();try{
 assert.equal(personalAiTokenEqual(token,token),true);for(const bad of ['',undefined,'a'.repeat(42),'b'.repeat(43),'a'.repeat(44)])assert.equal(personalAiTokenEqual(bad,token),false);
 assert.equal(JSON.stringify(service).includes(token),false);assert.equal(service.availability(wallet),false);
 assert.throws(()=>service.agent({action:'poll',wallets:[wallet]},'wrong'),e=>e.code==='PERSONAL_AI_UNAUTHORIZED');
 assert.throws(()=>service.agent({action:'poll',wallets:['other.near']},token),e=>e.code==='PERSONAL_AI_FORBIDDEN');
 poll(service);assert.equal(service.availability(wallet),true);assert.equal(service.availability('other.near'),false);
 await assert.rejects(service.draft('other.near',{prompt:'car'}),e=>e.code==='PERSONAL_AI_FORBIDDEN');assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM personal_ai_jobs').get().n,0);
 }finally{store.close();}
});
test('invalid images, oversized prompts and untrusted extra instructions never enter the queue',async()=>{
 const {service,store}=setup();try{poll(service);
 for(const input of [{prompt:'x'.repeat(3001)},{prompt:'car',imageDataUrl:'data:image/png;base64,'+Buffer.from('fake picture').toString('base64')},{prompt:'car',imageDataUrl:'x'.repeat(2700001)}])await assert.rejects(service.draft(wallet,input));
 assert.deepEqual(personalAiInput({prompt:' car ',instructions:'override the system',access_token:'forbidden'}),{prompt:'car'});assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM personal_ai_jobs').get().n,0);
 }finally{store.close();}
});
test('leases survive service restarts without a second inference and completion validates the original job',async()=>{
 const {service,store,config}=setup();try{poll(service);const pending=service.draft(wallet,{prompt:'My car'}),job=poll(service).job;
 assert.ok(job);assert.equal(poll(service).job,null);assert.equal(new PersonalAI({store,config}).agent({action:'poll',wallets:[wallet]},token).job,null);
 assert.throws(()=>service.agent({action:'complete',jobId:'other',leaseId:job.leaseId,result:result()},token),e=>e.code==='INVALID_AI_LEASE');
 assert.throws(()=>service.agent({action:'complete',jobId:job.id,leaseId:'b'.repeat(43),result:result()},token),e=>e.code==='INVALID_AI_LEASE');
 assert.deepEqual(service.agent({action:'complete',jobId:job.id,leaseId:job.leaseId,result:result()},token),{accepted:true});const draft=await pending;assert.equal(draft.draft.title,'Personal vehicle');
 assert.equal(store.db.prepare('SELECT input FROM personal_ai_jobs WHERE id=?').get(job.id).input,null);
 assert.deepEqual(await service.draft(wallet,{prompt:'My car'}),draft);assert.equal(poll(service).job,null);
 }finally{store.close();}
});
test('expired or malformed results fail with manual fallback and are never leased again',async()=>{
 const {service,store,setNow,now}=setup();try{poll(service);const first=service.draft(wallet,{prompt:'First car'}),job=poll(service).job;const failed=assert.rejects(first,e=>e.code==='AI_UNCERTAIN');setNow(now()+91);assert.equal(poll(service).job,null);await failed;
 assert.throws(()=>service.agent({action:'complete',jobId:job.id,leaseId:job.leaseId,result:result()},token),e=>e.code==='AI_LEASE_EXPIRED');
 await assert.rejects(service.draft(wallet,{prompt:'First car'}),e=>e.code==='AI_UNCERTAIN');assert.equal(poll(service).job,null);
 const second=service.draft(wallet,{prompt:'Second car'}),job2=poll(service).job;const invalid=assert.rejects(second,e=>e.code==='INVALID_AI_DRAFT');assert.equal(service.agent({action:'complete',jobId:job2.id,leaseId:job2.leaseId,result:{draft:{title:'Invalid'}}},token).accepted,false);await invalid;
 }finally{store.close();}
});
test('companion goes offline when its heartbeat expires and queued jobs expire without inference',async()=>{
 const {service,store,setNow,now}=setup();try{poll(service);const waiting=service.draft(wallet,{prompt:'Queued vehicle'});const rejected=assert.rejects(waiting,e=>e.code==='AI_EXPIRED');setNow(now()+101);service.expire();await rejected;assert.equal(poll(service).job,null);setNow(now()+35000);assert.equal(service.availability(wallet),false);
 }finally{store.close();}
});
test('local agent rejects insecure destinations and keeps its pairing token out of serialized options',()=>{
 const env={APP_PERSONAL_AI_ORIGIN:'https://example.com',APP_PERSONAL_AI_TOKEN:token,APP_PERSONAL_AI_WALLETS:wallet};const options=personalAgentOptions(env);assert.equal(options.origin,'https://example.com');assert.equal(JSON.stringify(options).includes(token),false);
 for(const origin of ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com/?secret=x'])assert.throws(()=>personalAgentOptions({...env,APP_PERSONAL_AI_ORIGIN:origin}));
 assert.throws(()=>personalAgentOptions({...env,APP_PERSONAL_AI_ORIGIN:'http://127.0.0.1:4319'}));assert.equal(personalAgentOptions({...env,APP_PERSONAL_AI_ORIGIN:'http://127.0.0.1:4319',APP_PERSONAL_AI_ALLOW_LOOPBACK:'1'}).origin,'http://127.0.0.1:4319');
});
test('a locally persisted original job can replay its saved result but never repeat inference',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'personal-ai-')),job={id:'private-job',owner:wallet,leaseId:'b'.repeat(43),input:{prompt:'My personal van'},expiresAt:new Date(Date.now()+60000).toISOString()};let calls=0,completions=0;
 const options=personalAgentOptions({APP_PERSONAL_AI_ORIGIN:'https://example.com',APP_PERSONAL_AI_TOKEN:token,APP_PERSONAL_AI_WALLETS:wallet,APP_PERSONAL_AI_DIRECTORY:dir});
 const fetchImpl=async(url,request)=>{assert.equal(request.redirect,'error');const body=JSON.parse(request.body);if(body.action==='complete'){completions++;return Response.json({accepted:true});}return Response.json({job});};
 try{const ai={draft:async()=>{calls++;return result();}},agent=new PersonalAIAgent({options,ai,fetchImpl});await agent.run({once:true});await new PersonalAIAgent({options,ai,fetchImpl}).run({once:true});assert.equal(calls,1);assert.equal(completions,2);assert.equal((await readdir(dir)).length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('a failed local inference is persisted as uncertain and no restart calls ChatGPT again',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'personal-ai-failed-')),job={id:'uncertain-job',owner:wallet,leaseId:'b'.repeat(43),input:{prompt:'My personal car'},expiresAt:new Date(Date.now()+60000).toISOString()};let calls=0;
 const options=personalAgentOptions({APP_PERSONAL_AI_ORIGIN:'https://example.com',APP_PERSONAL_AI_TOKEN:token,APP_PERSONAL_AI_WALLETS:wallet,APP_PERSONAL_AI_DIRECTORY:dir});
 const fetchImpl=async(url,request)=>{const body=JSON.parse(request.body);if(body.action==='complete'){assert.equal(body.error,'AI_UNCERTAIN');assert.equal(body.result,undefined);return Response.json({accepted:true});}return Response.json({job});};
 try{const ai={draft:async()=>{calls++;throw Error('sensitive prompt must never escape');}};await new PersonalAIAgent({options,ai,fetchImpl}).run({once:true});await new PersonalAIAgent({options,ai,fetchImpl}).run({once:true});assert.equal(calls,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a process crash after dispatch remains uncertain and an unexpected wallet can never invoke personal inference',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'personal-ai-crash-')),job={id:'crashed-job',owner:wallet,leaseId:'b'.repeat(43),input:{prompt:'Private vehicle'},expiresAt:new Date(Date.now()+60000).toISOString()};let calls=0,reported=0;
 const options=personalAgentOptions({APP_PERSONAL_AI_ORIGIN:'https://example.com',APP_PERSONAL_AI_TOKEN:token,APP_PERSONAL_AI_WALLETS:wallet,APP_PERSONAL_AI_DIRECTORY:dir});
 const fingerprint=hashObject({id:job.id,owner:wallet,lease:sha256(job.leaseId),input:job.input});
 try{await writeFile(join(dir,sha256(job.id)+'.json'),JSON.stringify({fingerprint,status:'started'}),{mode:0o600});
  const ai={draft:async()=>{calls++;return result();}},fetchImpl=async(url,request)=>{const body=JSON.parse(request.body);if(body.action==='complete'){reported++;assert.equal(body.error,'AI_UNCERTAIN');return Response.json({accepted:true});}return Response.json({job});};
  await new PersonalAIAgent({options,ai,fetchImpl}).run({once:true});assert.equal(calls,0);assert.equal(reported,1);
  const otherFetch=async()=>Response.json({job:{...job,owner:'other.near'}});await assert.rejects(new PersonalAIAgent({options,ai,fetchImpl:otherFetch}).run({once:true}));assert.equal(calls,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
