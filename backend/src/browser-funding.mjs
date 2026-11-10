import { reserveCustomerFunding,releaseCustomerFunding } from './customer-funding.mjs';
import { encodeFunctionData, toHex } from 'viem';
import { assert, walletId, uint } from './core.mjs';
import { MAINNET } from './config.mjs';
import { USDC_ABI } from './base-executor.mjs';
import { validateRoutePlan } from './oneclick.mjs';

// Customers sign with their browser wallet. This service never obtains a customer signing key.
export class BrowserFunding {
 constructor({store,budget,client,config,source,routes}){Object.assign(this,{store,budget,client,config,source,routes});}
 owned(wallet,id){const op=this.store.operation(id);assert(op?.scope===walletId(wallet)&&op.result?.browserWallet,'NOT_FOUND','Wallet funding request not found',404);return op;}
 public(op,dispatchAllowed=false){return {id:op.id,phase:op.phase,transactionHash:op.transaction_hash,transaction:op.result.walletTransaction,
  routeId:op.plan.planId,quotedInput:op.plan.response.quote.amountIn,quotedOutput:op.plan.response.quote.amountOut,expiresAt:op.plan.expiresAt,dispatchAllowed};}
 async prepare(wallet,routeId){
  const actor=walletId(wallet),row=this.store.get('route',routeId),plan=row?.plan,id='wallet-fund-'+routeId;
  assert(this.config.network==='mainnet'&&this.config.enabled,'MAINNET_DISABLED','Mainnet wallet funding is disabled');
  assert(row?.owner===actor&&actor.startsWith('0x'),'NOT_FOUND','Original wallet route not found',404);
  const prior=this.store.operation(id);if(prior)return this.public(this.owned(actor,id));
  const customerFunding=this.config.production===true||this.config.environment==='production';
  validateRoutePlan(plan,{maxInput:customerFunding?this.config.customerRouteMax??'1000000000':'300000'});assert(plan.direction==='fund','INVALID_ROUTE','A Base-to-Intents funding route is required');
  assert(await this.client.getChainId()===MAINNET.chainId,'WRONG_NETWORK','Base mainnet is required');
  const lock=this.store.get('base-lock',actor);if(lock)await this.source.reconcile(lock.operationId);
  assert(!this.store.get('base-lock',actor),'SIGNER_BUSY','An earlier Base wallet transfer requires reconciliation');
  const [balance,decimals,native,fees,nonce]=await Promise.all([
   this.client.readContract({address:MAINNET.baseUsdc,abi:USDC_ABI,functionName:'balanceOf',args:[actor]}),
   this.client.readContract({address:MAINNET.baseUsdc,abi:USDC_ABI,functionName:'decimals'}),this.client.getBalance({address:actor}),
   this.client.estimateFeesPerGas(),this.client.getTransactionCount({address:actor,blockTag:'pending'})]);
  const amount=uint(plan.response.quote.amountIn),data=encodeFunctionData({abi:USDC_ABI,functionName:'transfer',args:[plan.response.quote.depositAddress,amount]});
  assert(decimals===6&&balance>=amount,'INSUFFICIENT_USDC','Insufficient native Base USDC');
  assert(Number.isSafeInteger(nonce)&&nonce>=0,'INVALID_NONCE','Invalid wallet nonce');
  const estimate=await this.client.estimateGas({account:actor,to:MAINNET.baseUsdc,data,value:0n}),gas=(estimate*125n+99n)/100n;
  assert(gas<=200000n&&fees.maxFeePerGas>0n&&fees.maxFeePerGas<=1000000000n,'BASE_GAS_CHANGED','Base gas exceeds the qualification limit');
  const reserve=gas*fees.maxFeePerGas+1000000000000n;assert(native>=reserve,'INSUFFICIENT_ETH','Insufficient Base gas balance');
  const transaction={from:actor,to:MAINNET.baseUsdc,chainId:toHex(MAINNET.chainId),data,value:'0x0',nonce:toHex(nonce),gas:toHex(gas),
   maxFeePerGas:toHex(fees.maxFeePerGas),maxPriorityFeePerGas:toHex(fees.maxPriorityFeePerGas??0n)};
  // Lock, reserve and persist the wallet plan atomically before displaying the approval request.
  this.store.transaction(()=>{
   assert(!this.store.get('base-lock',actor),'SIGNER_BUSY','Earlier Base transfer requires reconciliation');
   this.store.insert('base-lock',actor,actor,{operationId:id});
   const amounts={sourceUsdc:amount.toString(),baseGas:reserve.toString()};
   if(customerFunding)reserveCustomerFunding({store:this.store,budget:this.budget,config:this.config,id,scope:actor,plan,amounts});
   else this.budget.reserve({id,kind:'base-fund',scope:actor,plan,amounts,transactionOpen:true});
   this.store.transition(id,['reserved'],'wallet-review',{result:{browserWallet:true,...(customerFunding?{customerFunding:true}:{}),walletNonce:nonce,walletTransaction:transaction}});
  });
  return this.public(this.store.operation(id),true);
 }
 dispatch(wallet,id){
  const op=this.owned(wallet,id);assert(op.phase==='wallet-review','WALLET_REQUEST_PENDING','This wallet request was already started; reconcile it instead');
  validateRoutePlan(op.plan,{maxInput:op.result.customerFunding?this.config.customerRouteMax??'1000000000':'300000'});
  this.store.transition(id,['wallet-review'],'wallet-pending');return this.public(this.store.operation(id),true);
 }
 reject(wallet,id,{code}){
  const op=this.owned(wallet,id);assert(code===4001&&['wallet-review','wallet-pending'].includes(op.phase)&&!op.transaction_hash,
   'RECONCILIATION_REQUIRED','Only an explicit pre-send wallet rejection can cancel this request');
  this.store.transaction(()=>{
   this.store.transition(id,[op.phase],'cancelled',{result:{...op.result,walletRejected:true}});
   this.store.db.prepare("UPDATE budget_entries SET status='released' WHERE operation_id=? AND status='reserved'").run(id);
   this.store.db.prepare('DELETE FROM objects WHERE kind=? AND id=?').run('base-lock',op.scope);
   if(op.result.customerFunding)releaseCustomerFunding(this.store,op);
   this.store.event('browser_wallet_rejected',id,op.scope,{code:4001});
  });return this.public(this.store.operation(id));
 }
 cancelUnsent(wallet,id){
  const op=this.owned(wallet,id);assert(op.phase==='wallet-review'&&!op.transaction_hash,'RECONCILIATION_REQUIRED','The wallet was already opened; reconcile its original transfer or explicit rejection');
  this.store.transaction(()=>{this.store.transition(id,['wallet-review'],'cancelled',{result:{...op.result,cancelledBeforeDispatch:true}});
   this.store.db.prepare("UPDATE budget_entries SET status='released' WHERE operation_id=? AND status='reserved'").run(id);
   this.store.db.prepare('DELETE FROM objects WHERE kind=? AND id=?').run('base-lock',op.scope);if(op.result.customerFunding)releaseCustomerFunding(this.store,op);});
  return this.public(this.store.operation(id));
 }
 async reconcile(wallet,id,hash){
  let op=this.owned(wallet,id);
  if(hash){
   assert(/^0x[0-9a-f]{64}$/i.test(hash),'INVALID_TRANSACTION','Base transaction hash required',400);
   hash=hash.toLowerCase();
   assert(!op.transaction_hash||op.transaction_hash.toLowerCase()===hash.toLowerCase(),'TRANSACTION_CHANGED','Funding already has another original transaction hash');
   if(!op.transaction_hash){assert(op.phase==='wallet-pending','NOT_DISPATCHED','Start this exact wallet request before attaching a hash');
    this.store.transition(id,['wallet-pending'],'broadcast-unknown',{transactionHash:hash});op=this.store.operation(id);}
  }
  if(op.transaction_hash){
   op=await this.source.reconcile(id);
   if(op.phase==='confirmed'){try{await this.routes.submit(op.plan,op.transaction_hash);}catch{/* A provider hint cannot authorize a second deposit. */}}
  }
  return this.public(op);
 }
 list(wallet){return this.store.db.prepare("SELECT id FROM operations WHERE kind='base-fund' AND scope=? ORDER BY created_at DESC").all(walletId(wallet))
  .map(r=>this.store.operation(r.id)).filter(op=>op.result?.browserWallet).map(op=>this.public(op));}
}
