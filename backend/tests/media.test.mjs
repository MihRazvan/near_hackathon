import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync,crc32 } from 'node:zlib';
import { sha256 } from '../src/core.mjs';
import { Store } from '../src/store.mjs';
import { Media } from '../src/media.mjs';

const owner='owner.near',bytes=Buffer.from('Synthetic public proof. No real delivery is claimed.'),cid='bafkreifp3bc74zay3fm6bgseijx6plb4ayr6bewah6thiivaygj4oeh26a';
test('public IPFS artifacts require consent and verified retrieval; duplicate content does not upload twice',async()=>{
 const store=new Store();let writes=0;
 try{const media=new Media({store,token:'test-private-token',fetchImpl:async(url,options)=>{
  if(url.includes('uploads.')){writes++;assert.equal(options.body.get('network'),'public');return Response.json({data:{id:'file',cid,size:bytes.length}});}
  if(url.includes('api.'))return Response.json({data:{id:'file',cid,size:bytes.length}});return new Response(bytes);
 }});
 await assert.rejects(media.upload({owner,bytes,mime:'text/plain'}),/intended for public/);
 const args={owner,bytes,mime:'text/plain',publicContentAcknowledged:true},first=await media.upload(args);assert.equal(first.status,'verified');
 assert.equal((await media.upload(args)).id,first.id);assert.equal(writes,1);assert.equal(JSON.stringify(media).includes('test-private-token'),false);
 }finally{store.close();}
});
test('unknown uploads remain reserved; failed content verification never silently reuploads',async()=>{
 const store=new Store();let writes=0;
 try{const media=new Media({store,token:'test',fetchImpl:async(url,options)=>{if(options?.method==='POST')writes++;throw Error('timeout');}}),args={owner,bytes,mime:'text/plain',publicContentAcknowledged:true};
  await assert.rejects(media.upload(args),/unknown/);await assert.rejects(media.upload(args),/needs reconciliation/);assert.equal(writes,1);
 }finally{store.close();}
 const other=new Store();writes=0;
 try{const media=new Media({store:other,token:'test',fetchImpl:async url=>{
  if(url.includes('uploads.')){writes++;return Response.json({data:{id:'file',cid,size:bytes.length}});}
  if(url.includes('api.'))return Response.json({data:{id:'file',cid,size:bytes.length}});return new Response(Buffer.alloc(bytes.length));
 }}),args={owner,bytes,mime:'text/plain',publicContentAcknowledged:true};
 await assert.rejects(media.upload(args),/hash differs/);await assert.rejects(media.upload(args),/hash differs/);assert.equal(writes,1);
 }finally{other.close();}
});
test('a public verified IPFS link can be reused by another wallet after fresh byte verification',async()=>{
 const store=new Store();let uploads=0,corrupt=false;
 const media=new Media({store,token:'test',fetchImpl:async url=>{if(url.includes('uploads.')){uploads++;return Response.json({data:{id:'file',cid,size:bytes.length}});}if(url.includes('api.'))return Response.json({data:{id:'file',cid,size:bytes.length}});return new Response(corrupt?Buffer.alloc(bytes.length):bytes);}});
 try{const original=await media.upload({owner,bytes,mime:'text/plain',publicContentAcknowledged:true});
  await assert.rejects(media.reuseVerified({owner:'seller.near',uri:original.uri}),{code:'PUBLIC_CONTENT_REQUIRED'});
  await assert.rejects(media.reuseVerified({owner:'seller.near',uri:'https://example.com/file',publicContentAcknowledged:true}),{code:'INVALID_MEDIA'});
  corrupt=true;await assert.rejects(media.reuseVerified({owner:'seller.near',uri:original.uri,publicContentAcknowledged:true}),{code:'MEDIA_CHANGED'});corrupt=false;
  const reused=await media.reuseVerified({owner:'seller.near',uri:original.uri,publicContentAcknowledged:true});assert.equal(reused.owner,'seller.near');assert.equal(reused.status,'verified');assert.equal(reused.sha256,original.sha256);assert.equal(reused.uri,original.uri);assert.equal(uploads,1);
 }finally{store.close();}
});

