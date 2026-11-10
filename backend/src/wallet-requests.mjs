import { randomUUID } from 'node:crypto';
import { assert, walletId } from './core.mjs';

// A request with an unknown result stays attached to its original wallet and plan.
// Time passing or a different connected account never authorizes another send.
export class WalletRequests {
 constructor({store,nativeActions,publication,chain,now=Date.now}){Object.assign(this,{store,nativeActions,publication,chain,now});}
 list(wallet){return this.store.list('wallet-request',walletId(wallet)).map(({signedTransaction,...r})=>r);}
 async prepare(wallet,input){
  const actor=walletId(wallet);
  for(const request of this.list(actor).filter(r=>!['rejected','confirmed','failed'].includes(r.status)))await this.reconcile(actor,request.id);
  return this.begin(actor,input);
 }
 begin(wallet,{kind,planId}){
  const actor=walletId(wallet),table={native:'native-plan',publication:'publication-plan',intent:'intent'}[kind];
  assert(table,'INVALID_REQUEST','Choose a known wallet action',400);
  const plan=this.store.get(table,planId);assert(plan?.owner===actor,'NOT_FOUND','Wallet plan not found',404);
  assert(plan.status==='prepared','PLAN_SUBMITTED','Reconcile the original wallet action before starting another');
  const publication=kind==='publication'?plan.plan:kind==='intent'&&plan.plan.context?.kind==='publish'?this.store.get('publication-plan',plan.plan.context.publicationPlanId)?.plan:null;
  if(publication){const sale=this.store.get('sale',publication.saleId);assert(sale?.owner===actor&&sale.status==='draft'&&sale.version===publication.saleVersion,'SALE_CHANGED','This publication review was replaced by newer sale details. Review the current listing before publishing');}
  return this.store.transaction(()=>{
   const pending=this.store.list('wallet-request',actor).filter(r=>!['rejected','confirmed','failed'].includes(r.status));
   const same=pending.find(r=>r.kind===kind&&r.planId===planId);if(same)return {...same,dispatchAllowed:false};
   assert(!pending.length,'WALLET_REQUEST_PENDING','An earlier wallet request needs reconciliation');
   return {...this.store.insert('wallet-request',randomUUID(),actor,{kind,planId,status:'requested',dispatched:false}),dispatchAllowed:true};
  });
 }
 reject(wallet,id,{code}){
  const r=this.owned(wallet,id);
  assert(code===4001,'UNKNOWN_WALLET_RESULT','Only an explicit wallet rejection releases the request');
  assert(r.status==='requested'&&!r.transactionHash&&!r.signedTransaction,'ALREADY_SENT','Signed or submitted actions require reconciliation');
  return this.store.transaction(()=>{
   const result=this.store.update('wallet-request',id,r.owner,r.version,{...r,status:'rejected'});
   for(const b of this.store.list('booking',r.owner).filter(b=>b.status==='prepared'&&(b.planId===r.planId||b.nativePlanId===r.planId))){
    const intent=this.store.get('intent',b.planId);
    if(!b.operationId&&!intent?.operationId&&!this.store.operation('relay-'+b.planId))this.store.update('booking',b.id,b.owner,b.version,{...b,status:'cancelled-before-send'});
   }
   return result;
  });
 }
 cancelUnsent(wallet,id){
  const r=this.owned(wallet,id);assert(r.status==='requested'&&!r.dispatched&&!r.transactionHash,'RECONCILIATION_REQUIRED','The original wallet was already opened; reconcile it before starting again');
  return this.store.update('wallet-request',id,r.owner,r.version,{...r,status:'rejected',errorCode:'CANCELLED_BEFORE_DISPATCH'});
 }
 dispatch(wallet,id){
  assert(this.store.get('lab-clock','current')?.status!=='advancing','CLOCK_BUSY','Wait for the local chain clock to finish before dispatching a wallet transaction');
  const r=this.owned(wallet,id);assert(r.status==='requested'&&!r.dispatched,'WALLET_REQUEST_PENDING','The original wallet request was already started');
  const table={native:'native-plan',publication:'publication-plan',intent:'intent'}[r.kind],plan=this.store.get(table,r.planId)?.plan;
  if(plan?.expiresAt&&Date.parse(plan.expiresAt)<=this.now()){
   this.store.update('wallet-request',id,r.owner,r.version,{...r,status:'failed',errorCode:'EXPIRED_BEFORE_DISPATCH'});
   assert(false,'EXPIRED_PLAN','This request expired before the wallet was opened. Prepare a fresh action.');
  }
  return this.store.update('wallet-request',id,r.owner,r.version,{...r,dispatched:true});
 }
 async submitIntent(wallet,id,signature){
  let r=this.owned(wallet,id);assert(r.kind==='intent','INVALID_REQUEST','An Intents signature request is required');
  if(['submitted','confirmed','failed'].includes(r.status))return this.reconcile(wallet,id);
  assert(r.status==='requested','WALLET_REQUEST_PENDING','The original wallet request is still being processed');
  r=this.store.update('wallet-request',id,r.owner,r.version,{...r,status:'authorizing'});
  try{
   const op=await this.chain.relay({buyerId:r.owner,planId:r.planId,signature}),intent=this.store.get('intent',r.planId);
   for(const b of this.store.list('booking',r.owner).filter(b=>b.planId===r.planId)){
    const accepted=this.chain.purchaseAccepted(intent.plan,op),status=op.phase==='confirmed'?(accepted?'accepted':'rejected'):op.phase==='failed'?'failed':'submitted';
    this.store.update('booking',b.id,r.owner,b.version,{...b,operationId:op.id,status,accepted});
   }
   return this.reconcile(wallet,id);
  }catch(error){
   const op=this.chain.store.operation('relay-'+r.planId),lease=this.chain.store.get('intent-dispatch',r.planId),current=this.owned(wallet,id);
   if(!op&&!lease&&error.code!=='INTENT_BUSY'){
    this.store.update('wallet-request',id,r.owner,current.version,{...current,status:'failed',errorCode:error.code??'REQUEST_FAILED'});
    for(const b of this.store.list('booking',r.owner).filter(b=>b.planId===r.planId&&b.status==='prepared'))this.store.update('booking',b.id,r.owner,b.version,{...b,status:'failed'});
   }
   throw error;
  }
 }
 async resumeIntent(wallet,id){
  let r=await this.reconcile(wallet,id);assert(r.kind==='intent','INVALID_REQUEST','Only the original Intents message can be resumed');
  if(['confirmed','failed'].includes(r.status)||r.transactionHash||this.chain.store.operation('relay-'+r.planId))return r;
  const lease=this.chain.store.get('intent-dispatch',r.planId);
  if(lease){
   assert(Number.isSafeInteger(lease.pid)&&lease.pid>0,'RECONCILIATION_REQUIRED','The original dispatch needs operator reconciliation');
   let dead=false;try{process.kill(lease.pid,0);}catch(error){if(error.code==='ESRCH')dead=true;}
   assert(dead,'INTENT_BUSY','The original signing process is still active');
   this.chain.store.db.prepare('DELETE FROM objects WHERE kind=? AND id=?').run('intent-dispatch',r.planId);
  }
  const plan=this.store.get('intent',r.planId).plan,expired=Date.parse(plan.expiresAt)<=this.now();
  r=this.store.update('wallet-request',id,r.owner,r.version,{...r,status:expired?'failed':'rejected',errorCode:expired?'EXPIRED_BEFORE_DISPATCH':'ORIGINAL_INTENT_RESUMABLE'});
  if(expired)for(const b of this.store.list('booking',r.owner).filter(b=>b.planId===r.planId&&b.status==='prepared'))this.store.update('booking',b.id,r.owner,b.version,{...b,status:'failed'});
  return r;
 }
 owned(wallet,id){const r=this.store.get('wallet-request',id);assert(r?.owner===walletId(wallet),'NOT_FOUND','Wallet request not found',404);return r;}
 async reconcile(wallet,id,transactionHash){
  let r=this.owned(wallet,id);
  assert(r.status!=='rejected','REQUEST_REJECTED','This request was rejected before signing');
  const funded=this.store.operation('funded-near-'+id);
  if(!r.transactionHash&&funded?.scope===r.owner&&funded.transaction_hash)r=this.store.update('wallet-request',id,r.owner,r.version,{...r,status:'submitted',transactionHash:funded.transaction_hash});
  if(transactionHash){
   assert(r.kind!=='intent'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(transactionHash),'INVALID_TRANSACTION','NEAR transaction hash required',400);
   assert(!r.transactionHash||r.transactionHash===transactionHash,'TRANSACTION_CHANGED','Request already has another hash');
   if(!r.transactionHash)r=this.store.update('wallet-request',id,r.owner,r.version,{...r,status:'submitted',transactionHash});
  }
  if(['confirmed','failed'].includes(r.status))return r;
  let result;
  if(r.kind==='intent'){
   const plan=this.store.get('intent',r.planId),operationId=plan.operationId??this.chain.store.operation('relay-'+r.planId)?.id,op=operationId&&await this.chain.near.reconcile(operationId);
   if(op){this.chain.updateIntentOutcome(r.planId,op);if(plan.plan.context.kind==='publish')await this.publication.confirmIntent(r.owner,plan.plan.context.publicationPlanId,op);result={status:['confirmed','failed'].includes(op.phase)?op.phase:'submitted',transactionHash:op.transaction_hash};
    if(['confirmed','failed'].includes(op.phase))for(const b of this.store.list('booking',r.owner).filter(b=>b.planId===r.planId&&['prepared','submitted'].includes(b.status))){
     const accepted=op.phase==='confirmed'&&this.chain.purchaseAccepted(plan.plan,op),status=op.phase==='failed'?'failed':accepted?'accepted':'rejected';
     this.store.update('booking',b.id,r.owner,b.version,{...b,status,accepted,operationId:op.id});
    }
   }
  }else if(r.transactionHash)result=await (r.kind==='native'?this.nativeActions:this.publication).confirm(r.owner,r.planId,r.transactionHash);
  if(result){
   const current=this.store.get('wallet-request',id),status=['confirmed','failed'].includes(result.status)?result.status:'submitted';
   if(current.status!==status||(!current.transactionHash&&result.transactionHash))r=this.store.update('wallet-request',id,r.owner,current.version,
    {...current,status,...(result.transactionHash?{transactionHash:result.transactionHash}:{})});else r=current;
  }
  const {signedTransaction,...publicRecord}=r;return publicRecord;
 }
}
