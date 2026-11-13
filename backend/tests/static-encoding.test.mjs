import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync,brotliDecompressSync} from 'node:zlib';
import {encodeStaticAsset} from '../src/static-encoding.mjs';
test('immutable application assets transfer compressed with exactly the original executable bytes',()=>{
 const bytes=Buffer.from('export const readableSource = "Everywhere";\n'.repeat(500));
 for(const [header,encoding]of [['gzip, deflate, br','br'],['gzip','gzip'],['br;q=0,gzip;q=1','gzip'],['br;q=0.2,gzip;q=0.9','gzip']]){
  const result=encodeStaticAsset('assets/performance-test.js',bytes,header);assert.equal(result.encoding,encoding);assert.deepEqual((encoding==='br'?brotliDecompressSync:gunzipSync)(result.bytes),bytes);assert(result.bytes.length<bytes.length/2);
 }
 assert.equal(encodeStaticAsset('assets/performance-test.js',bytes,'br;q=0,gzip;q=0').encoding,undefined);
});
test('HTML with per-request CSP nonces, private data and already compressed photos/fonts never enter the encoding cache',()=>{
 const bytes=Buffer.from('private nonce or compressed image bytes'.repeat(100));
 for(const name of ['index.html','api/workspace','images/photo.jpg','assets/photo.webp','fonts/body.woff2']){const result=encodeStaticAsset(name,bytes,'br,gzip');assert.equal(result.bytes,bytes);assert.equal(result.encoding,undefined);}
});
test('wallet adapter compression tracks its actual bytes when rebuilt at the same public URL',()=>{
 for(const word of ['original','rebuilt']){const bytes=Buffer.from(word.repeat(500));const result=encodeStaticAsset('wallets.js',bytes,'br');assert.equal(result.encoding,'br');assert.deepEqual(brotliDecompressSync(result.bytes),bytes);}
});
