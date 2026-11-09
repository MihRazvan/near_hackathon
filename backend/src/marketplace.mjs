import { randomUUID } from 'node:crypto';
import { assert, walletId, text, uint, hashObject } from './core.mjs';
import { validateDraft, imageInput } from './asset-ai.mjs';

const DATE_KEYS=['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'];
function dates(input,now){
 const times=DATE_KEYS.map(key=>{const value=input[key],ms=Date.parse(value);assert(typeof value==='string'&&Number.isSafeInteger(ms)&&new Date(ms).toISOString()===value,'INVALID_SCHEDULE',`Use an ISO timestamp for ${key}`,400);return ms;});
 assert(times[0]>now&&times[0]<times[1]&&times[1]<=times[2]&&times[2]<=times[3]&&times[3]<times[4]&&times[4]<times[5],'INVALID_SCHEDULE','Campaign dates must leave time for artwork, installation, service and review',400);
 return Object.fromEntries(DATE_KEYS.map((key,index)=>[key,new Date(times[index]).toISOString()]));
}
const ns=value=>String(BigInt(Date.parse(value))*1000000n);
function owned(store,kind,id,owner){const row=store.get(kind,id);assert(row&&row.owner===walletId(owner),'NOT_FOUND','Record not found for this wallet',404);return row;}
function native(value){const id=walletId(value);assert(!id.startsWith('0x'),'NEAR_OWNER_REQUIRED','Publishing requires the seller NEAR wallet; EVM buyers sign Intents separately',400);return id;}

export class Marketplace {
 constructor({store,chain,now=Date.now}){Object.assign(this,{store,chain,now});}
 assertSaleEditable(sale){
  const factoryPlans=this.store.list('publication-plan',sale.owner).filter(p=>p.plan.saleId===sale.id);
  const ids=new Set(factoryPlans.map(p=>p.id));
  const started=factoryPlans.some(p=>p.transactionHash)||this.store.list('wallet-request',sale.owner).some(r=>ids.has(r.planId)&&r.dispatched&&r.status!=='rejected')||
   this.store.list('provision-plan',sale.owner).some(p=>p.plan.saleId===sale.id&&(p.approvedAt||p.plan.spots.some(s=>this.store.operation('identity-fund-'+s.label))));
  assert(!started,'PUBLICATION_IN_PROGRESS','Publication has started. Reconcile its original contracts before changing these terms');
 }
 assetMedia(owner,input){
  const data={};
  if(input.photoDataUrl){imageInput(input.photoDataUrl);data.photoDataUrl=input.photoDataUrl;}
  if(input.coverMediaId){const m=owned(this.store,'media',input.coverMediaId,owner);assert(m.status==='verified'&&['image/png','image/jpeg'].includes(m.mime),'INVALID_COVER','A verified image belonging to this wallet is required');
   Object.assign(data,{coverMediaId:m.id,coverUri:m.uri,coverSha256:m.sha256});}
  return data;
 }