function pngWithComment(size){
 const chunk=(type,data)=>{const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('tEXt',Buffer.concat([Buffer.from('Comment\0'),Buffer.alloc(size,65)])),chunk('IDAT',deflateSync(Buffer.alloc(5))),chunk('IEND',Buffer.alloc(0))]);
}
test('multi-block IPFS storage size is separate from the exact downloaded file bytes',async()=>{
 const store=new Store(),data=pngWithComment(300000),providerBytes=data.length+108;let uploads=0,corrupt=false;
 const media=new Media({store,token:'test',fetchImpl:async url=>{
  if(url.includes('uploads.')){uploads++;return Response.json({data:{id:'blocks',cid,size:providerBytes}});}
  if(url.includes('api.'))return Response.json({data:{id:'blocks',cid,size:providerBytes}});
  return new Response(corrupt?Buffer.alloc(data.length):data);
 }});
 try{
  const record=await media.upload({owner,bytes:data,mime:'image/png',publicContentAcknowledged:true});assert.equal(record.bytes,data.length);assert.equal(record.providerBytes,providerBytes);assert.equal(record.sha256,sha256(data));
  const alias=await media.reuseVerified({owner:'another.near',uri:record.uri,publicContentAcknowledged:true});assert.equal(alias.providerBytes,providerBytes);assert.equal(alias.status,'verified');assert.equal(uploads,1);
  corrupt=true;await assert.rejects(media.verify({...record,status:'uploaded'}),/hash differs/);
 }finally{store.close();}
});
test('an uncertain upload recovers its provider record by exact upload identity without another upload',async()=>{
 const store=new Store();let uploads=0,metadata,wrong=true;
 const media=new Media({store,token:'test',fetchImpl:async(url,options)=>{
  if(url.includes('uploads.')){uploads++;metadata={id:'recovered',cid,size:bytes.length+108,name:options.body.get('name'),mime_type:'text/plain',keyvalues:JSON.parse(options.body.get('keyvalues'))};throw Error('response lost');}
  if(url.includes('?name='))return Response.json({data:{files:[{...metadata,keyvalues:{...metadata.keyvalues,sha256:wrong?'0'.repeat(64):metadata.keyvalues.sha256}}]}});
  if(url.includes('api.'))return Response.json({data:metadata});return new Response(bytes);
 }});
 try{
  const args={owner,bytes,mime:'text/plain',publicContentAcknowledged:true};await assert.rejects(media.upload(args),{code:'UPLOAD_UNKNOWN'});
  await assert.rejects(media.upload(args),{code:'UPLOAD_UNKNOWN'});assert.equal(store.list('media')[0].status,'upload-unknown');assert.equal(uploads,1);
  wrong=false;const recovered=await media.upload(args);assert.equal(recovered.status,'verified');assert.equal(recovered.providerBytes,bytes.length+108);assert.equal(uploads,1);
 }finally{store.close();}
});
function pinningStub(){
 const files=new Map(),uploaded=[];
 const fetchImpl=async(url,options)=>{
  if(url.includes('uploads.')){const file=options.body.get('file'),data=Buffer.from(await file.arrayBuffer()),digest=sha256(data),cid='baf'+[...digest].map(c=>String.fromCharCode(97+parseInt(c,16))).join(''),entry={id:'file-'+digest,cid,size:data.length,data};files.set(entry.id,entry);uploaded.push(entry);return Response.json({data:{id:entry.id,cid:entry.cid,size:entry.size}});}
  if(url.includes('api.')){const file=files.get(decodeURIComponent(url.split('/').at(-1)));return Response.json({data:{id:file.id,cid:file.cid,size:file.size}});}
  const file=[...files.values()].find(f=>url.endsWith(f.cid));return new Response(file.data);
 };
 return {fetchImpl,uploaded};
}

test('multi-megabyte print PNG and PDF preserve their exact original bytes and SHA256',async()=>{
 const store=new Store(),provider=pinningStub(),png=pngWithComment(3000000),pdf=Buffer.concat([Buffer.from('%PDF-1.7\n'),Buffer.alloc(3000000,32),Buffer.from('\n%%EOF\n')]);
 try{const media=new Media({store,token:'test',maxBytes:20000000,maxTotalBytes:1000000000,fetchImpl:provider.fetchImpl});
  for(const [data,mime] of [[png,'image/png'],[pdf,'application/pdf']]){const record=await media.upload({owner,bytes:data,mime,publicContentAcknowledged:true});assert.equal(record.status,'verified');assert.equal(record.bytes,data.length);assert.equal(record.sha256,sha256(data));assert.deepEqual(provider.uploaded.at(-1).data,data);}
  assert.equal(provider.uploaded.length,2);assert.equal(store.list('media').length,2);
 }finally{store.close();}
});

test('file-size, image magic and global storage caps reject before any provider request',async()=>{
 const store=new Store();let requests=0;const media=new Media({store,token:'test',maxBytes:100,maxTotalBytes:50,fetchImpl:async()=>{requests++;throw Error('must not fetch');}});
 try{await assert.rejects(media.upload({owner,bytes:Buffer.alloc(101,65),mime:'text/plain',publicContentAcknowledged:true}),{code:'MEDIA_LIMIT'});
  await assert.rejects(media.upload({owner,bytes:Buffer.from('not a PNG'),mime:'image/png',publicContentAcknowledged:true}),{code:'INVALID_IMAGE'});
  await assert.rejects(media.upload({owner,bytes:Buffer.from([255,216,0]),mime:'image/jpeg',publicContentAcknowledged:true}),{code:'INVALID_IMAGE'});
  await assert.rejects(media.upload({owner,bytes:Buffer.alloc(51,65),mime:'text/plain',publicContentAcknowledged:true}),{code:'MEDIA_STORAGE_QUOTA'});assert.equal(requests,0);assert.equal(store.list('media').length,0);
 }finally{store.close();}
});

