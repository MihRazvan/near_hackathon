import test from 'node:test';
import assert from 'node:assert/strict';
import { Budget } from '../src/budget.mjs';
import { Store } from '../src/store.mjs';
import { Marketplace } from '../src/marketplace.mjs';
import { Product } from '../src/product.mjs';
const now=1800000000000,owner='seller.near';
const input={title:'Vehicle',description:'Synthetic panel',assetType:'van',city:'Bucharest',spots:[{id:'stable-panel',name:'Panel',side:'rear',box:{x:.2,y:.2,width:.4,height:.3},suggestedPriceCents:'10',confidence:'low'}]};
test('private reference photos stay out of published terms and stable panel identifiers survive edits',()=>{
 const store=new Store(),m=new Marketplace({store,chain:{},now:()=>now});try{
  const photo='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
  const a=m.createAsset(owner,{...input,photoDataUrl:photo}),edited=m.updateAsset(owner,a.id,a.version,{...input,spots:[{...input.spots[0],name:'Renamed panel'}]});
  assert.equal(edited.spots[0].id,'stable-panel');assert.equal(edited.photoDataUrl,photo);
  const dates=Object.fromEntries(['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map((key,i)=>[key,new Date(now+(i+1)*60000).toISOString()]));
  const sale=m.createSale(owner,{assetId:a.id,title:'Period',schedule:dates,takeoverDefault:true,spots:[{id:'stable-panel',priceCents:'10'}],arbiterId:'arbiter.near',rules:'Synthetic rules'});
  assert.equal('photoDataUrl' in m.publication(owner,sale.id).manifest.asset,false);
  assert.throws(()=>m.createAsset(owner,{...input,spots:[input.spots[0],input.spots[0]]}),{code:'INVALID_SPOT'});
 }finally{store.close();}
});
test('profiles and saved records persist per wallet and public catalog has no private drafts or signing plans',async()=>{
 const store=new Store(),m=new Marketplace({store,chain:{}}),p=new Product({store,marketplace:m,chain:{},config:{},walletRequests:{list:()=>[]}});
 try{
  store.insert('profile',owner,owner,{displayName:owner});m.createAsset(owner,input);p.profile(owner,{displayName:'Space owner',brand:'Demo brand'});
  const catalog=await p.catalog();assert.deepEqual(catalog.sales,[]);assert.equal('assets' in catalog,false);
  const owned=await p.workspace(owner);assert.equal(owned.dashboard.assets.length,1);assert.equal(owned.profile.displayName,'Space owner');
  const other=await p.workspace('other.near');assert.equal(other.dashboard.assets.length,0);assert.equal(other.profile,null);
 }finally{store.close();}
});
test('placement messages and issue requests follow current NFT control rather than a former controller',async()=>{
 const store=new Store(),chain={snapshot:async()=>({state:{seller_id:owner,holder:{account_id:'payer.near'}},rights:{current_owner_id:'new.near'}})},m=new Marketplace({store,chain});
 try{
  await m.placementThread('new.near','campaign.near','Coordinate printing');assert.equal((await m.placementThread(owner,'campaign.near')).length,1);
  await assert.rejects(m.placementThread('old.near','campaign.near'),{code:'NOT_FOUND'});
  store.insert('media','proof','new.near',{status:'verified',sha256:'01'.repeat(32)});
  const issue=await m.placementIssue('new.near','campaign.near',{reason:'Review installation',mediaId:'proof'});assert.equal(issue.status,'awaiting-arbiter');
  await assert.rejects(m.placementIssue('old.near','campaign.near',{reason:'Other',mediaId:'proof'}),{code:'NOT_FOUND'});
 }finally{store.close();}
});
test('commercial terms and referenced surfaces freeze once publication has started',()=>{
 const store=new Store(),m=new Marketplace({store,chain:{},now:()=>now});try{
  const a=m.createAsset(owner,input),schedule=Object.fromEntries(['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map((key,i)=>[key,new Date(now+(i+1)*60000).toISOString()]));
  const s=m.createSale(owner,{assetId:a.id,title:'Frozen period',schedule,takeoverDefault:true,spots:[{id:'stable-panel',priceCents:'1'}],arbiterId:'arbiter.near',rules:'Reviewed offer'});
  store.insert('provision-plan','publication',owner,{plan:{saleId:s.id,spots:[]},approvedAt:new Date().toISOString(),status:'processing'});
  assert.throws(()=>m.updateSale(owner,s.id,s.version,{...s,title:'Changed after funding'}),{code:'PUBLICATION_IN_PROGRESS'});
  assert.throws(()=>m.updateAsset(owner,a.id,a.version,{...input,title:'Changed referenced surface'}),{code:'PUBLICATION_IN_PROGRESS'});
 }finally{store.close();}
});
test('sponsored payout records belong only to their original creditor',async()=>{
 const store=new Store(),m=new Marketplace({store,chain:{}}),p=new Product({store,marketplace:m,chain:{},config:{},walletRequests:{list:()=>[]}});try{
  const budget=new Budget(store,Object.fromEntries(['sourceUsdc','baseGas','nearFees','nearAllocation','nearAllocationGross'].map(k=>[k,'100'])));
  budget.reserve({id:'wallet-claim-payer',kind:'near',scope:'treasury.near',plan:{actions:[{method:'release_credit',args:{account_id:owner}}]},amounts:{}});
  assert.equal((await p.workspace(owner)).operations.length,1);assert.equal((await p.workspace('other.near')).operations.length,0);
 }finally{store.close();}
});
