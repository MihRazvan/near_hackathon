// Verification-only transport. Production transaction/RPC behavior is unchanged.
import {AppError,assert} from './core.mjs';

export const EVIDENCE_RPC_ENDPOINTS=Object.freeze([
 'https://near.drpc.org',
 'https://free.rpc.fastnear.com',
 'https://archival-rpc.mainnet.near.org',
]);
const READS=new Set(['status','block','query','tx']);
const FALLBACK=new Set(['RPC_UNAVAILABLE','RPC_RATE_LIMITED','RPC_REJECTED','UNKNOWN_TRANSACTION','UNKNOWN_ACCOUNT']);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const failure=(code,message)=>new AppError(code,message,503);
const recovery='Retry with: node backend/bin/verify-evidence.mjs --history-rpc <https-archival-rpc-url>';
export function evidenceEndpoint(value){
 let url;try{url=new URL(value);}catch{}
 assert(url?.protocol==='https:'&&!url.username&&!url.password,'INVALID_RPC_URL','Use an HTTPS NEAR mainnet RPC URL without embedded username or password.',400);
 return url.href;
}
function retryAfter(response,now){
 const value=response.headers?.get?.('retry-after');
 if(!value)return 2000;
 const delay=/^\d+(?:\.\d+)?$/.test(value)?Number(value)*1000:Date.parse(value)-now;
 return Number.isFinite(delay)?Math.max(500,Math.min(delay,8000)):2000;
}
// Queuing, HTTP retries and body reads share one per-provider deadline. Only the
// four read methods above can reach this transport; no signer or env is loaded.
class VerificationProvider {
 constructor(endpoint,{fetchImpl=fetch,now=Date.now,sleep=pause}={}){
  Object.assign(this,{endpoint,fetch:fetchImpl,now,sleep});
  // This public archival service is documented as severely rate limited. It is
  // used sequentially for eleven old receipts, not as the current-state pool.
  this.archival=new URL(endpoint).hostname==='archival-rpc.mainnet.near.org';
  this.schedules={state:{next:0,queue:Promise.resolve()},history:{next:0,queue:Promise.resolve()}};
 }
 async slot(deadline,schedule,interval){
  const previous=schedule.queue;let release;schedule.queue=new Promise(resolve=>release=resolve);
  try{
   await previous;const wait=Math.max(0,schedule.next-this.now());
   if(wait>=deadline-this.now())throw failure('RPC_UNAVAILABLE','Provider request deadline expired while waiting for a read slot.');
   if(wait)await this.sleep(wait);
   schedule.next=this.now()+interval;
  }finally{release();}
 }
 async call(method,params,{timeoutMs=8000}={}){
  const lane=method==='tx'?'history':'state',schedule=this.schedules[lane];
  const interval=this.archival?(lane==='history'?20000:1500):250,deadline=this.now()+timeoutMs;
  let last;
  for(let attempt=0;attempt<3;attempt++){
   try{await this.slot(deadline,schedule,interval);}catch(error){throw last??error;}
   const remaining=deadline-this.now();
   if(remaining<=0)throw last??failure('RPC_UNAVAILABLE','Provider read deadline expired.');
   const controller=new AbortController();let timer,delay;
   const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('RPC_UNAVAILABLE','Provider read deadline expired.'));},Math.min(remaining,8000));});
   try{
    const response=await Promise.race([this.fetch(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'everywhere-evidence',method,params}),signal:controller.signal}),expired]);
    if(response.status===429){
     delay=retryAfter(response,this.now());
     // The free archive can exhaust a longer quota even at a low request rate.
     // Give its bucket time to refill instead of sending three quick retries.
     if(this.archival&&lane==='history')delay=Math.max(delay,60000*(attempt+1));
     throw failure('RPC_RATE_LIMITED','Provider rejected the read with HTTP 429.');
    }
    if(!response.ok)throw failure([502,503,504].includes(response.status)?'RPC_UNAVAILABLE':'RPC_REJECTED',`Provider rejected the read with HTTP ${response.status}.`);
    const value=await Promise.race([response.json(),expired]);
    if(!value||typeof value!=='object'||Array.isArray(value)||(!('result' in value)&&!value.error))throw failure('RPC_UNAVAILABLE','Provider returned an incomplete JSON-RPC response.');
    if(value.error){
     const type=value.error.cause?.name??value.error.data?.name;
     const code=type==='UNKNOWN_TRANSACTION'?'UNKNOWN_TRANSACTION':type==='UNKNOWN_ACCOUNT'?'UNKNOWN_ACCOUNT':['TIMEOUT_ERROR','DOES_NOT_TRACK_SHARD','INTERNAL_ERROR'].includes(type)?'RPC_UNAVAILABLE':'RPC_REJECTED';
     // Do not repeat upstream error text: authenticated RPCs can echo URLs/keys.
     throw failure(code,code==='UNKNOWN_TRANSACTION'?'This provider does not have the requested transaction.':'Provider could not serve the requested chain read.');
    }
    return value.result;
   }catch(error){
    last=error instanceof AppError?error:failure('RPC_UNAVAILABLE','Provider transport or response was unavailable.');
    if(!['RPC_UNAVAILABLE','RPC_RATE_LIMITED'].includes(last.code)||attempt===2)throw last;
    delay??=500*(attempt+1);
    if(delay>=deadline-this.now())throw last;
    schedule.next=Math.max(schedule.next,this.now()+delay);
   }finally{clearTimeout(timer);controller.abort();}
  }
  throw last;
 }
}
export class EvidenceRpc {
 constructor(endpoints=EVIDENCE_RPC_ENDPOINTS,{historyEndpoints,rpcFactory,fetchImpl=fetch,now=Date.now,sleep=pause,endpointTimeoutMs=8000,historyTimeoutMs=240000}={}){
  const validate=list=>{assert(Array.isArray(list)&&list.length>0&&list.length<=4,'INVALID_RPC_URL','Choose one to four NEAR RPC endpoints.',400);return [...new Set(list.map(evidenceEndpoint))];};
  const state=validate(endpoints),history=historyEndpoints?validate(historyEndpoints):[...state].sort((a,b)=>Number(new URL(b).hostname==='archival-rpc.mainnet.near.org')-Number(new URL(a).hostname==='archival-rpc.mainnet.near.org'));
  this.endpoints=[...new Set([...state,...history])];assert(this.endpoints.length<=4,'INVALID_RPC_URL','Choose at most four distinct NEAR RPC endpoints.',400);
  this.pools={state:state.map(url=>this.endpoints.indexOf(url)),history:history.map(url=>this.endpoints.indexOf(url))};
  this.clients=this.endpoints.map(url=>rpcFactory?rpcFactory(url):new VerificationProvider(url,{fetchImpl,now,sleep}));
  Object.assign(this,{now,endpointTimeoutMs,historyTimeoutMs,active:0,tried:new Set(),failures:[],preferred:{state:this.pools.state[0],history:this.pools.history[0]}});
 }
 async call(method,params,{timeoutMs,...options}={}){
  assert(READS.has(method),'VERIFY_READ_ONLY','Evidence verification only permits read-only RPC methods.',400);
  // The public archive needs time for its next slot and bounded 429 retries.
  // Other reads keep the short deadline; callers can still supply a tighter one.
  timeoutMs??=method==='tx'?300000:30000;
  const lane=method==='tx'?'history':'state',pool=this.pools[lane],first=this.preferred[lane],order=[first,...pool.filter(index=>index!==first)],deadline=this.now()+timeoutMs,errors=[];
  for(const index of order){
   const remaining=deadline-this.now();if(remaining<=0)break;this.tried.add(index);
   try{
    const publicArchive=new URL(this.endpoints[index]).hostname==='archival-rpc.mainnet.near.org';
    const budget=lane==='history'?(publicArchive?this.historyTimeoutMs:Math.min(this.historyTimeoutMs,15000)):publicArchive?Math.max(this.endpointTimeoutMs,18000):this.endpointTimeoutMs;
    const value=await this.clients[index].call(method,params,{...options,timeoutMs:Math.min(budget,remaining)});
    this.active=index;this.preferred[lane]=index;return value;
   }catch(error){
    if(!FALLBACK.has(error.code))throw error;
    errors.push(error.code);this.failures.push({endpoint:new URL(this.endpoints[index]).origin,lane,method,code:error.code});this.failures=this.failures.slice(-12);
   }
  }
  if(errors.includes('RPC_RATE_LIMITED'))throw failure('RPC_RATE_LIMITED',`NEAR RPC verification was rate limited (HTTP 429). Wait before retrying, or use another archival provider. ${recovery}`);
  if(lane==='history'&&errors.length&&errors.every(code=>code==='UNKNOWN_TRANSACTION'))throw failure('HISTORY_UNAVAILABLE',`The selected providers could not find this historical transaction. This does not establish that the transaction never existed. ${recovery}`);
  throw failure('RPC_UNAVAILABLE',`Network access to a NEAR mainnet RPC is required; the selected providers could not complete ${lane==='history'?'a historical receipt read':'a current-state read'}. Retry with: node backend/bin/verify-evidence.mjs <rpc-url>`);
 }
 diagnostics(){return {endpoint:new URL(this.endpoints[this.active]).origin,stateEndpoint:new URL(this.endpoints[this.preferred.state]).origin,historicalEndpoint:new URL(this.endpoints[this.preferred.history]).origin,endpointsTried:[...this.tried].map(index=>new URL(this.endpoints[index]).origin),failures:this.failures};}
}
