import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document={querySelector:()=>null};
const {live}=await import('../src/integration/runtime.mjs');
const {publishVehiclePhotos}=await import('../src/integration/view-publication.mjs');
const asset=()=>({id:'van',version:1,primaryPhotoSide:'left',photoUrl:'/api/assets/van/photo',photoViews:[{id:'rear',side:'rear',photoUrl:'/api/assets/van/photo?view=rear'}],spots:[]});
const image='data:image/jpeg;base64,/9j/';
function setup(){live.session={wallet:'owner.near'};live.data={dashboard:{assets:[asset()]}};}
test('all photo views require publication consent, preserve ownership across loading and pinning, and never start a financial action',async()=>{
 setup();let calls=0;await assert.rejects(publishVehiclePhotos(asset(),{acknowledged:false,request:async()=>calls++}),/Agree to publish/);assert.equal(calls,0);
 await assert.rejects(publishVehiclePhotos(asset(),{acknowledged:true,loadPhoto:async()=>{live.session.wallet='different.near';return image;},request:async()=>calls++}),/wallet changed/);assert.equal(calls,0);
});
test('each published photo is saved before the next upload, so a later failure retries only the remaining view',async()=>{
 setup();let uploads=0,fail=true;const request=async(path,body)=>{
  if(path==='media'){uploads++;if(fail&&uploads===2)throw new Error('Pinning unavailable');return {id:'media-'+uploads};}
  assert.equal(path,'assets/van');const prior=live.data.dashboard.assets[0];assert.equal(body.version,prior.version);
  const a={...body.asset,version:prior.version+1};if(a.coverMediaId)a.coverUri='ipfs://cover';a.photoViews=a.photoViews.map(v=>v.coverMediaId?{...v,coverUri:'ipfs://rear'}:v);return a;
 };
 await assert.rejects(publishVehiclePhotos(asset(),{acknowledged:true,request,loadPhoto:async()=>image}),/Pinning unavailable/);assert.equal(live.data.dashboard.assets[0].coverUri,'ipfs://cover');assert.equal(live.data.dashboard.assets[0].photoViews[0].coverUri,undefined);
 fail=false;const done=await publishVehiclePhotos(live.data.dashboard.assets[0],{acknowledged:true,request,loadPhoto:async()=>image});assert.equal(uploads,3);assert.equal(done.photoViews[0].coverUri,'ipfs://rear');assert.equal(done.coverMediaId,'media-1');
});
