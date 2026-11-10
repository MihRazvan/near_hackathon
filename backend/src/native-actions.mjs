import { assert, walletId, uint, hashObject } from './core.mjs';
import { successfulNearOutcome } from './rpc.mjs';
import { effectiveCodeHash } from './rpc.mjs';
import { validateIntentPlan } from './intents.mjs';

// Customer actions are prepared for their own NEAR wallet. This service has no signer or private-key input.
export class NativeActions {
 constructor({store,chain,reads,config,now=Date.now}){Object.assign(this,{store,chain,reads,config,now});}
 async prepareBooking(wallet,bookingId){
  const actor=walletId(wallet),booking=this.store.get('booking',bookingId);
  assert(!actor.startsWith('0x')&&booking?.owner===actor&&booking.status==='prepared','NOT_FOUND','Native wallet booking not found',404);
  if(booking.nativePlanId)return this.store.get('native-plan',booking.nativePlanId).plan;
  const original=this.store.get('intent',booking.planId)?.plan;validateIntentPlan(original,{now:this.now()});
  const s=await this.chain.snapshot(booking.contractId),transfer=original.payload.intents[0];
  assert(s.state.round===original.context.expectedRound&&s.state.next_price===original.context.amount,'PRICE_CHANGED','Refresh and prepare a booking at the current price');
  const body={schema:'everywhere-native-action/v1',wallet:actor,contractId:booking.contractId,codeHash:this.config.assets.intentsCodeHash,kind:'purchase',bookingId,purchasePlanId:booking.planId,
   createdAt:new Date(this.now()).toISOString(),expiresAt:original.expiresAt,transaction:{signerId:actor,receiverId:this.config.assets.intentsId,actions:[{type:'FunctionCall',params:{
    methodName:'mt_transfer_call',args:{receiver_id:booking.contractId,token_id:this.config.assets.nearAsset,amount:original.context.amount,approval:null,memo:null,msg:transfer.msg},gas:'80000000000000',deposit:'1'}}]}};
  const plan={...body,planId:hashObject(body)};this.store.insert('native-plan',plan.planId,actor,{plan,status:'prepared'});
  this.store.update('booking',bookingId,actor,booking.version,{...booking,nativePlanId:plan.planId});return plan;
 }
 async prepareToken(wallet,{kind,amount}){
  const actor=walletId(wallet),a=this.config?.assets;
  assert(!actor.startsWith('0x')&&a,'NEAR_WALLET_REQUIRED','Connect a native NEAR account for this token action');
  const block=await this.reads.block();
  assert(effectiveCodeHash(await this.reads.account(a.nearUsdc,block))===a.usdcCodeHash&&effectiveCodeHash(await this.reads.account(a.intentsId,block))===a.intentsCodeHash,
   'ASSET_CHANGED','Token and Intents code must match qualification');
  let receiverId=a.nearUsdc,method,args,deposit='1',gas='60000000000000';
  if(kind==='token-storage'){
   const existing=await this.reads.view(a.nearUsdc,'storage_balance_of',{account_id:actor},block);
   assert(!existing,'ALREADY_REGISTERED','This wallet already has native USDC storage');
   const bounds=await this.reads.view(a.nearUsdc,'storage_balance_bounds',{},block);
   assert(uint(bounds.min)>0n&&uint(bounds.min)<=10000000000000000000000n,'STORAGE_PRICE_CHANGED','Token storage cost exceeds the local limit');
   method='storage_deposit';args={account_id:actor,registration_only:true};deposit=bounds.min;gas='15000000000000';
  }else{
   assert(uint(amount)>0n,'ZERO_WITHDRAWAL','Choose a positive token amount');
   if(kind==='withdraw-native'){
    assert(await this.reads.view(a.nearUsdc,'storage_balance_of',{account_id:actor},block),'STORAGE_REQUIRED','Register this account for native USDC first');
    assert(uint(await this.reads.view(a.intentsId,'mt_balance_of',{account_id:actor,token_id:a.nearAsset},block))>=uint(amount),'INSUFFICIENT_INTENTS','Withdrawal exceeds the original wallet balance');
    receiverId=a.intentsId;method='ft_withdraw';args={token:a.nearUsdc,receiver_id:actor,amount,memo:null,msg:null};
   }else if(kind==='deposit-intents'){
    assert(uint(await this.reads.view(a.nearUsdc,'ft_balance_of',{account_id:actor},block))>=uint(amount),'INSUFFICIENT_USDC','Deposit exceeds native USDC balance');
    method='ft_transfer_call';args={receiver_id:a.intentsId,amount,msg:actor,memo:null};
   }else assert(false,'INVALID_ACTION','Unknown native token action',400);
  }
  const body={schema:'everywhere-native-action/v1',wallet:actor,contractId:receiverId,
   codeHash:receiverId===a.intentsId?a.intentsCodeHash:a.usdcCodeHash,kind,createdAt:new Date(this.now()).toISOString(),expiresAt:new Date(this.now()+120000).toISOString(),
   transaction:{signerId:actor,receiverId,actions:[{type:'FunctionCall',params:{methodName:method,args,gas,deposit}}]}};
  const plan={...body,planId:hashObject(body)};this.store.insert('native-plan',plan.planId,actor,{plan,status:'prepared'});return plan;
 }
 async prepare(wallet,{contractId,kind,mediaId,expectedRevision,receiverId,caseId,open}){
  const actor=walletId(wallet);assert(!actor.startsWith('0x'),'NEAR_WALLET_REQUIRED','Connect the NEAR wallet that owns this placement or role',400);
  const s=await this.chain.snapshot(contractId),state=s.state,rights=s.rights;
  let method,args={},deposit='0';const gas='25000000000000';
  const seller=()=>assert(actor===state.seller_id,'SELLER_REQUIRED','Only the published seller can prepare this action',403);
  const arbiter=()=>assert(actor===state.arbiter_id,'ARBITER_REQUIRED','Only the published arbiter can prepare this action',403);
  const unsettled=()=>assert(state.outcome==='open','CAMPAIGN_SETTLED',state.outcome==='success'?'This campaign has already settled successfully. Earnings and refunds can now be claimed.':'This campaign has already settled as failed. Available refunds can now be claimed.');
  const nftOwner=()=>assert(actor===rights.current_owner_id,'NFT_OWNER_REQUIRED','Only the current placement NFT owner can prepare this action',403);
  const artifact=()=>{const m=this.store.get('media',mediaId);assert(m?.owner===actor&&m.status==='verified','VERIFIED_ARTIFACT_REQUIRED','Choose a verified public artifact owned by this wallet');
   return {artifact_uri:m.uri,artifact_sha256:Buffer.from(m.sha256,'hex').toString('base64')};};
  if(kind==='accept-nomination'){assert(state.nominated_recipient===actor&&!state.nft_minted,'NOMINEE_REQUIRED','Only the nominated account can accept this placement');method='accept_nft_nomination';}
  else if(kind==='mint'){assert(rights.bidding_closed&&!state.nft_minted&&state.outcome!=='failure'&&(!state.holder?.account_id?.startsWith('0x')||state.nomination_accepted),'MINT_UNAVAILABLE','Final placement mint requires closed bidding and an accepted native recipient');method='mint_final_placement';deposit='30000000000000000000000';}
  else if(kind==='transfer'){
   nftOwner();const recipient=walletId(receiverId);assert(!recipient.startsWith('0x')&&recipient!==actor,'NATIVE_RECIPIENT_REQUIRED','Choose a different native NEAR recipient');await this.reads.account(recipient);
   method='nft_transfer';args={receiver_id:recipient,token_id:contractId};deposit='1';
  }
  else if(kind==='artwork'){nftOwner();assert(rights.active&&!rights.locked,'ARTWORK_CLOSED','Artwork submission is closed');method='submit_artwork';args={token_id:contractId,...artifact()};deposit='10000000000000000000000';}
  else if(kind==='lock-artwork'){seller();assert(rights.active&&!rights.locked&&rights.proposal&&expectedRevision===rights.revision,'STALE_ARTWORK','Review the current artwork revision before approving it');method='lock_artwork';args={expected_revision:expectedRevision};deposit='1';}
  else if(kind==='delivery-proof'){seller();assert(state.artwork_locked&&!s.campaign.delivery_proof,'PROOF_UNAVAILABLE','Locked artwork and an empty proof slot are required');method='submit_delivery_proof';args=artifact();deposit='10000000000000000000000';}
  else if(kind==='issue-decision'){
   arbiter();const issue=this.store.get('issue',caseId);assert(issue?.contractId===contractId&&typeof open==='boolean','INVALID_CASE','Case must belong to this campaign');
   const media=artifact();method='record_issue_decision';args={case_id:caseId,open,evidence_sha256:media.artifact_sha256};deposit='1000000000000000000000';
  }
  else if(kind==='finalize-success'){
   arbiter();unsettled();
   assert(BigInt(state.refund_end_ns)<=BigInt(this.now())*1000000n,'REVIEW_WINDOW_OPEN','Wait until the displayed issue review end time before settling this campaign');
   assert(state.artwork_locked,'ARTWORK_NOT_LOCKED','The space owner must approve and lock the artwork before settlement');
   assert(s.campaign.delivery_proof,'DELIVERY_PROOF_REQUIRED','The space owner must submit installation proof before settlement');
   assert(s.campaign.open_issues===0,'OPEN_ISSUES','Resolve the open campaign issues before successful settlement');
   for(const issue of this.store.list('issue').filter(i=>i.contractId===contractId))assert(s.campaign.issues[issue.id]?.open===false,'CASE_REVIEW_REQUIRED','Pending issue requests require an on-chain arbiter decision');
   method='finalize_success';
  }
  else if(kind==='finalize-failure'){arbiter();unsettled();assert(BigInt(state.cutoff_ns)<=BigInt(this.now())*1000000n,'SETTLEMENT_UNAVAILABLE','Cancellation is available after bidding closes');method='finalize_failure';}
  else assert(false,'INVALID_ACTION','Unsupported placement action',400);
  const body={schema:'everywhere-native-action/v1',wallet:actor,contractId,codeHash:s.codeHash,kind,createdAt:new Date(this.now()).toISOString(),
   expiresAt:new Date(this.now()+120000).toISOString(),transaction:{signerId:actor,receiverId:contractId,actions:[{type:'FunctionCall',params:{methodName:method,args,gas,deposit}}]}};
  const plan={...body,planId:hashObject(body)};this.store.insert('native-plan',plan.planId,actor,{plan,status:'prepared'});return plan;
 }
 async confirm(wallet,id,transactionHash){
  const actor=walletId(wallet);let record=this.store.get('native-plan',id);assert(record?.owner===actor,'NOT_FOUND','Wallet action not found',404);
  assert(typeof transactionHash==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(transactionHash),'INVALID_TRANSACTION','NEAR transaction hash required',400);
  assert(!record.transactionHash||record.transactionHash===transactionHash,'TRANSACTION_CHANGED','Wallet action already refers to another transaction');
  if(['confirmed','failed'].includes(record.status))return record;
  if(!record.transactionHash)record=this.store.update('native-plan',id,actor,record.version,{...record,transactionHash,status:'submitted'});
  let outcome;try{outcome=await this.reads.rpc.call('tx',{tx_hash:transactionHash,sender_account_id:actor,wait_until:'NONE'});}
  catch(error){if(['UNKNOWN_TRANSACTION','RPC_UNAVAILABLE'].includes(error.code))return {status:'pending',transactionHash};throw error;}
  if(outcome?.final_execution_status!=='FINAL')return {status:'pending',transactionHash};
  const p=record.plan.transaction,tx=outcome.transaction,a=tx?.actions?.[0]?.FunctionCall,expected=p.actions[0].params;
  assert(tx?.hash===transactionHash&&tx.signer_id===actor&&tx.receiver_id===p.receiverId&&tx.actions.length===1&&a?.method_name===expected.methodName
   &&uint(String(a.gas))===uint(expected.gas)&&a.deposit===expected.deposit,'TRANSACTION_CHANGED','Final wallet transaction differs from the prepared action');
  let args;try{args=JSON.parse(Buffer.from(a.args,'base64').toString());}catch{}
  assert(args&&hashObject(args)===hashObject(expected.args),'TRANSACTION_CHANGED','Final wallet transaction arguments differ from the prepared action');
  const status=successfulNearOutcome(outcome)?'confirmed':'failed';
  if(record.plan.kind==='purchase'){
   const original=this.store.get('intent',record.plan.purchasePlanId),booking=this.store.get('booking',record.plan.bookingId);
   const accepted=status==='confirmed'&&this.chain.purchaseAccepted(original.plan,{phase:'confirmed',result:{outcome}});
   const state=status==='confirmed'?(accepted?'accepted':'rejected'):'failed';
   if(booking.status!==state||booking.transactionHash!==transactionHash)this.store.update('booking',booking.id,actor,booking.version,{...booking,status:state,accepted,transactionHash});
  }
  record=this.store.get('native-plan',id);
  if(record.status===status&&record.transactionHash===transactionHash)return record;
  return this.store.update('native-plan',id,actor,record.version,{...record,status,transactionHash});
 }
}
