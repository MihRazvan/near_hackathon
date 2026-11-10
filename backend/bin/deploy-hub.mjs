#!/usr/bin/env node
import { runtime } from '../src/runtime.mjs';
import { ChainService } from '../src/chain-service.mjs';
import { HubDeployment, hubDeploymentSummary } from '../src/hub-deployment.mjs';
import { assert } from '../src/core.mjs';

const args=process.argv.slice(2),r=await runtime();
try{
 const service=new HubDeployment({...r,chain:new ChainService(r)});
 if(args[0]==='prepare'){
  assert(args.length<=3,'INVALID_ARGUMENT','Usage: deploy-hub.mjs prepare [sponsored-offers] [arbiter-id]');
  const record=await service.prepare({sponsoredOffers:Number(args[1]??0),...(args[2]?{arbiterId:args[2]}:{})});console.log(JSON.stringify(hubDeploymentSummary(record),null,2));
 }else if(args[0]==='apply'){
  assert(args.length===2&&/^[0-9a-f]{64}$/.test(args[1]),'INVALID_ARGUMENT','Usage: deploy-hub.mjs apply <reviewed-plan-id>');
  const result=await service.apply(args[1]);console.log(JSON.stringify(result.operation?{stage:result.stage,operationId:result.operation.id,phase:result.operation.phase,transactionHash:result.operation.transaction_hash}:result,null,2));
 }else assert(false,'INVALID_ARGUMENT','Usage: deploy-hub.mjs prepare [sponsored-offers] [arbiter-id] | apply <reviewed-plan-id>');
}finally{r.store.close();}