 createAsset(owner,input){
  const draft=validateDraft({...input,assumptions:input.assumptions??[]},{preserveIds:true});
  const data={...draft,...this.assetMedia(owner,input),city:text(input.city,'city',100),source:input.source==='ai'?'ai':'manual',status:'draft'};
  return this.store.insert('asset',randomUUID(),walletId(owner),data);
 }
 updateAsset(owner,id,version,input){
  for(const sale of this.store.list('sale',walletId(owner)).filter(s=>s.assetId===id&&s.status==='draft'))this.assertSaleEditable(sale);
  const row=owned(this.store,'asset',id,owner),draft=validateDraft({...input,assumptions:input.assumptions??[]},{preserveIds:true});
  assert(row.version===version,'STALE_VERSION','Asset changed; reload before editing');
  return this.store.update('asset',id,row.owner,version,{...draft,...this.assetMedia(owner,{...row,...input}),city:text(input.city,'city',100),source:row.source,status:'draft'});
 }
 saleData(owner,input){
  const asset=owned(this.store,'asset',input.assetId,owner),schedule=dates(input.schedule,this.now());
  assert(typeof input.takeoverDefault==='boolean'&&Array.isArray(input.spots)&&input.spots.length>0,'INVALID_SALE','Select spots and a takeover default',400);
  const available=new Map(asset.spots.map(spot=>[spot.id,spot])),seen=new Set();
  const spots=input.spots.map(spot=>{
   assert(available.has(spot.id)&&!seen.has(spot.id),'INVALID_SPOT','Select each existing asset spot once',400);seen.add(spot.id);
   assert(uint(spot.priceCents)>0n&&uint(spot.priceCents)<=1000000000n,'INVALID_PRICE','Spot price must be positive cents',400);
   assert(spot.takeoverEnabled===undefined||typeof spot.takeoverEnabled==='boolean','INVALID_TAKEOVER','Takeover choice must be boolean',400);
   return {id:spot.id,priceCents:spot.priceCents,takeoverEnabled:spot.takeoverEnabled??input.takeoverDefault};
  });
  const seller=native(owner),arbiter=native(input.arbiterId);assert(seller!==arbiter,'INVALID_ARBITER','Seller and arbiter must be separate wallets',400);
  return {assetId:asset.id,title:text(input.title,'sale title',100),schedule,spots,arbiterId:arbiter,
   takeoverDefault:input.takeoverDefault,rules:text(input.rules,'published advertising rules',3000),printingAndInstallationIncluded:true,status:'draft'};
 }
 createSale(owner,input){return this.store.insert('sale',randomUUID(),walletId(owner),this.saleData(owner,input));}
 updateSale(owner,id,version,input){const sale=owned(this.store,'sale',id,owner);assert(sale.status==='draft','IMMUTABLE_SALE','Published sale rules cannot be changed');
  this.assertSaleEditable(sale);
  return this.store.update('sale',id,sale.owner,version,this.saleData(owner,{...sale,...input}));}
 publication(owner,id){
  const sale=owned(this.store,'sale',id,owner);assert(sale.status==='draft','IMMUTABLE_SALE','Published sales cannot change their commercial terms');
  for(const other of this.store.list('sale',sale.owner).filter(s=>s.status==='published'&&s.assetId===sale.assetId&&s.id!==sale.id)){
   const overlaps=Date.parse(other.schedule.serviceStart)<Date.parse(sale.schedule.serviceEnd)&&Date.parse(sale.schedule.serviceStart)<Date.parse(other.schedule.serviceEnd);
   assert(!overlaps||!other.spots.some(a=>sale.spots.some(b=>a.id===b.id)),'OVERLAPPING_SALE','A published campaign already uses this physical spot during these dates');
  }
  dates(sale.schedule,this.now());const asset=owned(this.store,'asset',sale.assetId,owner);
  const manifest={version:1,saleId:sale.id,title:sale.title,sellerId:sale.owner,arbiterId:sale.arbiterId,
   asset:{id:asset.id,title:asset.title,description:asset.description,assetType:asset.assetType,city:asset.city,spots:asset.spots,...(asset.coverUri?{coverUri:asset.coverUri,coverSha256:asset.coverSha256}:{})},
   schedule:sale.schedule,spots:sale.spots,rules:sale.rules,printingAndInstallationIncluded:true,
   settlement:'USDC in NEAR Intents',ownerPayout:'after service and review; open issues block settlement',artworkReview:'after immediate booking; exact revision locked before printing'};
  const hash=Buffer.from(hashObject(manifest),'hex').toString('base64');
  const terms=sale.spots.map(spot=>({sale_id:sale.id,asset_id:asset.id,spot_id:spot.id,published_terms_sha256:hash,takeover_enabled:spot.takeoverEnabled,
   bidding_close_ns:ns(sale.schedule.biddingClose),artwork_due_ns:ns(sale.schedule.artworkDue),installation_due_ns:ns(sale.schedule.installationDue),
   service_start_ns:ns(sale.schedule.serviceStart),service_end_ns:ns(sale.schedule.serviceEnd),review_end_ns:ns(sale.schedule.reviewEnd)}));
  return {saleVersion:sale.version,manifest,terms,publishedTermsHash:hash};
 }
 async publish(owner,id,{version,contracts}){
  const sale=owned(this.store,'sale',id,owner);assert(sale.version===version,'STALE_VERSION','Sale changed; reload before publishing');
  const publication=this.publication(owner,id);
  assert(Array.isArray(contracts)&&contracts.length===sale.spots.length&&new Set(contracts.map(c=>c.contractId)).size===contracts.length,'INVALID_DEPLOYMENTS','One distinct contract per spot is required');
  const bound=[];
  for(const terms of publication.terms){
   const entry=contracts.find(c=>c.spotId===terms.spot_id),spot=sale.spots.find(s=>s.id===terms.spot_id);assert(entry,'MISSING_SPOT','A spot deployment is missing');
   if(this.chain.attachDeployment)await this.chain.attachDeployment({contractId:entry.contractId,sellerId:sale.owner,arbiterId:sale.arbiterId,terms,initialPriceCents:spot.priceCents});
   const snapshot=await this.chain.snapshot(entry.contractId);
   assert(hashObject(snapshot.campaign.terms)===hashObject(terms)&&snapshot.state.seller_id===sale.owner&&snapshot.state.arbiter_id===sale.arbiterId
    &&snapshot.state.round==='0'&&snapshot.state.next_price===(uint(spot.priceCents)*10000n).toString()&&snapshot.state.outcome==='open','DEPLOYMENT_MISMATCH','On-chain spot does not match the published offer');
   bound.push({...spot,contractId:entry.contractId,codeHash:snapshot.codeHash});
  }
  return this.store.transaction(()=>{
   for(const other of this.store.list('sale',sale.owner).filter(s=>s.status==='published'&&s.assetId===sale.assetId)){
    const overlaps=Date.parse(other.schedule.serviceStart)<Date.parse(sale.schedule.serviceEnd)&&Date.parse(sale.schedule.serviceStart)<Date.parse(other.schedule.serviceEnd);
    assert(!overlaps||!other.spots.some(a=>sale.spots.some(b=>a.id===b.id)),'OVERLAPPING_SALE','A published campaign already uses this physical spot during these dates');
   }
   for(const spot of bound){assert(!this.store.get('spot-index',spot.contractId),'CONTRACT_ALREADY_LISTED','Contract is already listed');this.store.insert('spot-index',spot.contractId,sale.owner,{saleId:id,spotId:spot.id});}
   const result=this.store.update('sale',id,sale.owner,version,{...sale,spots:bound,status:'published',publication});
   this.store.event('sale_published',id,sale.owner,{publishedTermsHash:publication.publishedTermsHash});return result;
  });
 }
 browse({city,assetType}={}){
  return this.store.list('sale').filter(s=>s.status==='published').filter(s=>(!city||s.publication.manifest.asset.city.toLowerCase().includes(city.toLowerCase()))&&(!assetType||s.publication.manifest.asset.assetType===assetType));
 }
 sale(id){const sale=this.store.get('sale',id);assert(sale?.status==='published','NOT_FOUND','Published sale not found',404);return sale;}
 createCampaign(owner,{name,budgetMicroUsdc}){
  assert(uint(budgetMicroUsdc)>0n,'INVALID_BUDGET','Campaign budget must be positive',400);
  return this.store.insert('buyer-campaign',randomUUID(),walletId(owner),{name:text(name,'campaign name',100),budgetMicroUsdc,status:'active'});
 }
 async prepareBooking(owner,{campaignId,saleId,spotId}){
  const buyer=walletId(owner),campaign=owned(this.store,'buyer-campaign',campaignId,buyer),sale=this.sale(saleId),spot=sale.spots.find(s=>s.id===spotId);
  assert(campaign.status==='active'&&spot,'INVALID_BOOKING','Campaign or published spot is unavailable');
  const id=randomUUID(),invoiceId='booking-'+id;
  const plan=await this.chain.preparePurchase({buyerId:buyer,contractId:spot.contractId,invoiceId});
  return this.store.transaction(()=>{
   const committed=this.store.list('booking',buyer).filter(b=>b.campaignId===campaignId&&['prepared','submitted','accepted','outbid'].includes(b.status)).reduce((sum,b)=>sum+uint(b.amount),0n);
   assert(committed+uint(plan.context.amount)<=uint(campaign.budgetMicroUsdc),'CAMPAIGN_BUDGET','Booking commitments exceed the campaign principal budget');
   return this.store.insert('booking',id,buyer,{campaignId,saleId,spotId,contractId:spot.contractId,sellerId:sale.owner,invoiceId,planId:plan.planId,amount:plan.context.amount,status:'prepared'});
  });
 }
 async submitBooking(owner,id,signature){
  const booking=owned(this.store,'booking',id,owner);
  assert(!['cancelled-before-send','expired'].includes(booking.status),'BOOKING_CLOSED','Prepare a fresh booking');
  const operation=await this.chain.relay({buyerId:booking.owner,planId:booking.planId,signature});
  const record=this.store.get('intent',booking.planId),accepted=this.chain.purchaseAccepted(record.plan,operation);
  const status=operation.phase==='confirmed'?(accepted?'accepted':'rejected'):operation.phase==='failed'?'failed':'submitted';
  const latest=owned(this.store,'booking',id,owner);
  if(latest.operationId===operation.id&&latest.status===status)return latest;
  return this.store.update('booking',id,latest.owner,latest.version,{...latest,status,accepted,operationId:operation.id});
 }
 cancelBooking(owner,id){
  const booking=owned(this.store,'booking',id,owner),intent=this.store.get('intent',booking.planId);
  assert(booking.status==='prepared'&&!intent.operationId,'BOOKING_SUBMITTED','A submitted booking must be reconciled, not cancelled');
  const request=this.store.list('wallet-request',booking.owner).find(r=>r.planId===booking.planId&&!['rejected','confirmed','failed'].includes(r.status));
  assert(!request,'WALLET_REQUEST_PENDING','Resolve the earlier wallet request before cancelling');
  return this.store.update('booking',id,booking.owner,booking.version,{...booking,status:'cancelled-before-send'});
 }
 async syncBooking(id){
  const b=this.store.get('booking',id);if(!b?.operationId)return b;
  const operation=this.store.operation(b.operationId);if(!operation||!['confirmed','failed'].includes(operation.phase))return b;
  const intent=this.store.get('intent',b.planId),accepted=this.chain.purchaseAccepted(intent.plan,operation);let status=operation.phase==='failed'?'failed':accepted?'accepted':'rejected';
  if(accepted){const s=await this.chain.snapshot(b.contractId,[b.owner]);
   if(s.state.outcome==='failure')status='cancelled';else if(s.state.holder?.account_id!==b.owner)status='outbid';else if(s.state.outcome==='success')status='completed';}
  if(b.status===status&&b.accepted===accepted)return b;
  const result=this.store.update('booking',id,b.owner,b.version,{...b,status,accepted});
  this.store.event('booking_status',id,b.owner,{status});return result;
 }
 async booking(owner,id){
  const booking=this.store.get('booking',id),wallet=walletId(owner);assert(booking&&(wallet===booking.owner||wallet===booking.sellerId),'NOT_FOUND','Booked placement not found',404);
  const snapshot=await this.chain.snapshot(booking.contractId,[booking.owner]);
  let status=booking.status;if(status==='accepted'&&snapshot.state.holder?.account_id!==booking.owner)status='outbid';
  return {...booking,status,escrowOutcome:snapshot.state.outcome,credit:snapshot.credits[booking.owner],placementRights:snapshot.rights,
   currentPrice:snapshot.state.next_price,observedAt:snapshot.observedAt};
 }
 thread(actor,bookingId,message){
  const wallet=walletId(actor),booking=this.store.get('booking',bookingId);assert(booking&&(wallet===booking.owner||wallet===booking.sellerId),'NOT_FOUND','Booking conversation not found',404);
  if(message!==undefined)this.store.insert('message',randomUUID(),wallet,{bookingId,text:text(message,'message',2000)});
  return this.store.list('message').filter(m=>m.bookingId===bookingId);
 }
 async placementThread(actor,contractId,message){
  const wallet=walletId(actor),s=await this.chain.snapshot(contractId);
  assert([s.state.seller_id,s.state.holder?.account_id,s.rights.current_owner_id,s.state.nominated_recipient].includes(wallet),'NOT_FOUND','Placement conversation not found',404);
  if(message!==undefined)this.store.insert('placement-message',randomUUID(),wallet,{contractId,text:text(message,'message',2000)});
  return this.store.list('placement-message').filter(m=>m.contractId===contractId);
 }
 async placementIssue(actor,contractId,{reason,mediaId}){
  const wallet=walletId(actor),s=await this.chain.snapshot(contractId);
  assert([s.state.seller_id,s.state.holder?.account_id,s.rights.current_owner_id].includes(wallet),'NOT_FOUND','Placement not found for issue review',404);
  const media=owned(this.store,'media',mediaId,wallet);assert(media.status==='verified','UNVERIFIED_EVIDENCE','Public issue evidence must be verified');
  return this.store.insert('issue',randomUUID(),wallet,{contractId,reason:text(reason,'issue reason',2000),mediaId,evidenceSha256:media.sha256,status:'awaiting-arbiter'});
 }
 issue(actor,bookingId,{reason,mediaId}){
  const wallet=walletId(actor),booking=this.store.get('booking',bookingId);assert(booking&&['accepted','outbid'].includes(booking.status)&&(wallet===booking.owner||wallet===booking.sellerId),'NOT_FOUND','Booked placement not found',404);
  const media=owned(this.store,'media',mediaId,wallet);assert(media.status==='verified','UNVERIFIED_EVIDENCE','Public issue evidence must be verified');
  const data={bookingId,contractId:booking.contractId,reason:text(reason,'issue reason',2000),mediaId,evidenceSha256:media.sha256,status:'awaiting-arbiter'};
  // This is a request. Only the separately signed arbiter transaction can open the on-chain settlement gate.
  return this.store.insert('issue',randomUUID(),wallet,data);
 }
 dashboard(owner){
  const wallet=walletId(owner),sales=this.store.list('sale',wallet),bookings=this.store.list('booking',wallet),campaigns=this.store.list('buyer-campaign',wallet);
  return {assets:this.store.list('asset',wallet),sales,campaigns,bookings,incomingBookings:this.store.list('booking').filter(b=>b.sellerId===wallet),stats:{publishedSales:sales.filter(s=>s.status==='published').length,
   bookedPrincipalMicroUsdc:bookings.filter(b=>b.accepted||['accepted','outbid'].includes(b.status)).reduce((sum,b)=>sum+uint(b.amount),0n).toString(),
   exposureImpressions:null,exposureMeasurement:'Not measured by the on-chain integration'}};
 }
}