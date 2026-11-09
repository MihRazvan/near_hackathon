import { actions, createTransaction, baseEncode, baseDecode } from 'near-api-js';
import { assert, uint, sha256, hashObject } from './core.mjs';
import { successfulNearOutcome, nearBurn } from './rpc.mjs';

const CALLS=new Set(['new_campaign','execute_intents','storage_deposit','release_credit','finalize_failure','finalize_success',
  'accept_nft_nomination','mint_final_placement','submit_artwork','lock_artwork','submit_delivery_proof','record_issue_decision','nft_transfer']);
const ZERO='11111111111111111111111111111111';
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
    const feeReserve=uint(gasInfo.gas_price)*300000000000000n*2n;
    const storagePrice=uint(protocol.runtime_config.storage_amount_per_byte);
    assert(feeReserve>0n&&feeReserve<=100000000000000000000000n,'GAS_PRICE_CHANGED','Conservative gas reservation exceeds qualification');
    const outgoing=plan.actions.reduce((sum,a)=>sum+(a.type==='transfer'?uint(a.amount):a.type==='call'?uint(a.deposit):0n),0n);
    const liquid=uint(account.amount)-BigInt(account.storage_usage)*storagePrice;
    assert(liquid>=outgoing+feeReserve,'INSUFFICIENT_NEAR','Signer lacks liquid NEAR after storage collateral and reserved fees');
    if(plan.signerId===this.config.treasury){
      assert(account.code_hash===ZERO,'TREASURY_CODE_CHANGED','Treasury must remain an ordinary recovery account');
      assert(liquid-outgoing-feeReserve>=uint(this.config.treasuryFloor),'TREASURY_FLOOR','Transaction would cross the treasury recovery floor');
      assert(!plan.actions.some(a=>a.type==='deploy'||a.type==='delete'),'TREASURY_ACTION_BLOCKED','Treasury cannot deploy code or be deleted');
    }
    if(plan.actions.some(a=>a.type==='deploy')){
      assert(plan.signerId===plan.receiverId,'SELF_DEPLOY_REQUIRED','Deploy only to a dedicated account with its own key');
      assert(account.code_hash===ZERO,'EXISTING_CODE','Never overwrite a funded deployed contract');
      const codeBytes=plan.actions.filter(a=>a.type==='deploy').reduce((n,a)=>n+Buffer.from(a.code,'base64').length,0);
      assert(liquid>=BigInt(codeBytes+5000)*storagePrice+outgoing+feeReserve,'INSUFFICIENT_STORAGE','Deployment requires code, state and gas collateral');
    }
    if(plan.expectedReceiverCodeHash){
      const receiver=plan.receiverId===plan.signerId?account:await this.reads.account(plan.receiverId,block);
      assert(receiver.code_hash===plan.expectedReceiverCodeHash,'CODE_CHANGED','Transaction receiver code differs from qualification');
    }
    // Deletion is restricted to a previously verified recovery plan. No HTTP handler accepts raw plans.
    if(plan.actions.some(a=>a.type==='delete'))assert(plan.recoveryVerified===true&&plan.receiverId===plan.signerId&&plan.actions.length===1&&plan.actions[0].beneficiaryId===this.config.treasury,'RECOVERY_REQUIRED','Account closure requires zero-liability recovery evidence');
    const amounts={nearFees:feeReserve.toString()};
    if(plan.signerId===this.config.treasury&&outgoing>0n){
      assert(plan.allocationAccount===plan.receiverId,'ALLOCATION_REQUIRED','Treasury outflow must identify its recoverable allocation');
      Object.assign(amounts,{nearAllocation:outgoing.toString(),nearAllocationGross:outgoing.toString()});
    }
    // Claim this signer atomically with the budget, across multiple local processes.
    this.store.transaction(()=>{
      assert(!this.store.get('near-lock',plan.signerId),'SIGNER_BUSY','Earlier signer transaction requires reconciliation');
      this.store.insert('near-lock',plan.signerId,plan.signerId,{operationId:id});
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
      try{outcome=await this.reads.rpc.call('send_tx',{signed_tx_base64:encoded,wait_until:'FINAL'},{timeoutMs:60000});}
      catch{this.store.transition(id,['signed'],'broadcast-unknown');return this.store.operation(id);}
      return this.finish(id,outcome);
    }catch(error){
      if(!reserved)this.store.db.prepare('DELETE FROM objects WHERE kind=? AND id=?').run('near-lock',plan.signerId);
      throw error;
    }
  }
  async reconcile(id){
    const op=this.store.operation(id);assert(op?.kind==='near','UNKNOWN_OPERATION','NEAR operation not found',404);
    if(['confirmed','failed'].includes(op.phase))return op;
    if(!op.transaction_hash)return op; // Reserved but never signed: requires explicit recovery, never an automatic resend.
    let outcome;
    try{outcome=await this.reads.rpc.call('tx',{tx_hash:op.transaction_hash,sender_account_id:op.plan.signerId,wait_until:'FINAL'});}
    catch(error){if(['UNKNOWN_TRANSACTION','RPC_UNAVAILABLE'].includes(error.code))return op;throw error;}
    return this.finish(id,outcome);
  }
  finish(id,outcome){
    const op=this.store.operation(id);
    assert(outcome?.transaction?.hash===op.transaction_hash&&outcome.transaction.signer_id===op.plan.signerId&&outcome.transaction.receiver_id===op.plan.receiverId,'UNBOUND_RECEIPT','Transaction evidence does not match the signed operation');
    if(outcome.final_execution_status!=='FINAL')return op;
    const entries=this.store.db.prepare('SELECT * FROM budget_entries WHERE operation_id=?').all(id);
    const actual=Object.fromEntries(entries.map(row=>[row.category,row.category==='nearFees'?nearBurn(outcome).toString():row.reserved]));
    // On a failed asynchronous receipt, native deposits may still have moved. Keep full allocation reserved.
    this.budget.settle(id,actual,{evidence:{final:true,transactionHash:op.transaction_hash}});
    const successful=successfulNearOutcome(outcome);
    this.store.transaction(()=>{
      this.store.transition(id,['signed','broadcast-unknown'],successful?'confirmed':'failed',{result:{final:true,successful,outcome}});
      this.store.db.prepare('DELETE FROM objects WHERE kind=? AND id=?').run('near-lock',op.plan.signerId);
    });
    return this.store.operation(id);
  }
}
