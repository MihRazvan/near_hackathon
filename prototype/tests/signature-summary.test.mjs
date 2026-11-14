import test from 'node:test';
import assert from 'node:assert/strict';
import {signatureDetails,signatureMarkup} from '../src/integration/signature-summary.mjs';
const token='nep141:usdc.near',payload={signer_id:'0x'+'11'.repeat(20),verifying_contract:'intents.near',deadline:'2026-11-21T10:00:00Z',intents:[{intent:'transfer',receiver_id:'escrow.near',tokens:{[token]:'100000'}}]};
const plan=value=>({message:JSON.stringify(value,null,2),signerId:value.signer_id,verifier:value.verifying_contract,expiresAt:value.deadline,context:{amount:'99999999999'}});
test('signature summary reads the actual authorized token and amount, not descriptive context',()=>{
 const p=plan(payload),details=signatureDetails(p,{usdcToken:token});assert.equal(details.title,'Authorize 0.10 USDC');assert.ok(details.rows.some(([k,v])=>k==='To'&&v==='escrow.near'));assert.equal(details.raw,p.message);
 assert.doesNotMatch(signatureDetails(p,{usdcToken:'nep141:another.near'}).title,/USDC/);assert.throws(()=>signatureDetails({...p,signerId:'wrong.near'}),/changed/);
});
test('artwork authority and submitted file are decoded from the exact call and escaped for display',()=>{
 const p=plan({...payload,intents:[{intent:'auth_call',contract_id:'hub.near',msg:JSON.stringify({action:'transfer_placement',receiver_id:'<script>bad</script>'})}]});
 assert.equal(signatureDetails(p).title,'Transfer artwork control');const html=signatureMarkup(p);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Exact message being signed/);
});
