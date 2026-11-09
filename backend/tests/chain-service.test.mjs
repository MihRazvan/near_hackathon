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
