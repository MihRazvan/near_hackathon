import test from 'node:test';
import assert from 'node:assert/strict';
import {listingAvailability,latestWalletRequest,paymentState,creditSnapshots,placementProgress} from '../src/integration/buyer-state.mjs';
const now=1800000000000,ns=ms=>(BigInt(ms)*1000000n).toString();
const snapshot=()=>({state:{outcome:'open',cutoff_ns:ns(now+60000),next_price:'10000',holder:null,refund_end_ns:ns(now+360000)},rights:{bidding_closed:false,active:false,current_owner_id:null},campaign:{terms:{service_start_ns:ns(now+240000),service_end_ns:ns(now+300000)}}});
test('unavailable chain state and closed dates never display a bookable price',()=>{
 assert.equal(listingAvailability({takeoverEnabled:true},null,now).kind,'checking');const s=snapshot();s.state.cutoff_ns=ns(now);assert.equal(listingAvailability({takeoverEnabled:true},s,now).available,false);s.state.cutoff_ns=ns(now+1);s.state.holder={account_id:'other.near'};assert.equal(listingAvailability({takeoverEnabled:false},s,now).kind,'booked');assert.equal(listingAvailability({takeoverEnabled:true},s,now).kind,'takeover');
});
test('the newest wallet request controls payment recovery and a pending expiry cannot offer a second payment',()=>{
 const requests=[{id:'old',planId:'p',status:'rejected',createdAt:'2026-11-09T00:00:00Z'},{id:'new',planId:'p',status:'submitted',createdAt:'2026-11-10T00:00:00Z'}];const current=latestWalletRequest(requests,['p']);assert.equal(current.id,'new');assert.equal(paymentState({status:'prepared'},current,new Date(now-1).toISOString(),now),'pending');assert.equal(paymentState({status:'prepared'},null,new Date(now-1).toISOString(),now),'expired');
});
test('credit lists exclude absent balances and retain independently claimable or conditional money',()=>{
 const rows=[{credits:{}},{credits:{wallet:{available:'0',conditional_bonus:'0'}}},{credits:{wallet:{available:'10000',conditional_bonus:'0'}}},{credits:{wallet:{available:'0',conditional_bonus:'10000'}}}];assert.deepEqual(creditSnapshots(rows,'wallet'),rows.slice(2));
});
test('final campaign outcomes take precedence over expired artwork windows',()=>{
 const s=snapshot();s.state.holder={account_id:'buyer.near'};s.state.outcome='success';assert.equal(placementProgress(s,'buyer.near',now).key,'completed');s.state.outcome='failure';assert.equal(placementProgress(s,'buyer.near',now).key,'cancelled');
});
test('installation evidence alone does not claim a campaign has started',()=>{
 const s=snapshot();Object.assign(s.state,{holder:{account_id:'buyer.near'},nft_minted:true,artwork_locked:true});s.rights={bidding_closed:true,current_owner_id:'buyer.near'};s.campaign.delivery_proof={};assert.equal(placementProgress(s,'buyer.near',now).key,'scheduled');assert.equal(placementProgress(s,'buyer.near',now+250000).key,'running');assert.equal(placementProgress(s,'buyer.near',now+310000).key,'review');
});
test('automatic placement receipts let an EVM payer send artwork without a separate NEAR nominee',()=>{
 const s=snapshot();s.state.holder={account_id:'0x1111111111111111111111111111111111111111'};s.rights.bidding_closed=true;s.campaign.terms.artwork_due_ns=ns(now+60000);
 assert.equal(placementProgress(s,s.state.holder.account_id,now,{automaticReceipt:true}).key,'artwork');
 assert.equal(placementProgress(s,s.state.holder.account_id,now+60000,{automaticReceipt:true}).key,'artwork-closed');
});
test('explicit artwork control follows the authorized controller after receipt ownership is separated',()=>{
 const s=snapshot();Object.assign(s.state,{holder:{account_id:'payer.near'},nft_minted:true});Object.assign(s.rights,{bidding_closed:true,active:true,current_owner_id:'receipt.near',artwork_controller_id:'creative.near'});
 assert.equal(placementProgress(s,'creative.near',now).key,'artwork');
 assert.equal(placementProgress(s,'payer.near',now).key,'await-artwork');
});

test('creative transfer follows the minted owner, not the original payer, within the editing window',async()=>{
 const {canTransferCreativeControl}=await import('../src/integration/buyer-state.mjs'),s=snapshot();s.mode='hub';Object.assign(s.state,{holder:{account_id:'payer.near'},cutoff_ns:ns(now-1),nft_minted:true});Object.assign(s.rights,{bidding_closed:true,active:true,current_owner_id:'creative.near'});s.campaign.terms.artwork_due_ns=ns(now+60000);
 assert.equal(canTransferCreativeControl(s,'creative.near',now),true);assert.equal(canTransferCreativeControl(s,'payer.near',now),false);
 for(const change of [s=>s.state.nft_minted=false,s=>s.state.outcome='success',s=>s.state.outcome='failure',s=>s.state.artwork_locked=true,s=>s.rights.locked=true,s=>s.rights.active=false,s=>s.rights.bidding_closed=false,s=>s.rights.artwork_controller_id='someone-else.near',s=>s.state.cutoff_ns=ns(now+1),s=>s.campaign.terms.artwork_due_ns=ns(now+5000),s=>delete s.campaign.terms.artwork_due_ns,s=>s.mode='legacy']){
  const changed=structuredClone(s);change(changed);assert.equal(canTransferCreativeControl(changed,'creative.near',now),false);
 }
 assert.equal(canTransferCreativeControl(s,'creative.near',now+60000),false);
});
