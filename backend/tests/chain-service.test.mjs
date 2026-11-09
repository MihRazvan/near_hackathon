import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KeyVault } from '../src/vault.mjs';
import { ChainService } from '../src/chain-service.mjs';

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
