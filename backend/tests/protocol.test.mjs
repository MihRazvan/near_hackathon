import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { baseDecode } from 'near-api-js';
import { purchasePlan, signedErc191, validateIntentPlan, nominationPlan, withdrawalPlan } from '../src/intents.mjs';
import { NearReads, successfulNearOutcome, nearBurn, successfulAccountClosure } from '../src/rpc.mjs';
import { canonical } from '../src/core.mjs';
const buyer=privateKeyToAccount('0x'+'01'.repeat(32)), other=privateKeyToAccount('0x'+'02'.repeat(32));
const now=1800000000000;
function snapshot(){return {qualified:true,accountId:'campaign.near',codeHash:'qualified',observedAt:new Date(now).toISOString(),
  state:{outcome:'open',intents_contract_id:'intents.near',intents_token_id:'nep141:usdc.near',round:'0',next_price:'10000',holder:null},
  campaign:{terms:{takeover_enabled:true,bidding_close_ns:String(BigInt(now+600000)*1000000n),published_terms_sha256:Buffer.alloc(32,7).toString('base64')}}};}
const args=()=>({snapshot:snapshot(),buyerId:buyer.address,invoiceId:'invoice',asset:'nep141:usdc.near',now});
test('commercial signatures bind exact cents, round, rules, asset and receiver; stale/fixed/self bookings cannot be planned',()=>{
 const p=purchasePlan(args());assert.equal(p.payload.intents[0].tokens['nep141:usdc.near'],'10000');
 assert.equal(validateIntentPlan(JSON.parse(canonical(p)),{now}).message,p.message);
 assert.equal(JSON.parse(p.payload.intents[0].msg).expected_round,'0');
 for(const change of [a=>a.asset='nep141:fake.near',a=>a.snapshot.qualified=false,a=>a.snapshot.observedAt=new Date(now-30001).toISOString(),
   a=>a.snapshot.state.holder={account_id:buyer.address.toLowerCase()},a=>{a.snapshot.state.holder={account_id:other.address};a.snapshot.campaign.terms.takeover_enabled=false;},
   a=>a.snapshot.state.next_price='10001',a=>a.snapshot.state.outcome='failure']){
   const a=args();change(a);assert.throws(()=>purchasePlan(a));
 }
 const changed=structuredClone(p);changed.payload.intents[0].receiver_id='thief.near';assert.throws(()=>validateIntentPlan(changed,{now}));
 assert.throws(()=>validateIntentPlan(p,{now:now+120001}));
});
test('EIP-191 wire format recovers the original payer and normalizes the Intents secp256k1 recovery byte',async()=>{
 const p=purchasePlan(args()),sig=await buyer.signMessage({message:p.message});
 const signed=await signedErc191(p,sig,{now});assert.equal(signed.payload,p.message);assert.equal(signed.standard,'erc191');
 const bytes=baseDecode(signed.signature.slice(10));assert.equal(bytes.length,65);assert.ok(bytes[64]<2);
 await assert.rejects(signedErc191(p,await other.signMessage({message:p.message}),{now}),/payer/);
 const stale=await buyer.signMessage({message:p.message+' '});await assert.rejects(signedErc191(p,stale,{now}));
});
test('NFT nomination preserves final payer authority and native withdrawal requires a native receiver',()=>{
 const s=snapshot();s.state.holder={account_id:buyer.address.toLowerCase()};s.state.cutoff_ns=String(BigInt(now-1)*1000000n);
 const p=nominationPlan({snapshot:s,buyerId:buyer.address,recipientId:'recipient.near',now});
 assert.equal(p.context.kind,'nominate');assert.throws(()=>nominationPlan({snapshot:s,buyerId:other.address,recipientId:'recipient.near',now}));
 assert.throws(()=>withdrawalPlan({signerId:buyer.address,verifier:'intents.near',token:'usdc.near',recipientId:other.address,amount:'1',now}));
});
test('a snapshot rejects cross-block responses, changed verifier, insufficient escrow, pending withdrawals, paused transfers and fee changes',async()=>{
 const block={header:{hash:'final',height:10,timestamp_nanosec:'1800000000000000000'}};
 const s=snapshot();Object.assign(s.state,{settlement:'intents',ft_contract_id:'usdc.near',cutoff_ns:s.campaign.terms.bidding_close_ns,
  refund_end_ns:'1900000000000000000',total_received:'10000',total_withdrawn:'0',total_pending:'0'});s.campaign.terms.review_end_ns=s.state.refund_end_ns;
 const values={get_state:s.state,get_campaign:s.campaign,get_placement_rights:{},mt_balance_of:'10000',fee:1,pa_all_paused:null};
 let cross=false,verifier='intents-hash';
 const rpc={call:async(method,p)=>method==='block'?block:{block_hash:cross?'other':'final',block_height:10,
  ...(p.request_type==='view_account'?{code_hash:p.account_id==='campaign.near'?'qualified':p.account_id==='usdc.near'?'usdc-hash':verifier}:{result:[...Buffer.from(JSON.stringify(values[p.method_name]))]})}};
 const reads=new NearReads(rpc,{now:()=>now}),opts={expectedCodeHash:'qualified',expectedIntentsCodeHash:'intents-hash',expectedAssets:{intentsId:'intents.near',nearUsdc:'usdc.near',nearAsset:'nep141:usdc.near',usdcCodeHash:'usdc-hash'}};
 assert.equal((await reads.snapshot('campaign.near',opts)).liabilities,'10000');
 cross=true;await assert.rejects(reads.snapshot('campaign.near',opts),/same finalized block/);cross=false;
 verifier='changed';await assert.rejects(reads.snapshot('campaign.near',opts),/qualified deployment/);verifier='intents-hash';
 for(const [key,bad] of [['mt_balance_of','9999'],['fee',2],['pa_all_paused',['transfer']]]){
  const before=values[key];values[key]=bad;await assert.rejects(reads.snapshot('campaign.near',opts));values[key]=before;
 }
 s.state.total_pending='1';await assert.rejects(reads.snapshot('campaign.near',opts),/pending withdrawal/);
 s.state.total_pending='0';reads.now=()=>now+61000;await assert.rejects(reads.snapshot('campaign.near',opts),/must be recent/);
});
test('receipt-level failures remain failures even when the outer transaction succeeds',()=>{
 const good={status:{SuccessValue:''},tokens_burnt:'12'};
 const o={final_execution_status:'FINAL',status:good.status,transaction_outcome:{outcome:good},receipts_outcome:[{outcome:good}]};
 assert.equal(successfulNearOutcome(o),true);assert.equal(nearBurn(o),24n);
 o.receipts_outcome.push({outcome:{status:{Failure:{}}}});assert.equal(successfulNearOutcome(o),false);
});
test('closure verification isolates a failed refund to a deleted account from a failed beneficiary transfer',()=>{
 const good={SuccessValue:''},gone={Failure:{ActionError:{kind:{AccountDoesNotExist:{account_id:'closed.near'}}}}};
 const o={final_execution_status:'FINAL',status:good,transaction:{signer_id:'closed.near',receiver_id:'closed.near',actions:[{DeleteAccount:{beneficiary_id:'treasury.near'}}]},
  transaction_outcome:{outcome:{status:{SuccessReceiptId:'delete'}}},receipts_outcome:[
   {id:'delete',outcome:{executor_id:'closed.near',status:good,tokens_burnt:'100'}},
   {id:'beneficiary',outcome:{executor_id:'treasury.near',status:good,tokens_burnt:'0'}},
   {id:'gas-refund',outcome:{executor_id:'closed.near',status:gone,tokens_burnt:'0'}}]};
 assert.equal(successfulNearOutcome(o),false);assert.equal(successfulAccountClosure(o,'closed.near','treasury.near'),true);
 o.receipts_outcome[1].outcome.status=gone;assert.equal(successfulAccountClosure(o,'closed.near','treasury.near'),false);
});
