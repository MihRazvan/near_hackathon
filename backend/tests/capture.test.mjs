import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {Capture} from '../src/capture.mjs';
const photo='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
test('camera handoff grants only a single photo upload, remains owner-private, and retries the same photo safely',()=>{
 const store=new Store();let now=1000;const c=new Capture({store,config:{origin:'http://127.0.0.1:4320'},now:()=>now});
 try{const created=c.create('owner.near'),token=new URL(created.uploadUrl).searchParams.get('token');
  assert.throws(()=>c.read('other.near',created.id),{code:'NOT_FOUND'});assert.throws(()=>c.upload(created.id,{token:'wrong',imageDataUrl:photo}),{code:'CAPTURE_EXPIRED'});
  assert.equal(c.upload(created.id,{token,imageDataUrl:photo}).saved,true);assert.equal(c.upload(created.id,{token,imageDataUrl:photo}).saved,true);
  const own=c.read('owner.near',created.id);assert.equal(own.imageDataUrl,photo);assert.equal('tokenHash' in own,false);
  assert.throws(()=>c.upload(created.id,{token,imageDataUrl:photo+'x'}),{code:'CAPTURE_ALREADY_SAVED'});
  now+=1800001;assert.throws(()=>c.upload(created.id,{token,imageDataUrl:photo}),{code:'CAPTURE_EXPIRED'});
 }finally{store.close();}
});
test('a captured photo creates one owner draft across retries and cannot be consumed by another wallet',async()=>{
 const {Marketplace}=await import('../src/marketplace.mjs');const store=new Store(),c=new Capture({store,config:{origin:'http://localhost:4318'}}),marketplace=new Marketplace({store,chain:{}});
 try{const created=c.create('owner.near'),token=new URL(created.uploadUrl).searchParams.get('token');c.upload(created.id,{token,imageDataUrl:photo});
  assert.throws(()=>c.consume('other.near',created.id,marketplace),{code:'NOT_FOUND'});
  const a=c.consume('owner.near',created.id,marketplace),again=c.consume('owner.near',created.id,marketplace);assert.equal(a.id,again.id);assert.equal(store.list('asset').length,1);assert.equal(a.photoDataUrl,photo);assert.equal(c.read('owner.near',created.id).imageDataUrl,null);assert.equal(c.upload(created.id,{token,imageDataUrl:photo}).saved,true);
 }finally{store.close();}
});
