import {Rpc} from './rpc.mjs';
import {AppError,assert} from './core.mjs';

export const EVIDENCE_RPC_ENDPOINTS=Object.freeze([
 'https://near.drpc.org',
 'https://free.rpc.fastnear.com',
 'https://archival-rpc.mainnet.near.org',
]);
const READS=new Set(['status','block','query','tx']);
const UNAVAILABLE=new Set(['RPC_UNAVAILABLE','RPC_REJECTED','UNKNOWN_TRANSACTION','UNKNOWN_ACCOUNT']);
export function evidenceEndpoint(value){
 let url;try{url=new URL(value);}catch{}
 assert(url?.protocol==='https:'&&!url.username&&!url.password,'INVALID_RPC_URL','Use an HTTPS NEAR mainnet RPC URL without embedded username or password.',400);
 return url.href;
}
export class EvidenceRpc {
 constructor(endpoints=EVIDENCE_RPC_ENDPOINTS,{rpcFactory=url=>new Rpc(url,{intervalMs:500}),now=Date.now,endpointTimeoutMs=8000}={}){
  assert(Array.isArray(endpoints)&&endpoints.length>0&&endpoints.length<=4,'INVALID_RPC_URL','Choose one to four NEAR RPC endpoints.',400);
  this.endpoints=[...new Set(endpoints.map(evidenceEndpoint))];this.clients=this.endpoints.map(rpcFactory);this.now=now;this.endpointTimeoutMs=endpointTimeoutMs;this.active=0;this.tried=new Set();
 }
 async call(method,params,{timeoutMs=30000,...options}={}){
  assert(READS.has(method),'VERIFY_READ_ONLY','Evidence verification only permits read-only RPC methods.',400);
  const deadline=this.now()+timeoutMs,order=Array.from({length:this.clients.length},(_,i)=>(this.active+i)%this.clients.length);
  for(const index of order){
   const remaining=deadline-this.now();if(remaining<=0)break;this.tried.add(index);
   try{const value=await this.clients[index].call(method,params,{...options,timeoutMs:Math.min(this.endpointTimeoutMs,remaining)});this.active=index;return value;}
   catch(error){if(!UNAVAILABLE.has(error.code))throw error;}
  }
  throw new AppError('RPC_UNAVAILABLE','Network access to a NEAR mainnet RPC is required. Retry with: node backend/bin/verify-evidence.mjs <rpc-url>',503);
 }
 diagnostics(){return {endpoint:new URL(this.endpoints[this.active]).origin,endpointsTried:[...this.tried].map(i=>new URL(this.endpoints[i]).origin)};}
}
