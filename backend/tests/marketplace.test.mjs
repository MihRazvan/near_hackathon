import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { Marketplace } from '../src/marketplace.mjs';
import { purchasePlan } from '../src/intents.mjs';
import { ChainService } from '../src/chain-service.mjs';
const buyer='0x'+'11'.repeat(20),stranger='0x'+'22'.repeat(20);
const asset={title:'Synthetic vehicle',description:'Synthetic rear panel',assetType:'car',city:'Bucharest',spots:[{name:'Rear panel',side:'rear',box:{x:.2,y:.3,width:.5,height:.2},suggestedPriceCents:'10',confidence:'low'}]};
function setup(){
 const store=new Store(),snapshots=new Map(),operations=new Map();let sends=0;
 const chain={snapshot:async(id,wallets=[])=>{const s=structuredClone(snapshots.get(id));s.credits=Object.fromEntries(wallets.map(w=>[w,{available:'0',conditional_bonus:'0'}]));return s;},
  preparePurchase:async({buyerId,contractId,invoiceId})=>{const s=await chain.snapshot(contractId);s.observedAt=new Date().toISOString();const p=purchasePlan({snapshot:s,buyerId,invoiceId,asset:'nep141:usdc.near'});store.insert('intent',p.planId,buyerId,{plan:p});return p;},
  relay:async({buyerId,planId})=>{if(operations.has(planId))return operations.get(planId);sends++;const {plan:p}=store.get('intent',planId),s=snapshots.get(p.context.contractId);s.state.holder={account_id:buyerId,principal:p.context.amount};s.state.round=String(BigInt(s.state.round)+1n);
   const event={standard:'pitboard',version:'1.0.0',event:'purchase_accepted',data:[{invoice_id:p.context.invoiceId,buyer_id:buyerId,amount:p.context.amount,round:s.state.round}]};
   const op={id:'relay-'+planId,phase:'confirmed',result:{outcome:{receipts_outcome:[{outcome:{executor_id:s.accountId,logs:['EVENT_JSON:'+JSON.stringify(event)]}}]}}};operations.set(planId,op);return op;},
  purchaseAccepted:ChainService.prototype.purchaseAccepted};
 const app=new Marketplace({store,chain});
 async function listing(owner,contract,extra={}){
  const a=app.createAsset(owner,{...asset,...extra}),now=Date.now(),schedule=Object.fromEntries(['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map((key,index)=>[key,new Date(now+(index+1)*600000).toISOString()]));
  const sale=app.createSale(owner,{assetId:a.id,title:'Campaign panel',schedule,spots:[{id:a.spots[0].id,priceCents:'10'}],takeoverDefault:true,arbiterId:'arbiter.near',rules:'Owner prints and installs the approved artwork.'});
  const p=app.publication(owner,sale.id),terms=p.terms[0];
  snapshots.set(contract,{qualified:true,accountId:contract,codeHash:'qualified',state:{seller_id:owner,arbiter_id:'arbiter.near',round:'0',next_price:'100000',outcome:'open',holder:null,intents_contract_id:'intents.near',intents_token_id:'nep141:usdc.near'},campaign:{terms},rights:{minted:false}});
  return {a,sale,p,publish:()=>app.publish(owner,sale.id,{version:sale.version,contracts:[{spotId:terms.spot_id,contractId:contract}]})};
 }
 return {store,app,snapshots,listing,sends:()=>sends};
}
test('team test terms bind generated-image provenance and require acknowledgement before a real payment is prepared',async()=>{
 const s=setup();try{
  const l=await s.listing('owner.near','test.near',{campaignType:'team-test',imageProvenance:'ai-generated'});
  assert.equal(l.p.manifest.campaignType,'team-test');assert.equal(l.p.manifest.asset.imageProvenance,'ai-generated');assert.equal(l.p.manifest.printingAndInstallationIncluded,false);
  const updated=s.app.updateAsset('owner.near',l.a.id,l.a.version,{...asset,title:'Updated test vehicle'});
  assert.equal(updated.campaignType,'team-test');assert.equal(updated.imageProvenance,'ai-generated');
  // Publish the original committed draft after checking the frozen metadata.
  s.app.updateAsset('owner.near',l.a.id,updated.version,{...asset,title:l.a.title});
  await l.publish();
  const c=s.app.createCampaign(buyer,{name:'Test booking',budgetMicroUsdc:'100000'}),input={campaignId:c.id,saleId:l.sale.id,spotId:l.a.spots[0].id};
  await assert.rejects(s.app.prepareBooking(buyer,input),/includes no physical delivery/);assert.equal(s.store.list('intent').length,0);
  await assert.rejects(s.app.prepareBooking(buyer,{...input,testCampaignAcknowledged:'true'}),/Acknowledge/);
  assert.equal((await s.app.prepareBooking(buyer,{...input,testCampaignAcknowledged:true})).status,'prepared');
 }finally{s.store.close();}
});
test('draft ownership, exact on-chain publication and immutable terms survive asset edits',async()=>{
 const s=setup();try{const l=await s.listing('owner.near','spot.near');assert.equal(s.app.browse().length,0);
  assert.throws(()=>s.app.updateAsset('other.near',l.a.id,l.a.version,asset),/this wallet/);
  const original=s.snapshots.get('spot.near').campaign.terms.published_terms_sha256;s.snapshots.get('spot.near').campaign.terms.published_terms_sha256='changed';
  await assert.rejects(l.publish(),/does not match/);assert.equal(s.app.browse().length,0);s.snapshots.get('spot.near').campaign.terms.published_terms_sha256=original;
  const published=await l.publish();assert.equal(published.status,'published');assert.throws(()=>s.app.publication('owner.near',l.sale.id),/cannot change/);
  s.app.updateAsset('owner.near',l.a.id,l.a.version,{...asset,title:'Future listing title'});
  assert.equal(s.app.sale(l.sale.id).publication.manifest.asset.title,'Synthetic vehicle');assert.equal(s.app.browse({city:'bucharest'}).length,1);
 }finally{s.store.close();}
});
test('one buyer campaign books across owners with a shared budget, isolated conversations and idempotent submission',async()=>{
 const s=setup();try{const first=await s.listing('alice.near','alice-spot.near'),second=await s.listing('bob.near','bob-spot.near');await first.publish();await second.publish();
  const c=s.app.createCampaign(buyer,{name:'Two-owner campaign',budgetMicroUsdc:'200000'});
  const a=await s.app.prepareBooking(buyer,{campaignId:c.id,saleId:first.sale.id,spotId:first.a.spots[0].id}),b=await s.app.prepareBooking(buyer,{campaignId:c.id,saleId:second.sale.id,spotId:second.a.spots[0].id});
  await assert.rejects(s.app.prepareBooking(buyer,{campaignId:c.id,saleId:second.sale.id,spotId:second.a.spots[0].id}),/exceed/);
  await s.app.submitBooking(buyer,a.id,'synthetic-signature');await s.app.submitBooking(buyer,b.id,'synthetic-signature');await s.app.submitBooking(buyer,a.id,'synthetic-signature');assert.equal(s.sends(),2);
  await assert.rejects(s.app.booking(stranger,a.id),/not found/);assert.equal((await s.app.booking('alice.near',a.id)).owner,buyer);
  s.app.thread(buyer,a.id,'Artwork is ready for review.');assert.equal(s.app.thread('alice.near',a.id).length,1);assert.throws(()=>s.app.thread('bob.near',a.id),/not found/);
  assert.equal(s.app.dashboard('alice.near').incomingBookings.length,1);assert.equal(s.app.dashboard(buyer).stats.bookedPrincipalMicroUsdc,'200000');
  s.snapshots.get('alice-spot.near').state.holder={account_id:stranger};assert.equal((await s.app.booking(buyer,a.id)).status,'outbid');
 }finally{s.store.close();}
});
test('sale creation recovers its original draft after a lost response and rejects changed input or another wallet',()=>{
 const s=setup();try{const a=s.app.createAsset('owner.near',asset),now=Date.now(),schedule=Object.fromEntries(['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map((k,i)=>[k,new Date(now+(i+1)*600000).toISOString()])),input={assetId:a.id,title:'Campaign',schedule,spots:[{id:a.spots[0].id,priceCents:'10'}],takeoverDefault:true,arbiterId:'arbiter.near',rules:'Owner prints and installs.',requestId:'request-create-sale-0001'};
 const first=s.app.createSale('owner.near',input);assert.equal(s.app.createSale('owner.near',input).id,first.id);assert.equal(s.store.list('sale').length,1);assert.equal(s.app.saleRequest('owner.near',input.requestId).id,first.id);
 assert.throws(()=>s.app.createSale('owner.near',{...input,title:'Changed'}),{code:'SALE_REQUEST_CHANGED'});assert.throws(()=>s.app.saleRequest('other.near',input.requestId),{code:'NOT_FOUND'});
 }finally{s.store.close();}
});
