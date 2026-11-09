import { assert, AppError, uint } from './core.mjs';

export class Rpc {
  constructor(endpoint,{fetchImpl=fetch,intervalMs=120}={}) {this.endpoint=endpoint;this.fetch=fetchImpl;this.intervalMs=intervalMs;this.next=0;}
  async call(method,params,{timeoutMs=15000}={}) {
    const start=Math.max(Date.now(),this.next);this.next=start+this.intervalMs;
    if(start>Date.now())await new Promise(resolve=>setTimeout(resolve,start-Date.now()));
    let response;
    try {response=await this.fetch(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:'everywhere',method,params}),signal:AbortSignal.timeout(timeoutMs)});}
    catch {throw new AppError('RPC_UNAVAILABLE','Chain provider is temporarily unavailable',503);}
    assert(response.ok,'RPC_UNAVAILABLE',`Chain provider HTTP ${response.status}`,503);
    const value=await response.json();
    if(value.error){
      const type=value.error.cause?.name??value.error.data?.name;
      const code=type==='UNKNOWN_ACCOUNT'?'UNKNOWN_ACCOUNT':type==='UNKNOWN_TRANSACTION'?'UNKNOWN_TRANSACTION':value.error.code===30||['TIMEOUT_ERROR','DOES_NOT_TRACK_SHARD','INTERNAL_ERROR'].includes(type)?'RPC_UNAVAILABLE':'RPC_REJECTED';
      throw new AppError(code,`Chain query failed (${type??value.error.code})`,409);
    }
    return value.result;
  }
}

const VIEWS=new Set(['get_state','get_campaign','get_credit','get_withdrawal','get_placement_rights','get_artwork','nft_token',
  'is_invoice_used','mt_balance_of','storage_balance_of','storage_balance_bounds','ft_balance_of','fee','pa_all_paused']);
export class NearReads {
  constructor(rpc,{network='mainnet'}={}){this.rpc=rpc;this.network=network;}
  async block(){return this.rpc.call('block',{finality:'final'});}
  async status(){const value=await this.rpc.call('status',[]);assert(value.chain_id===this.network,'WRONG_NETWORK','NEAR network does not match configuration');return value;}
  async query(params,block){
    const result=await this.rpc.call('query',{...params,...(block?{block_id:block.header.hash}:{finality:'final'})});
    if(block)assert(result.block_hash===block.header.hash&&result.block_height===block.header.height,'UNBOUND_QUERY','RPC views must come from the same finalized block');
    return result;
  }
  async account(accountId,block){return this.query({request_type:'view_account',account_id:accountId},block);}
  async keys(accountId,block){return (await this.query({request_type:'view_access_key_list',account_id:accountId},block)).keys;}
  async key(accountId,publicKey,block){return this.query({request_type:'view_access_key',account_id:accountId,public_key:publicKey},block);}
  async view(accountId,method,args={},block){
    assert(VIEWS.has(method),'UNSUPPORTED_VIEW','Unreviewed contract view rejected');
    const response=await this.query({request_type:'call_function',account_id:accountId,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')},block);
    return JSON.parse(Buffer.from(response.result).toString('utf8'));
  }
  async snapshot(accountId,{expectedCodeHash,expectedIntentsCodeHash,expectedAssets,wallets=[]}={}){
    const block=await this.block(),account=await this.account(accountId,block);
    assert(expectedCodeHash&&account.code_hash===expectedCodeHash,'CODE_CHANGED','Contract code differs from the registered deployment');
    const [state,campaign,rights]=await Promise.all([this.view(accountId,'get_state',{},block),this.view(accountId,'get_campaign',{},block),this.view(accountId,'get_placement_rights',{},block)]);
    assert(campaign?.terms&&state.cutoff_ns===campaign.terms.bidding_close_ns&&state.refund_end_ns===campaign.terms.review_end_ns,'CAMPAIGN_MISMATCH','Campaign schedule does not match financial state');
    assert(state.settlement==='intents'&&expectedAssets&&state.intents_contract_id===expectedAssets.intentsId&&state.ft_contract_id===expectedAssets.nearUsdc&&state.intents_token_id===expectedAssets.nearAsset,'ASSET_CHANGED','Campaign settlement assets do not match configuration');
    const verifier=await this.account(state.intents_contract_id,block);
    assert(expectedIntentsCodeHash&&verifier.code_hash===expectedIntentsCodeHash,'VERIFIER_CHANGED','Intents code must match the qualified deployment');
    const [balances,fee,paused]=await Promise.all([
      this.view(state.intents_contract_id,'mt_balance_of',{account_id:accountId,token_id:state.intents_token_id},block),
      this.view(state.intents_contract_id,'fee',{},block),this.view(state.intents_contract_id,'pa_all_paused',{},block)]);
    assert(uint(state.total_pending)===0n,'PENDING_WITHDRAWAL','Resolve the pending withdrawal before planning another action');
    const liabilities=uint(state.total_received)-uint(state.total_withdrawn);
    assert(liabilities>=0n&&uint(balances)>=liabilities,'INSOLVENT_ESCROW','Escrow balance does not cover recorded liabilities');
    assert(paused===null||(Array.isArray(paused)&&paused.length===0),'INTENTS_PAUSED','Intents transfers are paused');
    assert(fee===1,'FEE_CHANGED','Intents fee differs from the qualified value');
    const credits={};for(const wallet of new Set(wallets))credits[wallet]=await this.view(accountId,'get_credit',{account_id:wallet},block);
    return {accountId,codeHash:account.code_hash,observedAt:new Date().toISOString(),blockHash:block.header.hash,blockHeight:block.header.height,
      blockTimestampNs:block.header.timestamp_nanosec,state,campaign,rights,credits,escrowBalance:balances,liabilities:liabilities.toString(),intentsFee:fee,qualified:true};
  }
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
