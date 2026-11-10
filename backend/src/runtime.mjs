import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { join } from 'node:path';
import { importState } from './state-import.mjs';
import { loadConfig } from './config.mjs';
import { Store } from './store.mjs';
import { Budget } from './budget.mjs';
import { Rpc, NearReads, effectiveCodeHash } from './rpc.mjs';
import { NearExecutor } from './near-executor.mjs';
import { BaseExecutor, USDC_ABI } from './base-executor.mjs';
import { OneClick } from './oneclick.mjs';
import { assert } from './core.mjs';

export async function runtime(){
 const config=await loadConfig();await importState({config});
 const store=new Store(join(config.stateDir,'state.sqlite')),budget=new Budget(store,config.limits);
 const reads=new NearReads(new Rpc(config.nearRpc,{intervalMs:config.nearRpcIntervalMs})),client=createPublicClient({chain:base,transport:http(config.baseRpc,{retryCount:0,timeout:15000})});
 const near=new NearExecutor({store,budget,reads,config}),source=new BaseExecutor({store,budget,client,config}),routes=new OneClick({apiKey:config.keys.oneClick});
 return {config,store,budget,reads,client,near,source,routes};
}
export async function qualifyNetwork(r){
 const {reads,client,config}=r,a=config.assets;
 await reads.status();assert(await client.getChainId()===a.chainId,'WRONG_NETWORK','Base mainnet required');
 const block=await reads.block();
 const [intents,usdc,fee,paused,decimals,treasury,keys]=await Promise.all([
  reads.account(a.intentsId,block),reads.account(a.nearUsdc,block),reads.view(a.intentsId,'fee',{},block),reads.view(a.intentsId,'pa_all_paused',{},block),
  client.readContract({address:a.baseUsdc,abi:USDC_ABI,functionName:'decimals'}),reads.account(config.treasury,block),reads.keys(config.treasury,block)]);
 assert(intents.code_hash===a.intentsCodeHash&&usdc.code_hash===a.usdcCodeHash,'PROTOCOL_CHANGED','Protocol code differs from the qualified deployments');
 assert(fee===1&&(paused===null||(Array.isArray(paused)&&paused.length===0)),'PROTOCOL_UNAVAILABLE','Qualified fee and unpaused Intents required');
 assert(decimals===6,'ASSET_CHANGED','Base USDC decimals changed');
 assert(effectiveCodeHash(treasury)==='11111111111111111111111111111111'&&keys.some(k=>k.access_key.permission==='FullAccess'),'TREASURY_CHANGED','Recovery treasury must retain full access and no contract');
 return {network:'mainnet',baseChainId:a.chainId,blockHash:block.header.hash,fee,treasuryBalance:treasury.amount,budget:r.budget.totals()};
}
