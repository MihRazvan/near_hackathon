import { assert, walletId, hashObject } from './core.mjs';
import { intentPlan } from './intents.mjs';

export function assertCreativeTransfer(snapshot,actor,input,now=Date.now()){
 const state=snapshot.state,rights=snapshot.rights,controller=rights.artwork_controller_id??rights.current_owner_id;
 assert(input.purpose==='creative-control'&&input.controlAcknowledged===true,'TRANSFER_ACKNOWLEDGEMENT_REQUIRED','Confirm that creative control can only be returned by the recipient',400);
 assert(actor===rights.current_owner_id&&actor===controller&&input.expectedController===actor,'NFT_OWNER_REQUIRED','Only the current receipt owner and creative controller can transfer creative control',403);
 assert(input.expectedRevision===String(rights.revision??'0'),'STALE_ARTWORK','Artwork changed. Review the latest revision before transferring control');
 const due=Number(BigInt(snapshot.campaign.terms.artwork_due_ns)/1000000n),cutoff=BigInt(state.cutoff_ns);
 assert(snapshot.mode==='hub'&&state.nft_minted===true&&state.outcome==='open'&&rights.bidding_closed===true&&rights.active===true&&!rights.locked&&!state.artwork_locked&&cutoff<=BigInt(now)*1000000n&&due>now+5000,'CREATIVE_TRANSFER_CLOSED','Creative control can only be transferred while artwork submissions are open, before approval and the deadline');
 return {expiresMs:Math.min(now+120000,due-5000)};
}
const creativeContext=(snapshot,input)=>input.purpose==='creative-control'?{purpose:input.purpose,controlAcknowledged:true,expectedController:input.expectedController,expectedRevision:input.expectedRevision,artworkDueNs:snapshot.campaign.terms.artwork_due_ns}:{};

