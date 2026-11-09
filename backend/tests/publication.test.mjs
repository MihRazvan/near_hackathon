import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { Publication, verifyWalletCall } from '../src/publication.mjs';
import { effectiveCodeHash } from '../src/rpc.mjs';

test('publication binds seller, immutable global code, dates and exact wallet transaction; repeated prepares reuse the original plan',async()=>{
 const store=new Store(),owner='seller.near',factory={accountId:'factory.near',codeHash:'factory-code',campaignSha256:'07'.repeat(32)};
 const terms={spot_id:'spot-1',published_terms_sha256:Buffer.alloc(32,9).toString('base64')};
 store.insert('sale','sale',owner,{spots:[{id:'spot-1',priceCents:'10'}],arbiterId:'arbiter.near'});
 const config={factory,assets:{nearUsdc:'usdc.near',intentsId:'intents.near'}};
 const reads={block:async()=>({}),account:async()=>({code_hash:'factory-code'}),view:async()=>({campaign_code_hash:Buffer.alloc(32,7).toString('base64'),ft_contract_id:'usdc.near',intents_contract_id:'intents.near',arbiter_id:'arbiter.near',creation_deposit:'510000000000000000000000'})};
 const service=new Publication({store,reads,config,marketplace:{publication:()=>({terms:[terms]})}});
 try{
  const p=(await service.prepare(owner,'sale')).plans[0],again=(await service.prepare(owner,'sale')).plans[0];assert.equal(p.id,again.id);
  assert.equal(p.plan.transaction.signerId,owner);assert.equal(p.plan.transaction.actions[0].params.args.initial_price_cents,'10');
  assert.deepEqual(p.plan.transaction.actions[0].params.args.terms,terms);
  await assert.rejects(service.prepare('intruder.near','sale'),{code:'NOT_FOUND'});
  const expected=p.plan.transaction,a=expected.actions[0].params,hash='1'.repeat(32),outcome={transaction:{hash,signer_id:owner,receiver_id:factory.accountId,
   actions:[{FunctionCall:{method_name:a.methodName,args:Buffer.from(JSON.stringify(a.args)).toString('base64'),gas:Number(a.gas),deposit:a.deposit}}]}};
  verifyWalletCall(outcome,expected,hash);outcome.transaction.signer_id='intruder.near';assert.throws(()=>verifyWalletCall(outcome,expected,hash),{code:'TRANSACTION_CHANGED'});
  reads.account=async()=>({code_hash:'changed'});await assert.rejects(service.prepare(owner,'sale'),{code:'FACTORY_CHANGED'});
 }finally{store.close();}
});
test('immutable global code resolves to its hash; mutable publisher references cannot qualify',()=>{
 assert.equal(effectiveCodeHash({code_hash:'zero',global_contract_hash:'immutable'}),'immutable');
 assert.throws(()=>effectiveCodeHash({global_contract_account_id:'publisher.near'}),{code:'MUTABLE_GLOBAL_CODE'});
});
