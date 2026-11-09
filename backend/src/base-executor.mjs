import { encodeFunctionData, parseAbi, keccak256, decodeEventLog } from 'viem';
import { assert, uint, hashObject } from './core.mjs';
import { MAINNET } from './config.mjs';
import { validateRoutePlan } from './oneclick.mjs';
export const USDC_ABI=parseAbi(['function transfer(address to,uint256 value) returns (bool)','function balanceOf(address owner) view returns (uint256)','function decimals() view returns (uint8)','event Transfer(address indexed from,address indexed to,uint256 value)']);
export class BaseExecutor {
  constructor({store,budget,client,config}){Object.assign(this,{store,budget,client,config});}
  async fund({id,plan,account}){
    assert(this.config.enabled,'MAINNET_DISABLED','Live integration execution is disabled');
    const prior=this.store.operation(id);if(prior){assert(prior.plan_hash===hashObject(plan),'OPERATION_CHANGED','Funding id already bound to another quote');return this.reconcile(id);}
    validateRoutePlan(plan,{maxInput:'300000'});
    assert(plan.direction==='fund'&&account.address.toLowerCase()===plan.wallet,'WRONG_WALLET','Route must fund the signing wallet');
    assert(await this.client.getChainId()===MAINNET.chainId,'WRONG_NETWORK','Base mainnet required');
    const [balance,decimals,native,fees,nonce]=await Promise.all([
      this.client.readContract({address:MAINNET.baseUsdc,abi:USDC_ABI,functionName:'balanceOf',args:[account.address]}),
      this.client.readContract({address:MAINNET.baseUsdc,abi:USDC_ABI,functionName:'decimals'}),
      this.client.getBalance({address:account.address}),this.client.estimateFeesPerGas(),this.client.getTransactionCount({address:account.address,blockTag:'pending'})]);
    const amount=uint(plan.response.quote.amountIn),recipient=plan.response.quote.depositAddress;
    assert(decimals===6&&balance>=amount,'INSUFFICIENT_USDC','Native Base USDC with six decimals required');
    const data=encodeFunctionData({abi:USDC_ABI,functionName:'transfer',args:[recipient,amount]});
    const estimate=await this.client.estimateGas({account:account.address,to:MAINNET.baseUsdc,data,value:0n});
    const gas=(estimate*125n+99n)/100n;
    assert(gas<=200000n&&fees.maxFeePerGas>0n&&fees.maxFeePerGas<=1000000000n,'BASE_GAS_CHANGED','Base gas estimate exceeds qualification');
    // Covers execution plus a conservative OP Stack L1/operator data-fee allowance.
    const gasReserve=gas*fees.maxFeePerGas+1000000000000n;
    assert(native>=gasReserve,'INSUFFICIENT_ETH','Base gas balance is too low');
    this.store.transaction(()=>{
      assert(!this.store.get('base-lock',plan.wallet),'SIGNER_BUSY','Earlier Base send requires reconciliation');
      this.store.insert('base-lock',plan.wallet,plan.wallet,{operationId:id});
    });
    let reserved=false;
    try{
      this.budget.reserve({id,kind:'base-fund',scope:plan.wallet,plan,amounts:{sourceUsdc:amount.toString(),baseGas:gasReserve.toString()}});reserved=true;
      const tx={chainId:MAINNET.chainId,to:MAINNET.baseUsdc,data,value:0n,nonce,gas,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas,type:'eip1559'};
      const signed=await account.signTransaction(tx),hash=keccak256(signed);
      this.store.transition(id,['reserved'],'signed',{transactionHash:hash,result:{signedTransaction:signed}});
      try{const sent=await this.client.sendRawTransaction({serializedTransaction:signed});assert(sent===hash,'TRANSACTION_CHANGED','Provider returned another transaction');}
      catch{this.store.transition(id,['signed'],'broadcast-unknown');return this.store.operation(id);}
      this.store.transition(id,['signed'],'broadcast');return this.reconcile(id);
    }catch(error){if(!reserved)this.store.db.prepare('DELETE FROM objects WHERE kind=? AND id=?').run('base-lock',plan.wallet);throw error;}
  }
  async reconcile(id){
    const op=this.store.operation(id);assert(op?.kind==='base-fund','UNKNOWN_OPERATION','Base funding operation not found',404);
    if(['confirmed','failed'].includes(op.phase)||!op.transaction_hash)return op;
    assert(await this.client.getChainId()===MAINNET.chainId,'WRONG_NETWORK','Base mainnet required');
    let tx,receipt;
    try{[tx,receipt]=await Promise.all([this.client.getTransaction({hash:op.transaction_hash}),this.client.getTransactionReceipt({hash:op.transaction_hash})]);}
    catch(error){if(['TransactionNotFoundError','TransactionReceiptNotFoundError'].includes(error.name))return op;throw error;}
    const p=op.plan,amount=uint(p.response.quote.amountIn),recipient=p.response.quote.depositAddress;
    const data=encodeFunctionData({abi:USDC_ABI,functionName:'transfer',args:[recipient,amount]});
    assert(tx.hash===op.transaction_hash&&tx.from.toLowerCase()===p.wallet&&tx.to?.toLowerCase()===MAINNET.baseUsdc.toLowerCase()&&tx.input===data&&tx.value===0n,'UNBOUND_RECEIPT','Base transaction differs from signed funding');
    if(op.result?.browserWallet)assert(tx.nonce===op.result.walletNonce,'NONCE_CHANGED','Wallet transfer nonce differs from its reserved transaction');
    assert(receipt.transactionHash===op.transaction_hash&&receipt.blockHash===tx.blockHash,'UNBOUND_RECEIPT','Base receipt differs from its transaction');
    const final=await this.client.getBlock({blockTag:'finalized'});if(receipt.blockNumber>final.number)return op;
    const canonical=await this.client.getBlock({blockNumber:receipt.blockNumber});assert(canonical.hash===receipt.blockHash,'REORG','Receipt is not in the canonical finalized chain');
    const success=receipt.status==='success';
    if(success){
      const matches=receipt.logs.filter(log=>log.address.toLowerCase()===MAINNET.baseUsdc.toLowerCase()).some(log=>{
        try{const event=decodeEventLog({abi:USDC_ABI,data:log.data,topics:log.topics});return event.eventName==='Transfer'&&event.args.from.toLowerCase()===p.wallet&&event.args.to.toLowerCase()===recipient.toLowerCase()&&event.args.value===amount;}catch{return false;}
      });assert(matches,'TRANSFER_NOT_PROVEN','Final receipt does not prove the exact USDC transfer');
    }
    const burn=receipt.gasUsed*receipt.effectiveGasPrice+(receipt.l1Fee??0n)+(receipt.operatorFee??0n);
    this.budget.settle(id,{sourceUsdc:success?amount.toString():'0',baseGas:burn.toString()},{evidence:{final:true,transactionHash:op.transaction_hash}});
    this.store.transaction(()=>{
      this.store.transition(id,['signed','broadcast','broadcast-unknown'],success?'confirmed':'failed',{result:{...(op.result?.browserWallet?op.result:{}),final:true,successful:success,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber.toString(),gasBurnWei:burn.toString()}});
      this.store.db.prepare('DELETE FROM objects WHERE kind=? AND id=?').run('base-lock',p.wallet);
    });return this.store.operation(id);
  }
}
