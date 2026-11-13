import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignRecordView,mountCampaignRecord,loadEvidence,handleRecordAction,recordFormatting} from '../src/integration/record.mjs';
globalThis.window={dispatchEvent(){}};
globalThis.document={querySelectorAll(){return []}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const fixture=(id,synthetic=false)=>({schema:'everywhere-campaign-record/v1',network:'mainnet',status:'available',campaign:{id,title:'Public campaign <test>',asset:{name:'Owner motorcycle',type:'motorcycle',city:'Bucharest'},schedule:{},spots:[]},qualification:{matched:synthetic,synthetic},snapshots:[{qualified:true,state:{outcome:'success',nft_minted:false},rights:{tokenId:'reserved-id',originalPayerId:'payer.near'},accounting:{received:'30000',withdrawn:'30000',pending:'0'},links:{contract:'https://nearblocks.io/address/hub.near'},artwork:{uri:'ipfs://QmRecorded/file.txt',sha256:'a'.repeat(64)}}]});
test('recorded commitments preserve CIDv0/path artifacts and do not mislabel a reserved token as a minted NFT',async()=>{
 globalThis.fetch=async()=>Response.json(fixture('ordinary'));mountCampaignRecord('ordinary');await tick();const html=campaignRecordView('ordinary');
 assert.match(html,/Public campaign &lt;test&gt;/);assert.match(html,/Owner motorcycle/);assert.match(html,/record-asset-summary/);assert.doesNotMatch(html,/van-dublin-ad/);assert.match(html,/NFT has not been issued/);assert.match(html,/gateway.pinata.cloud\/ipfs\/QmRecorded\/file.txt/);assert.match(html,/payer.near/);assert.doesNotMatch(html,/Inspect the NFT/);
});
test('published record details appear before a held chain response and are never labelled verified prematurely',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),id='fast-record',data=fixture(id);
 globalThis.fetch=async path=>{if(String(path).endsWith('?summary=1'))return Response.json({...data,status:'checking',snapshots:[]});await gate;return Response.json(data);};
 mountCampaignRecord(id);await tick();let html=campaignRecordView(id);assert.match(html,/Public campaign &lt;test&gt;/);assert.match(html,/Verifying its current NEAR state/);assert.doesNotMatch(html,/class="record-placement"|Some chain state is temporarily unavailable/);
 release();await tick();html=campaignRecordView(id);assert.match(html,/class="record-placement"/);assert.doesNotMatch(html,/Verifying its current NEAR state/);
});
test('historical receipts remain inspectable during RPC outages and mismatch warnings and coverage are visible',async()=>{
 const record=fixture('history',true);record.status='unavailable';record.snapshots=[];
 globalThis.fetch=async path=>Response.json(path.includes('/evidence/')?{schema:'everywhere-qualification/v1',network:'mainnet',verification:{status:'mismatch',checkedAt:'2026-11-11T12:00:00Z',receiptsVerifiedAt:'2026-11-10T12:00:00Z'},record:{steps:[{label:'Real purchase',transactionHash:'public-hash',explorerUrl:'https://nearblocks.io/txns/public-hash'}],coverage:[{feature:'NFT creative handoff',status:'not-recorded',note:'Not part of the V3 mainnet run'}]}}:record);
 mountCampaignRecord('history');await tick();await loadEvidence();const html=campaignRecordView('history');assert.match(html,/Current state does not match/);assert.match(html,/public-hash/);assert.match(html,/Not part of the V3/);assert.match(html,/Historical receipt verification/);assert.match(html,/historical test campaign with synthetic delivery evidence/);
});
test('evidence unavailability has an honest completed error state and Refresh verification retries evidence',async()=>{
 let reads=0;globalThis.fetch=async path=>{if(path.includes('/evidence/')){reads++;return Response.json({schema:'everywhere-qualification/v1',network:'mainnet',record:null,verification:{status:'unavailable'}});}return Response.json(fixture('retry',true));};
 mountCampaignRecord('retry',{force:true});await tick();await loadEvidence();let html=campaignRecordView('retry');assert.match(html,/Historical receipts are temporarily unavailable/);assert.doesNotMatch(html,/Loading the recorded receipts/);const before=reads;
 await handleRecordAction({dataset:{recordAction:'refresh',recordId:'retry'}});await tick();await loadEvidence();assert.equal(reads,before+1);
});
test('malformed public responses fail into a retry screen and financial formatting remains exact',async()=>{
 globalThis.fetch=async()=>Response.json({schema:'wrong',campaign:{}});mountCampaignRecord('broken');await tick();assert.match(campaignRecordView('broken'),/incomplete response/);assert.equal(recordFormatting.money('90071992547409930001'),'90071992547409.930001 USDC');assert.equal(recordFormatting.time(null),'Not recorded');assert.equal(recordFormatting.money('-1'),'Unavailable');
});
