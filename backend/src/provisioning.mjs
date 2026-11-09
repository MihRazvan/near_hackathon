import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {baseEncode} from 'near-api-js';
import {assert,walletId,hashObject,sha256,uint} from './core.mjs';
import {gasReservation} from './near-executor.mjs';

const N=10n**24n,DEFAULT_COLLATERAL=715n*10n**22n;
// Development publication without a global-code burn. Recovery keys remain in the private vault.
// This is deliberately distinct from the immutable, keyless factory path.
export class Provisioning {
 constructor({store,chain,marketplace,reads,budget,config,now=Date.now}){Object.assign(this,{store,chain,marketplace,reads,budget,config,now});this.running=new Set();}
 owned(actor,id){const r=this.store.get('provision-plan',id);assert(r?.owner===walletId(actor),'NOT_FOUND','Publication plan not found',404);return r;}
 async artifact(){const bytes=await readFile(this.config.artifact),manifest=JSON.parse(await readFile(join(dirname(this.config.artifact),'campaign-manifest.json')));
  assert(bytes.length===manifest.bytes&&sha256(bytes)===manifest.sha256,'ARTIFACT_CHANGED','Compiled campaign differs from its reviewed manifest');return {bytes,manifest};}
 async prepare(actor,saleId){
  const owner=walletId(actor),sale=this.store.get('sale',saleId);assert(sale?.owner===owner&&!owner.startsWith('0x'),'NOT_FOUND','NEAR owner sale not found',404);
  const publication=this.marketplace.publication(owner,saleId),{bytes,manifest}=await this.artifact();
  const prior=this.store.list('provision-plan',owner).find(p=>p.plan.saleId===saleId&&p.plan.saleVersion===sale.version);
  if(prior)return {...prior,assessment:await this.assess(prior.plan)};
  assert(this.config.treasury,'OPERATOR_NOT_CONFIGURED','Publication sponsorship is not configured',503);
  await this.reads.status();const block=await this.reads.block(),protocol=await this.reads.rpc.call('EXPERIMENTAL_protocol_config',{block_id:block.header.hash}),gas=await this.reads.rpc.call('gas_price',[block.header.hash]);
  await Promise.all([this.reads.account(owner,block),this.reads.account(sale.arbiterId,block)]);
  const deployment={signerId:'campaign-placeholder',receiverId:'campaign-placeholder',actions:[{type:'deploy',code:bytes.toString('base64'),sha256:manifest.sha256},
   {type:'call',method:'new_campaign',args:{seller_id:owner,arbiter_id:sale.arbiterId,ft_contract_id:this.config.assets.nearUsdc,intents_contract_id:this.config.assets.intentsId,settlement:'intents',initial_price_cents:sale.spots[0].priceCents,terms:publication.terms[0]},gas:'20000000000000',deposit:'0'}]};
  const fee=gasReservation(deployment,protocol,gas),storage=BigInt(bytes.length+5000)*uint(protocol.runtime_config.storage_amount_per_byte)+fee+N/10n;
  const collateral=storage>DEFAULT_COLLATERAL?((storage+N/100n-1n)/(N/100n))*(N/100n):DEFAULT_COLLATERAL;
  const body={schema:'everywhere-recoverable-publication/v1',network:this.config.network,saleId,saleVersion:sale.version,owner,
   arbiterId:sale.arbiterId,codeHash:baseEncode(Buffer.from(manifest.sha256,'hex')),artifactSha256:manifest.sha256,
   termsHash:publication.publishedTermsHash,collateralPerSpot:collateral.toString(),deploymentFeeReserve:fee.toString(),
   biddingClose:sale.schedule.biddingClose,recoveryKeysRetained:true,globalCodePublication:false};
  const id=hashObject(body),spots=[];
  for(const terms of publication.terms){const label='publish-'+hashObject({id,spot:terms.spot_id}).slice(0,24),identity=await this.chain.vault.identity(label);
   spots.push({spotId:terms.spot_id,label,contractId:identity.accountId,priceCents:sale.spots.find(s=>s.id===terms.spot_id).priceCents,terms});}
  const plan={...body,spots,planId:id};const row=this.store.insert('provision-plan',id,owner,{plan,status:'prepared'});return {...row,assessment:await this.assess(plan)};
 }
 async assess(plan){
  const block=await this.reads.block(),account=await this.reads.account(this.config.treasury,block),protocol=await this.reads.rpc.call('EXPERIMENTAL_protocol_config',{block_id:block.header.hash}),gas=await this.reads.rpc.call('gas_price',[block.header.hash]);
  let collateral=0n,fees=0n,treasuryFees=0n;
  for(const spot of plan.spots){
   if(!this.store.operation('identity-fund-'+spot.label)){
    collateral+=uint(plan.collateralPerSpot);const fee=gasReservation({signerId:this.config.treasury,receiverId:spot.contractId,actions:[{type:'transfer',amount:plan.collateralPerSpot}]},protocol,gas);fees+=fee;treasuryFees+=fee;
   }
   if(!this.store.operation('deploy-'+spot.label))fees+=uint(plan.deploymentFeeReserve);
  }
  const used=this.budget.totals(),liquid=uint(account.amount)-BigInt(account.storage_usage)*uint(protocol.runtime_config.storage_amount_per_byte),blocks=[];
  for(const [key,needed]of Object.entries({nearAllocation:collateral,nearAllocationGross:collateral,nearFees:fees}))if(uint(used[key])+needed>uint(this.config.limits[key]))blocks.push({code:'BUDGET_EXCEEDED',category:key,used:used[key],additional:needed.toString(),limit:this.config.limits[key]});
  if(liquid-collateral-treasuryFees<uint(this.config.treasuryFloor))blocks.push({code:'TREASURY_FLOOR',liquid:liquid.toString(),remainingAfterPublication:(liquid-collateral-treasuryFees).toString(),floor:this.config.treasuryFloor});
  if(!this.config.allowRecoverablePublication)blocks.push({code:'PUBLICATION_MODE_DISABLED'});
  return {ready:this.config.enabled&&blocks.length===0,executionEnabled:this.config.enabled,additionalCollateralYocto:collateral.toString(),additionalFeeReserveYocto:fees.toString(),
   availableTreasuryYocto:liquid.toString(),treasuryFloorYocto:this.config.treasuryFloor,blocks,recovery:'Retained development keys can recover native collateral after all USDC liabilities clear. Retiring an account also removes its demo NFT.'};
 }
 async start(actor,id,{reviewed=false}={}){
  let row=this.owned(actor,id);assert(reviewed===true,'REVIEW_REQUIRED','Review the publication funding and recovery terms before continuing');
  const sale=this.store.get('sale',row.plan.saleId);if(sale.status==='published')return row;
  assert(sale.version===row.plan.saleVersion&&sale.status==='draft','STALE_VERSION','The sale changed; prepare another publication quote');
  assert(Date.parse(row.plan.biddingClose)>this.now()+60000,'BIDDING_TOO_CLOSE','Leave at least one minute to publish before bidding closes');
  const a=await this.assess(row.plan);if(!a.ready){row=this.store.update('provision-plan',id,row.owner,row.version,{...row,status:'budget-blocked',assessment:a});return row;}
  if(this.running.has(id))return row;
  row=this.store.update('provision-plan',id,row.owner,row.version,{...row,status:'processing',approvedAt:new Date().toISOString()});
  this.running.add(id);void this.perform(row).catch(error=>{
   const latest=this.store.get('provision-plan',id);if(latest)this.store.update('provision-plan',id,row.owner,latest.version,{...latest,status:'needs-recovery',errorCode:error.code??'PUBLICATION_INTERRUPTED'});
  }).finally(()=>this.running.delete(id));return row;
 }
 async perform(row){
  const {plan}=row,{manifest}=await this.artifact();assert(manifest.sha256===plan.artifactSha256,'ARTIFACT_CHANGED','Publication artifact changed');
  for(const spot of plan.spots){
   const funded=await this.chain.fundIdentity(spot.label,plan.collateralPerSpot);
   const fundingStatus=await this.wait(funded.operation.id);assert(fundingStatus!=='failed','FUNDING_FAILED','The original funding transaction failed; inspect its recovery account');
   if(fundingStatus!=='confirmed')return this.pending(row.id,spot.spotId,'funding');
   const deployed=await this.chain.deploy({label:spot.label,initialPriceCents:spot.priceCents,terms:spot.terms,sellerId:row.owner,arbiterId:plan.arbiterId});
   const deploymentStatus=await this.wait(deployed.operation.id);assert(deploymentStatus!=='failed','DEPLOYMENT_FAILED','The original deployment failed; its dedicated recovery account is retained');
   if(deploymentStatus!=='confirmed')return this.pending(row.id,spot.spotId,'deployment');
   // Re-entering the same deployment only reconciles its original bytes and registers the final record.
   await this.chain.deploy({label:spot.label,initialPriceCents:spot.priceCents,terms:spot.terms,sellerId:row.owner,arbiterId:plan.arbiterId});
  }
  await this.marketplace.publish(row.owner,plan.saleId,{version:plan.saleVersion,contracts:plan.spots.map(s=>({spotId:s.spotId,contractId:s.contractId}))});
  const latest=this.store.get('provision-plan',row.id);this.store.update('provision-plan',row.id,row.owner,latest.version,{...latest,status:'published'});
 }
 async wait(id){for(let i=0;i<60;i++){const op=await this.chain.near.reconcile(id);if(['confirmed','failed'].includes(op.phase))return op.phase;await new Promise(r=>setTimeout(r,250));}return 'pending';}
 pending(id,spotId,step){const r=this.store.get('provision-plan',id);this.store.update('provision-plan',id,r.owner,r.version,{...r,status:'waiting-original-receipt',spotId,step});}
}
