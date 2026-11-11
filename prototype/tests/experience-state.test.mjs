import test from 'node:test';
import assert from 'node:assert/strict';
import {initialExperience,transitionExperience,experienceLedger,experienceActors,loadExperience,saveExperience,validExperience,experienceStorageKey} from '../src/integration/experience-state.mjs';
const wallet='0x'+'12'.repeat(20),other='owner.near';
const route=['book','takeover','close','fulfill','settle','claim'];
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};
function advance(count,brand='goodthings'){let state=transitionExperience(initialExperience(wallet),'brand',brand);for(const action of route.slice(0,count))state=transitionExperience(state,action);return state;}
test('the example conserves every integer micro-USDC before and after all six actions',()=>{
 for(const brand of ['goodthings','coffeeclub'])for(let step=0;step<=6;step++){
  const state=advance(step,brand),l=experienceLedger(state),locked=l.ownerPending+l.ownerAvailable+l.firstRefundAvailable+l.firstRewardConditional+l.firstRewardAvailable;
  assert.equal(l.received,l.escrow+l.withdrawn);assert.equal(l.received,l.firstPaidIn+l.challengerPaidIn);assert.equal(l.escrow,locked);assert.equal(l.withdrawn,l.ownerPaid+l.firstRefundPaid+l.firstRewardPaid);for(const value of Object.values(l).filter(v=>typeof v==='number'))assert.equal(Number.isSafeInteger(value)&&value>=0,true);
 }
 const l=experienceLedger(advance(6));assert.equal(l.received,30000);assert.equal(l.ownerPaid,10000);assert.equal(l.firstRefundPaid,10000);assert.equal(l.firstRewardPaid,10000);assert.equal(l.escrow,0);
});
test('a takeover separates the immediately available principal from the reward gated by successful completion',()=>{
 const taken=experienceLedger(advance(2));assert.equal(taken.firstRefundAvailable,10000);assert.equal(taken.firstRewardConditional,10000);assert.equal(taken.firstRewardAvailable,0);assert.equal(taken.ownerAvailable,0);
 for(const step of [3,4])assert.equal(experienceLedger(advance(step)).firstRewardConditional,10000);
 const settled=experienceLedger(advance(5));assert.equal(settled.firstRewardConditional,0);assert.equal(settled.firstRewardAvailable,10000);assert.equal(settled.ownerAvailable,10000);
});
test('moving creative authority never moves financial claims and cannot happen before mint or after approval',()=>{
 const before=advance(3),after=transitionExperience(before,'transfer');assert.equal(experienceActors(before).creativeController,'Coffee Club');assert.equal(experienceActors(after).creativeController,'Creative studio');assert.deepEqual(experienceLedger(after),experienceLedger(before));assert.equal(experienceLedger(after).refundBeneficiary,'first-advertiser');assert.equal(experienceLedger(after).rewardBeneficiary,'first-advertiser');assert.equal(experienceLedger(after).ownerBeneficiary,'space-owner');
 for(const state of [advance(0),advance(1),advance(2),advance(4),advance(5),advance(6),after])assert.throws(()=>transitionExperience(state,'transfer'));
 const finished=transitionExperience(transitionExperience(transitionExperience(after,'fulfill'),'settle'),'claim');assert.deepEqual(experienceLedger(finished),experienceLedger(advance(6)));
});
test('duplicate, out-of-order and unknown actions cannot create another payment or bypass settlement',()=>{
 const first=advance(1),taken=advance(2),closed=advance(3);for(const [state,action] of [[initialExperience(wallet),'claim'],[first,'book'],[taken,'takeover'],[closed,'settle'],[advance(6),'claim'],[first,'publish'],[first,'brand']])assert.throws(()=>transitionExperience(state,action,'coffeeclub'));
 assert.equal(experienceLedger(first).received,10000);assert.equal(experienceLedger(taken).received,30000);assert.equal(experienceLedger(closed).withdrawn,0);assert.throws(()=>transitionExperience(initialExperience(wallet),'brand','__proto__'));
});
test('saved examples are isolated by wallet and account normalization does not mix different people',()=>{
 const storage=memory(),state=advance(4);assert.equal(saveExperience(storage,state),true);assert.deepEqual(loadExperience(storage,wallet).state,state);assert.equal(loadExperience(storage,other).state.step,0);assert.equal(loadExperience(storage,wallet.toUpperCase().replace('0X','0x')).state.step,4);
 storage.setItem(experienceStorageKey(other),JSON.stringify(state));assert.equal(loadExperience(storage,other).source,'reset');assert.equal(loadExperience(storage,other).state.wallet,other);assert.equal(loadExperience(storage,other).state.step,0);
 const restarted=transitionExperience(state,'restart');assert.equal(restarted.step,0);assert.equal(restarted.wallet,wallet);assert.equal(restarted.transferred,false);
});
test('tampered amounts, future schemas and impossible states reset safely instead of becoming balances',()=>{
 const storage=memory(),fresh=initialExperience(wallet);
 for(const value of [{...fresh,schema:2},{...fresh,step:7},{...fresh,step:-1},{...fresh,step:1.5},{...fresh,brand:'untrusted'},{...fresh,transferred:true},{...fresh,ledger:{ownerAvailable:999999999}},{...fresh,wallet:other}]){assert.equal(validExperience(value,wallet),false);storage.setItem(experienceStorageKey(wallet),JSON.stringify(value));assert.deepEqual(loadExperience(storage,wallet),{state:fresh,source:'reset'});}
 storage.setItem(experienceStorageKey(wallet),'{broken');assert.equal(loadExperience(storage,wallet).source,'reset');assert.throws(()=>initialExperience('<script>'));assert.throws(()=>saveExperience(storage,{...fresh,escrow:9999}));
});
test('blocked browser storage never blocks the example or claims that progress was saved',()=>{
 const storage={getItem:()=>{throw Error('disabled');},setItem:()=>{throw Error('full');}};assert.equal(loadExperience(storage,wallet).source,'unavailable');assert.equal(saveExperience(storage,advance(2)),false);assert.equal(loadExperience(null,wallet).source,'unavailable');assert.equal(saveExperience(null,advance(2)),false);
});
