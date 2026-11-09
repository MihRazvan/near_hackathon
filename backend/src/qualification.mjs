import { privateKeyToAccount } from 'viem/accounts';
import { assert, hashObject, uint } from './core.mjs';
import { ChainService } from './chain-service.mjs';
import { qualifyNetwork } from './runtime.mjs';
import { successfulAccountClosure } from './rpc.mjs';

// Accelerated, synthetic operator scenarios. Dates are not commercial policy defaults.
export class Qualification {
 constructor(runtime){Object.assign(this,runtime);this.chain=new ChainService(runtime);}
 async campaign(name){
  assert(['failure','success'].includes(name),'INVALID_SCENARIO','Choose failure or success');
  const existing=this.store.get('qualification',name);if(existing?.deploymentId)return existing;
  await qualifyNetwork(this);
  if(name==='success'){
   const failure=this.store.get('qualification','failure');assert(failure?.recovered===true,'RECOVERY_REQUIRED','Recover the first deployment before allocating the second');
  }
  const arbiter=await this.chain.fundIdentity('arbiter','100000000000000000000000');
  assert(arbiter.operation.phase==='confirmed','FUNDING_PENDING','Arbiter funding requires reconciliation');
  const label='campaign-'+name,funded=await this.chain.fundIdentity(label,'7150000000000000000000000');
  assert(funded.operation.phase==='confirmed','FUNDING_PENDING','Campaign funding requires reconciliation');
  let record=this.store.get('qualification',name);
  if(!record){
   const now=Date.now(),ns=offset=>String(BigInt(now+offset*60000)*1000000n);
   const published={synthetic:true,title:'Synthetic vehicle integration test',saleId:'qualification-'+name,spotId:'rear-panel',
    priceCents:name==='failure'?'1':'10',takeoverEnabled:true,printingAndInstallationIncluded:true,
    physicalDelivery:'Synthetic test evidence only; no physical advertisement is claimed',biddingClose:ns(5),reviewEnd:ns(name==='failure'?10:20)};
   const terms={sale_id:published.saleId,asset_id:'synthetic-vehicle',spot_id:published.spotId,
    published_terms_sha256:Buffer.from(hashObject(published),'hex').toString('base64'),takeover_enabled:true,
    bidding_close_ns:published.biddingClose,artwork_due_ns:ns(14),installation_due_ns:ns(16),service_start_ns:ns(16),service_end_ns:ns(18),review_end_ns:ns(20)};
   // Failure is deliberately cancelled at bidding close; its other dates remain valid.
   published.reviewEnd=terms.review_end_ns;terms.published_terms_sha256=Buffer.from(hashObject(published),'hex').toString('base64');
   record=this.store.insert('qualification',name,this.config.treasury,{label,published,terms,arbiterId:arbiter.identity.accountId,initialPriceCents:published.priceCents});
  }
  const deployed=await this.chain.deploy({label,terms:record.terms,initialPriceCents:record.initialPriceCents,sellerId:this.config.treasury,arbiterId:record.arbiterId});
  assert(deployed.operation.phase==='confirmed','DEPLOYMENT_PENDING','Deployment requires reconciliation');
  return this.store.update('qualification',name,this.config.treasury,record.version,{...record,deploymentId:deployed.identity.accountId});
 }
 async buy(name,letter){
  const campaign=this.store.get('qualification',name);assert(campaign?.deploymentId,'NO_CAMPAIGN','Deploy the scenario first');
  assert(['A','B'].includes(letter),'INVALID_BUYER','Choose dedicated buyer A or B');
  const account=privateKeyToAccount(this.config.keys['buyer'+letter]),buyer=account.address.toLowerCase(),id=name+'-purchase-'+letter;
  let step=this.store.get('qualification-step',id);
  if(!step){
   const plan=await this.chain.preparePurchase({buyerId:buyer,contractId:campaign.deploymentId,invoiceId:'qualification-'+id});
   step=this.store.insert('qualification-step',id,buyer,{planId:plan.planId});
  }
  const record=this.store.get('intent',step.planId),prior=this.store.operation('relay-'+step.planId);
  let operation;
  if(prior)operation=await this.near.reconcile(prior.id);
  else operation=await this.chain.relay({buyerId:buyer,planId:step.planId,signature:await account.signMessage({message:record.plan.message})});
  const accepted=this.chain.purchaseAccepted(record.plan,operation);
  this.store.update('qualification-step',id,buyer,step.version,{planId:step.planId,operationId:operation.id,status:operation.phase,accepted});
  return {buyer,phase:operation.phase,accepted,hash:operation.transaction_hash};
 }
 async claim(name,letter,suffix='principal'){
  const c=this.store.get('qualification',name),buyer=privateKeyToAccount(this.config.keys['buyer'+letter]).address.toLowerCase();
  const id=`claim-${name}-${letter}-${suffix}`,prior=this.store.operation(id);
  const op=prior?await this.near.reconcile(id):await this.chain.release({contractId:c.deploymentId,creditorId:buyer,id});
  const snapshot=await this.chain.snapshot(c.deploymentId,[buyer]);
  assert(op.phase!=='confirmed'||snapshot.credits[buyer].available==='0','CLAIM_NOT_RELEASED','Final transaction did not release the original creditor claim');
  return {buyer,phase:op.phase,hash:op.transaction_hash,credit:snapshot.credits[buyer]};
 }
 async finalize(name){
  const c=this.store.get('qualification',name),snapshot=await this.chain.snapshot(c.deploymentId),id='finalize-'+name;
  const when=name==='failure'?snapshot.state.cutoff_ns:snapshot.state.refund_end_ns;
  if(BigInt(when)>BigInt(Date.now())*1000000n)return {phase:'waiting',eligibleAt:new Date(Number(BigInt(when)/1000000n)).toISOString()};
  const arbiter=await this.chain.vault.identity('arbiter');
  const op=await this.chain.call({id,signerId:arbiter.accountId,signer:arbiter.signer,receiverId:c.deploymentId,codeHash:snapshot.codeHash,
   method:name==='failure'?'finalize_failure':'finalize_success',gas:'20000000000000'});
  const after=await this.chain.snapshot(c.deploymentId);
  assert(op.phase!=='confirmed'||after.state.outcome===name,'SETTLEMENT_NOT_PROVEN','Campaign final state did not match settlement');
  return {phase:op.phase,hash:op.transaction_hash,outcome:after.state.outcome};
 }
 async recover(name){
  const c=this.store.get('qualification',name);assert(c,'NO_CAMPAIGN','Scenario not found');if(c.recovered)return {recovered:true,accountId:c.deploymentId};
  const identity=await this.chain.vault.identity(c.label),id='recover-'+c.label,prior=this.store.operation(id);
  if(!prior){
   const snapshot=await this.chain.snapshot(c.deploymentId);
   const nativeBalance=await this.reads.view(this.config.assets.nearUsdc,'ft_balance_of',{account_id:c.deploymentId});
   assert(snapshot.state.outcome!=='open'&&snapshot.liabilities==='0'&&snapshot.state.total_pending==='0'&&snapshot.escrowBalance==='0'&&nativeBalance==='0','RECOVERY_BLOCKED','Final outcome, zero liabilities and both zero token balances required');
   this.store.insert('recovery',id,this.config.treasury,{snapshot,nativeBalance});
  }
  const operation=prior?await this.near.reconcile(id):await this.near.execute({id,signer:identity.signer,plan:{network:this.config.network,signerId:identity.accountId,receiverId:identity.accountId,recoveryVerified:true,
   actions:[{type:'delete',beneficiaryId:this.config.treasury}]}});
  const closureVerified=successfulAccountClosure(operation.result?.outcome,identity.accountId,this.config.treasury);
  assert(closureVerified,'RECOVERY_PENDING','Account closure and beneficiary transfer require final verification');
  let absent=false;try{await this.reads.account(identity.accountId);}catch(error){if(error.code==='UNKNOWN_ACCOUNT')absent=true;else throw error;}
  assert(absent,'ACCOUNT_STILL_PRESENT','Recovery account is still present');
  for(const row of this.store.db.prepare('SELECT id FROM operations WHERE kind=?').all('near')){
   const op=this.store.operation(row.id);if(op.plan.allocationAccount===identity.accountId)this.budget.releaseAllocation(op.id,{accountId:identity.accountId,final:true,accountAbsent:true,tokenBalance:'0',pendingLiabilities:'0'});
  }
  this.store.update('qualification',name,this.config.treasury,c.version,{...c,recovered:true,recoveryOperationId:id});
  return {recovered:true,accountId:identity.accountId,hash:operation.transaction_hash,budget:this.budget.totals()};
 }
 async inspect(name){
  const c=this.store.get('qualification',name);assert(c,'NO_CAMPAIGN','Scenario not found');
  if(c.recovered)return {accountId:c.deploymentId,recovered:true};
  const wallets=['A','B'].map(letter=>privateKeyToAccount(this.config.keys['buyer'+letter]).address.toLowerCase());
  return this.chain.snapshot(c.deploymentId,[...wallets,this.config.treasury]);
 }
 async rights(step){
  if(step==='setup'){
   const output=[];for(const label of ['placement-owner','placement-transferee']){
    const funded=await this.chain.fundIdentity(label,'100000000000000000000000');output.push({label,accountId:funded.identity.accountId,phase:funded.operation.phase});
    if(funded.operation.phase!=='confirmed')break;
   }return output;
  }
  const c=this.store.get('qualification','success');assert(c?.deploymentId,'NO_CAMPAIGN','Deploy the success scenario first');
  const first=await this.chain.vault.identity('placement-owner'),second=await this.chain.vault.identity('placement-transferee');
  const snapshot=await this.chain.snapshot(c.deploymentId),contractId=c.deploymentId,codeHash=snapshot.codeHash;
  const id='qualification-rights-'+step,prior=this.store.operation(id);
  if(prior)return this.publicOperation(await this.near.reconcile(id));
  if(step==='nominate'){
   const account=privateKeyToAccount(this.config.keys.buyerB),plan=await this.chain.prepareNomination({buyerId:account.address,contractId,recipientId:first.accountId});
   const operation=await this.chain.relay({buyerId:account.address,planId:plan.planId,signature:await account.signMessage({message:plan.message})});
   this.store.insert('qualification-step',id,account.address.toLowerCase(),{operationId:operation.id,planId:plan.planId});return this.publicOperation(operation);
  }
  let signerId=this.config.treasury,signer=await this.chain.treasurySigner(),method,args={},deposit='0';
  if(step==='accept'){signerId=first.accountId;signer=first.signer;method='accept_nft_nomination';}
  else if(step==='mint'){method='mint_final_placement';deposit='30000000000000000000000';}
  else if(step==='transfer'){signerId=first.accountId;signer=first.signer;method='nft_transfer';deposit='1';args={receiver_id:second.accountId,token_id:contractId};}
  else if(['artwork','proof'].includes(step)){
   const artifact=this.store.list('media',this.config.treasury).find(row=>row.status==='verified'&&row.mime==='text/plain');assert(artifact,'NO_ARTIFACT','Upload the public synthetic artifact first');
   args={artifact_uri:artifact.uri,artifact_sha256:Buffer.from(artifact.sha256,'hex').toString('base64')};deposit='10000000000000000000000';
   if(step==='artwork'){signerId=second.accountId;signer=second.signer;method='submit_artwork';args.token_id=contractId;}
   else method='submit_delivery_proof';
  }
  else if(step==='lock'){method='lock_artwork';deposit='1';args={expected_revision:snapshot.rights.revision};}
  else if(['open-issue','close-issue'].includes(step)){
   const arbiter=await this.chain.vault.identity('arbiter');signerId=arbiter.accountId;signer=arbiter.signer;method='record_issue_decision';deposit='1000000000000000000000';
   args={case_id:'synthetic-delivery-check',open:step==='open-issue',evidence_sha256:Buffer.from(hashObject({synthetic:true,step}),'hex').toString('base64')};
  }
  else assert(false,'INVALID_RIGHTS_STEP','Use setup, nominate, accept, mint, transfer, artwork, lock, proof, open-issue or close-issue');
  return this.publicOperation(await this.chain.call({id,signerId,signer,receiverId:contractId,codeHash,method,args,deposit}));
 }
 publicOperation(op){return {id:op.id,phase:op.phase,hash:op.transaction_hash};}
 async repairSettlement(name){
  const id='finalize-'+name,old=await this.near.reconcile(id);
  if(old.phase==='confirmed')return this.publicOperation(old);
  if(old.phase==='superseded')return this.publicOperation(await this.near.reconcile(old.result.replacementId));
  const arbiter=await this.chain.vault.identity('arbiter');
  return this.publicOperation(await this.near.execute({id:id+'-lower-gas',signer:arbiter.signer,
   plan:{...old.plan,replacesOperationId:id,actions:[{...old.plan.actions[0],gas:'20000000000000'}]}}));
 }
}
