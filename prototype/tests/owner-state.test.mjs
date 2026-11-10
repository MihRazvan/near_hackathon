import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultOwnerSchedule,ownerCampaignStage,ownerTotals,ownerCanUploadProof} from '../src/integration/owner-state.mjs';
const now=1800000000000,stamp=minutes=>String(BigInt(now+minutes*60000)*1000000n);
function campaign(){return {state:{seller_id:'owner.near',outcome:'open',cutoff_ns:stamp(-1),refund_end_ns:stamp(40),holder:{account_id:'buyer.near'},artwork_locked:false,potential_seller_revenue:'10000'},rights:{active:false,proposal:null,rights_end_ns:stamp(10)},campaign:{open_issues:0,delivery_proof:null,terms:{artwork_due_ns:stamp(10),installation_due_ns:stamp(20),service_start_ns:stamp(20),service_end_ns:stamp(30)}}};}
test('new owner campaign defaults leave real time for booking, production, service and review',()=>{
 const schedule=defaultOwnerSchedule(now),times=['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map(k=>Date.parse(schedule[k]));
 assert.ok(times[0]-now>=86400000);assert.ok(times[0]<times[1]);assert.ok(times[1]<times[2]);assert.ok(times[2]<=times[3]);assert.ok(times[3]<times[4]);assert.ok(times[4]<times[5]);
});
test('a final advertiser without a minted placement waits for artwork rather than being called overdue',()=>{
 const s=campaign();assert.equal(ownerCampaignStage(s,now).key,'awaiting-artwork');assert.equal(ownerCampaignStage(s,now+11*60000).key,'artwork-overdue');
});
test('owner next steps follow artwork approval and installation facts',()=>{
 const s=campaign();s.rights.active=true;s.rights.proposal={revision:'1'};assert.equal(ownerCampaignStage(s,now).key,'review-artwork');
 s.state.artwork_locked=true;assert.equal(ownerCampaignStage(s,now).key,'installation');assert.equal(ownerCanUploadProof(s,now),true);
 s.campaign.delivery_proof={artifact_uri:'ipfs://evidence'};assert.equal(ownerCanUploadProof(s,now),false);assert.equal(ownerCampaignStage(s,now).key,'scheduled');assert.equal(ownerCampaignStage(s,now+25*60000).key,'running');assert.equal(ownerCampaignStage(s,now+35*60000).key,'review');assert.equal(ownerCampaignStage(s,now+41*60000).key,'settling');
});
test('owner cannot upload proof after the evidence window or after settlement',()=>{
 const s=campaign();s.state.artwork_locked=true;assert.equal(ownerCanUploadProof(s,now+31*60000),false);assert.equal(ownerCampaignStage(s,now+31*60000).key,'proof-overdue');
 s.state.outcome='failure';assert.equal(ownerCanUploadProof(s,now),false);assert.equal(ownerCampaignStage(s,now).key,'cancelled');
});
test('settled and disputed campaigns do not offer ordinary production next steps',()=>{
 const s=campaign();s.state.artwork_locked=true;s.campaign.delivery_proof={};s.campaign.open_issues=1;assert.equal(ownerCampaignStage(s,now).key,'issue');
 s.state.outcome='success';assert.equal(ownerCampaignStage(s,now).key,'complete');assert.equal(ownerCampaignStage(undefined,now).key,'syncing');
});
test('owner totals separate available credits, conditional earnings and completed earnings exactly',()=>{
 const open=campaign();open.credits={'owner.near':{available:'3'}};
 const completed=campaign();completed.state.outcome='success';completed.state.potential_seller_revenue='20000';completed.credits={'owner.near':{available:'20000'}};
 const foreign=campaign();foreign.state.seller_id='someone.near';foreign.state.potential_seller_revenue='999999';
 assert.deepEqual(ownerTotals([open,completed,foreign],'owner.near'),{booked:1,completed:1,available:'20003',held:'10000',earned:'20000'});
});
