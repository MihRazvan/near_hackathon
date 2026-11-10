import { assert, uint, hashObject, walletId } from './core.mjs';
import { effectiveCodeHash } from './rpc.mjs';

export const isOfferId=value=>typeof value==='string'&&/^offer-[0-9a-f]{32}$/.test(value);
export function offerIdFor({saleId,version,spotId}){return 'offer-'+hashObject({saleId,version,spotId}).slice(0,32);}
export function hubPriceAtRound(initialCents,round){const count=uint(round);assert(count<=32n,'INVALID_ROUND','Marketplace round exceeds its bounded purchase history');let cents=uint(initialCents);for(let i=0n;i<count;i++)cents=(cents*3n+1n)/2n;return (cents*10000n).toString();}
export function offerArgs(snapshot,args={}){return snapshot.offerId?{offer_id:snapshot.offerId,...args}:args;}
export function receiver(snapshot){return snapshot.receiverId??snapshot.accountId;}
export async function qualifyHub(reads,config,block){
 const hub=config.hub;assert(hub,'HUB_UNAVAILABLE','Marketplace publication is temporarily unavailable',503);
 assert(effectiveCodeHash(await reads.account(hub.accountId,block))===hub.codeHash,'HUB_CHANGED','Marketplace code differs from qualification');
 const value=await reads.view(hub.accountId,'get_config',{},block);
 assert(value.ft_contract_id===config.assets.nearUsdc&&value.intents_contract_id===config.assets.intentsId,'ASSET_CHANGED','Marketplace settlement assets changed');
 return value;
}
export async function hubSnapshot(reads,config,deployment,wallets=[]){
 const accountId=deployment.id,offerId=deployment.offerId,hubId=deployment.hubId;
 assert(isOfferId(accountId)&&accountId===offerId&&hubId===config.hub?.accountId&&deployment.codeHash===config.hub?.codeHash,'HUB_CHANGED','Offer registration differs from the qualified marketplace');
 const block=await reads.block(),age=BigInt(reads.now())*1000000n-uint(block.header.timestamp_nanosec);
 assert(age>=-5000000000n&&age<=60000000000n,'STALE_BLOCK','Finalized chain state must be recent before preparing an action');
 const hub=await qualifyHub(reads,config,block),args={offer_id:offerId};
 const [state,campaign,rights,totals,verifier,token,balance,fee,paused]=await Promise.all([
  reads.view(hubId,'get_state',args,block),reads.view(hubId,'get_campaign',args,block),reads.view(hubId,'get_placement_rights',args,block),reads.view(hubId,'get_totals',{},block),
  reads.account(config.assets.intentsId,block),reads.account(config.assets.nearUsdc,block),
  reads.view(config.assets.intentsId,'mt_balance_of',{account_id:hubId,token_id:config.assets.nearAsset},block),reads.view(config.assets.intentsId,'fee',{},block),reads.view(config.assets.intentsId,'pa_all_paused',{},block)]);
 assert(campaign?.terms&&state.cutoff_ns===campaign.terms.bidding_close_ns&&state.refund_end_ns===campaign.terms.review_end_ns,'CAMPAIGN_MISMATCH','Offer schedule does not match its escrow');
 assert(state.settlement==='intents'&&state.ft_contract_id===config.assets.nearUsdc&&state.intents_contract_id===config.assets.intentsId&&state.intents_token_id===config.assets.nearAsset&&state.arbiter_id===hub.arbiter_id,'ASSET_CHANGED','Offer settlement configuration changed');
 assert(verifier.code_hash===config.assets.intentsCodeHash&&token.code_hash===config.assets.usdcCodeHash,'PROTOCOL_CHANGED','Settlement protocol code changed');
 assert(state.offer_id===offerId&&state.receiver_id===hubId,'OFFER_CHANGED','Marketplace returned another offer');
 const liabilities=uint(totals.total_received)-uint(totals.total_withdrawn)-uint(totals.total_pending);
 const local=uint(state.total_received)-uint(state.total_withdrawn)-uint(state.total_pending);
 assert(local>=0n&&liabilities>=local&&uint(balance)>=liabilities,'INSOLVENT_ESCROW','Marketplace balance does not cover recorded liabilities');
 assert(fee===1&&(paused===null||(Array.isArray(paused)&&paused.length===0)),'PROTOCOL_UNAVAILABLE','Settlement transfers are unavailable');
 const credits={};for(const wallet of new Set(wallets))credits[wallet]=await reads.view(hubId,'get_credit',{...args,account_id:walletId(wallet)},block);
 return {accountId,offerId,receiverId:hubId,mode:'hub',hubOwnerId:hub.owner_id,codeHash:deployment.codeHash,observedAt:new Date(reads.now()).toISOString(),blockHash:block.header.hash,blockHeight:block.header.height,
  blockTimestampNs:block.header.timestamp_nanosec,state,campaign,rights,credits,escrowBalance:balance,liabilities:local.toString(),globalLiabilities:liabilities.toString(),globalTotals:totals,intentsFee:fee,qualified:true};
}
