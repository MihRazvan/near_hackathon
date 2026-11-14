import test from 'node:test';
import assert from 'node:assert/strict';
import {previewContext,validPreview,savePreview,readPreview,resetPreview,adoptGuestPreview} from '../src/integration/ad-preview-store.mjs';
const offer={id:'preview-sale',assetId:'van',publication:{publishedTermsHash:'terms-v1',manifest:{asset:{id:'van',coverSha256:'original-photo',spots:[{id:'door',photoViewId:'main',box:{x:.2,y:.3,width:.3,height:.2}}]}}},spots:[{id:'door',contractId:'offer-door'}]},spot=offer.spots[0],draft={kind:'file',blob:new Blob(['synthetic image'],{type:'image/png'}),mime:'image/png',sha256:'ab'.repeat(32),name:'brand.png'};
test('private drafts are bound to wallet, exact offer terms, photo and placement geometry',async()=>{
 const a=previewContext(offer,spot,'a.near');await savePreview(a,draft);assert.equal((await readPreview(a)).name,'brand.png');
 assert.equal(await readPreview(previewContext(offer,spot,'b.near')),null);
 for(const mutate of [o=>o.publication.publishedTermsHash='changed',o=>o.publication.manifest.asset.coverSha256='other-photo',o=>o.publication.manifest.asset.spots[0].box.x=.5,o=>o.publication.manifest.asset.spots[0].photoViewId='rear']){const changed=structuredClone(offer);mutate(changed);assert.equal(await readPreview(previewContext(changed,spot,'a.near')),null);}
 await resetPreview(a);assert.equal(await readPreview(a),null);
});
test('the explicit reserve handoff claims a guest preview for one wallet without overwriting its own draft',async()=>{
 const guest=previewContext(offer,spot,null),a=previewContext(offer,spot,'a.near'),b=previewContext(offer,spot,'b.near');
 await savePreview(guest,draft);await adoptGuestPreview(offer,spot,'a.near');assert.equal(await readPreview(guest),null);assert.equal((await readPreview(a)).wallet,'a.near');assert.equal(await readPreview(b),null);
 await savePreview(guest,{...draft,name:'other.png'});await adoptGuestPreview(offer,spot,'a.near');assert.equal((await readPreview(a)).name,'brand.png');assert.equal((await readPreview(guest)).name,'other.png');
 await resetPreview(guest);await resetPreview(a);
});
test('expired, future, wrong-wallet and non-image drafts cannot restore into the preview',()=>{
 const c=previewContext(offer,spot,'a.near'),record={...draft,...c,updatedAt:Date.now()};assert.equal(validPreview(record,c),true);
 for(const changes of [{wallet:'b.near'},{binding:'other'},{updatedAt:Date.now()-31*86400000},{updatedAt:Date.now()+120000},{mime:'image/svg+xml'},{sha256:'invalid'}])assert.equal(validPreview({...record,...changes},c),false);
});