test('two database connections cannot oversubscribe the global byte reservation during concurrent uploads',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-media-quota-')),a=new Store(join(dir,'state.sqlite')),b=new Store(join(dir,'state.sqlite'));let release,requests=0;
 const gate=new Promise(resolve=>{release=resolve;}),fetchImpl=async()=>{requests++;await gate;throw Error('unknown upload outcome');};
 try{const first=new Media({store:a,token:'test',maxBytes:100,maxTotalBytes:100,fetchImpl}),second=new Media({store:b,token:'test',maxBytes:100,maxTotalBytes:100,fetchImpl});
  const pending=Promise.allSettled([first.upload({owner,bytes:Buffer.alloc(60,65),mime:'text/plain',publicContentAcknowledged:true}),second.upload({owner:'other.near',bytes:Buffer.alloc(60,66),mime:'text/plain',publicContentAcknowledged:true})]);release();const outcomes=await pending;
  assert.equal(outcomes[0].reason.code,'UPLOAD_UNKNOWN');assert.equal(outcomes[1].reason.code,'MEDIA_STORAGE_QUOTA');assert.equal(requests,1);assert.equal(a.list('media').length,1);assert.equal(b.list('media')[0].bytes,60);assert.equal(b.list('media')[0].status,'upload-unknown');
 }finally{a.close();b.close();await rm(dir,{recursive:true,force:true});}
});

test('unknown uploads keep bytes reserved, and public aliases cannot duplicate pins or evade global quota',async()=>{
 const store=new Store(),provider=pinningStub();let failFirst=true,writes=0;
 const fetchImpl=async(url,options)=>{if(url.includes('uploads.')){writes++;if(failFirst){failFirst=false;throw Error('unknown');}}return provider.fetchImpl(url,options);};
 try{const media=new Media({store,token:'test',maxBytes:100,maxTotalBytes:100,fetchImpl}),unknown=Buffer.alloc(60,65),known=Buffer.alloc(40,66);
  await assert.rejects(media.upload({owner,bytes:unknown,mime:'text/plain',publicContentAcknowledged:true}),{code:'UPLOAD_UNKNOWN'});
  await assert.rejects(media.upload({owner:'other.near',bytes:unknown,mime:'text/plain',publicContentAcknowledged:true}),{code:'UPLOAD_UNKNOWN'});assert.equal(writes,1);
  const original=await media.upload({owner,bytes:known,mime:'text/plain',publicContentAcknowledged:true});
  const alias=await media.upload({owner:'other.near',bytes:known,mime:'text/plain',publicContentAcknowledged:true}),reused=await media.reuseVerified({owner:'third.near',uri:original.uri,publicContentAcknowledged:true});
  assert.equal(alias.fileId,original.fileId);assert.equal(reused.fileId,original.fileId);assert.equal(alias.sha256,original.sha256);assert.equal(writes,2);
  await assert.rejects(media.upload({owner:'fourth.near',bytes:Buffer.from('C'),mime:'text/plain',publicContentAcknowledged:true}),{code:'MEDIA_STORAGE_QUOTA'});assert.equal(writes,2);assert.equal(store.list('media').length,4);
 }finally{store.close();}
});

test('retrieval is bounded by the reserved exact size and configured limit, retaining failed verification for recovery',async()=>{
 const store=new Store(),data=Buffer.from('valid proof'),args={owner,bytes:data,mime:'text/plain',publicContentAcknowledged:true};let writes=0,cancelled=false;
 const fetchImpl=async url=>{
  if(url.includes('uploads.')){writes++;return Response.json({data:{id:'file',cid,size:data.length}});}
  if(url.includes('api.'))return Response.json({data:{id:'file',cid,size:data.length}});
  let part=0;return new Response(new ReadableStream({pull(controller){controller.enqueue(part++===0?data:Buffer.from('X'));},cancel(){cancelled=true;}}));
 };
 try{const media=new Media({store,token:'test',maxBytes:100,maxTotalBytes:100,fetchImpl});await assert.rejects(media.upload(args),{code:'MEDIA_CHANGED'});assert.equal(cancelled,true);assert.equal(store.list('media')[0].status,'uploaded');await assert.rejects(media.upload(args),{code:'MEDIA_CHANGED'});assert.equal(writes,1);
  let reads=0;const smaller=new Media({store,token:'test',maxBytes:5,maxTotalBytes:100,fetchImpl:async()=>{reads++;throw Error('must not fetch');}});await assert.rejects(smaller.verify(store.list('media')[0]),{code:'MEDIA_LIMIT'});assert.equal(reads,0);
 }finally{store.close();}
});
