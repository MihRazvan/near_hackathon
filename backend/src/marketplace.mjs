import {parallelRead} from './parallel-read.mjs';
import { initializeLocalPhotoQuota,assertLocalPhotoQuota,pruneCaptureStorage,OWNER_ASSET_MAX,GLOBAL_ASSET_MAX } from './local-photo-quota.mjs';
import { hubPriceAtRound } from './hub.mjs';
import { randomUUID } from 'node:crypto';
import { assert, walletId, text, uint, hashObject } from './core.mjs';
import { validateDraft, imageInput } from './asset-ai.mjs';
import {assetPhotos,photoDataValues,publicPhotoViews} from './asset-photos.mjs';

const DATE_KEYS=['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'];
function dates(input,now){
 const times=DATE_KEYS.map(key=>{const value=input[key],ms=Date.parse(value);assert(typeof value==='string'&&Number.isSafeInteger(ms)&&new Date(ms).toISOString()===value,'INVALID_SCHEDULE',`Use an ISO timestamp for ${key}`,400);return ms;});
 assert(times[0]>now&&times[0]<times[1]&&times[1]<=times[2]&&times[2]<=times[3]&&times[3]<times[4]&&times[4]<times[5],'INVALID_SCHEDULE','Campaign dates must leave time for artwork, installation, service and review',400);
 return Object.fromEntries(DATE_KEYS.map((key,index)=>[key,new Date(times[index]).toISOString()]));
}
const ns=value=>String(BigInt(Date.parse(value))*1000000n);
function assetProvenance(input,prior={}){
 const result={};
 for(const [key,allowed] of Object.entries({campaignType:['physical','team-test'],imageProvenance:['owner-photo','ai-generated']})){
  const value=input[key]??prior[key];
  if(value!==undefined){assert(allowed.includes(value),'INVALID_PROVENANCE','Choose a valid vehicle and image type',400);result[key]=value;}
 }
 return result;
}
function owned(store,kind,id,owner){const row=store.get(kind,id);assert(row&&row.owner===walletId(owner),'NOT_FOUND','Record not found for this wallet',404);return row;}
function native(value){const id=walletId(value);assert(!id.startsWith('0x'),'NEAR_OWNER_REQUIRED','Publishing requires the seller NEAR wallet; EVM buyers sign Intents separately',400);return id;}

