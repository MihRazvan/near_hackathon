import {assert} from './core.mjs';
import {effectiveCodeHash,successfulAccountClosure} from './rpc.mjs';
const ZERO='11111111111111111111111111111111';
// Explicit local operator recovery only. No HTTP endpoint accepts deletion plans.
export class ProvisionRecovery {
 constructor(runtime){Object.assign(this,runtime);}
 spot(planId,spotId){const row=this.store.get('provision-plan',planId),spot=row?.plan.spots.find(s=>s.spotId===spotId);assert(spot,'NOT_FOUND','Reviewed development publication spot not found',404);return {row,spot};}
 async quote(planId,spotId){
  const {row,spot}=this.spot(planId,spotId);assert(row.status!=='processing','RECOVERY_BLOCKED','Wait for the original publication process to finish');const prior=this.store.operation('recover-'+spot.label);
  if(prior)return {accountId:spot.contractId,phase:prior.phase,transactionHash:prior.transaction_hash,originalOperation:true};
  const funded=this.store.operation('identity-fund-'+spot.label);assert(funded?.phase==='confirmed'&&funded.plan.allocationAccount===spot.contractId,'RECOVERY_BLOCKED','Original funding must be confirmed before recovery');
  assert(!this.store.get('near-lock',spot.contractId),'RECOVERY_BLOCKED','Reconcile the original account transaction before recovery');
  const block=await this.reads.block(),account=await this.reads.account(spot.contractId,block),code=effectiveCodeHash(account),nativeBalance=await this.reads.view(this.config.assets.nearUsdc,'ft_balance_of',{account_id:spot.contractId},block);
  const intentsBalance=await this.reads.view(this.config.assets.intentsId,'mt_balance_of',{account_id:spot.contractId,token_id:this.config.assets.nearAsset},block);
  assert(nativeBalance==='0'&&intentsBalance==='0','RECOVERY_BLOCKED','Redeem native USDC before retiring this account');
  let nftMinted=false;
  if(code!==ZERO){
   assert(code===row.plan.codeHash,'CODE_CHANGED','Development contract code changed; inspect before recovery');
   const s=await this.chain.snapshot(spot.contractId);
   assert(s.state.outcome!=='open'&&s.liabilities==='0'&&s.state.total_pending==='0'&&s.escrowBalance==='0','RECOVERY_BLOCKED','Final settlement and zero campaign token liabilities are required');nftMinted=s.state.nft_minted===true;
  }
  return {accountId:spot.contractId,beneficiaryId:this.config.treasury,nativeBalanceYocto:account.amount,codeHash:code,nftMinted,deletesNFT:nftMinted,phase:'ready',warning:'Retiring this development account deletes its contract and any placement NFT. Retained recovery keys do not preserve a deleted NFT.'};
 }
 async execute(planId,spotId,{retireNft=false}={}){
  const {spot}=this.spot(planId,spotId),id='recover-'+spot.label;let operation=this.store.operation(id);
  if(!operation){const quote=await this.quote(planId,spotId);assert(!quote.nftMinted||retireNft===true,'NFT_RETIREMENT_REQUIRED','Explicit NFT retirement is required before deleting its contract');
   const identity=await this.chain.vault.identity(spot.label);assert(identity.accountId===spot.contractId,'IDENTITY_CHANGED','Recovery identity changed');
   if(!this.store.get('recovery',id))this.store.insert('recovery',id,this.config.treasury,{quote,retireNft});
   operation=await this.near.execute({id,signer:identity.signer,plan:{network:this.config.network,signerId:spot.contractId,receiverId:spot.contractId,expectedReceiverCodeHash:quote.codeHash,recoveryVerified:true,actions:[{type:'delete',beneficiaryId:this.config.treasury}]}});
  }else operation=await this.near.reconcile(id);
  if(!successfulAccountClosure(operation.result?.outcome,spot.contractId,this.config.treasury))return {phase:operation.phase,transactionHash:operation.transaction_hash,recovered:false};
  let absent=false;try{await this.reads.account(spot.contractId);}catch(error){if(error.code==='UNKNOWN_ACCOUNT')absent=true;else throw error;}assert(absent,'ACCOUNT_STILL_PRESENT','Wait for final account absence before releasing collateral allocation');
  const funding=this.store.operation('identity-fund-'+spot.label);this.budget.releaseAllocation(funding.id,{accountId:spot.contractId,final:true,accountAbsent:true,tokenBalance:'0',pendingLiabilities:'0'});
  return {phase:'confirmed',transactionHash:operation.transaction_hash,recovered:true,beneficiaryId:this.config.treasury,budget:this.budget.totals()};
 }
}
