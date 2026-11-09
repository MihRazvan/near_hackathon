import { actions, createTransaction, baseEncode, baseDecode, SignedTransaction } from 'near-api-js';
import { assert, uint, sha256, hashObject } from './core.mjs';
import { successfulNearOutcome, nearBurn, effectiveCodeHash } from './rpc.mjs';

const CALLS=new Set(['new_campaign','execute_intents','storage_deposit','release_credit','finalize_failure','finalize_success',
  'accept_nft_nomination','mint_final_placement','submit_artwork','lock_artwork','submit_delivery_proof','record_issue_decision','nft_transfer','ft_transfer_call','mt_transfer']);
const ZERO='11111111111111111111111111111111';
export function gasReservation(plan,protocol,gasInfo){
  const costs=protocol.runtime_config.transaction_costs?.action_creation_config??{};
  const sir=plan.signerId===plan.receiverId;
  const cost=value=>value?BigInt(value.execution)+BigInt(sir?value.send_sir:value.send_not_sir):0n;
  let gas=2000000000000n;
  for(const action of plan.actions){
    if(action.type==='call')gas+=uint(action.gas)+cost(costs.function_call_cost)+cost(costs.function_call_cost_per_byte)*BigInt(Buffer.byteLength(JSON.stringify(action.args)));
    if(action.type==='deploy')gas+=cost(costs.deploy_contract_cost)+cost(costs.deploy_contract_cost_per_byte)*BigInt(Buffer.from(action.code,'base64').length);
    if(action.type==='transfer')gas+=cost(costs.transfer_cost)+cost(costs.create_account_cost)+cost(costs.add_key_cost?.full_access_cost);
    if(action.type==='delete')gas+=cost(costs.delete_account_cost);
  }
  gas+=cost(protocol.runtime_config.transaction_costs?.action_receipt_creation_config);
  const price=uint(gasInfo.gas_price)>uint(protocol.min_gas_price??gasInfo.gas_price)?uint(gasInfo.gas_price):uint(protocol.min_gas_price??gasInfo.gas_price);
  assert(price>0n,'INVALID_GAS_PRICE','Positive protocol gas price required');
  return (gas*price*11n+9n)/10n;
}
export function decodeActions(plan){
  assert(Array.isArray(plan.actions)&&plan.actions.length>0&&plan.actions.length<=4,'INVALID_ACTIONS','One to four reviewed actions required');
  return plan.actions.map(a=>{
    if(a.type==='call'){
      assert(CALLS.has(a.method),'UNSUPPORTED_METHOD','Unreviewed contract method');
      assert(uint(a.gas)>0n&&uint(a.gas)<=300000000000000n,'INVALID_GAS','Gas must be bounded');
      return actions.functionCall(a.method,a.args,uint(a.gas),uint(a.deposit));
    }
    if(a.type==='transfer')return actions.transfer(uint(a.amount));
    if(a.type==='deploy'){
      const wasm=Buffer.from(a.code,'base64');assert(wasm.length>0&&wasm.toString('base64')===a.code&&sha256(wasm)===a.sha256,'ARTIFACT_CHANGED','Deployment artifact changed');
      return actions.deployContract(wasm);
    }
    if(a.type==='delete')return actions.deleteAccount(a.beneficiaryId);
    assert(false,'UNSUPPORTED_ACTION','Unreviewed NEAR action');
  });
}
export class NearExecutor {
  constructor({store,budget,reads,config}){Object.assign(this,{store,budget,reads,config});}
  async execute({id,plan,signer}){
    assert(this.config.enabled,'MAINNET_DISABLED','Live integration execution is disabled');
    const prior=this.store.operation(id);
    if(prior){assert(prior.plan_hash===hashObject(plan),'OPERATION_CHANGED','Operation differs from committed plan');return this.reconcile(id);}
    // A preceding transaction may already be final even when the background worker has not ticked.
    // Reconcile it before reading the next nonce; unknown outcomes keep the signer locked.
    const signerLock=this.store.get('near-lock',plan.signerId);
    if(signerLock&&!plan.replacesOperationId){
      for(let attempt=0;attempt<12;attempt++){
        await this.reconcile(signerLock.operationId);
        if(!this.store.get('near-lock',plan.signerId))break;
        if(attempt<11)await new Promise(resolve=>setTimeout(resolve,150));
      }
    }
    assert(plan.network===this.config.network&&plan.signerId&&plan.receiverId,'WRONG_NETWORK','Transaction network or identities missing');
    const decoded=decodeActions(plan),publicKey=await signer.getPublicKey(),block=await this.reads.block();
    await this.reads.status();
    const [key,account,protocol,gasInfo]=await Promise.all([
      this.reads.key(plan.signerId,publicKey.toString(),block),this.reads.account(plan.signerId,block),
      this.reads.rpc.call('EXPERIMENTAL_protocol_config',{block_id:block.header.hash}),this.reads.rpc.call('gas_price',[block.header.hash])]);
    assert(key.permission==='FullAccess','FULL_ACCESS_REQUIRED','Dedicated signer must retain a full-access key');
    assert(Number.isSafeInteger(key.nonce),'INVALID_NONCE','Access key nonce is not safely representable');
    const gas=plan.actions.reduce((sum,a)=>sum+(a.type==='call'?uint(a.gas):0n),0n);
    assert(gas<=300000000000000n,'INVALID_GAS','Total prepaid gas exceeds protocol limit');
    const feeReserve=gasReservation(plan,protocol,gasInfo);
    const storagePrice=uint(protocol.runtime_config.storage_amount_per_byte);
    assert(feeReserve>0n&&feeReserve<=uint(this.config.limits?.nearFees??'150000000000000000000000'),'GAS_PRICE_CHANGED','Conservative gas reservation exceeds qualification');
    const outgoing=plan.actions.reduce((sum,a)=>sum+(a.type==='transfer'?uint(a.amount):a.type==='call'?uint(a.deposit):0n),0n);
    const liquid=uint(account.amount)-BigInt(account.storage_usage)*storagePrice;
    assert(liquid>=outgoing+feeReserve,'INSUFFICIENT_NEAR','Signer lacks liquid NEAR after storage collateral and reserved fees');
    if(plan.signerId===this.config.treasury){
      assert(effectiveCodeHash(account)===ZERO,'TREASURY_CODE_CHANGED','Treasury must remain an ordinary recovery account');
      assert(liquid-outgoing-feeReserve>=uint(this.config.treasuryFloor),'TREASURY_FLOOR','Transaction would cross the treasury recovery floor');
      assert(!plan.actions.some(a=>a.type==='deploy'||a.type==='delete'),'TREASURY_ACTION_BLOCKED','Treasury cannot deploy code or be deleted');
    }
    if(plan.actions.some(a=>a.type==='deploy')){
      assert(plan.signerId===plan.receiverId,'SELF_DEPLOY_REQUIRED','Deploy only to a dedicated account with its own key');
      assert(effectiveCodeHash(account)===ZERO,'EXISTING_CODE','Never overwrite a funded deployed contract');
      const codeBytes=plan.actions.filter(a=>a.type==='deploy').reduce((n,a)=>n+Buffer.from(a.code,'base64').length,0);
      assert(liquid>=BigInt(codeBytes+5000)*storagePrice+outgoing+feeReserve,'INSUFFICIENT_STORAGE','Deployment requires code, state and gas collateral');
    }
    if(plan.expectedReceiverCodeHash){
      const receiver=plan.receiverId===plan.signerId?account:await this.reads.account(plan.receiverId,block);
      assert(effectiveCodeHash(receiver)===plan.expectedReceiverCodeHash,'CODE_CHANGED','Transaction receiver code differs from qualification');
    }
    // Deletion is restricted to a previously verified recovery plan. No HTTP handler accepts raw plans.
    if(plan.actions.some(a=>a.type==='delete'))assert(plan.recoveryVerified===true&&plan.receiverId===plan.signerId&&plan.actions.length===1&&plan.actions[0].beneficiaryId===this.config.treasury,'RECOVERY_REQUIRED','Account closure requires zero-liability recovery evidence');
    const amounts={nearFees:feeReserve.toString()};
    if(plan.signerId===this.config.treasury&&outgoing>0n){
      assert(plan.allocationAccount===plan.receiverId,'ALLOCATION_REQUIRED','Treasury outflow must identify its recoverable allocation');
      Object.assign(amounts,{nearAllocation:outgoing.toString(),nearAllocationGross:outgoing.toString()});
    }
    // Claim this signer atomically with the budget, across multiple local processes.
    let previousLock;
    this.store.transaction(()=>{
      const lock=this.store.get('near-lock',plan.signerId);
      if(plan.replacesOperationId){
        const previous=this.store.operation(plan.replacesOperationId),oldTx=previous?.result?.signedTransaction&&SignedTransaction.decode(Buffer.from(previous.result.signedTransaction,'base64')).transaction;
        assert(previous&&['signed','broadcast','broadcast-unknown'].includes(previous.phase)&&previous.scope===plan.signerId&&lock?.operationId===previous.id,'INVALID_REPLACEMENT','Original transaction must still own the signer lock');
        assert(oldTx.nonce===BigInt(key.nonce)+1n&&previous.plan.actions.length===1&&plan.actions.length===1,'INVALID_REPLACEMENT','Replacement must consume the same unused nonce');
        const old=previous.plan.actions[0],next=plan.actions[0];
        assert(old.type==='call'&&['finalize_failure','finalize_success'].includes(old.method)&&old.deposit==='0'&&next.type==='call'&&next.method===old.method&&next.deposit==='0'
          &&hashObject(next.args)===hashObject(old.args)&&plan.receiverId===previous.plan.receiverId&&uint(next.gas)<uint(old.gas),'INVALID_REPLACEMENT','Only the same zero-deposit settlement call may lower its gas');
        const minimumPrice=uint(protocol.min_gas_price??gasInfo.gas_price);
        assert(uint(account.amount)<uint(old.gas)*minimumPrice,'INVALID_REPLACEMENT','Original prepaid gas must exceed the entire signer balance');
        previousLock=lock;this.store.update('near-lock',plan.signerId,plan.signerId,lock.version,{operationId:id});
      }else{
        assert(!lock,'SIGNER_BUSY','Earlier signer transaction requires reconciliation');
        this.store.insert('near-lock',plan.signerId,plan.signerId,{operationId:id});
      }
    });
    let reserved=false;
    try{
      this.budget.reserve({id,kind:'near',scope:plan.signerId,plan,amounts});reserved=true;
      const tx=createTransaction(plan.signerId,publicKey,plan.receiverId,BigInt(key.nonce)+1n,decoded,baseDecode(block.header.hash));
      const {txHash,signedTransaction}=await signer.signTransaction(tx);
      const hash=baseEncode(txHash),encoded=Buffer.from(signedTransaction.encode()).toString('base64');
      this.store.transition(id,['reserved'],'signed',{transactionHash:hash,result:{signedTransaction:encoded}});
      // The exact signed bytes and hash are durable before any network write.
      let outcome;
      try{outcome=await this.reads.rpc.call('send_tx',{signed_tx_base64:encoded,wait_until:'NONE'});}
      catch(error){this.store.transition(id,['signed'],'broadcast-unknown',{result:{signedTransaction:encoded,lastRpcError:error.code??'RPC_UNAVAILABLE'}});return this.store.operation(id);}
      if(outcome?.final_execution_status==='FINAL')return this.finish(id,outcome);
      this.store.transition(id,['signed'],'broadcast');return this.reconcile(id);
    }catch(error){
      if(!reserved){if(previousLock){const lock=this.store.get('near-lock',plan.signerId);this.store.update('near-lock',plan.signerId,plan.signerId,lock.version,{operationId:previousLock.operationId});}
        else this.store.db.prepare('DELETE FROM objects WHERE kind=? AND id=?').run('near-lock',plan.signerId);}
      throw error;
    }
  }
  async reconcile(id){
    const op=this.store.operation(id);assert(op?.kind==='near','UNKNOWN_OPERATION','NEAR operation not found',404);
    if(['confirmed','failed','superseded'].includes(op.phase))return op;
    if(!op.transaction_hash)return op; // Reserved but never signed: requires explicit recovery, never an automatic resend.
    let outcome;
    try{outcome=await this.reads.rpc.call('tx',{tx_hash:op.transaction_hash,sender_account_id:op.plan.signerId,wait_until:'NONE'});}
    catch(error){if(['UNKNOWN_TRANSACTION','RPC_UNAVAILABLE'].includes(error.code))return op;throw error;}
    return this.finish(id,outcome);
  }
  finish(id,outcome){
    const op=this.store.operation(id);
    if(outcome?.final_execution_status!=='FINAL')return op;
    assert(outcome?.transaction?.hash===op.transaction_hash&&outcome.transaction.signer_id===op.plan.signerId&&outcome.transaction.receiver_id===op.plan.receiverId,'UNBOUND_RECEIPT','Transaction evidence does not match the signed operation');
    if(['confirmed','failed','superseded'].includes(op.phase))return op;
    const entries=this.store.db.prepare('SELECT * FROM budget_entries WHERE operation_id=?').all(id);
    const actual=Object.fromEntries(entries.map(row=>[row.category,row.category==='nearFees'?nearBurn(outcome).toString():row.reserved]));
    // On a failed asynchronous receipt, native deposits may still have moved. Keep full allocation reserved.
    this.budget.settle(id,actual,{evidence:{final:true,transactionHash:op.transaction_hash}});
    if(op.plan.replacesOperationId){
      const previous=this.store.operation(op.plan.replacesOperationId);
      if(previous.phase==='superseded')assert(previous.result.replacementId===id,'UNBOUND_REPLACEMENT','Original nonce was consumed by another replacement');
      else {
      const oldTx=SignedTransaction.decode(Buffer.from(previous.result.signedTransaction,'base64')).transaction;
      assert(BigInt(outcome.transaction.nonce)===oldTx.nonce,'UNBOUND_REPLACEMENT','Final replacement must consume the rejected transaction nonce');
      assert(this.store.db.prepare('SELECT category FROM budget_entries WHERE operation_id=?').all(previous.id).every(row=>row.category==='nearFees'),'INVALID_REPLACEMENT','Replaced operation must have no capital allocation');
      this.budget.settle(previous.id,{nearFees:'0'},{evidence:{final:true,transactionHash:previous.transaction_hash}});
      this.store.transition(previous.id,['signed','broadcast','broadcast-unknown'],'superseded',{result:{final:true,replacementId:id,replacementHash:op.transaction_hash,nonce:oldTx.nonce.toString()}});
      }
    }
    const successful=successfulNearOutcome(outcome);
    this.store.transaction(()=>{
      this.store.transition(id,['signed','broadcast','broadcast-unknown'],successful?'confirmed':'failed',{result:{final:true,successful,outcome}});
      this.store.db.prepare('DELETE FROM objects WHERE kind=? AND id=?').run('near-lock',op.plan.signerId);
    });
    return this.store.operation(id);
  }
  async rebroadcast(id){
    assert(this.config.enabled,'MAINNET_DISABLED','Live integration execution is disabled');
    const op=await this.reconcile(id);if(['confirmed','failed'].includes(op.phase))return op;
    const encoded=op.result?.signedTransaction;assert(encoded,'NO_SIGNED_TRANSACTION','No original signed bytes are available');
    const signed=SignedTransaction.decode(Buffer.from(encoded,'base64'));
    assert(baseEncode(Buffer.from(sha256(signed.transaction.encode()),'hex'))===op.transaction_hash,'TRANSACTION_CHANGED','Recovery bytes differ from the recorded hash');
    this.store.event('exact_transaction_rebroadcast',id,op.plan.signerId,{transactionHash:op.transaction_hash});
    // Explicit operator recovery only: identical signature, nonce, actions and hash. No replacement transaction is created.
    await this.reads.rpc.call('send_tx',{signed_tx_base64:encoded,wait_until:'NONE'});
    return this.reconcile(id);
  }
}
