import { randomUUID } from 'node:crypto';
import { assert, walletId } from './core.mjs';

// A request with an unknown result stays attached to its original wallet and plan.
// Time passing or a different connected account never authorizes another send.
export class WalletRequests {
 constructor({store,nativeActions,publication,chain}){Object.assign(this,{store,nativeActions,publication,chain});}
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
  return this.store.transaction(()=>{
   const pending=this.store.list('wallet-request',actor).filter(r=>!['rejected','confirmed','failed'].includes(r.status));
   const same=pending.find(r=>r.kind===kind&&r.planId===planId);if(same)return {...same,dispatchAllowed:false};
   assert(!pending.length,'WALLET_REQUEST_PENDING','An earlier wallet request needs reconciliation');
   return {...this.store.insert('wallet-request',randomUUID(),actor,{kind,planId,status:'requested'}),dispatchAllowed:true};
  });
 }
 reject(wallet,id,{code}){
  const r=this.owned(wallet,id);
  assert(code===4001,'UNKNOWN_WALLET_RESULT','Only an explicit wallet rejection releases the request');
  assert(r.status==='requested'&&!r.transactionHash&&!r.signedTransaction,'ALREADY_SENT','Signed or submitted actions require reconciliation');
  return this.store.update('wallet-request',id,r.owner,r.version,{...r,status:'rejected'});
 }
 owned(wallet,id){const r=this.store.get('wallet-request',id);assert(r?.owner===walletId(wallet),'NOT_FOUND','Wallet request not found',404);return r;}
 async reconcile(wallet,id,transactionHash){
  let r=this.owned(wallet,id);
  assert(r.status!=='rejected','REQUEST_REJECTED','This request was rejected before signing');
  if(transactionHash){
   assert(r.kind!=='intent'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(transactionHash),'INVALID_TRANSACTION','NEAR transaction hash required',400);
   assert(!r.transactionHash||r.transactionHash===transactionHash,'TRANSACTION_CHANGED','Request already has another hash');
   if(!r.transactionHash)r=this.store.update('wallet-request',id,r.owner,r.version,{...r,status:'submitted',transactionHash});
  }
  let result;
  if(r.kind==='intent'){
   const plan=this.store.get('intent',r.planId),op=plan.operationId&&await this.chain.near.reconcile(plan.operationId);
   if(op){this.chain.updateIntentOutcome(r.planId,op);result={status:['confirmed','failed'].includes(op.phase)?op.phase:'submitted',transactionHash:op.transaction_hash};}
  }else if(r.transactionHash)result=await (r.kind==='native'?this.nativeActions:this.publication).confirm(r.owner,r.planId,r.transactionHash);
  if(result){
   const current=this.store.get('wallet-request',id),status=['confirmed','failed'].includes(result.status)?result.status:'submitted';
   if(current.status!==status||(!current.transactionHash&&result.transactionHash))r=this.store.update('wallet-request',id,r.owner,current.version,
    {...current,status,...(result.transactionHash?{transactionHash:result.transactionHash}:{})});else r=current;
  }
  const {signedTransaction,...publicRecord}=r;return publicRecord;
 }
}
