#!/usr/bin/env node
// Explicit local operator commands. Importing backend services never loads keys or sends money.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { runtime, qualifyNetwork } from '../src/runtime.mjs';
import { assert } from '../src/core.mjs';
import { USDC_ABI } from '../src/base-executor.mjs';
import { Qualification } from '../src/qualification.mjs';

export async function command(args){
 const r=await runtime();
 try{
  const [verb,selected]=args;
  if(verb==='repair-settlement')return await new Qualification(r).repairSettlement(selected);
  if(verb==='rebroadcast'){const op=await r.near.rebroadcast(selected);return {id:op.id,phase:op.phase,hash:op.transaction_hash};}
  if(verb==='rights')return await new Qualification(r).rights(selected);
  if(['campaign','buy','claim','finalize','recover','inspect'].includes(verb)){
   const qualification=new Qualification(r);
   if(verb==='campaign'){const c=await qualification.campaign(selected);return {accountId:c.deploymentId,biddingClose:new Date(Number(BigInt(c.terms.bidding_close_ns)/1000000n)).toISOString(),synthetic:true};}
   if(verb==='buy')return await qualification.buy(selected,args[2]);
   if(verb==='claim')return await qualification.claim(selected,args[2],args[3]);
   return await qualification[verb](selected);
  }
  if(verb==='preflight')return await qualifyNetwork(r);
  if(verb==='status'){
   const operations=r.store.db.prepare('SELECT id,kind,scope,phase,transaction_hash FROM operations ORDER BY created_at').all();
   for(const op of operations){if(op.kind==='base-fund')await r.source.reconcile(op.id);if(op.kind==='near')await r.near.reconcile(op.id);}
   return {budget:r.budget.totals(),operations:r.store.db.prepare('SELECT id,kind,scope,phase,transaction_hash FROM operations ORDER BY created_at').all()};
  }
  if(verb==='balances'){
   const result={treasury:(await r.reads.account(r.config.treasury)).amount};
   for(const letter of ['A','B']){
    const account=privateKeyToAccount(r.config.keys['buyer'+letter]);
    result[letter]={wallet:account.address,baseUsdc:(await r.client.readContract({address:r.config.assets.baseUsdc,abi:USDC_ABI,functionName:'balanceOf',args:[account.address]})).toString(),
     baseEth:(await r.client.getBalance({address:account.address})).toString(),intentsUsdc:await r.reads.view(r.config.assets.intentsId,'mt_balance_of',{account_id:account.address.toLowerCase(),token_id:r.config.assets.nearAsset})};
   }return result;
  }
  if(verb==='fund'){
   assert(['A','B'].includes(selected),'INVALID_BUYER','Choose dedicated buyer A or B');assert(r.config.enabled,'MAINNET_DISABLED','Enable the explicitly authorized local test run first');
   await qualifyNetwork(r);
   const account=privateKeyToAccount(r.config.keys['buyer'+selected]),wallet=account.address.toLowerCase(),id='qualification-fund-'+selected;
   const prior=r.store.operation(id);if(prior){const operation=await r.source.reconcile(id);return {id,phase:operation.phase,hash:operation.transaction_hash};}
   const balance=await r.reads.view(r.config.assets.intentsId,'mt_balance_of',{account_id:wallet,token_id:r.config.assets.nearAsset});
   assert(balance==='0','ALREADY_FUNDED','Wallet already has an Intents balance; reuse it instead of funding again');
   const plan=await r.routes.quote({direction:'fund',wallet,amount:'250000',maxInput:'300000',dry:false});
   const saved=r.store.get('route',id);
   if(saved)r.store.update('route',id,wallet,saved.version,{plan});else r.store.insert('route',id,wallet,{plan});
   const operation=await r.source.fund({id,plan,account});
   // Notification is optional: receipt monitoring and automatic deposit detection remain authoritative.
   let notified=false;try{await r.routes.submit(plan,operation.transaction_hash);notified=true;}catch{}
   return {id,phase:operation.phase,hash:operation.transaction_hash,amountIn:plan.response.quote.amountIn,expectedIntentsUsdc:'250000',notified};
  }
  if(verb==='routes'){
   const output=[];for(const row of r.store.list('route'))output.push({id:row.id,wallet:row.owner,status:await r.routes.status(row.plan)});return output;
  }
  assert(false,'UNKNOWN_COMMAND','Use preflight, balances, fund A|B, routes or status');
 }finally{r.store.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await command(process.argv.slice(2)),null,2));}
 catch(error){console.error(JSON.stringify({code:error.code??'OPERATION_FAILED',message:error.code?error.message:'Operation failed; secrets and upstream payloads omitted'}));process.exitCode=1;}
}
