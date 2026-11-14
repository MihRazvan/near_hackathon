import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {committedArtifactMedia} from '../src/artifact-presentation.mjs';
import {Product} from '../src/product.mjs';
const uri='ipfs://baf'+'a'.repeat(45),sha256='ab'.repeat(32),record={artifact_uri:uri,artifact_sha256:Buffer.from(sha256,'hex').toString('base64')};
test('artifact presentation discloses only public verified media matching the actual chain URI and hash',()=>{
 const store=new Store();try{
  store.insert('media','file','buyer.near',{uri,sha256,mime:'image/jpeg',bytes:50230,status:'verified',public:true,fileId:'private-provider-id'});
  const snapshot={rights:{proposal:record},campaign:{delivery_proof:record}};
  assert.deepEqual(committedArtifactMedia(store,snapshot),{artwork:{uri,sha256,mime:'image/jpeg',bytes:50230},delivery:{uri,sha256,mime:'image/jpeg',bytes:50230}});
  snapshot.rights.proposal={...record,artifact_sha256:Buffer.alloc(32,1).toString('base64')};assert.equal(committedArtifactMedia(store,snapshot).artwork,undefined);
  snapshot.rights.proposal={...record,artifact_uri:uri+'a'};assert.equal(committedArtifactMedia(store,snapshot).artwork,undefined);
  for(const changes of [{public:false},{status:'uploaded'}]){const m=store.get('media','file');store.update('media',m.id,m.owner,m.version,{...m,public:true,status:'verified',...changes});assert.deepEqual(committedArtifactMedia(store,{rights:{proposal:record}}),{});}
  assert.deepEqual(committedArtifactMedia(store,{}),{});
 }finally{store.close();}
});
test('the public catalog carries committed artwork metadata without changing cached chain state',async()=>{
 const store=new Store();try{
  store.insert('media','file','buyer.near',{uri,sha256,mime:'image/jpeg',bytes:50230,status:'verified',public:true});
  const snapshot={accountId:'offer',state:{artwork_locked:false},rights:{proposal:record},campaign:{},credits:{}};
  const product=new Product({store,marketplace:{browse:()=>[{owner:'seller.near',spots:[{contractId:'offer'}]}]},chain:{snapshot:async()=>snapshot}});
  const catalog=await product.catalog();assert.equal(catalog.snapshots[0].artifacts.artwork.mime,'image/jpeg');assert.equal(catalog.snapshots[0].state.artwork_locked,false);
  assert.equal(snapshot.artifacts,undefined,'presentation metadata must not mutate the original chain response');
  assert.equal(catalog.snapshots[0].artifacts.artwork.owner,undefined);
 }finally{store.close();}
});
