import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {EvidenceRpc,EVIDENCE_RPC_ENDPOINTS} from '../src/evidence-rpc.mjs';
import {verifyOfflineEvidence} from '../src/evidence-offline.mjs';
const root=new URL('../../',import.meta.url).pathname,manifest=JSON.parse(await readFile(new URL('../../deployments/qualification.json',import.meta.url)));
const unavailable=()=>Object.assign(Error('private upstream response must stay private'),{code:'RPC_UNAVAILABLE'});
test('historical receipts prefer archival while current state keeps its own successful provider',async()=>{
 const calls=[],rpc=new EvidenceRpc(undefined,{rpcFactory:url=>({call:async(method,params,options)=>{const host=new URL(url).hostname;calls.push({host,method,params,timeout:options.timeoutMs});if(method==='tx'&&host!=='archival-rpc.mainnet.near.org')throw Object.assign(Error('old tx'),{code:'UNKNOWN_TRANSACTION'});return {ok:true};}})});
 assert.equal(EVIDENCE_RPC_ENDPOINTS.length,3);await rpc.call('status',[]);await rpc.call('tx',{tx_hash:'recorded',wait_until:'NONE'});await rpc.call('block',{finality:'final'});await rpc.call('tx',{tx_hash:'another',wait_until:'NONE'});
 assert.deepEqual(calls.map(c=>c.host),['near.drpc.org','archival-rpc.mainnet.near.org','near.drpc.org','archival-rpc.mainnet.near.org']);assert.ok(calls.every(c=>c.timeout<=(c.method==='tx'?15000:8000)));assert.equal(calls[1].params.wait_until,'NONE');
 assert.equal(new URL(rpc.diagnostics().stateEndpoint).hostname,'near.drpc.org');assert.equal(new URL(rpc.diagnostics().historicalEndpoint).hostname,'archival-rpc.mainnet.near.org');
});
test('current-state reads fail over across all public providers and remember their working state provider',async()=>{
 const calls=[],rpc=new EvidenceRpc(undefined,{rpcFactory:url=>({call:async()=>{calls.push(new URL(url).hostname);if(!url.includes('archival-rpc'))throw unavailable();return 'state';}})});
 assert.equal(await rpc.call('query',{}),'state');await rpc.call('block',{});assert.deepEqual(calls,['near.drpc.org','free.rpc.fastnear.com','archival-rpc.mainnet.near.org','archival-rpc.mainnet.near.org']);
});
test('historical data unavailable at one provider falls back, while evidence mismatches stop instead of shopping for a passing provider',async()=>{
 let count=0;const rpc=new EvidenceRpc(undefined,{rpcFactory:()=>({call:async()=>{count++;if(count===1)throw Object.assign(Error('old tx'),{code:'UNKNOWN_TRANSACTION'});return 'historical outcome';}})});
 assert.equal(await rpc.call('tx',{}),'historical outcome');
 count=0;const mismatch=new EvidenceRpc(undefined,{rpcFactory:()=>({call:async()=>{count++;throw Object.assign(Error('changed proof'),{code:'EVIDENCE_MISMATCH'});}})});
 await assert.rejects(mismatch.call('query',{}),{code:'EVIDENCE_MISMATCH'});assert.equal(count,1);
});
test('custom RPC is exclusive, hides API-key paths in diagnostics, and verification cannot broadcast',async()=>{
 const urls=[],rpc=new EvidenceRpc(['https://rpc.example/private-api-key?token=private'],{rpcFactory:url=>{urls.push(url);return {call:async()=>({chain_id:'mainnet'})};}});
 await rpc.call('status',[]);assert.equal(urls.length,1);assert.equal(JSON.stringify(rpc.diagnostics()).includes('private'),false);
 await assert.rejects(rpc.call('broadcast_tx_commit',[]),{code:'VERIFY_READ_ONLY'});
 for(const url of ['http://rpc.example','https://user:secret@rpc.example','not a url'])assert.throws(()=>new EvidenceRpc([url]),{code:'INVALID_RPC_URL'});
});
test('an offline provider set yields recovery instructions without exposing upstream payloads',async()=>{
 const rpc=new EvidenceRpc(undefined,{rpcFactory:()=>({call:async()=>{throw unavailable();}})});
 await assert.rejects(rpc.call('status',[]),e=>e.code==='RPC_UNAVAILABLE'&&e.message.includes('Network access')&&e.message.includes('<rpc-url>')&&!e.message.includes('private upstream'));
 let time=0;const budgets=[],bounded=new EvidenceRpc(undefined,{now:()=>time,rpcFactory:()=>({call:async(method,params,options)=>{budgets.push(options.timeoutMs);time+=options.timeoutMs;throw unavailable();}})});
 await assert.rejects(bounded.call('status',[],{timeoutMs:12000}),{code:'RPC_UNAVAILABLE'});assert.deepEqual(budgets,[8000,4000]);assert.equal(time,12000);
});
test('offline verification checks the deployed WASM, raw IPFS contents and cross-manifest bindings',async()=>{
 const result=await verifyOfflineEvidence(manifest,{root});assert.equal(result.status,'offline-verified');assert.equal(result.chainVerification,'not-performed');assert.equal(result.files.length,3);
 for(const change of [m=>m.contract.wasmSha256='0'.repeat(64),m=>m.record.offerId='offer-'+'0'.repeat(32),m=>m.record.artifacts.artwork.sha256='0'.repeat(64),m=>m.record.artifacts.delivery.uri=m.record.artifacts.artwork.uri,m=>m.record.artifacts.artwork.uri=m.record.artifacts.artwork.uri.slice(0,-1)+'f']){const m=structuredClone(manifest);change(m);await assert.rejects(verifyOfflineEvidence(m,{root}),{code:'EVIDENCE_MISMATCH'});}
 const bad=structuredClone(manifest);bad.contract.wasmFile='../../.env';await assert.rejects(verifyOfflineEvidence(bad,{root}),{code:'INVALID_EVIDENCE'});
});
test('changing committed artifact bytes or omitting an artifact fails offline verification',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-evidence-'));
 try{await mkdir(join(dir,'deployments/evidence'),{recursive:true});for(const file of ['deployments/mainnet.json',manifest.contract.wasmFile,...Object.values(manifest.record.artifacts).map(a=>a.file)])await writeFile(join(dir,file),await readFile(join(root,file)));
  await writeFile(join(dir,manifest.record.artifacts.artwork.file),'tampered');await assert.rejects(verifyOfflineEvidence(manifest,{root:dir}),{code:'EVIDENCE_MISMATCH'});
  await rm(join(dir,manifest.record.artifacts.artwork.file));await assert.rejects(verifyOfflineEvidence(manifest,{root:dir}),{code:'EVIDENCE_FILE_MISSING'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('the CLI offline mode succeeds without installed dependencies and with all network connections disabled',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-offline-'));
 try{const disable=join(dir,'disable-network.mjs');await writeFile(disable,"import net from 'node:net';globalThis.fetch=()=>{throw Error('Network disabled');};net.Socket.prototype.connect=function(){throw Error('Network disabled');};");
  for(const file of ['backend/bin/verify-evidence.mjs','backend/src/evidence-offline.mjs','backend/src/core.mjs','deployments/mainnet.json','deployments/qualification.json',manifest.contract.wasmFile,...Object.values(manifest.record.artifacts).map(a=>a.file)]){await mkdir(join(dir,file,'..'),{recursive:true});await writeFile(join(dir,file),await readFile(join(root,file)));}
  const run=spawnSync(process.execPath,['--import',disable,join(dir,'backend/bin/verify-evidence.mjs'),'--offline'],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});
  assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).status,'offline-verified');
  await writeFile(join(dir,manifest.record.artifacts.artwork.file),'changed');
  const tampered=spawnSync(process.execPath,['--import',disable,join(dir,'backend/bin/verify-evidence.mjs'),'--offline'],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});
  assert.equal(tampered.status,1);assert.equal(JSON.parse(tampered.stderr).status,'mismatch');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('explicit history provider is exclusive for receipts and cannot take over current-state reads',async()=>{
 const calls=[],rpc=new EvidenceRpc(['https://state.example/private-key'],{historyEndpoints:['https://archive.example/history-key?token=secret'],rpcFactory:url=>({call:async(method)=>{calls.push([new URL(url).hostname,method]);return 'ok';}})});
 await rpc.call('status',[]);await rpc.call('tx',{});await rpc.call('query',{});
 assert.deepEqual(calls,[['state.example','status'],['archive.example','tx'],['state.example','query']]);assert.ok(!JSON.stringify(rpc.diagnostics()).includes('key'));assert.ok(!JSON.stringify(rpc.diagnostics()).includes('secret'));
});
test('missing history is reported separately and does not assert that a transaction never existed',async()=>{
 const rpc=new EvidenceRpc(undefined,{rpcFactory:()=>({call:async()=>{throw Object.assign(Error('private upstream'),{code:'UNKNOWN_TRANSACTION'});}})});
 await assert.rejects(rpc.call('tx',{}),error=>error.code==='HISTORY_UNAVAILABLE'&&error.message.includes('--history-rpc')&&error.message.includes('does not establish')&&!error.message.includes('private upstream'));
 assert.equal(rpc.diagnostics().failures.length,3);assert.ok(rpc.diagnostics().failures.every(f=>f.code==='UNKNOWN_TRANSACTION'));
});
test('verification-only HTTP retries respect Retry-After and return a distinct rate-limit result within the deadline',async()=>{
 let time=0;const called=[],rpc=new EvidenceRpc(['https://archive.example/private?api_key=secret'],{now:()=>time,sleep:async ms=>time+=ms,fetchImpl:async()=>{called.push(time);return new Response('',{status:429,headers:{'retry-after':'3'}});}});
 await assert.rejects(rpc.call('tx',{}),error=>error.code==='RPC_RATE_LIMITED'&&error.message.includes('429')&&error.message.includes('--history-rpc'));
 assert.deepEqual(called,[0,3000,6000]);assert.ok(time<=8000);assert.ok(!JSON.stringify(rpc.diagnostics()).includes('private'));assert.ok(!JSON.stringify(rpc.diagnostics()).includes('secret'));
});
test('verification retries an actual transient read and keeps public upstream payloads out of diagnostics',async()=>{
 let time=0,count=0;const rpc=new EvidenceRpc(['https://state.example/private'],{now:()=>time,sleep:async ms=>time+=ms,fetchImpl:async()=>++count===1?new Response('',{status:503}):new Response(JSON.stringify({jsonrpc:'2.0',result:{chain_id:'mainnet'}}),{status:200})});
 assert.deepEqual(await rpc.call('status',[]),{chain_id:'mainnet'});assert.equal(count,2);assert.equal(time,500);
 const noHistory=new EvidenceRpc(['https://archive.example/secret'],{fetchImpl:async()=>new Response(JSON.stringify({jsonrpc:'2.0',error:{cause:{name:'UNKNOWN_TRANSACTION'},message:'private upstream response'}}),{status:200})});
 await assert.rejects(noHistory.call('tx',{}),{code:'HISTORY_UNAVAILABLE'});assert.ok(!JSON.stringify(noHistory.diagnostics()).includes('secret'));assert.ok(!JSON.stringify(noHistory.diagnostics()).includes('private'));
});
test('an incomplete response body cannot hang verification beyond its total read deadline',async()=>{
 let signal;const rpc=new EvidenceRpc(['https://state.example'],{fetchImpl:async(_url,options)=>{signal=options.signal;return {ok:true,status:200,json:()=>new Promise(()=>{})};}});
 const start=performance.now();await assert.rejects(rpc.call('status',[],{timeoutMs:30}),{code:'RPC_UNAVAILABLE'});assert.ok(performance.now()-start<1000);assert.equal(signal.aborted,true);
});
test('CLI rejects incompatible or missing arguments without network access and documents unavailable exit code',()=>{
 for(const args of [['--offline','https://rpc.example'],['--history-rpc'],['--history-rpc','--offline'],['https://one.example','https://two.example']]){
  const result=spawnSync(process.execPath,['backend/bin/verify-evidence.mjs',...args],{cwd:root,encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});assert.equal(result.status,1,result.stderr);assert.equal(JSON.parse(result.stderr).status,'invalid');
 }
 const help=spawnSync(process.execPath,['backend/bin/verify-evidence.mjs','--help'],{cwd:root,encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});assert.equal(help.status,0);assert.match(help.stdout,/--history-rpc/);assert.match(help.stdout,/2 online verification unavailable/);
});

test('an exclusive archival URL has independent lane queues and enough bounded time for parallel current-state reads',async()=>{
 let time=0;const calls=[],rpc=new EvidenceRpc(['https://archival-rpc.mainnet.near.org/private?key=secret'],{now:()=>time,sleep:async ms=>time+=ms,fetchImpl:async(_url,options)=>{const request=JSON.parse(options.body);calls.push({method:request.method,time});return new Response(JSON.stringify({jsonrpc:'2.0',result:'ok'}),{status:200});}});
 await rpc.call('tx',{});await rpc.call('query',{});
 assert.equal(time,0,'Current state does not wait for the historical lane’s next 8-second slot');
 assert.deepEqual(await Promise.all(Array.from({length:9},(_,i)=>rpc.call('query',{account_id:'public-'+i}))),Array(9).fill('ok'));
 assert.ok(time<=15000,'The nine scoped reads finish inside the bounded archival state budget');assert.equal(calls.length,11);
 assert.ok(!JSON.stringify(rpc.diagnostics()).includes('secret'));
});

test('malformed local manifests fail as invalid evidence before RPC imports in online and offline modes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-invalid-manifest-'));
 try{
  const disable=join(dir,'disable-network.mjs'),importMarker=join(dir,'rpc-imported');
  await writeFile(disable,"import net from 'node:net';globalThis.fetch=()=>{throw Error('Network must not run');};net.Socket.prototype.connect=function(){throw Error('Network must not run');};");
  for(const file of ['backend/bin/verify-evidence.mjs','backend/src/evidence-offline.mjs','backend/src/core.mjs','deployments/mainnet.json','deployments/qualification.json',manifest.contract.wasmFile,...Object.values(manifest.record.artifacts).map(a=>a.file)]){await mkdir(join(dir,file,'..'),{recursive:true});await writeFile(join(dir,file),await readFile(join(root,file)));}
  const sentinel="import {writeFileSync} from 'node:fs';writeFileSync(new URL('../../rpc-imported',import.meta.url),'unexpected');throw Error('RPC import must not run');";
  for(const file of ['backend/src/evidence-rpc.mjs','backend/src/evidence-verifier.mjs'])await writeFile(join(dir,file),sentinel);
  const missingArtifacts=structuredClone(manifest);delete missingArtifacts.record.artifacts;
  const nullArtifact=structuredClone(manifest);nullArtifact.record.artifacts.artwork=null;
  const invalidStep=structuredClone(manifest);invalidStep.record.steps[0].requirements=null;
  const invalidAmounts=structuredClone(manifest);invalidAmounts.record.amounts=null;
  for(const input of ['{invalid json with private marker','null','{}',...([missingArtifacts,nullArtifact,invalidStep,invalidAmounts].map(value=>JSON.stringify(value)))]){
   await writeFile(join(dir,'deployments/qualification.json'),input);
   for(const args of [[],['--offline']]){
    const run=spawnSync(process.execPath,['--import',disable,join(dir,'backend/bin/verify-evidence.mjs'),...args],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});
    assert.equal(run.status,1,run.stderr);assert.equal(run.stdout,'');
    const error=JSON.parse(run.stderr);assert.equal(error.status,'invalid');assert.equal(error.code,'INVALID_EVIDENCE');assert.match(error.message,/deployments\/qualification\.json/);assert.equal(error.message.includes('private marker'),false);assert.equal(error.rpc,undefined);if(!args.length)assert.equal(error.progress.stage,'local-manifest');
   }
  }
  await writeFile(join(dir,'deployments/qualification.json'),JSON.stringify(manifest));
  for(const deployment of ['{invalid deployment JSON','null']){
  await writeFile(join(dir,'deployments/mainnet.json'),deployment);
  const offline=spawnSync(process.execPath,['--import',disable,join(dir,'backend/bin/verify-evidence.mjs'),'--offline'],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});
  assert.equal(offline.status,1,offline.stderr);const error=JSON.parse(offline.stderr);assert.equal(error.status,'invalid');assert.equal(error.code,'INVALID_EVIDENCE');assert.match(error.message,/deployments\/mainnet\.json/);
  }
  await assert.rejects(readFile(importMarker),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
