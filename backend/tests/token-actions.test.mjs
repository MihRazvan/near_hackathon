import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { NativeActions } from '../src/native-actions.mjs';

test('native earnings withdrawal and redeposit are self-custodial; storage and both code pins are checked before signing',async()=>{
 const store=new Store(),assets={nearUsdc:'usdc.near',nearAsset:'nep141:usdc.near',intentsId:'intents.near',usdcCodeHash:'usdc-hash',intentsCodeHash:'intents-hash'};
 let registered=false,changed=false,balance='140000';
 const reads={block:async()=>({}),account:async id=>({code_hash:changed?'changed':id==='usdc.near'?'usdc-hash':'intents-hash'}),view:async(id,method)=>({
  storage_balance_of:registered?{}:null,storage_balance_bounds:{min:'1250000000000000000000'},mt_balance_of:balance,ft_balance_of:'10000'
 })[method]};
 const service=new NativeActions({store,reads,config:{assets},now:()=>1800000000000});
 try{
  const storage=await service.prepareToken('seller.near',{kind:'token-storage'});assert.equal(storage.transaction.receiverId,'usdc.near');assert.equal(storage.transaction.actions[0].params.args.account_id,'seller.near');
  await assert.rejects(service.prepareToken('seller.near',{kind:'withdraw-native',amount:'10000'}),{code:'STORAGE_REQUIRED'});
  registered=true;const withdrawal=await service.prepareToken('seller.near',{kind:'withdraw-native',amount:'10000',recipientId:'attacker.near'});
  assert.equal(withdrawal.transaction.receiverId,'intents.near');assert.deepEqual(withdrawal.transaction.actions[0].params.args,{token:'usdc.near',receiver_id:'seller.near',amount:'10000',memo:null,msg:null});
  const deposit=await service.prepareToken('seller.near',{kind:'deposit-intents',amount:'10000'});assert.equal(deposit.transaction.actions[0].params.args.msg,'seller.near');
  balance='0';await assert.rejects(service.prepareToken('seller.near',{kind:'withdraw-native',amount:'10000'}),{code:'INSUFFICIENT_INTENTS'});
  changed=true;await assert.rejects(service.prepareToken('seller.near',{kind:'deposit-intents',amount:'10000'}),{code:'ASSET_CHANGED'});
  await assert.rejects(service.prepareToken('0x'+'11'.repeat(20),{kind:'token-storage'}),{code:'NEAR_WALLET_REQUIRED'});
 }finally{store.close();}
});
