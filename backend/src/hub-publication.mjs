import { assert, walletId, hashObject, uint } from './core.mjs';
import { offerIdFor, qualifyHub } from './hub.mjs';
import { intentPlan } from './intents.mjs';
import { successfulNearOutcome } from './rpc.mjs';
import { verifyWalletCall } from './publication.mjs';

export class HubPublication {
 constructor(service){Object.assign(this,service);}
 async renewUnopened(record){
  if(record.status==='confirmed'||record.plan.type!=='intent'||Date.parse(record.plan.expiresAt)>this.now())return record;
  const original=this.store.get('intent',record.plan.intentPlanId),operation=this.store.operation('relay-'+record.plan.intentPlanId);
  assert(original&&original.owner===record.owner&&!operation&&!original.operationId&&!record.transactionHash,'PUBLICATION_RECONCILIATION_REQUIRED','The original publication needs reconciliation before a new signature');
  const requests=this.store.list('wallet-request',record.owner).filter(r=>r.planId===record.plan.intentPlanId);
  assert(!requests.some(r=>r.dispatched&&!['rejected','failed'].includes(r.status)),'PUBLICATION_RECONCILIATION_REQUIRED','Resolve the earlier wallet request before refreshing publication');
  // This explicit prepare call can renew only an expired message never relayed by
  // this service. Its complete original intent remains in the immutable journal.
  return this.store.transaction(()=>{
   for(const r of requests.filter(r=>!r.dispatched&&!['confirmed','failed','rejected'].includes(r.status)))this.store.update('wallet-request',r.id,r.owner,r.version,{...r,status:'failed',errorCode:'EXPIRED_BEFORE_DISPATCH'});
   if(original.status!=='expired')this.store.update('intent',original.id,original.owner,original.version,{...original,status:'expired'});
   const auth=intentPlan({signerId:record.owner,verifier:record.plan.intent.verifier,intents:record.plan.intent.payload.intents,context:record.plan.intent.context,now:this.now()});
   this.store.insert('intent',auth.planId,record.owner,{plan:auth,status:'prepared'});
   return this.store.update('publication-plan',record.id,record.owner,record.version,{...record,status:'prepared',plan:{...record.plan,intentPlanId:auth.planId,intent:auth,expiresAt:auth.expiresAt,revision:(record.plan.revision??0)+1}});
  });
 }
 async prepare(wallet,saleId){
  const actor=walletId(wallet),sale=this.store.get('sale',saleId);assert(sale?.owner===actor,'NOT_FOUND','Owner sale not found',404);
  const publication=this.marketplace.publication(actor,saleId),block=await this.reads.block(),c=await qualifyHub(this.reads,this.config,block),hub=this.config.hub;
  assert(c.arbiter_id===sale.arbiterId,'ARBITER_CHANGED','Campaign arbiter differs from marketplace configuration');
  const priorBatch=publication.terms.map(terms=>{const spot=sale.spots.find(s=>s.id===terms.spot_id),offerId=offerIdFor({saleId,version:sale.version,spotId:spot.id});return this.store.get('publication-plan',hashObject({hub:hub.accountId,offerId,terms,seller:actor,price:spot.priceCents}));});
  if(priorBatch.every(Boolean)){const renewed=[];for(const prior of priorBatch)renewed.push(await this.renewUnopened(prior));return {saleId,mode:'hub',sponsored:renewed.every(p=>p.plan.sponsored),storageDepositTotal:renewed.reduce((sum,p)=>sum+uint(p.plan.storageDeposit??'0'),0n).toString(),publication,plans:renewed};}
  const usage=c.sponsored_per_owner_limit!==undefined?await this.reads.view(hub.accountId,'get_sponsor_usage',{account_id:actor},block):'0';
  const count=BigInt(sale.spots.length),storageTotal=uint(c.offer_storage_deposit)*count;
  const sponsorSchedule=publication.terms.every(t=>uint(t.review_end_ns)<=BigInt(this.now()+30*86400000)*1000000n);
  assert(!actor.startsWith('0x')||sponsorSchedule,'SPONSOR_CAMPAIGN_TOO_LONG','Complimentary publishing covers campaigns whose issue review ends within 30 days. Shorten these dates or use native NEAR paid publishing.',400);
  const sponsored=sponsorSchedule&&uint(c.sponsor_available??'0')>=storageTotal&&(c.sponsored_offer_limit===undefined||uint(c.sponsored_offer_limit)-uint(c.sponsored_offers)>=count)&&(c.sponsored_per_owner_limit===undefined||uint(c.sponsored_per_owner_limit)-uint(usage)>=count);
  assert(!actor.startsWith('0x')||sponsored,'SPONSOR_UNAVAILABLE','Publication sponsorship is temporarily unavailable for this sale',503);
  const plans=[];
  for(const terms of publication.terms){
   const spot=sale.spots.find(s=>s.id===terms.spot_id),offerId=offerIdFor({saleId,version:sale.version,spotId:spot.id});
   const id=hashObject({hub:hub.accountId,offerId,terms,seller:actor,price:spot.priceCents}),prior=this.store.get('publication-plan',id);
   if(prior){plans.push(prior);continue;}
   const args={offer_id:offerId,initial_price_cents:spot.priceCents,terms};
   let plan={planId:id,saleId,saleVersion:sale.version,spotId:spot.id,contractId:offerId,offerId,hubId:hub.accountId,mode:'hub',sponsored,storageDeposit:sponsored?'0':c.offer_storage_deposit,hubCodeHash:hub.codeHash,createdAt:new Date(this.now()).toISOString()};
   if(actor.startsWith('0x')){
    assert(uint(c.sponsor_available??'0')>=uint(c.offer_storage_deposit),'SPONSOR_UNAVAILABLE','Publication sponsorship is temporarily unavailable',503);
    const auth=intentPlan({signerId:actor,verifier:this.config.assets.intentsId,now:this.now(),intents:[{intent:'auth_call',contract_id:hub.accountId,msg:JSON.stringify({action:'create_offer',...args}),min_gas:'50000000000000'}],
     context:{kind:'publish',contractId:offerId,offerId,receiverId:hub.accountId,codeHash:hub.codeHash,publicationPlanId:id,saleId}});
    this.store.insert('intent',auth.planId,actor,{plan:auth,status:'prepared'});
    plan={...plan,type:'intent',intentPlanId:auth.planId,intent:auth,expiresAt:auth.expiresAt};
   }else plan={...plan,type:'native',transaction:{signerId:actor,receiverId:hub.accountId,actions:[{type:'FunctionCall',params:{methodName:'create_offer',args,gas:'60000000000000',deposit:sponsored?'0':c.offer_storage_deposit}}]}};
   plans.push(this.store.insert('publication-plan',id,actor,{plan,status:'prepared'}));
  }
  return {saleId,mode:'hub',sponsored,storageDepositTotal:sponsored?'0':storageTotal.toString(),publication,plans};
 }
 accepted(record,outcome){
  return successfulNearOutcome(outcome)&&outcome.receipts_outcome.some(r=>r.outcome.executor_id===record.plan.hubId&&r.outcome.logs?.some(log=>{
   if(!log.startsWith('EVENT_JSON:'))return false;let e;try{e=JSON.parse(log.slice(11));}catch{return false;}
   return e.standard==='pitboard'&&e.version==='1.0.0'&&e.event==='offer_created'&&e.data?.some(d=>d.offer_id===record.plan.offerId&&d.seller_id===record.owner);
  }));
 }
 async finish(record,outcome,transactionHash){
  const status=this.accepted(record,outcome)?'confirmed':'failed';
  if(status==='confirmed'){
   const terms=record.plan.type==='native'?record.plan.transaction.actions[0].params.args.terms:JSON.parse(record.plan.intent.payload.intents[0].msg).terms;
   const spot=this.store.get('sale',record.plan.saleId).spots.find(s=>s.id===record.plan.spotId);
   await this.marketplace.chain.attachHubDeployment({contractId:record.plan.offerId,sellerId:record.owner,arbiterId:this.store.get('sale',record.plan.saleId).arbiterId,terms,initialPriceCents:spot.priceCents});
  }
  const latest=this.store.get('publication-plan',record.id);
  if(latest.status!==status||latest.transactionHash!==transactionHash)record=this.store.update('publication-plan',record.id,record.owner,latest.version,{...latest,status,transactionHash});else record=latest;
  const sale=this.store.get('sale',record.plan.saleId),all=this.store.list('publication-plan',record.owner).filter(p=>p.plan.saleId===sale.id&&p.plan.saleVersion===record.plan.saleVersion);
  if(sale.status==='draft'&&all.length===sale.spots.length&&all.every(p=>p.status==='confirmed'))await this.marketplace.publish(record.owner,sale.id,{version:record.plan.saleVersion,contracts:all.map(p=>({spotId:p.plan.spotId,contractId:p.plan.contractId}))});
  return record;
 }
 async confirmIntent(wallet,id,operation){
  const record=this.store.get('publication-plan',id);assert(record?.owner===walletId(wallet)&&record.plan.mode==='hub'&&record.plan.type==='intent','NOT_FOUND','Publication signature not found',404);
  assert(operation.id==='relay-'+record.plan.intentPlanId,'TRANSACTION_CHANGED','Publication requires its original signed intent');
  if(!['confirmed','failed'].includes(operation.phase))return record;
  if(operation.phase==='failed'){if(record.status==='failed')return record;return this.store.update('publication-plan',id,record.owner,record.version,{...record,status:'failed',transactionHash:operation.transaction_hash});}
  return this.finish(record,operation.result.outcome,operation.transaction_hash);
 }
 async confirm(wallet,id,transactionHash){
  const actor=walletId(wallet);let record=this.store.get('publication-plan',id);assert(record?.owner===actor&&record.plan.mode==='hub'&&record.plan.type==='native','NOT_FOUND','Publication transaction not found',404);
  assert(typeof transactionHash==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(transactionHash),'INVALID_TRANSACTION','NEAR transaction hash required',400);
  assert(!record.transactionHash||record.transactionHash===transactionHash,'TRANSACTION_CHANGED','Publication already has another transaction');
  if(!record.transactionHash)record=this.store.update('publication-plan',id,actor,record.version,{...record,transactionHash,status:'submitted'});
  let outcome;try{outcome=await this.reads.rpc.call('tx',{tx_hash:transactionHash,sender_account_id:actor,wait_until:'NONE'});}catch(e){if(['UNKNOWN_TRANSACTION','RPC_UNAVAILABLE'].includes(e.code))return record;throw e;}
  if(outcome?.final_execution_status!=='FINAL')return record;
  verifyWalletCall(outcome,record.plan.transaction,transactionHash);return this.finish(record,outcome,transactionHash);
 }
}
