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
