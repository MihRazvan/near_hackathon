import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {NativeActions} from '../src/native-actions.mjs';
import {ChainService} from '../src/chain-service.mjs';
import {purchasePlan} from '../src/intents.mjs';
test('a native NEAR booking binds the original round, amount and invoice and requires the actual campaign acceptance event',async()=>{
 const store=new Store(),actor='buyer.near',now=1800000000000,contract='campaign.near';
 const s={qualified:true,accountId:contract,observedAt:new Date(now).toISOString(),codeHash:'campaign-code',state:{round:'0',next_price:'10000',outcome:'open',intents_contract_id:'intents.near',intents_token_id:'nep141:usdc.near'},
  campaign:{terms:{bidding_close_ns:String(BigInt(now+600000)*1000000n),takeover_enabled:true,published_terms_sha256:Buffer.alloc(32,1).toString('base64')}}};
 const original=purchasePlan({snapshot:s,buyerId:actor,invoiceId:'invoice',asset:'nep141:usdc.near',now});
 store.insert('intent',original.planId,actor,{plan:original,status:'prepared'});store.insert('booking','booking',actor,{status:'prepared',planId:original.planId,contractId:contract});
 let outcome;const chain={snapshot:async()=>s,purchaseAccepted:ChainService.prototype.purchaseAccepted},reads={rpc:{call:async()=>outcome}};
 const actions=new NativeActions({store,chain,reads,now:()=>now,config:{assets:{intentsId:'intents.near',nearAsset:'nep141:usdc.near',intentsCodeHash:'verifier-code'}}});
 try{
  const plan=await actions.prepareBooking(actor,'booking'),p=plan.transaction.actions[0].params;
  assert.equal(p.methodName,'mt_transfer_call');assert.equal(p.args.amount,'10000');assert.equal(p.args.receiver_id,contract);assert.equal(p.args.token_id,'nep141:usdc.near');
  assert.equal(JSON.parse(p.args.msg).expected_round,'0');await assert.rejects(actions.prepareBooking('other.near','booking'),{code:'NOT_FOUND'});
  const hash='1'.repeat(32),status={SuccessValue:''};outcome={final_execution_status:'FINAL',status,
   transaction:{hash,signer_id:actor,receiver_id:'intents.near',actions:[{FunctionCall:{method_name:p.methodName,args:Buffer.from(JSON.stringify(p.args)).toString('base64'),gas:Number(p.gas),deposit:p.deposit}}]},
   transaction_outcome:{outcome:{status}},receipts_outcome:[{outcome:{executor_id:contract,status,logs:['EVENT_JSON:'+JSON.stringify({standard:'pitboard',version:'1.0.0',event:'purchase_accepted',data:[{invoice_id:'invoice',buyer_id:actor,amount:'10000',round:'1'}]})]}}]};
  assert.equal((await actions.confirm(actor,plan.planId,hash)).status,'confirmed');assert.equal(store.get('booking','booking').accepted,true);
 }finally{store.close();}
});
