// Read-only verification of the team vehicle setup and recorded NFT handoff.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Rpc,NearReads,successfulNearOutcome} from '../src/rpc.mjs';
const manifest=JSON.parse(await readFile(new URL('../../deployments/team-campaigns.json',import.meta.url),'utf8'));
assert.equal(manifest.schema,'everywhere-team-campaigns/v1');assert.equal(manifest.network,'mainnet');assert.equal(manifest.campaigns.length,4);
const rpc=new Rpc(process.env.NEAR_READ_RPC||'https://rpc.mainnet.near.org',{intervalMs:500}),reads=new NearReads(rpc);
assert.equal((await rpc.call('status',[])).chain_id,'mainnet');
const block=await reads.block();assert.equal((await reads.account(manifest.hub.accountId,block)).code_hash,manifest.hub.codeHash);
const eventsFor=outcome=>outcome.receipts_outcome.filter(receipt=>receipt.outcome.executor_id===manifest.hub.accountId).flatMap(receipt=>receipt.outcome.logs).filter(log=>log.startsWith('EVENT_JSON:')).map(log=>JSON.parse(log.slice(11)));
const observed=[];
const allPlacements=[...manifest.campaigns,...(manifest.additionalPlacements??[])];
assert.equal(new Set(allPlacements.map(p=>p.offerId)).size,allPlacements.length);
for(const campaign of allPlacements){
 const args={offer_id:campaign.offerId};
 const [state,terms,rights]=await Promise.all([reads.view(manifest.hub.accountId,'get_state',args,block),reads.view(manifest.hub.accountId,'get_campaign',args,block),reads.view(manifest.hub.accountId,'get_placement_rights',args,block)]);
 assert.equal(state.offer_id,campaign.offerId);assert.equal(state.seller_id,manifest.actors.owner);assert.equal(terms.terms.published_terms_sha256,campaign.publishedTermsSha256);assert.equal(terms.terms.sale_id,campaign.saleId);assert.equal(terms.terms.asset_id,campaign.assetId);assert.equal(terms.terms.spot_id,campaign.spotId??'spot-1');if(campaign.takeoverEnabled!==undefined)assert.equal(terms.terms.takeover_enabled,campaign.takeoverEnabled);
 if(campaign.role==='completed-payout'){assert.equal(state.outcome,'success');assert.equal(state.total_received,'30000');assert.equal(state.total_withdrawn,'30000');assert.equal(state.total_pending,'0');}
 if(state.nft_minted){const nft=await reads.view(manifest.hub.accountId,'nft_token',{token_id:campaign.offerId},block);assert.equal(nft.owner_id,rights.current_owner_id);if(rights.proposal)assert.equal(nft.metadata.reference,rights.proposal.artifact_uri);}
 observed.push({saleId:campaign.saleId,spotId:campaign.spotId??'spot-1',offerId:campaign.offerId,outcome:state.outcome,received:state.total_received,withdrawn:state.total_withdrawn,nftOwner:rights.current_owner_id});
}
for(const campaign of manifest.additionalPlacements??[]){
 const setup=manifest.transactions.find(item=>item.action==='publish-extra-'+campaign.vehicle);assert.ok(setup);assert.equal(setup.actorId,manifest.actors.owner);
 const receipt=await rpc.call('tx',{tx_hash:setup.transactionHash,sender_account_id:manifest.relayerId,wait_until:'NONE'});assert.equal(successfulNearOutcome(receipt),true);assert.equal(receipt.transaction.hash,setup.transactionHash);assert.equal(receipt.transaction.receiver_id,'intents.near');assert.equal(receipt.transaction.signer_id,manifest.relayerId);assert.equal(receipt.transaction.actions.length,1);
 const call=receipt.transaction.actions[0].FunctionCall;assert.equal(call.method_name,'execute_intents');const signed=JSON.parse(Buffer.from(call.args,'base64')).signed;assert.equal(signed.length,1);
 const payload=JSON.parse(signed[0].payload);assert.equal(payload.signer_id,manifest.actors.owner);assert.equal(payload.intents.length,1);const intent=payload.intents[0],message=JSON.parse(intent.msg);assert.equal(intent.intent,'auth_call');assert.equal(intent.contract_id,manifest.hub.accountId);assert.equal(message.action,'create_offer');assert.equal(message.offer_id,campaign.offerId);assert.equal(message.initial_price_cents,'1');assert.equal(message.terms.sale_id,campaign.saleId);assert.equal(message.terms.asset_id,campaign.assetId);assert.equal(message.terms.spot_id,campaign.spotId);assert.equal(message.terms.published_terms_sha256,campaign.publishedTermsSha256);
 assert.ok(eventsFor(receipt).some(event=>event.standard==='pitboard'&&event.event==='offer_created'&&event.data.some(data=>data.offer_id===campaign.offerId&&data.seller_id===manifest.actors.owner&&data.sponsored===true)));
}
const handoff=manifest.nftHandoff,outcome=await rpc.call('tx',{tx_hash:handoff.transactionHash,sender_account_id:manifest.relayerId,wait_until:'NONE'});
assert.equal(successfulNearOutcome(outcome),true);assert.equal(outcome.transaction.hash,handoff.transactionHash);assert.equal(outcome.transaction.receiver_id,'intents.near');
const call=outcome.transaction.actions[0].FunctionCall;assert.equal(call.method_name,'execute_intents');
const payload=JSON.parse(JSON.parse(Buffer.from(call.args,'base64')).signed[0].payload),intent=payload.intents[0],message=JSON.parse(intent.msg);
assert.equal(payload.signer_id,handoff.from);assert.equal(intent.intent,'auth_call');assert.equal(intent.contract_id,manifest.hub.accountId);assert.equal(message.action,'transfer_placement');assert.equal(message.offer_id,handoff.offerId);assert.equal(message.receiver_id,handoff.to);
const events=eventsFor(outcome);
assert.ok(events.some(event=>event.standard==='nep171'&&event.event==='nft_transfer'&&event.data.some(data=>data.old_owner_id===handoff.from&&data.new_owner_id===handoff.to&&data.token_ids.includes(handoff.offerId))));
assert.deepEqual(handoff.sampledCreditsBefore,handoff.sampledCreditsAfter);
const payouts=manifest.transactions.filter(item=>item.action.startsWith('claim-cargo-bike-'));
assert.equal(payouts.length,2);
for(const [role,amount] of [['owner','10000'],['a','20000']]){
 const claim=payouts.find(item=>item.actorRole===role);assert.ok(claim);assert.equal(claim.actorId,manifest.actors[role]);assert.equal(claim.amount,amount);
 const receipt=await rpc.call('tx',{tx_hash:claim.transactionHash,sender_account_id:manifest.relayerId,wait_until:'NONE'});
 assert.equal(successfulNearOutcome(receipt),true);assert.equal(receipt.transaction.hash,claim.transactionHash);assert.equal(receipt.transaction.receiver_id,manifest.hub.accountId);assert.equal(receipt.transaction.signer_id,manifest.relayerId);assert.equal(receipt.transaction.actions.length,1);
 const call=receipt.transaction.actions[0].FunctionCall;assert.equal(call.method_name,'release_credit');assert.deepEqual(JSON.parse(Buffer.from(call.args,'base64')),{offer_id:manifest.completedPayout.offerId,account_id:claim.actorId});
 const events=eventsFor(receipt),started=events.filter(event=>event.standard==='pitboard'&&event.event==='withdrawal_started').flatMap(event=>event.data).find(data=>data.offer_id===manifest.completedPayout.offerId&&data.owner_id===claim.actorId&&data.amount===amount);assert.ok(started);
 assert.ok(events.some(event=>event.standard==='pitboard'&&event.event==='withdrawal_resolved'&&event.data.some(data=>data.offer_id===manifest.completedPayout.offerId&&data.withdrawal_id===started.withdrawal_id&&data.succeeded===true)));
}

console.log(JSON.stringify({network:'mainnet',blockHeight:block.header.height,campaigns:observed,additionalPlacementPublications:manifest.additionalPlacements?.length??0,recordedNftTransfer:'verified',recordedCargoPayouts:'verified',scope:'Finalized current offer bindings and completed cargo-bike accounting; historical NFT transfer payload and NEP-171 event; original-creditor payout actions and successful withdrawal events. Credit tables are recorded setup observations. Generated vehicle images and synthetic delivery do not establish physical installation.'},null,2));
