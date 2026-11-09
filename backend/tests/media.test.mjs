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
