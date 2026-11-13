import { assert, AppError, uint } from './core.mjs';

const RETRYABLE_READS=new Set(['status','block','query','tx','EXPERIMENTAL_protocol_config','gas_price']);
const RETRYABLE_HTTP=new Set([429,502,503,504]);
const unavailable=(message='Chain provider is temporarily unavailable')=>new AppError('RPC_UNAVAILABLE',message,503);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function retryDelay(response,attempt,now){
 const value=response?.headers?.get?.('retry-after');
 if(typeof value==='string'&&value.trim()){
  const raw=value.trim(),milliseconds=/^\d+(?:\.\d+)?$/.test(raw)?Number(raw)*1000:Date.parse(raw)-now;
  if(Number.isFinite(milliseconds))return Math.min(2000,Math.max(0,milliseconds));
 }
 return 500*(attempt+1);
}
export class Rpc {
  constructor(endpoint,{fetchImpl=fetch,intervalMs=120,sleep=delay,now=Date.now}={}) {
    Object.assign(this,{endpoint,fetch:fetchImpl,intervalMs,sleep,now,next:0,inflight:new Map(),queue:[],draining:false});
  }
  async slot(priority,deadline){
    if(this.next>=deadline)throw unavailable();
    return new Promise((resolve,reject)=>{this.queue.push({priority,deadline,resolve,reject});if(!this.draining)void this.drain();});
  }
  async drain(){
    this.draining=true;
    try{
      while(this.queue.length){
        const wait=Math.max(0,this.next-this.now());if(wait>0)await this.sleep(wait);
        // Choose after waiting, so a wallet request can pass a queued browse.
        const foreground=this.queue.findIndex(job=>job.priority!=='background');
        const [job]=this.queue.splice(foreground<0?0:foreground,1);
        if(this.now()>=job.deadline){job.reject(unavailable());continue;}
        this.next=this.now()+this.intervalMs;job.resolve();
      }
    }catch(error){for(const job of this.queue.splice(0))job.reject(error);}
    finally{this.draining=false;}
  }
  async call(method,params,{timeoutMs=15000,priority='normal'}={}) {
    // Share only identical reads that are still running. Completed reads are
    // never cached, and transaction broadcasts always have their own request.
    if(!RETRYABLE_READS.has(method))return this.request(method,params,{timeoutMs,priority});
    const key=JSON.stringify([method,params,timeoutMs]);
    let pending=this.inflight.get(key);
    if(!pending){pending=this.request(method,params,{timeoutMs,priority});this.inflight.set(key,pending);}
    try{return structuredClone(await pending);}
    finally{if(this.inflight.get(key)===pending)this.inflight.delete(key);}
  }
  async request(method,params,{timeoutMs=15000,priority='normal'}={}) {
    assert(Number.isFinite(timeoutMs)&&timeoutMs>0,'RPC_UNAVAILABLE','Chain request timeout is invalid',503);
    const deadline=this.now()+timeoutMs,body=JSON.stringify({jsonrpc:'2.0',id:'everywhere',method,params}),attempts=RETRYABLE_READS.has(method)?3:1;
    const remaining=()=>deadline-this.now();
    const wait=async ms=>{
      if(ms>=remaining())throw unavailable();
      if(ms>0)await this.sleep(ms);
      if(remaining()<=0)throw unavailable();
    };
    for(let attempt=0;attempt<attempts;attempt++){
      // Every attempt shares the caller's deadline and the same serialized
      // payload. Retried finalized-block queries cannot drift to another block.
      await this.slot(priority,deadline);
      if(remaining()<=0)throw unavailable();
      const controller=new AbortController();let timer,response,retry=false;
      const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(unavailable());},Math.max(1,Math.ceil(remaining())));});
      try{
        try{response=await Promise.race([this.fetch(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body,signal:controller.signal}),expired]);}
        catch{
          if(attempt+1<attempts&&remaining()>0)retry=true;else throw unavailable();
        }
        if(response){
          if(remaining()<=0)throw unavailable();
          if(!response.ok){
            if(RETRYABLE_HTTP.has(response.status)&&attempt+1<attempts)retry=true;
            else throw unavailable(`Chain provider HTTP ${response.status}`);
          }else{
            let value;
            try{value=await Promise.race([response.json(),expired]);}
            catch(error){
              const transport=error instanceof TypeError||error?.name==='AbortError'||['ECONNRESET','EPIPE','ETIMEDOUT'].includes(error?.code);
              if(transport&&attempt+1<attempts&&remaining()>0)retry=true;
              else throw unavailable('Chain provider returned an invalid or incomplete response');
            }
            if(!retry){
              if(remaining()<=0)throw unavailable();
              assert(value&&typeof value==='object'&&!Array.isArray(value)&&('result' in value||value.error),'RPC_UNAVAILABLE','Chain provider returned an invalid response',503);
              if(value.error){
                // Application/query failures are authoritative, including an
                // unknown transaction. They never trigger transport retries.
                const type=value.error.cause?.name??value.error.data?.name;
                const code=type==='UNKNOWN_ACCOUNT'?'UNKNOWN_ACCOUNT':type==='UNKNOWN_TRANSACTION'?'UNKNOWN_TRANSACTION':value.error.code===30||['TIMEOUT_ERROR','DOES_NOT_TRACK_SHARD','INTERNAL_ERROR'].includes(type)?'RPC_UNAVAILABLE':'RPC_REJECTED';
                throw new AppError(code,`Chain query failed (${type??value.error.code})`,409);
              }
              return value.result;
            }
          }
        }
      }finally{clearTimeout(timer);controller.abort();}
      if(retry)await wait(retryDelay(response,attempt,this.now()));
    }
    throw unavailable();
  }
}

