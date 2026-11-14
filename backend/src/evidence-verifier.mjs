import { assert, hashObject } from './core.mjs';
import { successfulNearOutcome, NearReads } from './rpc.mjs';
import { hubSnapshot } from './hub.mjs';
import { MAINNET } from './config.mjs';

function matches(value,expected){return Object.entries(expected).every(([key,v])=>value?.[key]!==undefined&&hashObject(value[key])===hashObject(v));}
export function verifyReceipt(step,outcome,manifest){
 assert(successfulNearOutcome(outcome),'EVIDENCE_MISMATCH','Transaction is not a fully successful finalized outcome');
 const tx=outcome.transaction,hub=manifest.record.hubId,offer=manifest.record.offerId;
 assert(tx.hash===step.transactionHash&&tx.signer_id===step.signerId&&tx.receiver_id===step.receiverId&&step.offerId===offer,'EVIDENCE_MISMATCH','Transaction identity differs from recorded evidence');
 const calls=tx.actions?.filter(a=>a.FunctionCall).map(a=>a.FunctionCall)??[];
 assert(calls.length===1&&calls[0].method_name===step.method,'EVIDENCE_MISMATCH','Transaction method differs from evidence');
 const args=JSON.parse(Buffer.from(calls[0].args,'base64').toString());
 if(step.receiverId===hub){assert(args.offer_id===offer&&step.action===step.method,'EVIDENCE_MISMATCH','Transaction targets another offer or action');if(step.action==='release_credit')assert(args.account_id===step.actorId,'EVIDENCE_MISMATCH','Claim recipient differs');}
 else {
  assert(step.receiverId===MAINNET.intentsId&&step.method==='execute_intents'&&args.signed?.length===1,'EVIDENCE_MISMATCH','Unexpected evidence receiver');
  const signed=args.signed[0],payload=JSON.parse(signed.payload);
  assert(payload.signer_id===step.actorId&&payload.verifying_contract===MAINNET.intentsId&&payload.intents?.length===1,'EVIDENCE_MISMATCH','Original verified actor or intent differs');
  const intent=payload.intents[0],message=JSON.parse(intent.msg);
  assert(message.offer_id===offer,'EVIDENCE_MISMATCH','Intent targets another offer');
  if(intent.intent==='auth_call'){
   assert(intent.contract_id===hub&&message.action===step.action,'EVIDENCE_MISMATCH','Authenticated action differs');
   if(step.action==='create_offer')assert(message.terms?.sale_id===manifest.record.saleId&&message.terms.published_terms_sha256===manifest.contract.publishedTermsSha256,'EVIDENCE_MISMATCH','Publication commitment differs');
   if(['submit_artwork','submit_delivery_proof'].includes(step.action)){const artifact=manifest.record.artifacts[step.action==='submit_artwork'?'artwork':'delivery'];assert(message.artifact_uri===artifact.uri&&Buffer.from(message.artifact_sha256,'base64').toString('hex')===artifact.sha256,'EVIDENCE_MISMATCH','Signed artifact commitment differs');}
  }else {
   const purchase=step.requirements.find(r=>r.event==='purchase_accepted');
   assert(intent.intent==='transfer'&&intent.receiver_id===hub&&purchase&&intent.tokens?.[MAINNET.nearAsset]===purchase.match.amount&&message.published_terms_sha256===manifest.contract.publishedTermsSha256,'EVIDENCE_MISMATCH','Signed purchase transfer differs');
  }
 }
 const selected=[];
 for(const requirement of step.requirements){
  assert(requirement.executorId===hub||requirement.executorId===MAINNET.intentsId,'EVIDENCE_MISMATCH','Evidence executor is not qualified');
  if(requirement.standard==='nep171')assert(requirement.executorId===hub&&requirement.event==='nft_mint'&&hashObject(requirement.match.token_ids)===hashObject([offer])&&requirement.match.owner_id===manifest.record.actors.buyerB,'EVIDENCE_MISMATCH','NFT mint must bind the offer token and actual final payer');
  if(requirement.executorId===hub&&requirement.standard==='pitboard')assert(requirement.match.offer_id===offer&&requirement.match.hub_id===hub,'EVIDENCE_MISMATCH','Offer event binding is missing');
  let found;
  for(const r of outcome.receipts_outcome){if(r.outcome.executor_id!==requirement.executorId)continue;
   for(const log of r.outcome.logs??[]){if(!log.startsWith('EVENT_JSON:'))continue;let e;try{e=JSON.parse(log.slice(11));}catch{continue;}
    if(e.standard===requirement.standard&&e.event===requirement.event&&e.data?.some(data=>matches(data,requirement.match))){found={receiptId:r.id,blockHash:r.block_hash,executorId:requirement.executorId,standard:e.standard,event:e.event,match:requirement.match};break;}
   }if(found)break;
  }
  assert(found,'EVIDENCE_MISMATCH','Required scoped receipt event is missing');selected.push(found);
 }
 assert(selected.length>0,'EVIDENCE_MISMATCH','Evidence step requires scoped receipt events');
 const digest=hashObject(selected);if(step.receiptDigest)assert(digest===step.receiptDigest,'EVIDENCE_MISMATCH','Scoped receipt digest differs from verified evidence');
 return {id:step.id,transactionHash:step.transactionHash,receiptDigest:digest,blockHashes:[...new Set(selected.map(r=>r.blockHash))]};
}
export async function verifyEvidence(manifest,{rpc,now=Date.now,onProgress=()=>{}}={}){
 assert(manifest.schema==='everywhere-qualification/v1'&&manifest.network==='mainnet','INVALID_EVIDENCE','Expected a mainnet qualification manifest');
 const reads=new NearReads(rpc,{network:'mainnet',now});await reads.status();
 // These are historical hashes. Read their existing status without waiting on
 // nodes that do not retain them; verifyReceipt still requires FINAL and every
 // successful receipt before accepting any evidence.
 const results=[];onProgress({stage:'historical-receipts',verified:0,total:manifest.record.steps.length});
 for(const step of manifest.record.steps){const outcome=await rpc.call('tx',{tx_hash:step.transactionHash,sender_account_id:step.signerId,wait_until:'NONE'});results.push(verifyReceipt(step,outcome,manifest));onProgress({stage:'historical-receipts',verified:results.length,total:manifest.record.steps.length});}
 onProgress({stage:'current-state',verified:results.length,total:manifest.record.steps.length});
 const record=manifest.record,config={hub:{accountId:record.hubId,codeHash:manifest.contract.codeHash},assets:MAINNET};
 const s=await hubSnapshot(reads,config,{id:record.offerId,offerId:record.offerId,hubId:record.hubId,codeHash:manifest.contract.codeHash});
 assert(s.state.outcome==='success'&&s.state.total_received===record.amounts.received&&s.state.total_withdrawn===record.amounts.withdrawn&&s.state.total_pending===record.amounts.pending&&s.state.storage_reclaimed===true&&s.rights.current_owner_id===record.actors.buyerB&&s.rights.original_payer_id===record.actors.buyerB&&s.campaign.terms.sale_id===record.saleId,'EVIDENCE_MISMATCH','Current offer accounting, identity or NFT differs from evidence');
 for(const [key,value]of [['artwork',s.rights.proposal],['delivery',s.campaign.delivery_proof]])assert(value?.artifact_uri===record.artifacts[key].uri&&Buffer.from(value.artifact_sha256,'base64').toString('hex')===record.artifacts[key].sha256,'EVIDENCE_MISMATCH','Artifact commitment differs from evidence');
 assert(s.campaign.terms.published_terms_sha256===manifest.contract.publishedTermsSha256,'EVIDENCE_MISMATCH','Published terms commitment differs');
 return {status:'verified',checkedAt:new Date(now()).toISOString(),network:'mainnet',blockHash:s.blockHash,blockHeight:s.blockHeight,steps:results};
}
