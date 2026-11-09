import test from 'node:test';import assert from 'node:assert/strict';
import {Store}from'../src/store.mjs';import {Budget}from'../src/budget.mjs';import{ProvisionRecovery}from'../src/provision-recovery.mjs';
function fixture(){
 const store=new Store(),budget=new Budget(store,Object.fromEntries(['sourceUsdc','baseGas','nearFees','nearAllocation','nearAllocationGross'].map(k=>[k,'100']))),accountId='a'.repeat(64),plan={spots:[{spotId:'spot',label:'publish-test',contractId:accountId}],codeHash:'reviewed'};
 store.insert('provision-plan','plan','owner.near',{plan});const op=budget.reserve({id:'identity-fund-publish-test',kind:'near',scope:'treasury.near',plan:{allocationAccount:accountId},amounts:{nearAllocation:'10',nearAllocationGross:'10',nearFees:'1'}}).operation;store.transition(op.id,['reserved'],'confirmed',{transactionHash:'hash'});budget.settle(op.id,{nearAllocation:'10',nearAllocationGross:'10',nearFees:'1'},{evidence:{final:true,transactionHash:'hash'}});
 const snapshot={state:{outcome:'success',total_pending:'0',nft_minted:true},liabilities:'0',escrowBalance:'0'},sent=[];
 const r=new ProvisionRecovery({store,budget,config:{network:'mainnet',treasury:'treasury.near',assets:{nearUsdc:'usdc.near',intentsId:'intents.near',nearAsset:'asset'}},reads:{block:async()=>({}),account:async()=>({amount:'10',code_hash:'reviewed'}),view:async()=> '0'},chain:{snapshot:async()=>snapshot,vault:{identity:async()=>({accountId,signer:{}})}},near:{execute:async value=>{sent.push(value);return{phase:'broadcast',transaction_hash:'hash'};}}});return{r,store,snapshot,sent,close:()=>store.close()};
}
test('development collateral recovery requires terminal zero liabilities and explicit NFT retirement',async()=>{
 const f=fixture();try{
  assert.equal((await f.r.quote('plan','spot')).deletesNFT,true);await assert.rejects(f.r.execute('plan','spot'),{code:'NFT_RETIREMENT_REQUIRED'});assert.deepEqual(f.sent,[]);
  f.snapshot.liabilities='1';await assert.rejects(f.r.quote('plan','spot'),{code:'RECOVERY_BLOCKED'});f.snapshot.liabilities='0';f.snapshot.state.outcome='open';await assert.rejects(f.r.quote('plan','spot'),{code:'RECOVERY_BLOCKED'});f.snapshot.state.outcome='success';
  await f.r.execute('plan','spot',{retireNft:true});assert.equal(f.sent.length,1);assert.equal(f.sent[0].plan.expectedReceiverCodeHash,'reviewed');assert.equal(f.sent[0].plan.actions[0].beneficiaryId,'treasury.near');assert.equal(f.r.budget.totals().nearAllocation,'10');
 }finally{f.close();}
});
test('retirement refuses an active signer request and unexpected Intents balance',async()=>{
 const f=fixture();try{f.store.insert('near-lock','a'.repeat(64),'a'.repeat(64),{operationId:'pending'});await assert.rejects(f.r.quote('plan','spot'),{code:'RECOVERY_BLOCKED'});f.store.db.prepare("DELETE FROM objects WHERE kind='near-lock'").run();f.r.reads.view=async()=> '1';await assert.rejects(f.r.quote('plan','spot'),{code:'RECOVERY_BLOCKED'});assert.deepEqual(f.sent,[]);}finally{f.close();}
});
