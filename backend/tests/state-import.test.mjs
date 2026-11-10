import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,symlink,unlink,copyFile,readdir,lstat,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../src/store.mjs';
import {Budget} from '../src/budget.mjs';
import {sha256} from '../src/core.mjs';
import {initializeLocalPhotoQuota} from '../src/local-photo-quota.mjs';
import {importState} from '../src/state-import.mjs';

const zeroLimits={sourceUsdc:'0',baseGas:'0',nearFees:'0',nearAllocation:'0',nearAllocationGross:'0'};
async function setup(){const volume=await mkdtemp(join(tmpdir(),'everywhere-state-import-')),stateDir=join(volume,'state'),source=join(volume,'snapshot.sqlite');const store=new Store(source);initializeLocalPhotoQuota(store);store.insert('asset','original','owner.near',{title:'Original vehicle'});new Budget(store,zeroLimits).reserve({id:'original-final-operation',kind:'near',scope:'hot.near',plan:{original:true},amounts:{}});store.transition('original-final-operation',['reserved'],'confirmed',{transactionHash:'original-hash',result:{final:true}});store.close();return {volume,stateDir,source,config:{production:true,stateDir},async environment(){return {APP_STATE_IMPORT_PATH:source,APP_STATE_IMPORT_SHA256:sha256(await readFile(source))};},async close(){await rm(volume,{recursive:true,force:true});}};}
function readObject(path,id){const db=new DatabaseSync(path,{readOnly:true});try{return db.prepare("SELECT data FROM objects WHERE kind='asset' AND id=?").get(id);}finally{db.close();}}

test('operator import installs a verified snapshot before Store opens and durable marker preserves all subsequent transactions',async()=>{
 const f=await setup();try{const environment=await f.environment(),original=await readFile(f.source);const result=await importState({config:f.config,environment});assert.equal(result.status,'imported');assert(readObject(join(f.stateDir,'state.sqlite'),'original'));assert.deepEqual(await readFile(f.source),original);assert.equal((await lstat(join(f.stateDir,'state.sqlite'))).mode&0o077,0);
  const live=new Store(join(f.stateDir,'state.sqlite'));assert.equal(live.operation('original-final-operation').transaction_hash,'original-hash');live.insert('asset','new-customer','other.near',{title:'After migration'});const budget=new Budget(live,zeroLimits);budget.reserve({id:'new-original-operation',kind:'near',scope:'hot.near',plan:{},amounts:{}});live.close();await unlink(f.source);
  assert.equal((await importState({config:f.config,environment})).status,'already-imported');assert(readObject(join(f.stateDir,'state.sqlite'),'new-customer'));const db=new DatabaseSync(join(f.stateDir,'state.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT phase FROM operations WHERE id=?').get('new-original-operation').phase,'reserved');}finally{db.close();}
 }finally{await f.close();}
});

test('paired startup environment and production-only path guards reject mistakes without importing',async()=>{
 const f=await setup();try{const environment=await f.environment();assert.equal((await importState({config:f.config,environment:{}})).status,'not-requested');
  await assert.rejects(importState({config:f.config,environment:{APP_STATE_IMPORT_PATH:f.source}}),{code:'STATE_IMPORT_CONFIG'});await assert.rejects(importState({config:{...f.config,production:false},environment}),{code:'STATE_IMPORT_PRODUCTION_ONLY'});
  await assert.rejects(importState({config:f.config,environment:{...environment,APP_STATE_IMPORT_PATH:join(f.volume,'..','outside.sqlite')}}),{code:'STATE_IMPORT_PATH'});
 }finally{await f.close();}
});

test('wrong SHA, invalid SQLite and incompatible schemas never replace an existing empty bootstrap',async()=>{
 const f=await setup();try{const bootstrap=new Store(join(f.stateDir,'state.sqlite'));bootstrap.close();const before=await readFile(join(f.stateDir,'state.sqlite')),environment=await f.environment();
  await assert.rejects(importState({config:f.config,environment:{...environment,APP_STATE_IMPORT_SHA256:'0'.repeat(64)}}),{code:'STATE_IMPORT_SHA'});assert.deepEqual(await readFile(join(f.stateDir,'state.sqlite')),before);
  await writeFile(f.source,'not a sqlite snapshot');await assert.rejects(importState({config:f.config,environment:await f.environment()}),{code:'STATE_IMPORT_INVALID'});assert.deepEqual(await readFile(join(f.stateDir,'state.sqlite')),before);
  await unlink(f.source);const incompatible=new DatabaseSync(f.source);incompatible.exec('CREATE TABLE objects(id TEXT)');incompatible.close();await assert.rejects(importState({config:f.config,environment:await f.environment()}),{code:'STATE_IMPORT_SCHEMA'});
 }finally{await f.close();}
});