const VIEWS=new Set(['get_config','get_creation','get_state','get_campaign','get_credit','get_withdrawal','get_placement_rights','get_artwork','nft_token',
  'get_totals','get_sponsor_usage','get_offer_exists','is_participant','is_invoice_used','mt_balance_of','storage_balance_of','storage_balance_bounds','ft_balance_of','fee','pa_all_paused']);
export class NearReads {
  constructor(rpc,{network='mainnet',now=Date.now}={}){this.rpc=rpc;this.network=network;this.now=now;this.pinnedQueries=new Map();this.pendingQueries=new Map();this.pinnedBytes=0;}
  async block({priority='normal'}={}){const block=await this.rpc.call('block',{finality:'final'},{priority});return priority==='background'?{...block,readPriority:priority}:block;}
  async status(){const value=await this.rpc.call('status',[]);assert(value.chain_id===this.network,'WRONG_NETWORK','NEAR network does not match configuration');return value;}
  async query(params,block){
    const request={...params,...(block?{block_id:block.header.hash}:{finality:'final'})};
    // Only an explicitly pinned block is immutable. Head queries and transaction
    // preparation still fetch a fresh finalized block; successful old-block reads
    // may share verified bytes across offers and concurrent visitors.
    if(!block)return this.rpc.call('query',request);
    const key=JSON.stringify(request),cached=this.pinnedQueries.get(key);
    if(cached){assert(cached.result.block_height===block.header.height,'UNBOUND_QUERY','RPC views must come from the same finalized block');return structuredClone(cached.result);}
    let pending=this.pendingQueries.get(key);
    if(!pending){pending=(async()=>{try{
      const result=await this.rpc.call('query',request,{priority:block.readPriority??'normal'});
      assert(result.block_hash===block.header.hash&&result.block_height===block.header.height,'UNBOUND_QUERY','RPC views must come from the same finalized block');
      const bytes=Buffer.byteLength(JSON.stringify(result))+Buffer.byteLength(key);
      if(bytes<=4194304){
        while(this.pinnedQueries.size>=256||this.pinnedBytes+bytes>4194304){const oldest=this.pinnedQueries.keys().next().value,entry=this.pinnedQueries.get(oldest);this.pinnedQueries.delete(oldest);this.pinnedBytes-=entry.bytes;}
        this.pinnedQueries.set(key,{result,bytes});this.pinnedBytes+=bytes;
      }
      return result;
    }finally{this.pendingQueries.delete(key);}})();this.pendingQueries.set(key,pending);}
    const result=await pending;assert(result.block_height===block.header.height,'UNBOUND_QUERY','RPC views must come from the same finalized block');return structuredClone(result);
  }
  async account(accountId,block){return this.query({request_type:'view_account',account_id:accountId},block);}
  async keys(accountId,block){return (await this.query({request_type:'view_access_key_list',account_id:accountId},block)).keys;}
  async key(accountId,publicKey,block){return this.query({request_type:'view_access_key',account_id:accountId,public_key:publicKey},block);}
  async view(accountId,method,args={},block){
    assert(VIEWS.has(method),'UNSUPPORTED_VIEW','Unreviewed contract view rejected');
    const response=await this.query({request_type:'call_function',account_id:accountId,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')},block);
    return JSON.parse(Buffer.from(response.result).toString('utf8'));
  }
  async snapshot(accountId,{expectedCodeHash,expectedIntentsCodeHash,expectedAssets,wallets=[],block:pinnedBlock}={}){
    const block=pinnedBlock??await this.block(),account=await this.account(accountId,block);
    const age=BigInt(this.now())*1000000n-uint(block.header.timestamp_nanosec);
    assert(age>=-5000000000n&&age<=60000000000n,'STALE_BLOCK','Finalized chain state must be recent before preparing an action');
    assert(expectedCodeHash&&effectiveCodeHash(account)===expectedCodeHash,'CODE_CHANGED','Contract code differs from the registered deployment');
    const [state,campaign,rights]=await Promise.all([this.view(accountId,'get_state',{},block),this.view(accountId,'get_campaign',{},block),this.view(accountId,'get_placement_rights',{},block)]);
    assert(campaign?.terms&&state.cutoff_ns===campaign.terms.bidding_close_ns&&state.refund_end_ns===campaign.terms.review_end_ns,'CAMPAIGN_MISMATCH','Campaign schedule does not match financial state');
    assert(state.settlement==='intents'&&expectedAssets&&state.intents_contract_id===expectedAssets.intentsId&&state.ft_contract_id===expectedAssets.nearUsdc&&state.intents_token_id===expectedAssets.nearAsset,'ASSET_CHANGED','Campaign settlement assets do not match configuration');
    const verifier=await this.account(state.intents_contract_id,block);
    assert(expectedIntentsCodeHash&&verifier.code_hash===expectedIntentsCodeHash,'VERIFIER_CHANGED','Intents code must match the qualified deployment');
    const token=await this.account(state.ft_contract_id,block);
    assert(expectedAssets.usdcCodeHash&&token.code_hash===expectedAssets.usdcCodeHash,'TOKEN_CHANGED','Native USDC code differs from qualification');
    const [balances,fee,paused]=await Promise.all([
      this.view(state.intents_contract_id,'mt_balance_of',{account_id:accountId,token_id:state.intents_token_id},block),
      this.view(state.intents_contract_id,'fee',{},block),this.view(state.intents_contract_id,'pa_all_paused',{},block)]);
    assert(uint(state.total_pending)===0n,'PENDING_WITHDRAWAL','Resolve the pending withdrawal before planning another action');
    const liabilities=uint(state.total_received)-uint(state.total_withdrawn);
    assert(liabilities>=0n&&uint(balances)>=liabilities,'INSOLVENT_ESCROW','Escrow balance does not cover recorded liabilities');
    assert(paused===null||(Array.isArray(paused)&&paused.length===0),'INTENTS_PAUSED','Intents transfers are paused');
    assert(fee===1,'FEE_CHANGED','Intents fee differs from the qualified value');
    const credits={};for(const wallet of new Set(wallets))credits[wallet]=await this.view(accountId,'get_credit',{account_id:wallet},block);
    return {accountId,codeHash:effectiveCodeHash(account),observedAt:new Date(this.now()).toISOString(),blockHash:block.header.hash,blockHeight:block.header.height,
      blockTimestampNs:block.header.timestamp_nanosec,state,campaign,rights,credits,escrowBalance:balances,liabilities:liabilities.toString(),intentsFee:fee,qualified:true};
  }
}

// Account-based global code can change behind its publisher ID. Only immutable hashes qualify.
export function effectiveCodeHash(account){
  assert(!account.global_contract_account_id,'MUTABLE_GLOBAL_CODE','Account-based global code is not qualified');
  return account.global_contract_hash??account.code_hash;
}

export function successfulNearOutcome(outcome){
  const success=status=>status&&typeof status==='object'&&('SuccessValue'in status||'SuccessReceiptId'in status);
  return outcome?.final_execution_status==='FINAL'&&success(outcome.status)&&success(outcome.transaction_outcome?.outcome?.status)
    &&Array.isArray(outcome.receipts_outcome)&&outcome.receipts_outcome.length>0&&outcome.receipts_outcome.every(r=>success(r.outcome?.status));
}
export function nearBurn(outcome){
  return [outcome.transaction_outcome,...(outcome.receipts_outcome??[])].reduce((sum,item)=>sum+BigInt(item?.outcome?.tokens_burnt??'0'),0n);
}
export function successfulAccountClosure(outcome,accountId,beneficiaryId){
  const success=status=>status&&typeof status==='object'&&('SuccessValue'in status||'SuccessReceiptId'in status);
  const tx=outcome?.transaction,actions=tx?.actions,receipts=outcome?.receipts_outcome;
  if(outcome?.final_execution_status!=='FINAL'||!success(outcome.status)||!success(outcome.transaction_outcome?.outcome?.status)
    ||tx?.signer_id!==accountId||tx.receiver_id!==accountId||actions?.length!==1||actions[0]?.DeleteAccount?.beneficiary_id!==beneficiaryId||!Array.isArray(receipts))return false;
  const primaryId=outcome.transaction_outcome.outcome.status.SuccessReceiptId;
  if(!receipts.some(r=>r.id===primaryId&&r.outcome.executor_id===accountId&&success(r.outcome.status))
    ||!receipts.some(r=>r.outcome.executor_id===beneficiaryId&&success(r.outcome.status)))return false;
  // Account deletion can leave a gas-refund receipt addressed to the removed signer.
  // Its failure is distinct from the successful deletion and beneficiary transfer.
  return receipts.every(r=>success(r.outcome.status)||(r.id!==primaryId&&r.outcome.executor_id===accountId&&r.outcome.tokens_burnt==='0'
    &&r.outcome.status?.Failure?.ActionError?.kind?.AccountDoesNotExist?.account_id===accountId));
}
