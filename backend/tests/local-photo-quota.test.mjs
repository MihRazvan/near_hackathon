import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { Marketplace } from '../src/marketplace.mjs';
import { Capture } from '../src/capture.mjs';
import { configFromEnv } from '../src/config.mjs';
import { LOCAL_PHOTO_MAX_BYTES } from '../src/local-photo-quota.mjs';
const png=padding=>'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(padding,65)]).toString('base64');
const small=png(0),large=png(30),owner='owner.near';
const asset={title:'Vehicle',description:'Rear panel',assetType:'car',city:'Bucharest',spots:[{name:'Rear',side:'rear',box:{x:0,y:0,width:1,height:1},suggestedPriceCents:'1',confidence:'low'}]};
const used=store=>store.db.prepare('SELECT bytes FROM local_photo_storage WHERE id=1').get().bytes;
const actual=store=>store.db.prepare("SELECT COALESCE(SUM(length(CAST(CASE kind WHEN 'asset' THEN json_extract(data,'$.photoDataUrl') WHEN 'capture' THEN json_extract(data,'$.imageDataUrl') END AS BLOB))),0) bytes FROM objects WHERE kind IN ('asset','capture')").get().bytes;
function market(store,limit,now=()=>1000){return new Marketplace({store,chain:{config:{localPhotoMaxBytes:limit}},now});}
function captures(store,limit,now=()=>1000){return new Capture({store,config:{origin:'https://app.example',localPhotoMaxBytes:limit},now});}
function token(session){return new URL(session.uploadUrl).searchParams.get('token');}

test('quota tracks actual UTF-8 bytes, includes existing rows and replacement deltas, and rolls back oversized edits',()=>{
 const store=new Store();store.insert('asset','legacy','legacy.near',{photoDataUrl:'é'});const m=market(store,2+Buffer.byteLength(small));
 try{assert.equal(used(store),2);const first=m.createAsset(owner,{...asset,photoDataUrl:small});assert.equal(used(store),2+Buffer.byteLength(small));
  const same=m.updateAsset(owner,first.id,first.version,{...asset,photoDataUrl:small});assert.equal(used(store),actual(store));
  assert.throws(()=>m.updateAsset(owner,first.id,same.version,{...asset,photoDataUrl:large}),{code:'LOCAL_PHOTO_QUOTA'});assert.equal(store.get('asset',first.id).photoDataUrl,small);assert.equal(store.get('asset',first.id).version,same.version);assert.equal(used(store),actual(store));
  m.updateAsset(owner,first.id,same.version,{...asset,photoDataUrl:''});assert.equal(used(store),2);store.db.prepare("DELETE FROM objects WHERE kind='asset' AND id='legacy'").run();assert.equal(used(store),0);
 }finally{store.close();}
});

test('asset and phone capture reservations share one atomic budget across database connections',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-photo-budget-')),a=new Store(join(dir,'state.sqlite')),b=new Store(join(dir,'state.sqlite'));
 try{const m=market(a,Buffer.byteLength(small)),c=captures(b,Buffer.byteLength(small)),session=c.create('phone.near');m.createAsset(owner,{...asset,photoDataUrl:small});
  assert.throws(()=>c.upload(session.id,{token:token(session),imageDataUrl:small}),{code:'LOCAL_PHOTO_QUOTA'});assert.equal(b.get('capture',session.id).status,'waiting');assert.equal(used(a),Buffer.byteLength(small));assert.equal(used(b),actual(b));
  const row=a.list('asset',owner)[0];m.updateAsset(owner,row.id,row.version,{...asset,photoDataUrl:''});c.upload(session.id,{token:token(session),imageDataUrl:small});assert.equal(used(a),Buffer.byteLength(small));assert.throws(()=>m.createAsset('another.near',{...asset,photoDataUrl:small}),{code:'LOCAL_PHOTO_QUOTA'});assert.equal(a.list('asset').length,1);
 }finally{a.close();b.close();await rm(dir,{recursive:true,force:true});}
});

