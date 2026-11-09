import { assert, hashObject, walletId, uint } from './core.mjs';
import { effectiveCodeHash, successfulNearOutcome } from './rpc.mjs';

export function verifyWalletCall(outcome,transaction,hash){
 const tx=outcome?.transaction,a=tx?.actions?.[0]?.FunctionCall,p=transaction.actions[0].params;
 assert(tx?.hash===hash&&tx.signer_id===transaction.signerId&&tx.receiver_id===transaction.receiverId&&tx.actions.length===1
  &&a?.method_name===p.methodName&&uint(String(a.gas))===uint(p.gas)&&a.deposit===p.deposit,'TRANSACTION_CHANGED','Final transaction differs from the wallet plan');
 let args;try{args=JSON.parse(Buffer.from(a.args,'base64'));}catch{}
 assert(args&&hashObject(args)===hashObject(p.args),'TRANSACTION_CHANGED','Final transaction arguments differ from the wallet plan');
}
export class Publication {
 constructor({store,reads,config,marketplace,now=Date.now}){Object.assign(this,{store,reads,config,marketplace,now});}
 async prepare(wallet,saleId){
  const actor=walletId(wallet),sale=this.store.get('sale',saleId),factory=this.config.factory;
  assert(sale?.owner===actor,'NOT_FOUND','Owner sale not found',404);
  assert(factory,'FACTORY_UNAVAILABLE','A qualified campaign factory has not been configured',503);
  const publication=this.marketplace.publication(actor,saleId),block=await this.reads.block();
  assert(effectiveCodeHash(await this.reads.account(factory.accountId,block))===factory.codeHash,'FACTORY_CHANGED','Factory code differs from qualification');
  const c=await this.reads.view(factory.accountId,'get_config',{},block);
  assert(Buffer.from(c.campaign_code_hash,'base64').toString('hex')===factory.campaignSha256&&c.ft_contract_id===this.config.assets.nearUsdc
   &&c.intents_contract_id===this.config.assets.intentsId&&c.arbiter_id===sale.arbiterId,'FACTORY_CHANGED','Factory configuration differs from the published offer');
  const plans=[];
  for(const terms of publication.terms){
   const spot=sale.spots.find(s=>s.id===terms.spot_id),name='c'+hashObject({saleId,version:sale.version,spotId:spot.id}).slice(0,24);
   const id=hashObject({factory:factory.accountId,name,terms,seller:actor,price:spot.priceCents});
   const prior=this.store.get('publication-plan',id);
   if(prior){plans.push(prior);continue;}
   const transaction={signerId:actor,receiverId:factory.accountId,actions:[{type:'FunctionCall',params:{methodName:'create_campaign',
    args:{name,initial_price_cents:spot.priceCents,terms},gas:'60000000000000',deposit:c.creation_deposit}}]};
   const plan={planId:id,saleId,saleVersion:sale.version,spotId:spot.id,contractId:name+'.'+factory.accountId,
    factoryCodeHash:factory.codeHash,transaction,createdAt:new Date(this.now()).toISOString()};
   plans.push(this.store.insert('publication-plan',id,actor,{plan,status:'prepared'}));
  }
  return {saleId,publication,plans};
 }
 async confirm(wallet,id,transactionHash){
  const actor=walletId(wallet);let record=this.store.get('publication-plan',id);
  assert(record?.owner===actor,'NOT_FOUND','Publication action not found',404);
  assert(typeof transactionHash==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(transactionHash),'INVALID_TRANSACTION','NEAR transaction hash required',400);
  assert(!record.transactionHash||record.transactionHash===transactionHash,'TRANSACTION_CHANGED','Publication already has a transaction');
  if(!record.transactionHash)record=this.store.update('publication-plan',id,actor,record.version,{...record,transactionHash,status:'submitted'});
  let outcome;try{outcome=await this.reads.rpc.call('tx',{tx_hash:transactionHash,sender_account_id:actor,wait_until:'NONE'});}
  catch(e){if(['UNKNOWN_TRANSACTION','RPC_UNAVAILABLE'].includes(e.code))return record;throw e;}
  if(outcome.final_execution_status!=='FINAL')return record;
  verifyWalletCall(outcome,record.plan.transaction,transactionHash);
  const creation=await this.reads.view(record.plan.transaction.receiverId,'get_creation',{name:record.plan.transaction.actions[0].params.args.name});
  const success=successfulNearOutcome(outcome)&&creation?.status==='ready'&&creation.account_id===record.plan.contractId&&creation.seller_id===actor;
  if(success)assert((await this.reads.keys(creation.account_id)).length===0,'CHILD_KEYS','Published campaign must not have access keys');
  const status=success?'confirmed':'failed';
  if(record.status!==status)record=this.store.update('publication-plan',id,actor,record.version,{...record,status});
  const sale=this.store.get('sale',record.plan.saleId),all=this.store.list('publication-plan',actor).filter(p=>p.plan.saleId===sale.id&&p.plan.saleVersion===record.plan.saleVersion);
  if(sale.status==='draft'&&all.length===sale.spots.length&&all.every(p=>p.status==='confirmed'))
   await this.marketplace.publish(actor,sale.id,{version:record.plan.saleVersion,contracts:all.map(p=>({spotId:p.plan.spotId,contractId:p.plan.contractId}))});
  return record;
 }
}
