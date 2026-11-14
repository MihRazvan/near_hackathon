import test from 'node:test';
import assert from 'node:assert/strict';
import {artworkImage,submittedArtwork,mediaPreview} from '../src/integration/artwork-media.mjs';
import {placementPhoto} from '../src/integration/placement-photo.mjs';
const uri='ipfs://baf'+'a'.repeat(45),sha256='ab'.repeat(32),proposal={artifact_uri:uri,artifact_sha256:Buffer.from(sha256,'hex').toString('base64')};
const snap=()=>({state:{artwork_locked:true,outcome:'open'},rights:{proposal},artifacts:{artwork:{uri,sha256,mime:'image/jpeg',bytes:100}}});
test('public artwork requires owner approval and matching committed image metadata',()=>{
 const s=snap();assert.match(artworkImage(s),/^https:\/\/gateway.pinata.cloud\/ipfs\//);
 for(const mutate of [s=>s.state.artwork_locked=false,s=>s.state.outcome='failure',s=>s.artifacts.artwork.sha256='cd'.repeat(32),s=>s.artifacts.artwork.mime='application/pdf',s=>s.artifacts.artwork.uri='javascript:alert(1)']){const s=snap();mutate(s);assert.equal(artworkImage(s),null);}
 assert.match(submittedArtwork(snap()),/<img/);assert.equal(mediaPreview({uri:'javascript:alert(1)',mime:'image/jpeg'}),'');
});
test('approved artwork stays on the exact placement and vehicle view',()=>{
 const asset={title:'Two views',photoViews:[{id:'left',side:'left',coverUri:uri},{id:'right',side:'right',coverUri:uri}]},entry=(key,view)=>({key,spot:{id:key},geometry:{name:key,photoViewId:view,side:view,box:{x:.2,y:.3,width:.3,height:.2}}});
 const left=entry('door','left'),right=entry('rear','right'),entries=[left,right],artwork=new Map([['door',artworkImage(snap())]]),href=e=>'/spaces/van?spot='+e.spot.id;
 const leftHtml=placementPhoto(asset,entries,'door',href,{artwork});assert.match(leftHtml,/<image class="placement-artwork"/);assert.match(leftHtml,/clip-path="url\(#placement-artwork-0\)"/);assert.match(leftHtml,/Approved artwork preview/);
 const rightHtml=placementPhoto(asset,entries,'rear',href,{artwork});assert.doesNotMatch(rightHtml,/<image class="placement-artwork"|Approved artwork preview/);
});
