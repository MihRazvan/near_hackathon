import { assert, uint, walletId, hashObject, AppError, canonical } from './core.mjs';
import { MAINNET } from './config.mjs';

const FEE_RECIPIENT='5880ad2b362620fadf759cbceb1cd5737ce8c6ed7fb8e9942881e6731f9247dd';
const evm=value=>/^0x[0-9a-f]{40}$/i.test(value)&&!/^0x0{40}$/i.test(value);
export function routeRequest({direction,wallet,amount,dry=true,now=Date.now()}){
  const owner=walletId(wallet);assert(evm(owner),'EVM_WALLET_REQUIRED','This Base route requires an EVM wallet');assert(uint(amount)>0n,'ZERO_ROUTE','Positive route amount required');
  assert(['fund','exit'].includes(direction),'INVALID_ROUTE','Unsupported route');
  return {dry,swapType:direction==='fund'?'EXACT_OUTPUT':'EXACT_INPUT',slippageTolerance:100,
    originAsset:direction==='fund'?MAINNET.baseAsset:MAINNET.nearAsset,depositType:direction==='fund'?'ORIGIN_CHAIN':'INTENTS',
    destinationAsset:direction==='fund'?MAINNET.nearAsset:MAINNET.baseAsset,amount,
    refundTo:owner,refundType:direction==='fund'?'ORIGIN_CHAIN':'INTENTS',recipient:owner,
    recipientType:direction==='fund'?'INTENTS':'DESTINATION_CHAIN',deadline:new Date(now+600000).toISOString()};
}
export function validateQuote(response,request,{now=Date.now(),maxInput,minOutput='1'}={}){
  const echo=response?.quoteRequest,q=response?.quote;
  assert(echo&&q,'INVALID_QUOTE','Provider quote and echoed request required');
  for(const [key,value] of Object.entries(request))assert(canonical(echo[key])===canonical(value),'QUOTE_CHANGED',`Provider changed ${key}`);
  const extra=new Set(['depositMode','confidentiality','quoteWaitingTimeMs','insured','appFees']);
  assert(Object.keys(echo).every(k=>k in request||extra.has(k)),'QUOTE_CHANGED','Unexpected provider option');
  assert((!echo.depositMode||echo.depositMode==='SIMPLE')&&(!echo.confidentiality||echo.confidentiality==='public')&&(!echo.insured),'QUOTE_CHANGED','Unexpected private, insured or memo route');
  const fees=echo.appFees;
  assert(fees===undefined||(Array.isArray(fees)&&(fees.length===0||(fees.length===1&&fees[0]?.recipient===FEE_RECIPIENT&&fees[0].fee===1
    &&(fees[0].limitOrderId===undefined||fees[0].limitOrderId===null)&&Object.keys(fees[0]).every(k=>['recipient','fee','limitOrderId'].includes(k))))),'FEE_CHANGED','Unexpected upstream app fee');
  assert(Date.parse(request.deadline)>now+30000,'EXPIRED_QUOTE','Route deadline is too close');
  assert(uint(q.amountIn)>0n&&uint(q.minAmountIn)>0n&&uint(q.minAmountIn)<=uint(q.amountIn),'INVALID_QUOTE','Invalid input bounds');
  assert(uint(q.amountIn)<=uint(maxInput),'INPUT_CAP','Quoted input exceeds the route cap');
  if(request.swapType==='EXACT_OUTPUT')assert(q.amountOut===request.amount&&q.minAmountOut===request.amount,'OUTPUT_CHANGED','Exact output changed');
  else assert(q.amountIn===request.amount&&uint(q.minAmountOut)<=uint(q.amountOut)&&uint(q.minAmountOut)>=uint(minOutput),'OUTPUT_CHANGED','Minimum output was not met');
  assert(!q.depositMemo&&!q.memo&&!q.customRecipientMsg,'QUOTE_CHANGED','Unexpected deposit memo or callback');
  if(request.dry)assert(!q.depositAddress,'INVALID_QUOTE','Dry quote must not allocate an address');
  else assert(typeof q.depositAddress==='string'&&(request.depositType==='ORIGIN_CHAIN'?evm(q.depositAddress):walletId(q.depositAddress)===q.depositAddress),'INVALID_QUOTE','Invalid route deposit address');
  if(q.deadline)assert(Date.parse(q.deadline)>now+30000,'EXPIRED_QUOTE','Provider quote already expired');
  return response;
}
export class OneClick {
  constructor({apiKey,fetchImpl=fetch}){Object.defineProperty(this,'apiKey',{value:apiKey});this.fetch=fetchImpl;}
  async request(path,body){
    let response;
    try{response=await this.fetch(MAINNET.oneClick+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(this.apiKey?{'X-API-Key':this.apiKey}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});}
    catch{throw new AppError('ROUTE_UNAVAILABLE','Routing provider is temporarily unavailable',503);}
    const value=await response.json();
    const minimum=response.status===400&&typeof value?.message==='string'&&value.message.match(/^Amount is too low for bridge, try at least ([0-9]{1,18})$/);
    if(minimum){const micro=BigInt(minimum[1]),label=(micro/1000000n).toString()+'.'+(micro%1000000n).toString().padStart(6,'0');throw new AppError('ROUTE_MINIMUM',`This bridge currently requires at least ${label} USDC. Request a larger quote; no transfer was sent.`,409);}
    assert(response.ok,'ROUTE_REJECTED',`Routing provider rejected the request (HTTP ${response.status})`,502);return value;
  }
  async quote(options){
    const now=options.now??Date.now(),request=routeRequest({...options,now});
    const response=validateQuote(await this.request('/quote',request),request,{now,maxInput:options.maxInput,minOutput:options.minOutput});
    const expiresAt=new Date(Math.min(now+120000,Date.parse(request.deadline),response.quote.deadline?Date.parse(response.quote.deadline):Infinity)).toISOString();
    const plan={schema:'everywhere-route/v1',direction:options.direction,wallet:walletId(options.wallet),createdAt:new Date(now).toISOString(),expiresAt,request,response};
    return {...plan,planId:hashObject(plan)};
  }
  async status(plan){return this.request('/status?depositAddress='+encodeURIComponent(plan.response.quote.depositAddress));}
  async submit(plan,txHash){return this.request('/deposit/submit',{txHash,depositAddress:plan.response.quote.depositAddress});}
}
export function validateRoutePlan(plan,{now=Date.now(),maxInput,minOutput='1'}={}){
  const {planId,...body}=plan;assert(hashObject(body)===planId,'PLAN_CHANGED','Route plan changed');
  assert(!plan.request.dry&&Date.parse(plan.expiresAt)>now&&Date.parse(plan.createdAt)<=now+5000&&Date.parse(plan.expiresAt)-Date.parse(plan.createdAt)<=120000,'EXPIRED_QUOTE','Fresh executable route required');
  const expected=routeRequest({direction:plan.direction,wallet:plan.wallet,amount:plan.request.amount,dry:false,now:Date.parse(plan.createdAt)});
  assert(canonical(expected)===canonical(plan.request),'PLAN_CHANGED','Route does not match its intended direction and original wallet');
  validateQuote(plan.response,plan.request,{now,maxInput,minOutput});return plan;
}
