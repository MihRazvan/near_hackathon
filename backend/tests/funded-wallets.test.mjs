import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { Auth } from '../src/auth.mjs';
import { FundedWallets } from '../src/funded-wallets.mjs';
import { KeyVault } from '../src/vault.mjs';
import { WalletRequests } from '../src/wallet-requests.mjs';
async function setup(enabled=true){
 const dir=await mkdtemp(join(tmpdir(),'everywhere-funded-')),store=new Store(),vault=new KeyVault(join(dir,'keys'));
 const owner=await vault.identity('placement-owner'),buyerKey=generatePrivateKey(),buyer=privateKeyToAccount(buyerKey);
 const config={network:'mainnet',enabled:true,allowFundedWallets:enabled,origin:'http://127.0.0.1:4318',keys:{buyerA:buyerKey}};
 const walletRequests=new WalletRequests({store}),sent=[];
 const funded=await new FundedWallets({config,store,chain:{vault},walletRequests,near:{execute:async value=>{sent.push(value);return {transaction_hash:'1'.repeat(44),phase:'broadcast'};}}}).load();
 return {config,store,owner,buyer,funded,walletRequests,sent,close:async()=>{store.close();await rm(dir,{recursive:true,force:true});}};
}
test('funded browser identities are opt-in and expose public identifiers only',async()=>{
 const f=await setup(false);try{assert.deepEqual(f.funded.list(),[]);await assert.rejects(f.funded.signIn({wallet:f.buyer.address}),{code:'DEVELOPMENT_WALLETS_DISABLED'});}finally{await f.close();}
 const g=await setup();try{const json=JSON.stringify(g.funded.list());assert.equal(g.funded.list().length,2);assert.ok(!json.includes('privateKey'));assert.ok(!json.includes(g.config.keys.buyerA));}finally{await g.close();}
});
test('development sign-in signs only fresh server-owned origin-bound challenges for known identities',async()=>{
 const f=await setup();try{
  const auth=new Auth(f.store,{origin:f.config.origin,readKeys:async()=>[{public_key:f.owner.publicKey,access_key:{permission:'FullAccess'}}]});
  for(const wallet of [f.buyer.address,f.owner.accountId]){const challenge=auth.challenge(wallet),signed=await f.funded.signIn({wallet,challengeId:challenge.id});const result=await auth.verify(signed);assert.equal(result.wallet,wallet.toLowerCase());await assert.rejects(f.funded.signIn({wallet,challengeId:challenge.id}),{code:'EXPIRED_CHALLENGE'});}
  const c=auth.challenge(f.buyer.address);await assert.rejects(f.funded.signIn({wallet:f.owner.accountId,challengeId:c.id}),{code:'EXPIRED_CHALLENGE'});
 }finally{await f.close();}
});
test('funded native signer requires the dispatched owner-bound stored action and delegates to durable budgeted executor',async()=>{
 const f=await setup();try{
  const actor=f.owner.accountId,plan={planId:'native',codeHash:'code-pin',transaction:{signerId:actor,receiverId:'campaign.near',actions:[{type:'FunctionCall',params:{methodName:'mint_final_placement',args:{},gas:'60000000000000',deposit:'10000000000000000000000'}}]}};
  f.store.insert('native-plan',plan.planId,actor,{plan,status:'prepared'});const r=f.walletRequests.begin(actor,{kind:'native',planId:plan.planId});
  await assert.rejects(f.funded.sendNative(actor,{requestId:r.id}),{code:'INVALID_REQUEST'});assert.equal(f.sent.length,0);
  f.walletRequests.dispatch(actor,r.id);await assert.rejects(f.funded.sendNative(f.buyer.address,{requestId:r.id}),{code:'NOT_FOUND'});
  await f.funded.sendNative(actor,{requestId:r.id});assert.equal(f.sent.length,1);assert.equal(f.sent[0].id,'funded-near-'+r.id);assert.equal(f.sent[0].plan.expectedReceiverCodeHash,'code-pin');assert.deepEqual(f.sent[0].plan.actions,[{type:'call',method:'mint_final_placement',args:{},gas:'60000000000000',deposit:'10000000000000000000000'}]);assert.equal(f.walletRequests.owned(actor,r.id).transactionHash,'1'.repeat(44));
 }finally{await f.close();}
});
