import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {mkdtemp,mkdir,copyFile,rm,symlink,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {ROOT,cleanEnvironment} from './verification-support.mjs';
import {base58} from './verify-build.mjs';
import {verifyDeployedHubBytes} from './verify-sandbox.mjs';

for(const kind of ['build','sandbox'])test(kind+' runner rejects unknown flags as a structured prerequisite error without starting a check',()=>{
 const child=spawnSync(process.execPath,[join(ROOT,'scripts/verify-'+kind+'.mjs'),'--pretend-pass','--json'],{env:cleanEnvironment(),encoding:'utf8',timeout:10000});
 assert.equal(child.status,2);assert.equal(child.stderr,'');const result=JSON.parse(child.stdout);
 assert.equal(result.status,'prerequisites-unavailable');assert.equal(result.kind,kind);assert.match(result.message,/Unknown or incomplete option/);assert.equal(result.steps,undefined);
});

test('NEAR code hash encoding preserves the pinned deployment hash and leading zero bytes',()=>{
 assert.equal(base58(Buffer.from('45f29ecac83ae3c31c7e8f300d314484d82184f40f35c4bb92c319f298b5240b','hex')),'5i3hw9oXjH6Ri3fGGZ177U7ckk87oeqtUUVxtYMgPsiS');
 assert.equal(base58(Buffer.from([0,0,1])),'112');
});

test('an unsupported Sandbox browser fails before setup with structured usage guidance',()=>{
 const child=spawnSync(process.execPath,[join(ROOT,'scripts/verify-sandbox.mjs'),'--browser','unsupported','--json'],{env:cleanEnvironment(),encoding:'utf8',timeout:10000});
 assert.equal(child.status,2);const result=JSON.parse(child.stdout);assert.equal(result.status,'prerequisites-unavailable');assert.match(result.action,/chrome or --browser chromium/);assert.equal(result.steps,undefined);
});

for(const kind of ['quick','build','sandbox'])test(kind+' runner executes and reports invalid arguments from a checkout path containing spaces',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'everywhere checkout with spaces '));
 try{
  await mkdir(join(directory,'scripts'));
  for(const name of ['verification-support.mjs','verify.mjs','verify-build.mjs','verify-sandbox.mjs'])await copyFile(join(ROOT,'scripts',name),join(directory,'scripts',name));
  await symlink(join(directory,'scripts'),join(directory,'linked scripts'));
  const entry=kind==='quick'?'verify.mjs':'verify-'+kind+'.mjs';
  const child=spawnSync(process.execPath,[join(directory,'linked scripts',entry),'--pretend-pass','--json'],{cwd:directory,env:cleanEnvironment(),encoding:'utf8',timeout:10000});
  assert.equal(child.status,2,kind+' must execute its CLI rather than silently return success');
  assert.equal(JSON.parse(child.stdout).status,kind==='quick'?'invalid':'prerequisites-unavailable');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('deployed-artifact Sandbox mode rejects tampered bytes and inconsistent manifest pins',async()=>{
 const pin=JSON.parse(await readFile(join(ROOT,'deployments/build.json'),'utf8'));
 const manifest=JSON.parse(await readFile(join(ROOT,'deployments/qualification.json'),'utf8'));
 const bytes=await readFile(join(ROOT,pin.expected.artifact));
 assert.equal(verifyDeployedHubBytes(bytes,pin,manifest).nearCodeHash,pin.expected.nearCodeHash);
 const changed=Buffer.from(bytes);changed[changed.length-1]^=1;
 assert.throws(()=>verifyDeployedHubBytes(changed,pin,manifest),/pinned deployment/);
 assert.throws(()=>verifyDeployedHubBytes(bytes,pin,{...manifest,contract:{...manifest.contract,codeHash:'wrong'}}),/pinned deployment/);
});

test('unsupported hub artifact choices fail before dependency setup',()=>{
 const child=spawnSync(process.execPath,[join(ROOT,'scripts/verify-sandbox.mjs'),'--hub-artifact','pretend-pass','--json'],{env:cleanEnvironment(),encoding:'utf8',timeout:10000});
 assert.equal(child.status,2);const result=JSON.parse(child.stdout);assert.equal(result.status,'prerequisites-unavailable');assert.match(result.action,/rebuild or --hub-artifact deployed/);assert.equal(result.steps,undefined);
});
