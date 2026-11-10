import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { sha256 } from '../src/core.mjs';
import { HubDeployment,hubDeploymentSummary } from '../src/hub-deployment.mjs';

test('shared deployment preparation only quotes explicit collateral and sponsorship; it never executes or prints code/recovery keys',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-hub-plan-')),store=new Store(),bytes=Buffer.from('fake wasm artifact');
 try{await writeFile(join(dir,'hub.wasm'),bytes);await writeFile(join(dir,'hub-manifest.json'),JSON.stringify({bytes:bytes.length,sha256:sha256(bytes),initializer:'new'}));
 const config={network:'mainnet',treasury:'treasury.near',defaultArbiter:'0x'+'44'.repeat(20),hubArtifact:join(dir,'hub.wasm'),assets:{nearUsdc:'usdc.near',intentsId:'intents.near'}},identity={accountId:'ab'.repeat(32)};let executions=0;
 const chain={vault:{identity:async()=>identity},near:{execute:async()=>{executions++;}},fundIdentity:async()=>{executions++;}},reads={status:async()=>{},block:async()=>({header:{hash:'block'}}),rpc:{call:async method=>method==='gas_price'?{gas_price:'100000000'}:{runtime_config:{storage_amount_per_byte:'10000000000000000000'},min_gas_price:'100000000'}}};
 const service=new HubDeployment({chain,store,reads,config}),record=await service.prepare({sponsoredOffers:4});assert.equal(executions,0);assert.equal(record.plan.sponsorDeposit,'2400000000000000000000000');assert.equal(record.plan.codeCollateral,String(BigInt(bytes.length)*10000000000000000000n));assert.equal(record.plan.deployPlan.actions[0].sha256,sha256(bytes));assert.equal(record.plan.deployPlan.actions[1].args.owner_id,'treasury.near');assert.equal(record.plan.deployPlan.actions[1].args.arbiter_id,config.defaultArbiter);
 const summary=hubDeploymentSummary(record);assert.equal(summary.deployPlan,undefined);assert(!JSON.stringify(summary).includes(bytes.toString('base64')));assert.equal((await service.prepare({sponsoredOffers:4})).id,record.id);await assert.rejects(service.apply(record.id),{code:'MAINNET_DISABLED'});assert.equal(executions,0);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
