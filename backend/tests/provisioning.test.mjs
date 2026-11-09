import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import{join}from'node:path';
import {Store}from'../src/store.mjs';import{Budget}from'../src/budget.mjs';import{Provisioning}from'../src/provisioning.mjs';import{sha256}from'../src/core.mjs';
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'everywhere-publication-')),bytes=Buffer.from('reviewed-test-artifact');await writeFile(join(dir,'campaign.wasm'),bytes);await writeFile(join(dir,'campaign-manifest.json'),JSON.stringify({bytes:bytes.length,sha256:sha256(bytes)}));
 const store=new Store(),limits={sourceUsdc:'0',baseGas:'0',nearFees:'1000000000000000000000000',nearAllocation:'7500000000000000000000000',nearAllocationGross:'16000000000000000000000000'},budget=new Budget(store,limits);
 const config={network:'mainnet',enabled:true,allowRecoverablePublication:true,treasury:'treasury.near',treasuryFloor:'5000000000000000000000000',limits,artifact:join(dir,'campaign.wasm'),assets:{nearUsdc:'usdc.near',intentsId:'intents.near'}};
 const sale=store.insert('sale','sale','seller.near',{status:'draft',arbiterId:'arbiter.near',schedule:{biddingClose:new Date(Date.now()+3600000).toISOString()},spots:[{id:'spot',priceCents:'1'}]});
 const reads={status:async()=>{},block:async()=>({header:{hash:'block'}}),account:async()=>({amount:'12473000000000000000000000',storage_usage:0}),rpc:{call:async method=>method==='gas_price'?{gas_price:'100000000'}:{runtime_config:{storage_amount_per_byte:'10000000000000000000',min_gas_purchase_price:'1000000000'}}}};
 const calls=[],chain={vault:{identity:async label=>({accountId:'c'.repeat(64)})},fundIdentity:async(label,amount)=>{calls.push('fund');return {operation:{id:'identity-fund-'+label}};},deploy:async()=>{calls.push('deploy');return {operation:{id:'deploy-original'}};},near:{reconcile:async()=>({phase:'confirmed'})}};
 const marketplace={publication:()=>({publishedTermsHash:'terms-hash',terms:[{spot_id:'spot'}]}),publish:async()=>calls.push('publish')};
 const p=new Provisioning({store,chain,marketplace,reads,budget,config});return{p,store,budget,config,chain,calls,close:async()=>{store.close();await rm(dir,{recursive:true,force:true});}};
}
test('recoverable publication quotes storage and fees without broadcasting; rejects changed artifact',async()=>{
 const f=await fixture();try{const r=await f.p.prepare('seller.near','sale');assert.equal(r.assessment.ready,true);assert.equal(r.plan.collateralPerSpot,'7150000000000000000000000');assert.equal(r.plan.globalCodePublication,false);assert.deepEqual(f.calls,[]);assert.equal(f.store.db.prepare('SELECT count(*) n FROM operations').get().n,0);assert.equal((await f.p.prepare('seller.near','sale')).id,r.id);await writeFile(f.config.artifact,'changed');await assert.rejects(f.p.prepare('seller.near','sale'),{code:'ARTIFACT_CHANGED'});}finally{await f.close();}
});
test('publication exceeding treasury floor or allocation cap cannot start, even after review',async()=>{
 const f=await fixture();try{f.config.treasuryFloor='12000000000000000000000000';f.config.limits.nearAllocation='1';const r=await f.p.prepare('seller.near','sale');assert.equal(r.assessment.ready,false);assert.ok(r.assessment.blocks.some(b=>b.code==='TREASURY_FLOOR'));assert.ok(r.assessment.blocks.some(b=>b.category==='nearAllocation'));await assert.rejects(f.p.start('seller.near',r.id),{code:'REVIEW_REQUIRED'});assert.equal((await f.p.start('seller.near',r.id,{reviewed:true})).status,'budget-blocked');assert.deepEqual(f.calls,[]);}finally{await f.close();}
});
test('interrupted funding waits on its original operation without deploying another contract',async()=>{
 const f=await fixture();try{const r=await f.p.prepare('seller.near','sale');f.p.wait=async()=> 'pending';await f.p.perform(r);assert.deepEqual(f.calls,['fund']);assert.equal(f.store.get('provision-plan',r.id).status,'waiting-original-receipt');await assert.rejects(f.p.start('other.near',r.id,{reviewed:true}),{code:'NOT_FOUND'});}finally{await f.close();}
});
