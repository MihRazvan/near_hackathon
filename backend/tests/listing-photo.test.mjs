import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {Marketplace} from '../src/marketplace.mjs';
import {hashObject,sha256} from '../src/core.mjs';
import {listingPhotoSource,attachListingPhoto,withListingPhoto} from '../src/listing-photo.mjs';
const owner='owner.near',bytes=Buffer.from([255,216,255,5]),photo='data:image/jpeg;base64,'+bytes.toString('base64');
function fixture(){
 const store=new Store(),m=new Marketplace({store,chain:{}}),asset=m.createAsset(owner,{title:'White van',description:'Owner vehicle',city:'Zagreb',assetType:'van',photoDataUrl:photo,spots:[{id:'door',name:'Door panel',side:'left',box:{x:.2,y:.2,width:.3,height:.2},suggestedPriceCents:'10',confidence:'low'}]});
 const frozen={id:asset.id,title:asset.title,city:asset.city,assetType:asset.assetType,spots:asset.spots},manifest={asset:frozen,spots:[{id:'door'}]},publishedTermsHash=hashObject(manifest),sale=store.insert('sale','legacy-sale',owner,{assetId:asset.id,status:'published',spots:[{id:'door',contractId:'offer'}],publication:{manifest,publishedTermsHash}});
 store.insert('media','photo',owner,{public:true,status:'verified',mime:'image/jpeg',sha256:sha256(bytes),uri:'ipfs://baf'+'a'.repeat(40)});
 return {store,m,asset,sale,input:{publicContentAcknowledged:true,publishedTermsHash,mediaId:'photo'}};
}
test('a missing-cover repair exposes verified original media separately while preserving every published term and spot binding',()=>{
 const {store,m,sale,input}=fixture();try{
  const before=JSON.stringify(store.get('sale',sale.id)),record=attachListingPhoto(store,owner,sale.id,input),shown=m.sale(sale.id);assert.equal(record.provenance,'photo-added-after-publication');assert.equal(record.authorization,'owner-session');
  assert.equal(shown.presentation.coverSha256,sha256(bytes));assert.deepEqual(shown.publication,sale.publication);assert.equal(JSON.stringify(store.get('sale',sale.id)),before);assert.equal(m.browse()[0].presentation.coverUri,record.coverUri);assert.equal(m.dashboard(owner).sales[0].presentation.coverUri,record.coverUri);
  assert.equal(attachListingPhoto(store,owner,sale.id,input).id,record.id);assert.equal(store.list('listing-photo').length,1);
 }finally{store.close();}
});
test('missing-photo repair requires the owner, public-storage consent, unchanged terms, unchanged layout and the exact verified photo bytes',()=>{
 const {store,m,asset,sale,input}=fixture();try{
  assert.throws(()=>listingPhotoSource(store,'other.near',sale.id,input),{code:'NOT_FOUND'});assert.throws(()=>listingPhotoSource(store,owner,sale.id,{...input,publicContentAcknowledged:false}),{code:'PUBLIC_CONTENT_REQUIRED'});assert.throws(()=>listingPhotoSource(store,owner,sale.id,{...input,publishedTermsHash:'changed'}),{code:'PUBLICATION_CHANGED'});
  store.insert('media','different',owner,{public:true,status:'verified',sha256:'00'.repeat(32)});assert.throws(()=>attachListingPhoto(store,owner,sale.id,{...input,mediaId:'different'}),{code:'PHOTO_MISMATCH'});
  m.updateAsset(owner,asset.id,asset.version,{...asset,spots:[{...asset.spots[0],box:{x:.5,y:.2,width:.3,height:.2}}]});assert.throws(()=>attachListingPhoto(store,owner,sale.id,input),{code:'PHOTO_LAYOUT_CHANGED'});assert.equal(store.list('listing-photo').length,0);
 }finally{store.close();}
});
test('a supplemental photo attached to a different manifest is never shown and an operator repair is labelled separately from wallet consent',()=>{
 const {store,sale,input}=fixture();try{attachListingPhoto(store,owner,sale.id,input,{authorization:'platform-repair-request'});assert.equal(store.get('listing-photo',sale.id).authorization,'platform-repair-request');assert.equal(withListingPhoto(store,{...sale,publication:{...sale.publication,publishedTermsHash:'other'}}).presentation,undefined);}finally{store.close();}
});
