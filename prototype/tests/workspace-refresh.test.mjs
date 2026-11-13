import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeScopedWorkspace,affectedContracts} from '../src/integration/workspace-refresh.mjs';
const snapshot=id=>({accountId:id,state:{next_price:'10000'},credits:{'a.near':{available:'10000'}}});
const previous={wallet:'a.near',chainPending:false,placements:[snapshot('x'),snapshot('y')],issues:[{id:'issue-x',contractId:'x'},{id:'issue-y',contractId:'y'}],placementMessages:[{id:'message-x',contractId:'x'},{id:'message-y',contractId:'y'}]};
const data={wallet:'a.near',chainPending:false,scopedContracts:['x'],sales:[{spots:[{contractId:'x'},{contractId:'y'}]}],snapshots:[snapshot('x')],placements:[],issues:[],placementMessages:[],unavailable:[]};
test('targeted verification removes a former NFT controller without losing unrelated placements',()=>{
 const catalog={snapshots:[snapshot('x'),snapshot('y')]},before=JSON.stringify({previous,data,catalog}),merged=mergeScopedWorkspace(previous,data,catalog);
 assert.deepEqual(merged.placements.map(s=>s.accountId),['y']);assert.deepEqual(merged.placementMessages.map(s=>s.id),['message-y']);assert.deepEqual(merged.issues.map(s=>s.id),['issue-y']);
 assert.equal(merged.snapshots.length,2);assert.equal(merged.chainPending,false);assert.equal(JSON.stringify({previous,data,catalog}),before);
});
test('unavailable targeted state replaces old authority instead of presenting stale prices or claimable money',()=>{
 const merged=mergeScopedWorkspace(previous,{...data,snapshots:[],unavailable:[{contractId:'x',code:'RPC_UNAVAILABLE'}]},{snapshots:[snapshot('x'),snapshot('y')]});
 assert.deepEqual(merged.snapshots.map(s=>s.accountId),['y']);assert.deepEqual(merged.unavailable,[{contractId:'x',code:'RPC_UNAVAILABLE'}]);assert.deepEqual(merged.placements.map(s=>s.accountId),['y']);
});
test('scoped responses never inherit another wallet\'s private roles or claim complete rights discovery',()=>{
 const merged=mergeScopedWorkspace(previous,{...data,wallet:'b.near'},{snapshots:[snapshot('x'),snapshot('y')]});
 assert.deepEqual(merged.placements,[]);assert.deepEqual(merged.issues,[]);assert.deepEqual(merged.placementMessages,[]);assert.equal(merged.chainPending,true);
});
test('recovery checks only placements in the original plans and treats token-only actions as balance updates',()=>{
 const data={intents:[{id:'buy',context:{contractId:'x'}}],nativePlans:[{id:'withdraw',plan:{contractId:'usdc.near'}},{id:'art',plan:{contractId:'y'}}],publicationPlans:[],dashboard:{bookings:[]}};
 assert.deepEqual(affectedContracts(data,[{planId:'buy'},{planId:'withdraw'},{planId:'art'}],[{spots:[{contractId:'x'},{contractId:'y'}]}]),['x','y']);
 assert.deepEqual(affectedContracts(data,[{planId:'withdraw'}],[{spots:[{contractId:'x'}]}]),[]);
});
