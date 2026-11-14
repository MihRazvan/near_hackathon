import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ROOT,sha256} from './verification-support.mjs';
import {base58,compareBuildArtifact} from './verify-build.mjs';

const expectedFor=bytes=>({bytes:bytes.length,sha256:sha256(bytes),nearCodeHash:base58(Buffer.from(sha256(bytes),'hex')),artifact:'deployed.wasm'});

test('build comparison retains actual and expected digests when the rebuilt artifact differs',()=>{
 const committed=Buffer.from('committed deployed contract'),rebuilt=Buffer.from('host-dependent rebuild'),expected=expectedFor(committed);
 assert.throws(()=>compareBuildArtifact(rebuilt,committed,expected,expected.nearCodeHash),error=>{
  assert.equal(error.exitCode,1);assert.equal(error.artifact.matchesCommitted,false);
  assert.equal(error.artifact.bytes,rebuilt.length);assert.equal(error.artifact.sha256,sha256(rebuilt));
  assert.equal(error.artifact.nearCodeHash,expectedFor(rebuilt).nearCodeHash);
  assert.equal(error.expectedArtifact.sha256,sha256(committed));assert.equal(error.expectedArtifact.committedSha256,sha256(committed));
  assert.match(error.action,/macOS arm64/);return true;
 });
});

test('identical bytes cannot pass when either pinned manifest disagrees',()=>{
 const bytes=Buffer.from('same bytes'),expected=expectedFor(bytes);
 for(const [pin,manifest] of [[{...expected,sha256:'0'.repeat(64)},expected.nearCodeHash],[{...expected,bytes:1},expected.nearCodeHash],[{...expected,nearCodeHash:'wrong'},expected.nearCodeHash],[expected,'wrong']]) {
  assert.throws(()=>compareBuildArtifact(bytes,bytes,pin,manifest),error=>error.exitCode===1&&error.artifact.matchesCommitted===true);
 }
});

test('the committed deployment passes all byte, digest and code-hash pins',async()=>{
 const pin=JSON.parse(await readFile(join(ROOT,'deployments/build.json'))),manifest=JSON.parse(await readFile(join(ROOT,'deployments/qualification.json')));
 const bytes=await readFile(join(ROOT,pin.expected.artifact));
 const result=compareBuildArtifact(bytes,bytes,pin.expected,manifest.contract.codeHash);
 assert.equal(result.artifact.matchesCommitted,true);assert.equal(result.artifact.bytes,477522);
 assert.equal(result.artifact.nearCodeHash,'5i3hw9oXjH6Ri3fGGZ177U7ckk87oeqtUUVxtYMgPsiS');
});
