import test from 'node:test';
import assert from 'node:assert/strict';
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
 try{const media=new Media({store,token:'test',fetchImpl:async()=>{writes++;throw Error('timeout');}}),args={owner,bytes,mime:'text/plain',publicContentAcknowledged:true};
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
