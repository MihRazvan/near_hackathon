import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { NativeActions } from '../src/native-actions.mjs';

test('native action preparation checks current NFT authority and exact artwork revision; confirmation binds actual wallet transaction args',async()=>{
 const store=new Store(),s={codeHash:'pinned',state:{seller_id:'seller.near',arbiter_id:'arbiter.near',nominated_recipient:'owner.near',nft_minted:true,artwork_locked:false},
  rights:{active:true,locked:false,current_owner_id:'owner.near',revision:'2',proposal:{revision:'2'}},campaign:{}};
 const media=store.insert('media','artifact','owner.near',{status:'verified',uri:'ipfs://example',sha256:'11'.repeat(32)});let outcome;
 const reads={rpc:{call:async()=>outcome},account:async()=>({})},actions=new NativeActions({store,chain:{snapshot:async()=>s},reads});
 try{
  await assert.rejects(actions.prepare('former.near',{contractId:'campaign.near',kind:'artwork',mediaId:media.id}),/current placement/);
  await assert.rejects(actions.prepare('seller.near',{contractId:'campaign.near',kind:'lock-artwork',expectedRevision:'1'}),/current artwork/);
  const plan=await actions.prepare('owner.near',{contractId:'campaign.near',kind:'artwork',mediaId:media.id}),p=plan.transaction.actions[0].params,hash='1'.repeat(44),status={SuccessValue:''};
  outcome={final_execution_status:'FINAL',status,transaction_outcome:{outcome:{status}},transaction:{hash,signer_id:'owner.near',receiver_id:'campaign.near',actions:[{FunctionCall:{method_name:p.methodName,args:Buffer.from(JSON.stringify(p.args)).toString('base64'),deposit:p.deposit,gas:Number(p.gas)}}]},receipts_outcome:[{outcome:{status}}]};
  const original=outcome.transaction.actions[0].FunctionCall.args;outcome.transaction.actions[0].FunctionCall.args=Buffer.from('{}').toString('base64');
  await assert.rejects(actions.confirm('owner.near',plan.planId,hash),/arguments differ/);outcome.transaction.actions[0].FunctionCall.args=original;
  assert.equal((await actions.confirm('owner.near',plan.planId,hash)).status,'confirmed');await assert.rejects(actions.confirm('other.near',plan.planId,hash),/not found/);
 }finally{store.close();}
});
test('settlement preparation distinguishes already settled state from missing prerequisites',async()=>{
 const store=new Store(),s={codeHash:'pinned',state:{seller_id:'seller.near',arbiter_id:'arbiter.near',outcome:'success',refund_end_ns:'0',cutoff_ns:'0',artwork_locked:true},rights:{},campaign:{delivery_proof:{},open_issues:0,issues:{}}};
 const actions=new NativeActions({store,chain:{snapshot:async()=>s},reads:{},now:()=>1800000000000});try{
  for(const kind of ['finalize-success','finalize-failure'])await assert.rejects(actions.prepare('arbiter.near',{contractId:'campaign.near',kind}),{code:'CAMPAIGN_SETTLED'});
  s.state.outcome='open';s.state.refund_end_ns='9999999999999999999';await assert.rejects(actions.prepare('arbiter.near',{contractId:'campaign.near',kind:'finalize-success'}),{code:'REVIEW_WINDOW_OPEN'});
  s.state.refund_end_ns='0';s.state.artwork_locked=false;await assert.rejects(actions.prepare('arbiter.near',{contractId:'campaign.near',kind:'finalize-success'}),{code:'ARTWORK_NOT_LOCKED'});
  s.state.artwork_locked=true;s.campaign.delivery_proof=null;await assert.rejects(actions.prepare('arbiter.near',{contractId:'campaign.near',kind:'finalize-success'}),{code:'DELIVERY_PROOF_REQUIRED'});
 }finally{store.close();}
});
test('a verified final native receipt does not regress if upstream history is unavailable',async()=>{
 const store=new Store();try{const plan={planId:'final'};store.insert('native-plan','final','owner.near',{plan,status:'confirmed',transactionHash:'1'.repeat(44)});const actions=new NativeActions({store,reads:{rpc:{call:async()=>assert.fail('final receipts must remain final')}}});assert.equal((await actions.confirm('owner.near','final','1'.repeat(44))).status,'confirmed');await assert.rejects(actions.confirm('owner.near','final','2'.repeat(44)),{code:'TRANSACTION_CHANGED'});}finally{store.close();}
});

test('native hub preparation retains creative-transfer consent, controller and revision in its stored wallet plan',async()=>{
 const now=1800000000000,ns=delta=>String(BigInt(now+delta)*1000000n),contractId='offer-'+'a'.repeat(32),owner='owner.near',recipient='0x'+'22'.repeat(20),store=new Store();
 const snapshot={mode:'hub',accountId:contractId,offerId:contractId,receiverId:'hub.near',codeHash:'qualified-hub',state:{outcome:'open',nft_minted:true,artwork_locked:false,cutoff_ns:ns(-60000)},rights:{current_owner_id:owner,bidding_closed:true,active:true,locked:false,revision:'3'},campaign:{terms:{artwork_due_ns:ns(45000)}}};
 store.insert('deployment',contractId,owner,{mode:'hub'});
 const actions=new NativeActions({store,chain:{snapshot:async id=>{assert.equal(id,contractId);return snapshot;}},reads:{account:async()=>assert.fail('EVM recipients do not need native registration')},now:()=>now});
 const input={contractId,kind:'transfer',receiverId:recipient,purpose:'creative-control',controlAcknowledged:true,expectedController:owner,expectedRevision:'3'};
 try{
  const plan=await actions.prepare(owner,input);assert.equal(plan.purpose,'creative-control');assert.equal(plan.controlAcknowledged,true);assert.equal(plan.expectedController,owner);assert.equal(plan.expectedRevision,'3');assert.equal(plan.artworkDueNs,ns(45000));assert.equal(plan.expiresAt,new Date(now+40000).toISOString());
  assert.equal(plan.transaction.signerId,owner);assert.equal(plan.transaction.receiverId,'hub.near');assert.deepEqual(plan.transaction.actions[0].params,{methodName:'nft_transfer',args:{offer_id:contractId,receiver_id:recipient,token_id:contractId},gas:'50000000000000',deposit:'1'});assert.deepEqual(store.get('native-plan',plan.planId).plan,plan);
  await assert.rejects(actions.prepare(owner,{...input,controlAcknowledged:false}),{code:'TRANSFER_ACKNOWLEDGEMENT_REQUIRED'});
  await assert.rejects(actions.prepare(owner,{...input,expectedController:'former.near'}),{code:'NFT_OWNER_REQUIRED'});
  await assert.rejects(actions.prepare(owner,{...input,expectedRevision:'2'}),{code:'STALE_ARTWORK'});
  assert.equal(store.list('native-plan',owner).length,1,'invalid transfers must not create wallet plans');
 }finally{store.close();}
});