test('a populated destination is refused while an empty bootstrap is backed up before atomic replacement',async()=>{
 const f=await setup();try{const target=join(f.stateDir,'state.sqlite'),live=new Store(target);live.insert('asset','existing','customer.near',{title:'Never overwrite'});live.close();const before=await readFile(target),environment=await f.environment();
  await assert.rejects(importState({config:f.config,environment}),{code:'STATE_IMPORT_NONEMPTY'});assert.deepEqual(await readFile(target),before);assert(readObject(target,'existing'));
  const reset=new DatabaseSync(target);reset.exec('DELETE FROM objects');reset.close();const result=await importState({config:f.config,environment});assert.equal(result.status,'imported');assert(readObject(target,'original'));const backups=(await readdir(f.stateDir)).filter(name=>name.startsWith('state.before-import-'));assert.equal(backups.length,1);assert.equal(readObject(join(f.stateDir,backups[0]),'original'),undefined);
 }finally{await f.close();}
});

test('source, source parent and destination symlinks cannot escape or redirect state import',async()=>{
 const f=await setup(),other=await mkdtemp(join(tmpdir(),'everywhere-state-outside-'));try{const environment=await f.environment(),link=join(f.volume,'linked.sqlite');await symlink(f.source,link);await assert.rejects(importState({config:f.config,environment:{...environment,APP_STATE_IMPORT_PATH:link}}),{code:'STATE_IMPORT_PATH'});
  await copyFile(f.source,join(other,'outside.sqlite'));await symlink(other,join(f.volume,'outside'));await assert.rejects(importState({config:f.config,environment:{...environment,APP_STATE_IMPORT_PATH:join(f.volume,'outside','outside.sqlite')}}),{code:'STATE_IMPORT_PATH'});
  await mkdir(f.stateDir,{recursive:true});await symlink(f.source,join(f.stateDir,'state.sqlite'));await assert.rejects(importState({config:f.config,environment}),{code:'STATE_IMPORT_PATH'});
 }finally{await f.close();await rm(other,{recursive:true,force:true});}
});

test('a crash after database rename but before its marker is recovered only by exact snapshot SHA provenance',async()=>{
 const f=await setup();try{const environment=await f.environment();await mkdir(f.stateDir,{recursive:true});await copyFile(f.source,join(f.stateDir,'state.sqlite'));const before=await readFile(join(f.stateDir,'state.sqlite'));
  assert.equal((await importState({config:f.config,environment})).status,'imported');assert.deepEqual(await readFile(join(f.stateDir,'state.sqlite')),before);assert.equal((await importState({config:f.config,environment})).status,'already-imported');
  await unlink(join(f.stateDir,'state.sqlite'));await assert.rejects(importState({config:f.config,environment}),{code:'STATE_IMPORT_TARGET_MISSING'});
 }finally{await f.close();}
});

test('unsettled financial operations, wallet dispatches and live WAL snapshots are refused',async()=>{
 for(const kind of ['operation','dispatch','wal']){const f=await setup();try{if(kind==='wal'){await writeFile(f.source+'-wal','uncheckpointed');await assert.rejects(importState({config:f.config,environment:await f.environment()}),{code:'STATE_IMPORT_SIDECAR'});}
  else{const source=new Store(f.source);if(kind==='operation')new Budget(source,zeroLimits).reserve({id:'pending',kind:'near',scope:'hot.near',plan:{},amounts:{}});else source.insert('wallet-request','pending','customer.near',{status:'submitted',dispatched:true});source.close();await assert.rejects(importState({config:f.config,environment:await f.environment()}),{code:'STATE_IMPORT_PENDING'});}
 }finally{await f.close();}}
});
