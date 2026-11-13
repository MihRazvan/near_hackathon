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
test('evidence reads automatically fail over across all three public providers and prefer the working provider afterward',async()=>{
 const calls=[],rpc=new EvidenceRpc(undefined,{rpcFactory:url=>({call:async(method,params,options)=>{calls.push({host:new URL(url).hostname,method,params,timeout:options.timeoutMs});if(new URL(url).hostname!=='archival-rpc.mainnet.near.org')throw unavailable();return {ok:true};}})});
 assert.equal(EVIDENCE_RPC_ENDPOINTS.length,3);assert.deepEqual(await rpc.call('tx',{tx_hash:'recorded',wait_until:'FINAL'}),{ok:true});await rpc.call('block',{finality:'final'});
 assert.deepEqual(calls.map(c=>c.host),['near.drpc.org','free.rpc.fastnear.com','archival-rpc.mainnet.near.org','archival-rpc.mainnet.near.org']);assert.ok(calls.every(c=>c.timeout<=8000));assert.equal(calls[1].params.wait_until,'FINAL');
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