test('unphotographed asset creation is bounded per wallet and globally',()=>{
 const store=new Store(),m=market(store,LOCAL_PHOTO_MAX_BYTES);
 try{for(let i=0;i<20;i++)m.createAsset(owner,asset);assert.throws(()=>m.createAsset(owner,asset),{code:'ASSET_LIMIT'});assert.equal(store.list('asset',owner).length,20);
  store.transaction(()=>{for(let i=20;i<1999;i++)store.insert('asset','seed-'+i,'seed'+i+'.near',{});});m.createAsset('last.near',asset);assert.equal(store.list('asset').length,2000);assert.throws(()=>m.createAsset('extra.near',asset),{code:'ASSET_LIMIT'});assert.equal(used(store),0);
 }finally{store.close();}
});

test('expired captures lose their photo and upload capability before quota is reused',()=>{
 const store=new Store();let now=1000;const c=captures(store,Buffer.byteLength(small),()=>now),m=market(store,Buffer.byteLength(small),()=>now);
 try{const session=c.create(owner);c.upload(session.id,{token:token(session),imageDataUrl:small});assert.equal(used(store),Buffer.byteLength(small));now+=1800001;
  m.createAsset(owner,{...asset,photoDataUrl:small});const expired=store.get('capture',session.id);assert.equal(expired.status,'expired');assert.equal(expired.imageDataUrl,undefined);assert.equal(expired.tokenHash,undefined);assert.equal(used(store),Buffer.byteLength(small));
  assert.throws(()=>c.upload(session.id,{token:token(session),imageDataUrl:small}),{code:'CAPTURE_EXPIRED'});assert.equal(c.read(owner,session.id).status,'expired');
 }finally{store.close();}
});

test('active capture slots are bounded globally and per wallet, then become reusable after expiry',()=>{
 const store=new Store();let now=1000;const c=captures(store,LOCAL_PHOTO_MAX_BYTES,()=>now);
 try{const first=c.create(owner);c.create(owner);assert.throws(()=>c.create(owner),{code:'CAPTURE_LIMIT'});
  for(let i=0;i<98;i++)c.create('guest'+i+'.near');assert.equal(store.list('capture').length,100);assert.throws(()=>c.create('extra.near'),{code:'CAPTURE_LIMIT'});
  now+=1800001;assert.equal(c.read(owner,first.id).status,'expired');assert.equal(c.create(owner).id.length,32);assert.equal(store.list('capture').filter(r=>r.status!=='expired').length,1);
 }finally{store.close();}
});

test('capture metadata remains bounded while cleanup never deletes financial records',()=>{
 const store=new Store();market(store,LOCAL_PHOTO_MAX_BYTES);
 try{store.insert('booking','financial',owner,{status:'submitted',transactionHash:'original'});const financial=store.get('booking','financial');
  store.transaction(()=>{for(let i=0;i<2005;i++)store.insert('capture','expired-'+String(i).padStart(4,'0'),owner,{expiresAt:i,status:'received',tokenHash:'old-token',imageDataUrl:small});});assert.equal(used(store),2005*Buffer.byteLength(small));
  const c=captures(store,LOCAL_PHOTO_MAX_BYTES,()=>10000);assert.equal(store.list('capture').length,2000);assert.equal(used(store),0);assert(store.list('capture').every(r=>r.status==='expired'&&!r.tokenHash&&!r.imageDataUrl));
  c.create(owner);assert.equal(store.list('capture').length,2000);assert.equal(store.get('capture','expired-0000'),null);assert.deepEqual(store.get('booking','financial'),financial);
 }finally{store.close();}
});

test('local photo storage defaults to 128 MiB and configuration can only lower that bound',()=>{
 assert.equal(configFromEnv({}).localPhotoMaxBytes,LOCAL_PHOTO_MAX_BYTES);assert.equal(configFromEnv({APP_LOCAL_PHOTO_MAX_BYTES:'1000'}).localPhotoMaxBytes,1000);
 for(const value of ['0','-1','1.5',String(LOCAL_PHOTO_MAX_BYTES+1)])assert.throws(()=>configFromEnv({APP_LOCAL_PHOTO_MAX_BYTES:value}),{code:'INVALID_LIMIT'});
});
