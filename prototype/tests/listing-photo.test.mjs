import test from 'node:test';
import assert from 'node:assert/strict';
import {listingAsset} from '../src/integration/reference-images.mjs';
globalThis.document={querySelector:()=>null};globalThis.location={pathname:'/host/sales/sale',search:''};
const {live}=await import('../src/integration/runtime.mjs');
const {ownerView}=await import('../src/integration/owner.mjs');
const {publicView}=await import('../src/integration/public.mjs');
const now=Date.now(),asset={id:'asset',title:'White van',city:'Zagreb',assetType:'van',description:'Vehicle',photoUrl:'/api/assets/asset/photo',spots:[{id:'door',name:'Door',side:'left',box:{x:.2,y:.2,width:.3,height:.2},suggestedPriceCents:'10'}]},schedule=Object.fromEntries(['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map((k,i)=>[k,new Date(now+(i+1)*86400000).toISOString()]));
function setup(status){const {photoUrl,...frozen}=asset,sale={id:'sale',assetId:'asset',owner:'owner.near',title:'Van offer',status,schedule,rules:'Keep lights clear',spots:[{id:'door',priceCents:'10',takeoverEnabled:true,contractId:'offer'}],publication:{publishedTermsHash:'original',manifest:{asset:frozen}}};Object.assign(live,{session:{wallet:'owner.near'},config:{production:true},data:{dashboard:{assets:[asset],sales:[sale],incomingBookings:[],bookings:[],campaigns:[]},publicationPlans:[],provisionPlans:[],saved:[]},catalog:{sales:[sale],snapshots:[],owners:[],time:new Date(now).toISOString()}});return sale;}
test('saved single-photo drafts require public-photo consent in the same publish flow as multiple views',()=>{
 const sale=setup('draft');sale.version=2;live.data.publicationPlans=[{plan:{saleId:'sale',saleVersion:1}}];const html=ownerView({id:'O12',params:{id:'sale'}});assert.match(html,/name="publishPhotos"/);assert.equal((html.match(/data-live-action="publish"/g)??[]).length,1);
});
test('an already published missing-cover listing offers recovery, and the public listing never substitutes an illustrated car',()=>{
 const sale=setup('published');assert.match(ownerView({id:'O12',params:{id:'sale'}}),/Add photo to listing/);
 let html=publicView({id:'P03',params:{slug:'asset'}});assert.match(html,/Vehicle photo not supplied/);assert.doesNotMatch(html,/ILLUSTRATIVE VEHICLE|vehicle-svg/);
 sale.presentation={publishedTermsHash:'original',provenance:'photo-added-after-publication',coverUri:'ipfs://baf'+'a'.repeat(40),coverSha256:'a'.repeat(64),imageProvenance:'owner-photo'};
 const original=JSON.stringify(sale.publication);html=publicView({id:'P03',params:{slug:'asset'}});assert.match(html,/gateway.pinata.cloud/);assert.match(html,/photo was added after publication/);assert.equal(JSON.stringify(sale.publication),original);assert.equal(listingAsset(sale).coverUri,sale.presentation.coverUri);
 sale.presentation.publishedTermsHash='other';assert.equal(listingAsset(sale).coverUri,undefined);
});
