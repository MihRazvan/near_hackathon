import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {ROOT,cleanEnvironment} from './verification-support.mjs';
import {base58} from './verify-build.mjs';

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