export class Marketplace {
 constructor({store,chain,now=Date.now}){Object.assign(this,{store,chain,now});initializeLocalPhotoQuota(store);}
 assertSaleEditable(sale){
  const factoryPlans=this.store.list('publication-plan',sale.owner).filter(p=>p.plan.saleId===sale.id);
  const ids=new Set(factoryPlans.flatMap(p=>[p.id,p.plan.intentPlanId].filter(Boolean)));
  const started=factoryPlans.some(p=>p.transactionHash||(p.plan.intentPlanId&&(this.store.get('intent',p.plan.intentPlanId)?.operationId||this.store.operation('relay-'+p.plan.intentPlanId))))||this.store.list('wallet-request',sale.owner).some(r=>ids.has(r.planId)&&r.dispatched&&r.status!=='rejected')||
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

 createAsset(owner,input,{id=randomUUID()}={}){
  return this.store.transaction(()=>{
   const actor=walletId(owner);const prior=this.store.get('asset',id);if(prior){assert(prior.owner===actor,'NOT_FOUND','Asset not found',404);return prior;}pruneCaptureStorage(this.store,this.now());
   assert(this.store.db.prepare("SELECT COUNT(*) count FROM objects WHERE kind='asset' AND owner=?").get(actor).count<OWNER_ASSET_MAX,'ASSET_LIMIT','This wallet has reached its 20-space limit.',429);
   assert(this.store.db.prepare("SELECT COUNT(*) count FROM objects WHERE kind='asset'").get().count<GLOBAL_ASSET_MAX,'ASSET_LIMIT','The platform is at its current space capacity.',429);
   const draft=validateDraft({...input,assumptions:input.assumptions??[]},{preserveIds:true,allowEmpty:true});
   const data={...draft,...this.assetMedia(owner,input),...assetPhotos(input,{media:value=>this.assetMedia(owner,value)}),...assetProvenance(input),city:text(input.city,'city',100),source:input.source==='ai'?'ai':'manual',status:'draft'};
   assertLocalPhotoQuota(this.store,{kind:'asset',values:photoDataValues(data),config:this.chain?.config});
   return this.store.insert('asset',id,actor,data);
  });
 }
 updateAsset(owner,id,version,input){
  return this.store.transaction(()=>{
   pruneCaptureStorage(this.store,this.now());
   for(const sale of this.store.list('sale',walletId(owner)).filter(s=>s.assetId===id&&s.status==='draft'))this.assertSaleEditable(sale);
   const row=owned(this.store,'asset',id,owner),draft=validateDraft({...input,assumptions:input.assumptions??[]},{preserveIds:true,allowEmpty:true});
   assert(row.version===version,'STALE_VERSION','Asset changed; reload before editing');
   const data={...draft,...this.assetMedia(owner,{...row,...input}),...assetPhotos({...input,photoViews:input.photoViews??row.photoViews},{prior:row,media:value=>this.assetMedia(owner,value)}),...assetProvenance(input,row),city:text(input.city,'city',100),source:input.source==='ai'?'ai':row.source,status:'draft'};
   assertLocalPhotoQuota(this.store,{kind:'asset',id,values:photoDataValues(data),config:this.chain?.config});
   return this.store.update('asset',id,row.owner,version,data);
  });
 }
 saleData(owner,input){
  const asset=owned(this.store,'asset',input.assetId,owner),schedule=dates(input.schedule,this.now());
  if(this.chain?.config?.hub)assert(Date.parse(schedule.biddingClose)<=this.now()+30*86400000&&Date.parse(schedule.reviewEnd)<=this.now()+366*86400000,'CAMPAIGN_TOO_LONG','Bidding must close within 30 days and campaign review within 366 days',400);
  assert(typeof input.takeoverDefault==='boolean'&&Array.isArray(input.spots)&&input.spots.length>0,'INVALID_SALE','Select spots and a takeover default',400);
  const available=new Map(asset.spots.map(spot=>[spot.id,spot])),seen=new Set();
  const spots=input.spots.map(spot=>{
   assert(available.has(spot.id)&&!seen.has(spot.id),'INVALID_SPOT','Select each existing asset spot once',400);seen.add(spot.id);
   assert(uint(spot.priceCents)>0n&&uint(spot.priceCents)<=1000000000n,'INVALID_PRICE','Spot price must be positive cents',400);
   assert(spot.takeoverEnabled===undefined||typeof spot.takeoverEnabled==='boolean','INVALID_TAKEOVER','Takeover choice must be boolean',400);
   return {id:spot.id,priceCents:spot.priceCents,takeoverEnabled:spot.takeoverEnabled??input.takeoverDefault};
  });
  const seller=this.chain?.config?.hub?walletId(owner):native(owner),arbiter=this.chain?.config?.hub?walletId(input.arbiterId):native(input.arbiterId);assert(seller!==arbiter,'INVALID_ARBITER','Seller and arbiter must be separate wallets',400);
  return {assetId:asset.id,title:text(input.title,'sale title',100),schedule,spots,arbiterId:arbiter,
   takeoverDefault:input.takeoverDefault,rules:text(input.rules,'published advertising rules',3000),...(asset.campaignType==='team-test'?{campaignType:'team-test'}:{}),printingAndInstallationIncluded:asset.campaignType!=='team-test',status:'draft'};
 }
 createSale(owner,input){
  if(!input.requestId)return this.store.insert('sale',randomUUID(),walletId(owner),this.saleData(owner,input));
  const actor=walletId(owner);assert(typeof input.requestId==='string'&&/^[A-Za-z0-9_-]{16,80}$/.test(input.requestId),'INVALID_REQUEST','A unique sale request ID is required');
  const id=hashObject({actor,requestId:input.requestId}),fingerprint=hashObject(input);
  return this.store.transaction(()=>{const prior=this.store.get('sale-request',id);if(prior){assert(prior.fingerprint===fingerprint,'SALE_REQUEST_CHANGED','An earlier draft already uses this request. Reopen that draft before changing the offer.',409);return this.store.get('sale',prior.saleId);}
   const sale=this.store.insert('sale',randomUUID(),actor,this.saleData(actor,input));this.store.insert('sale-request',id,actor,{fingerprint,saleId:sale.id});return sale;});
 }
 saleRequest(owner,requestId){const actor=walletId(owner),r=this.store.get('sale-request',hashObject({actor,requestId}));assert(r?.owner===actor,'NOT_FOUND','Sale request not found',404);return this.store.get('sale',r.saleId);}

 updateSale(owner,id,version,input){const sale=owned(this.store,'sale',id,owner);assert(sale.status==='draft','IMMUTABLE_SALE','Published sale rules cannot be changed');
  this.assertSaleEditable(sale);
  return this.store.update('sale',id,sale.owner,version,this.saleData(owner,{...sale,...input}));}
 publication(owner,id,{allowStarted=false}={}){
  const sale=owned(this.store,'sale',id,owner);assert(sale.status==='draft','IMMUTABLE_SALE','Published sales cannot change their commercial terms');
  for(const other of this.store.list('sale',sale.owner).filter(s=>s.status==='published'&&s.assetId===sale.assetId&&s.id!==sale.id)){
   const overlaps=Date.parse(other.schedule.serviceStart)<Date.parse(sale.schedule.serviceEnd)&&Date.parse(sale.schedule.serviceStart)<Date.parse(other.schedule.serviceEnd);
   assert(!overlaps||!other.spots.some(a=>sale.spots.some(b=>a.id===b.id)),'OVERLAPPING_SALE','A published campaign already uses this physical spot during these dates');
  }
  if(!allowStarted)dates(sale.schedule,this.now());const asset=owned(this.store,'asset',sale.assetId,owner);
  assert(sale.spots.length>0&&sale.spots.every(p=>asset.spots.some(a=>a.id===p.id)),'INVALID_SPOT','A campaign spot was removed from this vehicle. Update your draft campaign before publishing.',400);
  const manifest={version:1,saleId:sale.id,title:sale.title,sellerId:sale.owner,arbiterId:sale.arbiterId,
   asset:{id:asset.id,title:asset.title,description:asset.description,assetType:asset.assetType,city:asset.city,spots:asset.spots,...assetProvenance(asset),...publicPhotoViews(asset),...(asset.coverUri?{coverUri:asset.coverUri,coverSha256:asset.coverSha256}:{})},
   schedule:sale.schedule,spots:sale.spots,rules:sale.rules,...(sale.campaignType==='team-test'?{campaignType:'team-test'}:{}),printingAndInstallationIncluded:sale.printingAndInstallationIncluded,
   settlement:'USDC in NEAR Intents',ownerPayout:'after service and review; open issues block settlement',artworkReview:'after immediate booking; exact revision locked before printing'};
  const hash=Buffer.from(hashObject(manifest),'hex').toString('base64');
  const terms=sale.spots.map(spot=>({sale_id:sale.id,asset_id:asset.id,spot_id:spot.id,published_terms_sha256:hash,takeover_enabled:spot.takeoverEnabled,
   bidding_close_ns:ns(sale.schedule.biddingClose),artwork_due_ns:ns(sale.schedule.artworkDue),installation_due_ns:ns(sale.schedule.installationDue),
   service_start_ns:ns(sale.schedule.serviceStart),service_end_ns:ns(sale.schedule.serviceEnd),review_end_ns:ns(sale.schedule.reviewEnd)}));
  return {saleVersion:sale.version,manifest,terms,publishedTermsHash:hash};
 }
 publishedResult(sale,version,contracts,{bound,publication}={}){
  assert(sale.status==='published'&&sale.publication?.saleVersion===version,'PUBLICATION_CHANGED','This sale was published from a different draft version');
  assert(contracts.length===sale.spots.length&&contracts.every(entry=>sale.spots.some(spot=>spot.id===entry.spotId&&spot.contractId===entry.contractId)),'PUBLICATION_CHANGED','This sale was published with different spot contracts');
  if(bound)assert(hashObject(sale.spots)===hashObject(bound),'PUBLICATION_CHANGED','Published spot bindings differ from the verified contracts');
  if(publication)assert(hashObject(sale.publication)===hashObject(publication),'PUBLICATION_CHANGED','Published terms differ from the verified draft');
  const source=sale.publication.manifest?.spots;assert(Array.isArray(source),'PUBLICATION_CHANGED','Published commercial terms are missing');
  for(const spot of sale.spots){
   if(spot.mode==='hub'&&this.chain.config?.hub)assert(spot.hubId===this.chain.config.hub.accountId&&spot.codeHash===this.chain.config.hub.codeHash&&spot.offerId===spot.contractId,'DEPLOYMENT_CHANGED','Published marketplace code or routing differs from qualification');
   const deployment=this.store.get('deployment',spot.contractId),terms=sale.publication.terms.find(t=>t.spot_id===spot.id);
   if(deployment)assert(deployment.owner===sale.owner&&deployment.arbiterId===sale.arbiterId&&deployment.codeHash===spot.codeHash&&String(deployment.initialPriceCents)===String(spot.priceCents)&&hashObject(deployment.terms)===hashObject(terms),'DEPLOYMENT_CHANGED','Published spot differs from its registered deployment');
  }
  assert(source.length===sale.spots.length&&sale.spots.every(spot=>source.some(original=>original.id===spot.id&&String(original.priceCents)===String(spot.priceCents)&&original.takeoverEnabled===spot.takeoverEnabled)),
   'PUBLICATION_CHANGED','Published commercial spot details differ from their committed terms');
  return sale;
 }
 async publish(owner,id,{version,contracts}){
  const sale=owned(this.store,'sale',id,owner);
  assert(Array.isArray(contracts)&&contracts.length===sale.spots.length&&new Set(contracts.map(c=>c.contractId)).size===contracts.length&&new Set(contracts.map(c=>c.spotId)).size===contracts.length,'INVALID_DEPLOYMENTS','One distinct contract per spot is required');
  if(sale.status==='published')return this.store.transaction(()=>this.publishedResult(owned(this.store,'sale',id,owner),version,contracts));
  assert(sale.version===version,'STALE_VERSION','Sale changed; reload before publishing');
  const publication=this.publication(owner,id,{allowStarted:true});
  const entries=publication.terms.map(terms=>{const entry=contracts.find(c=>c.spotId===terms.spot_id),spot=sale.spots.find(s=>s.id===terms.spot_id);assert(entry,'MISSING_SPOT','A spot deployment is missing');return {terms,entry,spot};});
  if(this.chain.attachDeployment)await parallelRead(entries,4,({terms,entry,spot})=>this.chain.attachDeployment({contractId:entry.contractId,sellerId:sale.owner,arbiterId:sale.arbiterId,terms,initialPriceCents:spot.priceCents}));
  // No chain writes occur in this verification batch. All placements bind to one
  // fresh finalized block and share immutable hub/token qualification reads.
  const block=this.chain.reads?.block?await this.chain.reads.block():undefined;
  const bound=await parallelRead(entries,4,async({terms,entry,spot})=>{
   const snapshot=await this.chain.snapshot(entry.contractId,[],block?{block}:undefined);
   assert(hashObject(snapshot.campaign.terms)===hashObject(terms)&&snapshot.state.seller_id===sale.owner&&snapshot.state.arbiter_id===sale.arbiterId
    &&(snapshot.mode==='hub'?snapshot.state.next_price===hubPriceAtRound(spot.priceCents,snapshot.state.round):(snapshot.state.round==='0'&&snapshot.state.next_price===(uint(spot.priceCents)*10000n).toString()&&snapshot.state.outcome==='open')),'DEPLOYMENT_MISMATCH','On-chain spot does not match the published offer');
   return {...spot,contractId:entry.contractId,codeHash:snapshot.codeHash,...(snapshot.offerId?{mode:'hub',offerId:snapshot.offerId,hubId:snapshot.receiverId}:{} )};
  });
  return this.store.transaction(()=>{
   const current=owned(this.store,'sale',id,owner);
   if(current.status==='published')return this.publishedResult(current,version,contracts,{bound,publication});
   assert(current.status==='draft'&&current.version===version,'STALE_VERSION','Sale changed while its contracts were verified');
   for(const other of this.store.list('sale',sale.owner).filter(s=>s.status==='published'&&s.assetId===sale.assetId&&s.id!==id)){
    const overlaps=Date.parse(other.schedule.serviceStart)<Date.parse(sale.schedule.serviceEnd)&&Date.parse(sale.schedule.serviceStart)<Date.parse(other.schedule.serviceEnd);
    assert(!overlaps||!other.spots.some(a=>sale.spots.some(b=>a.id===b.id)),'OVERLAPPING_SALE','A published campaign already uses this physical spot during these dates');
   }
   for(const spot of bound){assert(!this.store.get('spot-index',spot.contractId),'CONTRACT_ALREADY_LISTED','Contract is already listed');this.store.insert('spot-index',spot.contractId,sale.owner,{saleId:id,spotId:spot.id});}
   const result=this.store.update('sale',id,current.owner,current.version,{...current,spots:bound,status:'published',publication});
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
 async prepareBooking(owner,{campaignId,saleId,spotId,testCampaignAcknowledged=false}){
  const buyer=walletId(owner),campaign=owned(this.store,'buyer-campaign',campaignId,buyer),sale=this.sale(saleId),spot=sale.spots.find(s=>s.id===spotId);
  assert(campaign.status==='active'&&spot,'INVALID_BOOKING','Campaign or published spot is unavailable');
  assert(sale.campaignType!=='team-test'||testCampaignAcknowledged===true,'TEST_CAMPAIGN_ACKNOWLEDGEMENT','This team test uses real USDC and includes no physical delivery. Acknowledge it to continue.',400);
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
 bookingEvidence(booking){
  const intent=this.store.get('intent',booking.planId),plan=intent?.plan;
  if(!plan)return null;
  assert(intent.owner===booking.owner&&plan.signerId===booking.owner&&plan.planId===booking.planId&&plan.context?.kind==='purchase'&&plan.context.contractId===booking.contractId&&plan.context.invoiceId===booking.invoiceId&&plan.context.amount===booking.amount,'BOOKING_CHANGED','The booking differs from its original purchase plan');
  if(booking.operationId){
   const operation=this.store.operation(booking.operationId);if(!operation||!['confirmed','failed'].includes(operation.phase))return null;
   return {plan,accepted:this.chain.purchaseAccepted(plan,operation),failed:operation.phase==='failed'};
  }
  if(booking.nativePlanId){
   const native=this.store.get('native-plan',booking.nativePlanId);
   if(!native||!['confirmed','failed'].includes(native.status))return null;
   assert(native.owner===booking.owner&&native.plan.kind==='purchase'&&native.plan.bookingId===booking.id&&native.plan.purchasePlanId===booking.planId&&native.transactionHash===booking.transactionHash,'BOOKING_CHANGED','Native receipt binding differs from this booking');
   return {plan,accepted:native.status==='confirmed'&&booking.accepted===true,failed:native.status==='failed'};
  }
  return null;
 }
 async syncBookingGroup(contractId,bookingIds){
  assert(typeof contractId==='string'&&Array.isArray(bookingIds),'INVALID_BOOKING_GROUP','A contract-bound booking group is required');
  const originals=[...new Set(bookingIds)].map(id=>this.store.get('booking',id)).filter(Boolean);
  assert(originals.every(b=>b.contractId===contractId),'BOOKING_CHANGED','Every booking must belong to the same original contract');
  const evidence=originals.map(b=>({booking:b,evidence:this.bookingEvidence(b)}));
  const accepted=evidence.filter(item=>item.evidence?.accepted);let snapshot;
  if(accepted.length){
   // Never accept a caller-supplied snapshot or reuse this read for financial
   // preparation. This one qualified public read serves status updates only.
   snapshot=await this.chain.snapshot(contractId);
   assert(snapshot?.qualified===true&&snapshot.accountId===contractId&&Number.isSafeInteger(snapshot.blockHeight)&&typeof snapshot.blockHash==='string'&&snapshot.blockHash,'UNQUALIFIED_CAMPAIGN','Status reconciliation requires a bound finalized snapshot');
   for(const {booking:b,evidence:e} of accepted){
    assert(snapshot.codeHash===e.plan.context.codeHash&&snapshot.campaign.terms.published_terms_sha256===e.plan.context.publishedTermsHash&&snapshot.campaign.terms.sale_id===b.saleId&&snapshot.campaign.terms.spot_id===b.spotId&&snapshot.state.seller_id===b.sellerId,'BOOKING_CHANGED','The shared status snapshot differs from the original booking');
    assert(uint(snapshot.state.round)>=uint(e.plan.context.expectedRound)+1n,'STALE_SNAPSHOT','Wait for a finalized snapshot that includes the original accepted purchase');
   }
  }
  const bookings=this.store.transaction(()=>originals.map(original=>{
   // Other wallet/recovery processes may have advanced this row while RPC was
   // pending. Re-read within the update transaction and preserve newer state.
   const current=this.store.get('booking',original.id);if(!current)return null;
   if(['contractId','owner','planId','operationId','nativePlanId','transactionHash'].some(key=>current[key]!==original[key]))return current;
   const e=this.bookingEvidence(current);if(!e)return current;
   let status=e.failed?'failed':e.accepted?'accepted':'rejected',observation={};
   if(e.accepted){
    if(!snapshot||current.statusBlockHeight>snapshot.blockHeight)return current;
    assert(current.statusBlockHeight!==snapshot.blockHeight||!current.statusBlockHash||current.statusBlockHash===snapshot.blockHash,'SNAPSHOT_CHANGED','Finalized status snapshots cannot disagree at the same block height');
    const round=(uint(e.plan.context.expectedRound)+1n).toString(),holding=snapshot.state.holder?.account_id===current.owner&&snapshot.state.round===round;
    if(snapshot.state.outcome==='failure')status='cancelled';else if(!holding)status='outbid';else if(snapshot.state.outcome==='success')status='completed';
    observation={purchaseRound:round,statusBlockHeight:snapshot.blockHeight,statusBlockHash:snapshot.blockHash,statusOutcome:snapshot.state.outcome};
   }
   const changed=current.status!==status||current.accepted!==e.accepted;
   if(!changed&&Object.entries(observation).every(([key,value])=>current[key]===value))return current;
   const result=this.store.update('booking',current.id,current.owner,current.version,{...current,...observation,status,accepted:e.accepted});
   if(changed)this.store.event('booking_status',current.id,current.owner,{status});return result;
  }));
  return {bookings,snapshotUsed:!!snapshot};
 }
 async syncBooking(id){
  const booking=this.store.get('booking',id);if(!booking)return booking;
  return (await this.syncBookingGroup(booking.contractId,[id])).bookings[0];
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
  const participant=s.mode==='hub'?await this.chain.reads.view(s.receiverId,'is_participant',{offer_id:s.offerId,account_id:wallet}):[s.state.seller_id,s.state.holder?.account_id,s.rights.current_owner_id].includes(wallet);
  assert(participant,'NOT_FOUND','Placement not found for issue review',404);
  assert(s.mode!=='hub'||(s.state.outcome==='open'&&BigInt(s.state.refund_end_ns)>BigInt(this.now())*1000000n),'REVIEW_CLOSED','The campaign issue review period has ended');
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
