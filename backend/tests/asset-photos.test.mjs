import test from 'node:test';
import assert from 'node:assert/strict';
import {privateAssetMetadata} from '../src/asset-photos.mjs';
import {Store} from '../src/store.mjs';
import {Marketplace} from '../src/marketplace.mjs';
import {serveReferencePhoto} from '../src/reference-photo.mjs';
const first='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64'),second='data:image/jpeg;base64,'+Buffer.from([255,216,255,5]).toString('base64');
const draft={title:'Multi-view van',description:'Separate left and rear photos',assetType:'van',city:'Dublin',primaryPhotoSide:'left',photoDataUrl:first,photoViews:[{id:'rear',side:'rear',photoDataUrl:second,imageProvenance:'owner-photo'}],spots:[{id:'cargo',name:'Cargo panel',side:'left',photoViewId:'main',box:{x:.2,y:.2,width:.2,height:.2},suggestedPriceCents:'100',confidence:'low'},{id:'rear-door',name:'Rear door',side:'rear',photoViewId:'rear',box:{x:.3,y:.2,width:.2,height:.3},suggestedPriceCents:'100',confidence:'low'}]};
function setup(limit){const store=new Store(),m=new Marketplace({store,chain:{config:limit?{localPhotoMaxBytes:limit}:{}}});return {store,m};}
test('vehicle photos remain private, bounded and wallet-scoped; metadata edits preserve bytes omitted from workspace responses',()=>{
 const {store,m}=setup();try{
  const a=m.createAsset('owner.near',draft),metadata={...a,photoDataUrl:undefined,photoViews:a.photoViews.map(({photoDataUrl,...v})=>({...v,photoUrl:'/untrusted-address'}))};delete metadata.photoDataUrl;
  const compact=privateAssetMetadata(a);assert.equal(JSON.stringify(compact).includes('data:image'),false);assert.match(compact.photoViews[0].photoUrl,/view=rear/);assert.equal(privateAssetMetadata({...a,version:a.version+1}).photoViews[0].photoUrl,compact.photoViews[0].photoUrl);assert.notEqual(privateAssetMetadata({...a,photoViews:[{...a.photoViews[0],photoDataUrl:first}]}).photoViews[0].photoUrl,compact.photoViews[0].photoUrl);
  const saved=m.updateAsset('owner.near',a.id,a.version,{...metadata,title:'Updated van'});assert.equal(saved.photoDataUrl,first);assert.equal(saved.photoViews[0].photoDataUrl,second);assert.equal(saved.photoViews[0].photoUrl,undefined);assert.equal(saved.spots[1].photoViewId,'rear');
  assert.throws(()=>m.updateAsset('other.near',a.id,saved.version,metadata),{code:'NOT_FOUND'});
  for(const change of [{photoViews:[...draft.photoViews,...draft.photoViews]},{photoViews:[{id:'left',side:'left',photoDataUrl:second}]},{photoViews:[{id:'rear',side:'rear',photoUrl:'https://arbitrary.example'}]},{spots:[{...draft.spots[0],photoViewId:'top'}]}])assert.throws(()=>m.createAsset('owner.near',{...draft,...change}),{code:'INVALID_PHOTO_VIEW'});
  const headers={},response={setHeader:(k,v)=>headers[k]=v,writeHead:(status,fields)=>{headers.status=status;Object.assign(headers,fields);},end:bytes=>headers.body=bytes},request={method:'GET',url:'/api/assets/'+a.id+'/photo?view=rear',headers:{}};
  serveReferencePhoto({store,wallet:'owner.near',assetId:a.id,request,response});assert.equal(headers.status,200);assert.equal(headers['Content-Type'],'image/jpeg');assert.deepEqual(headers.body,Buffer.from([255,216,255,5]));assert.match(headers['Cache-Control'],/private/);
  assert.throws(()=>serveReferencePhoto({store,wallet:'other.near',assetId:a.id,request:{...request,headers:{'if-none-match':headers.ETag}},response}),{code:'NOT_FOUND'});
  assert.throws(()=>serveReferencePhoto({store,wallet:'owner.near',assetId:a.id,request:{...request,url:'/?view=top'},response}),{code:'NOT_FOUND'});
 }finally{store.close();}
});
test('additional photos share the same storage quota; an oversized replacement rolls back without losing the original view',()=>{
 const bytes=Buffer.byteLength(first)+Buffer.byteLength(second),{store,m}=setup(bytes);try{
  const a=m.createAsset('owner.near',draft);assert.equal(store.db.prepare('SELECT bytes FROM local_photo_storage').get().bytes,bytes);
  assert.throws(()=>m.updateAsset('owner.near',a.id,a.version,{...a,photoViews:[{...a.photoViews[0],photoDataUrl:first}]}),{code:'LOCAL_PHOTO_QUOTA'});assert.equal(store.get('asset',a.id).photoViews[0].photoDataUrl,second);
  m.updateAsset('owner.near',a.id,a.version,{...a,photoViews:[],spots:[a.spots[0]]});assert.equal(store.db.prepare('SELECT bytes FROM local_photo_storage').get().bytes,Buffer.byteLength(first));
 }finally{store.close();}
});
test('publication requires verified owned photo artifacts and commits every view and its spot binding without private photo bytes',()=>{
 const {store,m}=setup();try{
  let a=m.createAsset('owner.near',draft);const now=Date.now(),schedule=Object.fromEntries(['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map((k,i)=>[k,new Date(now+(i+1)*600000).toISOString()]));
  const sale=m.createSale('owner.near',{assetId:a.id,title:'Multi-view offer',arbiterId:'arbiter.near',rules:'Owner prints and installs',takeoverDefault:true,schedule,spots:a.spots.map(p=>({id:p.id,priceCents:'100'}))});
  assert.throws(()=>m.publication('owner.near',sale.id),{code:'PUBLIC_PHOTO_REQUIRED'});
  const media=(id,owner)=>store.insert('media',id,owner,{status:'verified',mime:'image/png',uri:'ipfs://baf'+id.repeat(40),sha256:id.repeat(64)});media('a','owner.near');media('b','owner.near');media('c','other.near');
  assert.throws(()=>m.updateAsset('owner.near',a.id,a.version,{...a,photoViews:[{...a.photoViews[0],coverMediaId:'c'}]}),{code:'NOT_FOUND'});
  a=m.updateAsset('owner.near',a.id,a.version,{...a,coverMediaId:'a',photoViews:[{...a.photoViews[0],coverMediaId:'b'}]});
  const p=m.publication('owner.near',sale.id);assert.equal(p.manifest.asset.primaryPhotoSide,'left');assert.equal(p.manifest.asset.photoViews[0].coverSha256,'b'.repeat(64));assert.equal(p.manifest.asset.spots[1].photoViewId,'rear');assert.doesNotMatch(JSON.stringify(p.manifest),/photoDataUrl|photoUrl|data:image|coverMediaId/);
  a=m.updateAsset('owner.near',a.id,a.version,{...a,photoViews:[{...a.photoViews[0],coverMediaId:'a'}]});assert.notEqual(m.publication('owner.near',sale.id).publishedTermsHash,p.publishedTermsHash);assert.equal(p.manifest.asset.photoViews[0].coverSha256,'b'.repeat(64));
 }finally{store.close();}
});

 test('the legacy photo counter migrates atomically to include extra views, then tracks deletion',()=>{
 const store=new Store();try{store.insert('asset','legacy','owner.near',draft);store.db.exec("CREATE TABLE local_photo_storage(id INTEGER PRIMARY KEY,bytes INTEGER); INSERT INTO local_photo_storage VALUES(1,0); CREATE TRIGGER local_photo_insert AFTER INSERT ON objects BEGIN UPDATE local_photo_storage SET bytes=bytes+0; END;");new Marketplace({store,chain:{}});
 assert.equal(store.db.prepare('SELECT bytes FROM local_photo_storage').get().bytes,Buffer.byteLength(first)+Buffer.byteLength(second));store.db.prepare("DELETE FROM objects WHERE kind='asset' AND id='legacy'").run();assert.equal(store.db.prepare('SELECT bytes FROM local_photo_storage').get().bytes,0);
 }finally{store.close();}
 });
