import test from 'node:test';
import assert from 'node:assert/strict';
import {listingGroupKey,listingPlacements,groupedListings} from '../src/integration/listing-groups.mjs';
import {placementPhoto} from '../src/integration/placement-photo.mjs';
const asset={id:'vehicle',title:'City van',coverUri:'ipfs://bafyabc',coverSha256:'abc',imageProvenance:'ai-generated',spots:[{id:'side',name:'Side panel',box:{x:.1,y:.3,width:.4,height:.2}},{id:'door',name:'Cab door',box:{x:.7,y:.5,width:.1,height:.1}}]};
const sale=(id,spotId,patch={})=>({id,assetId:'vehicle',owner:'owner.near',status:'published',campaignType:'team-test',schedule:{biddingClose:'2026-11-19T12:00:00Z',serviceStart:'2026-11-21T13:00:00Z',serviceEnd:'2026-11-22T13:00:00Z'},publication:{manifest:{asset}},spots:[{id:spotId,contractId:'offer-'+id}],...patch});
test('compatible placements retain their independent sale, contract and geometry bindings',()=>{
 const a=sale('a','side'),b=sale('b','door'),before=JSON.stringify([a,b]);b.schedule={...b.schedule,biddingClose:'2026-11-15T12:00:00Z'};const original=JSON.stringify([a,b]);
 const entries=listingPlacements(a,[a,b]);assert.equal(entries.length,2);assert.equal(entries[1].sale.id,'b');assert.equal(entries[1].spot.contractId,'offer-b');assert.equal(entries[1].geometry.name,'Cab door');assert.equal(JSON.stringify([a,b]),original);
 assert.equal(groupedListings([a,b],s=>s.id==='b')[0],b);assert.notEqual(before,original);
});
test('different owners, dates, cover images and listing purposes never share placements',()=>{
 const a=sale('a','side'),variants=[sale('b','door',{owner:'other.near'}),sale('c','door',{schedule:{...a.schedule,serviceEnd:'2026-11-23T13:00:00Z'}}),sale('d','door',{campaignType:'physical'}),sale('e','door',{publication:{manifest:{asset:{...asset,coverSha256:'different'}}}}),sale('f','door',{status:'draft'})];
 assert.equal(listingPlacements(a,[a,...variants]).length,1);assert.equal(groupedListings([a,...variants]).length,5);
});
test('duplicate offers do not create duplicate purchasable placements',()=>{
 const a=sale('a','side'),alias=sale('b','side',{spots:[{id:'side',contractId:'offer-a'}]});assert.equal(listingPlacements(a,[a,alias]).length,1);assert.equal(listingGroupKey(a),listingGroupKey(alias));
});
test('photo markers link to the exact placement and use unfilled contours instead of opaque blocks',()=>{
 const a=sale('a','side'),b=sale('b','door'),entries=listingPlacements(a,[a,b]),html=placementPhoto(asset,entries,'b:door',e=>'/spaces/vehicle?sale='+e.sale.id+'&spot='+e.spot.id);
 assert.match(html,/sale=b&amp;spot=door/);assert.match(html,/aria-current="true"/);assert.match(html,/Select Cab door/);assert.doesNotMatch(html,/fill-opacity="\.9"|spot-shape/);assert.equal((html.match(/class="placement-pin /g)||[]).length,2);
});
test('owner-edited geometry overrides a prepared reference contour',()=>{
 const custom={...asset,coverSha256:'5ef44a386faecdaa96181084e4882e31a18da27de73cd42cfd11e9dbcefa0929'},entry={key:'a:spot-1',sale:{id:'a'},spot:{id:'spot-1'},geometry:{name:'Custom panel',box:{x:.1,y:.2,width:.1,height:.1}}};
 const html=placementPhoto(custom,[entry],entry.key,()=>'/custom');assert.match(html,/d="M153/);assert.doesNotMatch(html,/M715 515/);
});
test('a multi-placement sale exposes only its published spots, not other draft geometry',()=>{
 const a=sale('a','side');a.spots.push({id:'door',contractId:'offer-door'});a.publication.manifest={asset:{...asset,spots:[...asset.spots,{id:'unpublished',name:'Not for sale'}]}};
 const entries=listingPlacements(a,[a]);assert.deepEqual(entries.map(e=>e.spot.contractId),['offer-a','offer-door']);assert.deepEqual(entries.map(e=>e.geometry.name),['Side panel','Cab door']);
});
