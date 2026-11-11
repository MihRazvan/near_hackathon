import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KeyVault } from '../src/vault.mjs';
import { ChainService } from '../src/chain-service.mjs';
import { Store } from '../src/store.mjs';

test('generated implicit identities survive restart, retain a matching recovery key, and use owner-only files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-keys-'));
 try{const first=await new KeyVault(dir).identity('campaign-test'),again=await new KeyVault(dir).identity('campaign-test');
  assert.equal(first.accountId,again.accountId);assert.equal(first.publicKey,(await first.signer.getPublicKey()).toString());
  assert.equal(first.accountId.length,64);assert.equal((await stat(first.recoveryFile)).mode&0o077,0);
  await assert.rejects(new KeyVault(dir).identity('../unsafe'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('a refunded Intents transfer is not a purchase; acceptance requires exact contract event, payer, invoice, principal and round',()=>{
 const service=new ChainService({config:{stateDir:'/unused'}}),plan={signerId:'0x'+'11'.repeat(20),context:{contractId:'campaign.near',invoiceId:'invoice',amount:'10000',expectedRound:'0'}};
 const data={invoice_id:'invoice',buyer_id:plan.signerId,amount:'10000',round:'1'};
 const event={standard:'pitboard',version:'1.0.0',event:'purchase_accepted',data:[data]};
 const op=()=>({phase:'confirmed',result:{outcome:{receipts_outcome:[{outcome:{executor_id:'campaign.near',logs:['EVENT_JSON:'+JSON.stringify(event)]}}]}}});
 assert.equal(service.purchaseAccepted(plan,op()),true);
 for(const field of ['invoice_id','buyer_id','amount','round']){const original=data[field];data[field]='other';assert.equal(service.purchaseAccepted(plan,op()),false);data[field]=original;}
 const unrelated=op();unrelated.result.outcome.receipts_outcome[0].outcome.executor_id='other.near';assert.equal(service.purchaseAccepted(plan,unrelated),false);
 assert.equal(service.purchaseAccepted(plan,{phase:'confirmed',result:{outcome:{receipts_outcome:[]}}}),false);
});
test('exact principal can be purchased without a fictitious extra swap fee on an ordinary transfer intent',async()=>{
 const store=new Store(),wallet='0x'+'11'.repeat(20),now=Date.now();
 try{const service=new ChainService({store,config:{stateDir:'/unused',assets:{nearAsset:'nep141:usdc.near',intentsId:'intents.near'}},reads:{view:async(_contract,method)=>method==='is_invoice_used'?false:'100000'}});
  service.snapshot=async()=>({qualified:true,accountId:'campaign.near',codeHash:'qualified',observedAt:new Date(now).toISOString(),intentsFee:1,
   state:{outcome:'open',round:'0',next_price:'100000',holder:null,intents_contract_id:'intents.near',intents_token_id:'nep141:usdc.near'},
   campaign:{terms:{bidding_close_ns:String(BigInt(now+600000)*1000000n),published_terms_sha256:Buffer.alloc(32).toString('base64'),takeover_enabled:true}}});
  assert.equal((await service.preparePurchase({buyerId:wallet,contractId:'campaign.near',invoiceId:'exact-principal'})).context.amount,'100000');
 }finally{store.close();}
});
test('payout retries use a deterministic successor only after final failure and restored available credit',async()=>{
 const operations=new Map(),payer='buyer.near';let sends=0;
 const chain=Object.assign(Object.create(ChainService.prototype),{store:{operation:id=>operations.get(id)},near:{reconcile:async id=>operations.get(id)},snapshot:async()=>({credits:{[payer]:{available:'10000'}},state:{round:'1',outcome:'failure'}}),release:async({id})=>{sends++;const op={id,phase:'broadcast-unknown',transaction_hash:'hash-'+sends};operations.set(id,op);return op;}});
 const first=await chain.claimForWallet({contractId:'campaign.near',creditorId:payer});assert.equal((await chain.claimForWallet({contractId:'campaign.near',creditorId:payer})).id,first.id);assert.equal(sends,1);
 operations.set(first.id,{...operations.get(first.id),phase:'failed',result:{outcome:{final_execution_status:'FINAL'}}});const retry=await chain.claimForWallet({contractId:'campaign.near',creditorId:payer});assert.notEqual(retry.id,first.id);assert.equal((await chain.claimForWallet({contractId:'campaign.near',creditorId:payer})).id,retry.id);assert.equal(sends,2);
 operations.set(retry.id,{...operations.get(retry.id),phase:'failed',result:{}});await assert.rejects(chain.claimForWallet({contractId:'campaign.near',creditorId:payer}),{code:'RECONCILIATION_REQUIRED'});assert.equal(sends,2);
});

async function creativeRelayFixture(){
 const {privateKeyToAccount}=await import('viem/accounts'),{hubIntentPlan}=await import('../src/hub-actions.mjs');
 // Fixed public test key, never a funded or configured development wallet.
 const account=privateKeyToAccount('0x'+'11'.repeat(32)),wallet=account.address.toLowerCase(),store=new Store(),now=1800000000000,ns=delta=>String(BigInt(now+delta)*1000000n),offerId='offer-'+'a'.repeat(32);
 const snapshot={accountId:offerId,offerId,receiverId:'hub.near',mode:'hub',codeHash:'qualified-hub',state:{outcome:'open',nft_minted:true,artwork_locked:false,cutoff_ns:ns(-60000),intents_contract_id:'intents.near'},rights:{current_owner_id:wallet,bidding_closed:true,active:true,locked:false,revision:'3'},campaign:{terms:{artwork_due_ns:ns(240000)}}};
 const plan=await hubIntentPlan({store,reads:{},snapshot,wallet,input:{kind:'transfer',receiverId:'0x'+'22'.repeat(20),purpose:'creative-control',controlAcknowledged:true,expectedController:wallet,expectedRevision:'3'},now});
 store.insert('intent',plan.planId,wallet,{plan,status:'prepared'});
 const f={wallet,store,snapshot,plan,clock:now,sends:[],snapshots:0,reconciled:[],signature:await account.signMessage({message:plan.message})};
 f.service=new ChainService({store,config:{stateDir:'/unused',enabled:true,treasury:'hot.near',assets:{intentsId:'intents.near',intentsCodeHash:'qualified-intents'}},now:()=>f.clock,near:{reconcile:async id=>{f.reconciled.push(id);return store.operation(id);}}});
 f.service.snapshot=async id=>{assert.equal(id,offerId);f.snapshots++;return structuredClone(snapshot);};f.service.treasurySigner=async()=>({fixture:true});f.service.call=async action=>{f.sends.push(action);return {id:action.id,phase:'confirmed'};};
 f.relay=()=>f.service.relayUnlocked({buyerId:wallet,planId:plan.planId,signature:f.signature});return f;
}

test('creative-control relay freshly rejects changed owner, approval, revision and expiry before any dispatch',async t=>{
 for(const [name,change,code]of [
  ['new receipt owner',f=>f.snapshot.rights.current_owner_id='recipient.near','NFT_OWNER_REQUIRED'],
  ['artwork approved',f=>{f.snapshot.state.artwork_locked=true;f.snapshot.rights.locked=true;},'CREATIVE_TRANSFER_CLOSED'],
  ['new artwork revision',f=>f.snapshot.rights.revision='4','STALE_ARTWORK'],
  ['editing closed on chain',f=>f.snapshot.rights.active=false,'CREATIVE_TRANSFER_CLOSED'],
  ['signed deadline elapsed',f=>f.clock=Date.parse(f.plan.expiresAt),'EXPIRED_INTENT'],
 ])await t.test(name,async()=>{
  const f=await creativeRelayFixture();try{change(f);await assert.rejects(f.relay(),{code});assert.equal(f.sends.length,0);assert.equal(f.reconciled.length,0);assert.equal(f.store.get('intent',f.plan.planId).status,'prepared');assert.equal(f.store.operation('relay-'+f.plan.planId),null);}finally{f.store.close();}
 });
});

test('a current creative-controller signature dispatches only its exact original transfer plan',async()=>{
 const f=await creativeRelayFixture();try{const result=await f.relay();assert.equal(result.phase,'confirmed');assert.equal(f.snapshots,1);assert.equal(f.sends.length,1);const action=f.sends[0];assert.equal(action.id,'relay-'+f.plan.planId);assert.equal(action.receiverId,'intents.near');assert.equal(action.method,'execute_intents');assert.equal(action.args.signed.length,1);assert.equal(f.store.get('intent',f.plan.planId).operationId,action.id);assert.equal(f.store.get('intent',f.plan.planId).status,'confirmed');}finally{f.store.close();}
});

test('recorded creative transfers reconcile the original operation before expired or changed creative policy is considered',async()=>{
 const {Budget}=await import('../src/budget.mjs'),f=await creativeRelayFixture();
 try{
  const id='relay-'+f.plan.planId;new Budget(f.store,Object.fromEntries(['sourceUsdc','baseGas','nearFees','nearAllocation','nearAllocationGross'].map(key=>[key,'0']))).reserve({id,kind:'near',scope:'hot.near',plan:{originalIntentId:f.plan.planId},amounts:{}});f.store.transition(id,['reserved'],'broadcast-unknown',{transactionHash:'original-transaction'});
  f.clock=Date.parse(f.plan.expiresAt)+60000;f.snapshot.state.artwork_locked=true;f.snapshot.rights.current_owner_id='recipient.near';f.service.config.enabled=false;f.signature=undefined;f.service.snapshot=async()=>assert.fail('an already dispatched transfer must not prepare against new state');
  const result=await f.relay();assert.equal(result.id,id);assert.equal(result.phase,'broadcast-unknown');assert.equal(result.transaction_hash,'original-transaction');assert.deepEqual(f.reconciled,[id]);assert.equal(f.sends.length,0);assert.equal(f.store.get('intent',f.plan.planId).operationId,id);assert.equal(f.store.get('intent',f.plan.planId).status,'broadcast-unknown');
  await assert.rejects(f.service.relayUnlocked({buyerId:'0x'+'22'.repeat(20),planId:f.plan.planId}),{code:'WRONG_WALLET'});assert.deepEqual(f.reconciled,[id]);
 }finally{f.store.close();}
});
