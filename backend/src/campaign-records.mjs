import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './config.mjs';
import { assert, hashObject } from './core.mjs';

const FIELDS=['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
export function explorer(network,kind,id){const host=network==='mainnet'?'nearblocks.io':network==='testnet'?'testnet.nearblocks.io':null;return host?`https://${host}/${kind}/${encodeURIComponent(id)}`:null;}
export function artifact(record){if(!record)return null;return {uri:/^ipfs:\/\/[A-Za-z0-9]+(?:\/[A-Za-z0-9._/-]*)?$/.test(record.artifact_uri??'')?record.artifact_uri:null,sha256:typeof record.artifact_sha256==='string'?Buffer.from(record.artifact_sha256,'base64').toString('hex'):null,...pick(record,['revision','artwork_revision','submitted_at_ns'])};}
export function publicSnapshot(snapshot,network,synthetic=false){
 assert(snapshot?.qualified===true,'UNQUALIFIED_STATE','Campaign state could not be qualified',503);
 const state=snapshot.state,rights=snapshot.rights,delivery=artifact(snapshot.campaign.delivery_proof);
 return {contractId:snapshot.accountId,receiverId:snapshot.receiverId??snapshot.accountId,offerId:snapshot.offerId??null,qualified:true,codeHash:snapshot.codeHash,
  blockHash:snapshot.blockHash,blockHeight:snapshot.blockHeight,observedAt:snapshot.observedAt,
  state:{...pick(state,['outcome','round','next_price','seller_id','arbiter_id','nft_minted','artwork_locked','storage_reclaimed']),holder:state.holder?pick(state.holder,['account_id','principal']):null,openIssues:snapshot.campaign.open_issues},
  rights:{tokenId:rights.token_id,currentOwnerId:rights.current_owner_id,originalPayerId:rights.original_payer_id,active:rights.active,locked:rights.locked,minted:rights.minted,rightsEndNs:rights.rights_end_ns},
  artwork:artifact(rights.proposal),delivery:delivery?{...delivery,provenance:synthetic?'synthetic-qualification':'owner-submitted-unverified',physicalVerification:'not-independently-verified'}:null,
  accounting:{received:state.total_received,withdrawn:state.total_withdrawn,pending:state.total_pending,liability:snapshot.liabilities,unit:'USDC base units',decimals:6},
  links:{contract:explorer(network,'address',snapshot.receiverId??snapshot.accountId),nft: rights.minted&&explorer(network,'nft-token',snapshot.receiverId??snapshot.accountId)?`${explorer(network,'nft-token',snapshot.receiverId??snapshot.accountId)}/${encodeURIComponent(rights.token_id)}`:null}};
}
export class CampaignRecords {
 constructor({store,chain,marketplace,product,config,now=Date.now,manifestPath=join(ROOT,'deployments/qualification.json')}){Object.assign(this,{store,chain,marketplace,product,config,now,manifestPath});this.qualificationCache=null;}
 async manifest(){const m=JSON.parse(await readFile(this.manifestPath,'utf8'));assert(m.schema==='everywhere-qualification/v1'&&m.network==='mainnet'&&m.record?.offerId&&m.verification?.status==='verified','INVALID_EVIDENCE','Recorded qualification evidence is unavailable',503);return m;}
 async snapshot(id){return this.product?.publicSnapshot?this.product.publicSnapshot(id):this.chain.snapshot(id);}
 async record(saleId){
  const sale=this.marketplace.sale(saleId),manifest=sale.publication?.manifest;
  assert(manifest?.asset&&manifest.saleId===sale.id,'RECORD_UNAVAILABLE','Published campaign record is unavailable',503);
  let evidence;try{evidence=await this.manifest();}catch{}
  const matches=evidence?.record.saleId===sale.id&&this.config.network===evidence.network;
  const teamTest=manifest.campaignType==='team-test';
  const snapshots=[],unavailable=[];
  for(const spot of sale.spots){try{snapshots.push(publicSnapshot(await this.snapshot(spot.contractId),this.config.network,teamTest||matches&&spot.contractId===evidence.record.offerId));}catch(error){unavailable.push({contractId:spot.contractId,code:error.code==='RPC_UNAVAILABLE'?'RPC_UNAVAILABLE':'STATE_UNAVAILABLE'});}}
  return {schema:'everywhere-campaign-record/v1',network:this.config.network,observedAt:new Date(this.now()).toISOString(),status:unavailable.length?(snapshots.length?'partial':'unavailable'):'available',
   campaign:{id:sale.id,title:manifest.title,...(teamTest?{campaignType:'team-test'}:{}),ownerId:sale.owner,ownerDisplayName:this.store.get('profile',sale.owner)?.displayName??sale.owner,
    asset:{id:manifest.asset.id,name:manifest.asset.title,type:manifest.asset.assetType,city:manifest.asset.city,...pick(manifest.asset,['imageProvenance']),...(/^ipfs:\/\/[A-Za-z0-9]+$/.test(manifest.asset.coverUri??'')&&/^[0-9a-f]{64}$/.test(manifest.asset.coverSha256??'')?{coverUri:manifest.asset.coverUri,coverSha256:manifest.asset.coverSha256}:{})},schedule:pick(manifest.schedule,FIELDS),spots:sale.spots.map(spot=>({id:spot.id,name:manifest.asset.spots?.find(p=>p.id===spot.id)?.name??spot.id,contractId:spot.contractId}))},
   snapshots,unavailable,qualification:{matched:!!matches,evidencePath:matches?'/api/evidence/qualification':null,synthetic:!!matches,note:matches?evidence.record.note:'Delivery evidence is submitted by the space owner. Recording its commitment on NEAR does not independently verify physical installation.'},
   verification:{method:'Finalized NEAR RPC; qualified contract code, settlement assets, parties, terms and solvency',physicalInstallationVerified:false}};
 }
 async qualification(){
  const now=this.now();if(this.qualificationCache&&now-this.qualificationCache.at<60000)return structuredClone(await this.qualificationCache.promise);
  const promise=(async()=>{let m;try{m=await this.manifest();}catch{return {schema:'everywhere-qualification/v1',network:'mainnet',source:'recorded-mainnet-qualification',record:null,verification:{status:'unavailable',checkedAt:new Date(this.now()).toISOString(),code:'EVIDENCE_UNAVAILABLE'}};}
   // The committed manifest is a deliberate public allowlist. Do not return arbitrary
   // future fields, raw RPC receipts, object journals or transaction signatures.
   const record={...pick(m.record,['saleId','offerId','hubId','completedAt','note','physicalInstallationVerified']),amounts:pick(m.record.amounts,['received','withdrawn','pending','ownerEarnings','buyerRefund','buyerReward','unit','decimals']),artifacts:Object.fromEntries(['artwork','delivery'].map(key=>[key,pick(m.record.artifacts?.[key],['uri','sha256','provenance','physicalInstallationVerified'])])),schedule:pick(m.record.schedule,FIELDS),actors:pick(m.record.actors,['owner','buyerA','buyerB']),coverage:m.record.coverage.map(c=>pick(c,['feature','status','note'])),funding:pick(m.record.funding,['source','basePrefunding']),steps:m.record.steps.map(s=>pick(s,['id','label','transactionHash','explorerUrl','actorId','actorRole','action','method','offerId','signerId','receiverId','receiptDigest','blockHashes']))};
   let verification={status:'unavailable',checkedAt:new Date(this.now()).toISOString(),receiptsVerifiedAt:m.verification.checkedAt,manifestDigest:hashObject(m),scope:'Current qualified state; historical receipt verification is reproducible with backend/bin/verify-evidence.mjs'};
   try{assert(this.config.network===m.network,'WRONG_NETWORK','Recorded evidence belongs to NEAR mainnet');const s=await this.snapshot(m.record.offerId);
    assert(s.qualified&&s.receiverId===m.record.hubId&&s.codeHash===m.contract.codeHash&&s.state.outcome==='success'&&s.state.total_received===record.amounts.received&&s.state.total_withdrawn===record.amounts.withdrawn&&s.state.total_pending===record.amounts.pending&&s.rights.minted&&s.rights.original_payer_id===record.actors.buyerB&&s.state.seller_id===record.actors.owner&&s.state.storage_reclaimed===true&&s.campaign.terms.sale_id===record.saleId&&s.campaign.terms.published_terms_sha256===m.contract.publishedTermsSha256&&['artwork','delivery'].every(key=>{const value=artifact(key==='artwork'?s.rights.proposal:s.campaign.delivery_proof);return value?.uri===record.artifacts[key].uri&&value?.sha256===record.artifacts[key].sha256;}),'EVIDENCE_MISMATCH','Recorded campaign differs from qualified state');
    verification={...verification,status:'verified',blockHash:s.blockHash,blockHeight:s.blockHeight,observedAt:s.observedAt};
   }catch(error){verification={...verification,status:['EVIDENCE_MISMATCH','TERMS_CHANGED','HUB_CHANGED','CODE_CHANGED','PARTIES_CHANGED','INSOLVENT_ESCROW','PROTOCOL_CHANGED','ASSET_CHANGED'].includes(error.code)?'mismatch':'unavailable',code:error.code==='RPC_UNAVAILABLE'?'RPC_UNAVAILABLE':error.code==='EVIDENCE_MISMATCH'?'EVIDENCE_MISMATCH':'STATE_UNAVAILABLE'};}
   return {schema:m.schema,network:m.network,source:'recorded-mainnet-qualification',record,verification};
  })();this.qualificationCache={at:now,promise};return structuredClone(await promise);
 }
}
