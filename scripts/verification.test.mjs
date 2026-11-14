import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {ROOT,cleanEnvironment} from './verification-support.mjs';

test('verification child environment drops wallet/provider secrets and cannot enable funded execution',()=>{
 const names=['INTEGRATION_NEAR_PRIVATE_KEY','NEAR_AI_API_KEY','OPENAI_API_KEY','NODE_OPTIONS','APP_PERSONAL_AI_TOKEN'];
 const original=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{
  for(const name of names)process.env[name]='invalid-test-sentinel';
  const env=cleanEnvironment({INTEGRATION_ALLOW_MAINNET:'true',APP_KEEPER_ENABLED:'true',INTEGRATION_ALLOW_FUNDED_BROWSER_WALLETS:'true',APP_ENV_FILE:'/invalid/personal.env',INTEGRATION_NEAR_PRIVATE_KEY:'invalid-test-sentinel'});
  for(const name of names)assert.equal(env[name],undefined,name+' must not be inherited or accepted as an override');
  assert.equal(env.INTEGRATION_ALLOW_MAINNET,'false');assert.equal(env.APP_KEEPER_ENABLED,'false');assert.equal(env.INTEGRATION_ALLOW_FUNDED_BROWSER_WALLETS,'false');assert.notEqual(env.APP_ENV_FILE,'/invalid/personal.env');
 }finally{for(const name of names)if(original[name]===undefined)delete process.env[name];else process.env[name]=original[name];}
});

test('offline entry runs from another working directory without dependencies, with parent networking blocked, and reports integrity-only scope',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'everywhere-offline-'));
 const guard=`import http from 'node:http';import https from 'node:https';globalThis.fetch=()=>{throw Error('Network is forbidden in offline verification')};http.request=http.get=https.request=https.get=globalThis.fetch;`;
 try{
  const child=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(guard),join(ROOT,'scripts/verify.mjs'),'--offline','--json'],{cwd,env:cleanEnvironment(),encoding:'utf8',timeout:15000});
  assert.equal(child.status,0,child.stderr||child.stdout);const report=JSON.parse(child.stdout);
  assert.equal(report.status,'passed');assert.equal(report.kind,'offline-integrity');assert.equal(report.checks.length,1);assert.match(report.scope,/no chain verification/i);
  const persisted=JSON.parse(await readFile(resolve(ROOT,report.reportPath),'utf8'));assert.equal(persisted.status,'passed');assert.equal(persisted.checks[0].name,'offline-integrity');
 }finally{await rm(cwd,{recursive:true,force:true});}
});

test('invalid verifier arguments fail without reporting a successful verification',()=>{
 const child=spawnSync(process.execPath,[join(ROOT,'scripts/verify.mjs'),'--pretend-pass'],{env:cleanEnvironment(),encoding:'utf8',timeout:10000});
 assert.equal(child.status,2);assert.doesNotMatch(child.stdout,/Verification passed/);assert.match(child.stderr,/Unknown option/);
});

test('an exported source directory is not attributed to an enclosing repository commit',async()=>{
 const {sourceIdentity}=await import('./verify.mjs');const root=await mkdtemp(join(ROOT,'.local/verification/archive-test-'));
 try{assert.deepEqual(sourceIdentity(root),{kind:'source-archive',commit:null});}finally{await rm(root,{recursive:true,force:true});}
});

test('invalid JSON-mode requests return structured failure and exit nonzero',()=>{
 const child=spawnSync(process.execPath,[join(ROOT,'scripts/verify.mjs'),'--json','--pretend-pass'],{env:cleanEnvironment(),encoding:'utf8',timeout:10000});
 assert.equal(child.status,2);const report=JSON.parse(child.stdout);assert.equal(report.status,'invalid');assert.deepEqual(report.checks,[]);
});
