import { assert, walletId, uint, hashObject } from './core.mjs';
import { successfulNearOutcome } from './rpc.mjs';

// Customer actions are prepared for their own NEAR wallet. This service has no signer or private-key input.
export class NativeActions {
 constructor({store,chain,reads,now=Date.now}){Object.assign(this,{store,chain,reads,now});}
 async prepare(wallet,{contractId,kind,mediaId,expectedRevision,receiverId,caseId,open}){
  const actor=walletId(wallet);assert(!actor.startsWith('0x'),'NEAR_WALLET_REQUIRED','Connect the NEAR wallet that owns this placement or role',400);
  const s=await this.chain.snapshot(contractId),state=s.state,rights=s.rights;
  let method,args={},deposit='0';const gas='25000000000000';
  const seller=()=>assert(actor===state.seller_id,'SELLER_REQUIRED','Only the published seller can prepare this action',403);
  const arbiter=()=>assert(actor===state.arbiter_id,'ARBITER_REQUIRED','Only the published arbiter can prepare this action',403);
  const nftOwner=()=>assert(actor===rights.current_owner_id,'NFT_OWNER_REQUIRED','Only the current placement NFT owner can prepare this action',403);
  const artifact=()=>{const m=this.store.get('media',mediaId);assert(m?.owner===actor&&m.status==='verified','VERIFIED_ARTIFACT_REQUIRED','Choose a verified public artifact owned by this wallet');
   return {artifact_uri:m.uri,artifact_sha256:Buffer.from(m.sha256,'hex').toString('base64')};};
  if(kind==='accept-nomination'){assert(state.nominated_recipient===actor&&!state.nft_minted,'NOMINEE_REQUIRED','Only the nominated account can accept this placement');method='accept_nft_nomination';}
  else if(kind==='mint'){assert(rights.bidding_closed&&!state.nft_minted&&state.outcome!=='failure','MINT_UNAVAILABLE','Final placement mint is unavailable');method='mint_final_placement';deposit='30000000000000000000000';}
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
   arbiter();assert(state.outcome==='open'&&BigInt(state.refund_end_ns)<=BigInt(this.now())*1000000n&&state.artwork_locked&&s.campaign.delivery_proof&&s.campaign.open_issues===0,'SETTLEMENT_UNAVAILABLE','Service, review and issue decisions must be complete');
   for(const issue of this.store.list('issue').filter(i=>i.contractId===contractId))assert(s.campaign.issues[issue.id]?.open===false,'CASE_REVIEW_REQUIRED','Pending issue requests require an on-chain arbiter decision');
   method='finalize_success';
  }
  else if(kind==='finalize-failure'){arbiter();assert(state.outcome==='open'&&BigInt(state.cutoff_ns)<=BigInt(this.now())*1000000n,'SETTLEMENT_UNAVAILABLE','Cancellation is available after bidding closes');method='finalize_failure';}
  else assert(false,'INVALID_ACTION','Unsupported placement action',400);
  const body={schema:'everywhere-native-action/v1',wallet:actor,contractId,codeHash:s.codeHash,kind,createdAt:new Date(this.now()).toISOString(),
   expiresAt:new Date(this.now()+120000).toISOString(),transaction:{signerId:actor,receiverId:contractId,actions:[{type:'FunctionCall',params:{methodName:method,args,gas,deposit}}]}};
  const plan={...body,planId:hashObject(body)};this.store.insert('native-plan',plan.planId,actor,{plan,status:'prepared'});return plan;
 }
 async confirm(wallet,id,transactionHash){
  const actor=walletId(wallet),record=this.store.get('native-plan',id);assert(record?.owner===actor,'NOT_FOUND','Wallet action not found',404);
  assert(typeof transactionHash==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(transactionHash),'INVALID_TRANSACTION','NEAR transaction hash required',400);
  assert(!record.transactionHash||record.transactionHash===transactionHash,'TRANSACTION_CHANGED','Wallet action already refers to another transaction');
  const outcome=await this.reads.rpc.call('tx',{tx_hash:transactionHash,sender_account_id:actor,wait_until:'NONE'});
  if(outcome?.final_execution_status!=='FINAL')return {status:'pending',transactionHash};
  const p=record.plan.transaction,tx=outcome.transaction,a=tx?.actions?.[0]?.FunctionCall,expected=p.actions[0].params;
  assert(tx?.hash===transactionHash&&tx.signer_id===actor&&tx.receiver_id===p.receiverId&&tx.actions.length===1&&a?.method_name===expected.methodName
   &&uint(String(a.gas))===uint(expected.gas)&&a.deposit===expected.deposit,'TRANSACTION_CHANGED','Final wallet transaction differs from the prepared action');
  let args;try{args=JSON.parse(Buffer.from(a.args,'base64').toString());}catch{}
  assert(args&&hashObject(args)===hashObject(expected.args),'TRANSACTION_CHANGED','Final wallet transaction arguments differ from the prepared action');
  const status=successfulNearOutcome(outcome)?'confirmed':'failed';
  if(record.status===status&&record.transactionHash===transactionHash)return record;
  return this.store.update('native-plan',id,actor,record.version,{...record,status,transactionHash});
 }
}
