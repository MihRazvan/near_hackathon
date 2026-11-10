import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { baseEncode } from 'near-api-js';
import { ROOT } from './config.mjs';
import { assert, sha256, hashObject, walletId, uint } from './core.mjs';
import { gasReservation } from './near-executor.mjs';

// Operator-only, deliberately absent from HTTP. Preparing never sends a transaction.
// Applying retains one original operation per stage and obeys the ordinary budget,
// signer lock, recovery floor and exact signed transaction rules.
export class HubDeployment {
 constructor({chain,store,reads,config}){Object.assign(this,{chain,store,reads,config});}
 async prepare({label='marketplace-hub-v1',arbiterId=this.config.defaultArbiter,sponsoredOffers=0,perOwnerLimit=8}={}){
  assert(Number.isSafeInteger(sponsoredOffers)&&sponsoredOffers>=0&&sponsoredOffers<=1000&&Number.isSafeInteger(perOwnerLimit)&&perOwnerLimit>=1&&perOwnerLimit<=32,'INVALID_CAPACITY','Choose a bounded explicit sponsor capacity');
  const arbiter=walletId(arbiterId),owner=walletId(this.config.treasury);assert(arbiter!==owner,'INVALID_ARBITER','A separate campaign arbiter wallet is required');
  const path=this.config.hubArtifact??resolve(ROOT,'target/proof-artifacts/marketplace-hub.wasm'),bytes=await readFile(path),manifest=JSON.parse(await readFile(join(dirname(path),'hub-manifest.json'),'utf8'));
  assert(manifest.bytes===bytes.length&&manifest.sha256===sha256(bytes)&&manifest.initializer==='new','ARTIFACT_CHANGED','Shared marketplace artifact differs from its separate manifest');
  const identity=await this.chain.vault.identity(label),block=await this.reads.block();await this.reads.status();
  const [protocol,gasInfo]=await Promise.all([this.reads.rpc.call('EXPERIMENTAL_protocol_config',{block_id:block.header.hash}),this.reads.rpc.call('gas_price',[block.header.hash])]);
  const storagePrice=uint(protocol.runtime_config.storage_amount_per_byte),codeHash=baseEncode(Buffer.from(manifest.sha256,'hex'));
  const args={owner_id:owner,arbiter_id:arbiter,ft_contract_id:this.config.assets.nearUsdc,intents_contract_id:this.config.assets.intentsId};
  const deployPlan={network:this.config.network,signerId:identity.accountId,receiverId:identity.accountId,actions:[{type:'deploy',code:bytes.toString('base64'),sha256:manifest.sha256},{type:'call',method:'new',args,gas:'30000000000000',deposit:'0'}]};
  const deploymentFeeReserve=gasReservation(deployPlan,protocol,gasInfo),codeCollateral=BigInt(bytes.length)*storagePrice,stateHeadroom=5000n*storagePrice,liquidBuffer=20000000000000000000000n;
  const accountFunding=codeCollateral+stateHeadroom+deploymentFeeReserve+liquidBuffer,offerReserve=60000n*storagePrice,sponsorDeposit=offerReserve*BigInt(sponsoredOffers);
  const body={schema:'everywhere-hub-deployment/v1',label,accountId:identity.accountId,owner,arbiter,codeHash,artifactSha256:manifest.sha256,artifactBytes:bytes.length,blockHash:block.header.hash,storagePrice:storagePrice.toString(),
   codeCollateral:codeCollateral.toString(),stateHeadroom:stateHeadroom.toString(),liquidBuffer:liquidBuffer.toString(),deploymentFeeReserve:deploymentFeeReserve.toString(),accountFunding:accountFunding.toString(),offerReserve:offerReserve.toString(),sponsoredOffers,perOwnerLimit,sponsorDeposit:sponsorDeposit.toString(),treasuryAllocation:(accountFunding+sponsorDeposit).toString(),deployPlan};
  const id=hashObject(body),prior=this.store.get('hub-deployment-plan',id);return prior??this.store.insert('hub-deployment-plan',id,owner,{plan:body,status:'prepared'});
 }
 async apply(id){
  const record=this.store.get('hub-deployment-plan',id);assert(record?.owner===this.config.treasury,'NOT_FOUND','Operator deployment plan not found',404);const p=record.plan;
  assert(this.config.enabled,'MAINNET_DISABLED','Mainnet execution is disabled');assert(p.deployPlan.network===this.config.network,'WRONG_NETWORK','Deployment network changed');
  const identity=await this.chain.vault.identity(p.label);assert(identity.accountId===p.accountId,'IDENTITY_CHANGED','Deployment recovery identity changed');
  const funded=await this.chain.fundIdentity(p.label,p.accountFunding);if(funded.operation.phase!=='confirmed')return {stage:'fund-account',operation:funded.operation};
  const deployed=await this.chain.near.execute({id:'hub-deploy-'+id,signer:identity.signer,plan:p.deployPlan});if(deployed.phase!=='confirmed')return {stage:'deploy',operation:deployed};
  if(uint(p.sponsorDeposit)>0n){const sponsored=await this.chain.call({id:'hub-sponsor-'+id,signerId:p.owner,signer:await this.chain.treasurySigner(),receiverId:p.accountId,codeHash:p.codeHash,method:'fund_sponsor_pool',
    args:{sponsored_offer_limit:String(p.sponsoredOffers),per_owner_limit:String(p.perOwnerLimit)},gas:'30000000000000',deposit:p.sponsorDeposit});if(sponsored.phase!=='confirmed')return {stage:'sponsor',operation:sponsored};}
  const latest=this.store.get('hub-deployment-plan',id);if(latest.status!=='confirmed')this.store.update('hub-deployment-plan',id,p.owner,latest.version,{...latest,status:'confirmed'});
  return {stage:'complete',accountId:p.accountId,codeHash:p.codeHash,sponsoredOffers:p.sponsoredOffers};
 }
}
export function hubDeploymentSummary(record){const {deployPlan,...summary}=record.plan;return {id:record.id,status:record.status,...summary};}