export async function hubAction({store,reads,snapshot:s,wallet,input,now=Date.now()}){
 const actor=walletId(wallet),state=s.state,rights=s.rights,kind=input.kind;
 assert(s.mode==='hub'&&s.offerId&&s.receiverId,'HUB_REQUIRED','This action requires a shared marketplace offer');
 assert(input.purpose===undefined||(kind==='transfer'&&input.purpose==='creative-control'),'INVALID_ACTION','Unsupported action purpose',400);
 const before=field=>BigInt(s.campaign.terms[field])>BigInt(now)*1000000n;
 const seller=()=>assert(actor===state.seller_id,'SELLER_REQUIRED','Only this space owner can prepare the action',403);
 const arbiter=()=>assert(actor===state.arbiter_id,'ARBITER_REQUIRED','Only this campaign arbiter can prepare the decision',403);
 const owner=()=>assert(actor===rights.current_owner_id,'NFT_OWNER_REQUIRED','Only the current placement owner can submit artwork',403);
 const open=()=>assert(state.outcome==='open','CAMPAIGN_SETTLED','This campaign has already settled');
 const artifact=(id=input.mediaId)=>{const m=store.get('media',id);assert(m?.owner===actor&&m.status==='verified','VERIFIED_ARTIFACT_REQUIRED','Choose a verified public file belonging to this wallet');return {artifact_uri:m.uri,artifact_sha256:Buffer.from(m.sha256,'hex').toString('base64')};};
 let method,args={},deposit='0',gas='50000000000000';
 if(kind==='mint'){open();assert(rights.bidding_closed&&!state.nft_minted&&state.holder,'MINT_UNAVAILABLE','The final placement receipt is available after bidding closes');method='mint_final_placement';}
 else if(kind==='artwork'){open();owner();assert(rights.bidding_closed&&!rights.locked&&before('artwork_due_ns'),'ARTWORK_CLOSED','Artwork submission has closed');method='submit_artwork';args={token_id:s.offerId,...artifact()};}
 else if(kind==='lock-artwork'){open();seller();assert(before('artwork_due_ns')&&!rights.locked&&rights.proposal&&input.expectedRevision===rights.revision,'STALE_ARTWORK','Review the current artwork revision before approving it');method='lock_artwork';args={expected_revision:input.expectedRevision};}
 else if(kind==='delivery-proof'){open();seller();assert(before('installation_due_ns')&&state.artwork_locked&&!s.campaign.delivery_proof,'PROOF_UNAVAILABLE','Approve the artwork before providing installation evidence');method='submit_delivery_proof';args=artifact();}
 else if(kind==='open-issue'){
  open();assert(rights.bidding_closed,'BIDDING_OPEN','Campaign issue review opens when bidding closes');assert(before('review_end_ns'),'REVIEW_CLOSED','The campaign issue review period has ended');
  const issue=store.get('issue',input.caseId);assert(issue?.owner===actor&&issue.contractId===s.accountId,'INVALID_CASE','Issue evidence must belong to this wallet and placement');
  const participant=await reads.view(s.receiverId,'is_participant',{offer_id:s.offerId,account_id:actor});assert(participant,'PARTICIPANT_REQUIRED','Only campaign participants may open an issue',403);
  const evidence=artifact(issue.mediaId);method='open_issue';args={case_id:issue.id,evidence_sha256:evidence.artifact_sha256};
 }
 else if(kind==='issue-decision'){
  open();arbiter();const issue=store.get('issue',input.caseId);assert(issue?.contractId===s.accountId&&typeof input.open==='boolean','INVALID_CASE','Choose a campaign issue and resolution');
  method='record_issue_decision';args={case_id:issue.id,open:input.open,evidence_sha256:artifact().artifact_sha256};
 }
 else if(kind==='finalize-success'){
  open();assert(!before('review_end_ns')&&state.artwork_locked&&s.campaign.delivery_proof,'SETTLEMENT_UNAVAILABLE','Service, artwork, installation evidence and issue review must finish before settlement');
  assert(s.campaign.open_issues===0,'OPEN_ISSUES','Open campaign issues must be resolved');method='finalize_success';
 }
 else if(kind==='finalize-failure'){open();arbiter();assert(rights.bidding_closed,'SETTLEMENT_UNAVAILABLE','Cancellation is available after bidding closes');method='finalize_failure';}
 else if(kind==='reclaim-storage'){
  assert(!actor.startsWith('0x')&&state.storage_funder===actor,'STORAGE_FUNDER_REQUIRED','Only the original NEAR storage funder can reclaim unused collateral',403);
  assert(state.outcome!=='open'&&state.total_pending==='0'&&state.total_received===state.total_withdrawn&&!state.storage_reclaimed,'STORAGE_STILL_NEEDED','Campaign settlement and all USDC claims must finish before reclaiming unused collateral');method='reclaim_storage_reserve';
 }
 else if(kind==='cancel-empty'){
  open();assert([state.seller_id,state.arbiter_id,s.hubOwnerId].includes(actor),'CANCELLATION_FORBIDDEN','Only the space owner or campaign operator can cancel this listing',403);
  assert(state.round==='0'&&state.total_received==='0'&&state.total_pending==='0','CAMPAIGN_BOOKED','Only an unbooked placement can be cancelled');method='cancel_empty_offer';
 }
 else if(kind==='transfer'){
  owner();assert(input.purpose===undefined||input.purpose==='creative-control','INVALID_ACTION','Unsupported transfer purpose',400);if(input.purpose==='creative-control')assertCreativeTransfer(s,actor,input,now);const recipient=walletId(input.receiverId);assert(recipient!==actor,'INVALID_RECIPIENT','Choose a different recipient');
  if(!recipient.startsWith('0x'))await reads.account(recipient);method=actor.startsWith('0x')?'transfer_placement':'nft_transfer';args=actor.startsWith('0x')?{receiver_id:recipient}:{receiver_id:recipient,token_id:s.offerId};deposit=actor.startsWith('0x')?'0':'1';
 }else assert(false,'INVALID_ACTION','Unsupported placement action',400);
 return {method,args:{offer_id:s.offerId,...args},deposit,gas};
}
export async function hubIntentPlan({store,reads,snapshot,wallet,input,now=Date.now()}){
 const actor=walletId(wallet);assert(actor.startsWith('0x'),'EVM_SIGNER_REQUIRED','This action requires an EVM Intents signer');
 const action=await hubAction({store,reads,snapshot,wallet:actor,input,now});
 const plan=intentPlan({signerId:actor,verifier:snapshot.state.intents_contract_id,now,...(input.purpose==='creative-control'?assertCreativeTransfer(snapshot,actor,input,now):{}),intents:[{intent:'auth_call',contract_id:snapshot.receiverId,
  msg:JSON.stringify({action:action.method,...action.args}),min_gas:action.gas}],context:{kind:'hub-action',action:input.kind,contractId:snapshot.accountId,offerId:snapshot.offerId,receiverId:snapshot.receiverId,codeHash:snapshot.codeHash,...creativeContext(snapshot,input),...(input.caseId?{caseId:input.caseId}:{})}});
 return plan;
}
export async function hubNativePlan({store,reads,snapshot,wallet,input,now=Date.now()}){
 const actor=walletId(wallet);assert(!actor.startsWith('0x'),'NEAR_WALLET_REQUIRED','Connect a native NEAR wallet');
 const action=await hubAction({store,reads,snapshot,wallet:actor,input,now});
 const body={schema:'everywhere-native-action/v1',type:'native',wallet:actor,contractId:snapshot.accountId,offerId:snapshot.offerId,codeHash:snapshot.codeHash,kind:input.kind,
  ...creativeContext(snapshot,input),...(input.caseId?{caseId:input.caseId}:{}),createdAt:new Date(now).toISOString(),expiresAt:new Date(input.purpose==='creative-control'?assertCreativeTransfer(snapshot,actor,input,now).expiresMs:now+120000).toISOString(),transaction:{signerId:actor,receiverId:snapshot.receiverId,
   actions:[{type:'FunctionCall',params:{methodName:action.method,args:action.args,gas:action.gas,deposit:action.deposit}}]}};
 return {...body,planId:hashObject(body)};
}
