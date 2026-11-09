import { decodeEventLog } from 'viem';
import { MAINNET } from './config.mjs';
import { USDC_ABI } from './base-executor.mjs';
import { assert, uint } from './core.mjs';
import { validateRoutePlan } from './oneclick.mjs';

export class ReturnVerifier {
 constructor({store,client,routes}){Object.assign(this,{store,client,routes});}
 async verify(routeId,wallet){
  const row=this.store.get('route',routeId);assert(row?.owner===wallet,'NOT_FOUND','Return route not found',404);const plan=row.plan;
  assert(plan.direction==='exit','INVALID_ROUTE','Only an outbound return can be verified');
  validateRoutePlan(plan,{now:Date.parse(plan.createdAt),maxInput:plan.request.amount,minOutput:plan.response.quote.minAmountOut});
  const prior=this.store.get('route-result',plan.planId);if(prior?.status==='confirmed')return prior;
  const status=await this.routes.status(plan);
  if(status.status!=='SUCCESS')return {status:'provider-pending',providerStatus:status.status};
  const echo=status.quoteResponse?.quoteRequest;
  assert(echo,'UNBOUND_ROUTE_STATUS','Provider status must identify its original route');
  for(const key of ['originAsset','destinationAsset','depositType','refundTo','refundType','recipient','recipientType','amount','swapType'])assert(echo[key]===plan.request[key],'ROUTE_CHANGED',`Provider status changed ${key}`);
  assert(status.quoteResponse.quote?.depositAddress===plan.response.quote.depositAddress,'ROUTE_CHANGED','Provider status changed the deposit account');
  const details=status.swapDetails,amount=uint(details?.amountOut),minimum=uint(plan.response.quote.minAmountOut);
  assert(amount>=minimum,'OUTPUT_SHORTFALL','Provider output is below the signed quote minimum');
  const hashes=details.destinationChainTxHashes?.map(item=>item.hash);
  assert(Array.isArray(hashes)&&hashes.length>0&&hashes.length<=5&&new Set(hashes).size===hashes.length&&hashes.every(hash=>/^0x[0-9a-f]{64}$/i.test(hash)),'INVALID_DELIVERY','Provider did not identify unique Base payout transactions');
  assert(await this.client.getChainId()===MAINNET.chainId,'WRONG_NETWORK','Base mainnet required');
  const finalized=await this.client.getBlock({blockTag:'finalized'});let received=0n;
  const evidence=[];
  for(const hash of hashes){
   let receipt;try{receipt=await this.client.getTransactionReceipt({hash});}catch(error){if(error.name==='TransactionReceiptNotFoundError')return {status:'destination-pending',transactionHash:hash};throw error;}
   assert(receipt.transactionHash.toLowerCase()===hash.toLowerCase()&&receipt.status==='success','INVALID_DELIVERY','Destination transaction has not succeeded');
   if(receipt.blockNumber>finalized.number)return {status:'awaiting-destination-finality',transactionHashes:hashes};
   const canonical=await this.client.getBlock({blockNumber:receipt.blockNumber});assert(canonical.hash===receipt.blockHash,'REORG','Payout receipt is not canonical');
   for(const log of receipt.logs.filter(log=>log.address.toLowerCase()===MAINNET.baseUsdc.toLowerCase()&&!log.removed)){
    let event;try{event=decodeEventLog({abi:USDC_ABI,data:log.data,topics:log.topics});}catch{continue;}
    if(event.eventName==='Transfer'&&event.args.to.toLowerCase()===wallet)received+=event.args.value;
   }
   evidence.push({transactionHash:hash,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber.toString()});
  }
  assert(received===amount&&received>=minimum,'DELIVERY_NOT_PROVEN','Final USDC receipts do not prove the provider output to the original wallet');
  const data={status:'confirmed',routeId,deliveredMicroUsdc:received.toString(),destinationWallet:wallet,evidence,verifiedAt:new Date().toISOString()};
  const existing=this.store.get('route-result',plan.planId);if(existing)return existing;
  return this.store.insert('route-result',plan.planId,wallet,data);
 }
}
