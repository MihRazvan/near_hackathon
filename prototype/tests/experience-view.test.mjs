import test from 'node:test';
import assert from 'node:assert/strict';
import {renderExperience,handleExperienceAction,mountExperience} from '../src/integration/experience.mjs';
import {experienceStorageKey} from '../src/integration/experience-state.mjs';
const wallet='0x'+'34'.repeat(20),other='another.near';
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
let changed=0;globalThis.window={dispatchEvent:()=>changed++};
const target=(action,value='',scope=wallet)=>{const element={dataset:{experienceAction:action,experienceValue:value},closest:selector=>selector==='[data-experience-action]'?element:{dataset:{experienceWallet:scope}}};return element;};
function live(actor=wallet){return {session:actor?{wallet:actor}:null,get wallets(){throw Error('The example must never access signing wallets.');},get balances(){throw Error('The example must never read real balances.');},get data(){throw Error('The example must never touch real listings.');}};}
test('signed-out entry requires actual wallet sign-in and never creates simulated progress',()=>{
 storage.clear();const html=renderExperience(live(null));assert.match(html,/Sign in to try it/);assert.match(html,/\/sign-in\?next=%2Fexperience/);assert.match(html,/Interactive example · no funds used/);assert.doesNotMatch(html,/data-experience-action="book"/);assert.equal(handleExperienceAction(target('book'),live(null)),true);assert.equal(storage.size,0);
});
test('a full visitor-controlled journey changes creative and ledger while never using network or signing paths',()=>{
 storage.clear();let calls=0;const oldFetch=globalThis.fetch;globalThis.fetch=()=>{calls++;throw Error('No API calls are allowed.');};
 try{const account=live();let html=renderExperience(account);assert.match(html,/van-dublin.webp/);assert.match(html,/Book for 1¢/);
 for(const action of ['book','takeover','close','transfer','fulfill','settle','claim'])assert.equal(handleExperienceAction(target(action),account),true);
 html=renderExperience(account);assert.match(html,/THREE CENTS IN/);assert.match(html,/Creative studio/);assert.match(html,/payment destinations stayed the same/);assert.match(html,/Recorded mainnet proof/);assert.match(html,/\/records\/e22dd301-786f-476c-af74-0df7cd2e6168/);assert.match(html,/machine-readable evidence/);assert.match(html,/Your wallet only signed you in/);assert.equal(JSON.parse(storage.get(experienceStorageKey(wallet))).step,6);assert.equal(calls,0);assert.ok(changed>=7);
 }finally{globalThis.fetch=oldFetch;}
});
test('wallet switching and stale buttons cannot overwrite another person’s saved example',()=>{
 const before=storage.get(experienceStorageKey(wallet)),account=live(other);const html=renderExperience(account);assert.match(html,/Book for 1¢/);assert.equal(handleExperienceAction(target('book','',wallet),account),true);assert.equal(storage.has(experienceStorageKey(other)),false);assert.equal(storage.get(experienceStorageKey(wallet)),before);
 handleExperienceAction(target('book','',other),account);assert.equal(JSON.parse(storage.get(experienceStorageKey(other))).step,1);assert.equal(JSON.parse(storage.get(experienceStorageKey(wallet))).step,6);
});
test('keyboard focus returns to the selected brand or current scene heading after a user action',()=>{
 const account=live();handleExperienceAction(target('restart'),account);handleExperienceAction(target('brand','coffeeclub'),account);let focused='';
 const element={dataset:{experienceWallet:wallet},querySelector:selector=>({focus:()=>focused=selector})};mountExperience({querySelector:()=>element});assert.match(focused,/data-experience-value="coffeeclub"/);
 handleExperienceAction(target('book'),account);mountExperience({querySelector:()=>element});assert.equal(focused,'[data-experience-heading]');
});

test('the current rail follows creative authority through approval, then delivery and final payouts',()=>{
 const account=live();handleExperienceAction(target('restart'),account);for(const action of ['book','takeover','close'])handleExperienceAction(target(action),account);
 const current=()=>renderExperience(account).match(/<li class="is-current" aria-current="step">([\s\S]*?)<\/li>/)?.[1]??'';
 assert.match(current(),/Move the NFT/);handleExperienceAction(target('transfer'),account);assert.match(current(),/Move the NFT/);handleExperienceAction(target('fulfill'),account);assert.match(current(),/Follow delivery/);handleExperienceAction(target('settle'),account);assert.match(current(),/Get paid/);handleExperienceAction(target('claim'),account);assert.equal(current(),'');
});

test('the studio handoff is the featured NFT action, while self-managed artwork remains available',()=>{
 const account=live();handleExperienceAction(target('restart'),account);for(const action of ['book','takeover','close'])handleExperienceAction(target(action),account);
 let html=renderExperience(account);assert.match(html,/<div class="exp-primary-action">[^]*?data-experience-action="transfer"/);assert.match(html,/Keep the NFT &amp; approve artwork|Keep the NFT & approve artwork/);assert.match(html,/Example placement NFT/);assert.match(html,/NFT owner/);assert.match(html,/Artwork control open/);
 handleExperienceAction(target('transfer'),account);html=renderExperience(account);assert.match(html,/data-nft-controller>Creative studio/);assert.match(html,/<div class="exp-primary-action">[^]*?data-experience-action="fulfill"/);assert.match(html,/original financial claims stayed put|financial rights stayed put/);
 handleExperienceAction(target('fulfill'),account);html=renderExperience(account);assert.match(html,/Artwork approved &amp; locked/);assert.doesNotMatch(html,/data-experience-action="transfer"/);
});
