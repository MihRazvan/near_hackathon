// This is an isolated example. All money is integer micro-USDC derived from
// six permitted actions; no balance, payment, or contract state is stored here.
export const EXPERIENCE_VERSION=1;
export const EXPERIENCE_STEPS=6;
export const EXPERIENCE_BRANDS=Object.freeze({
 goodthings:Object.freeze({name:'Good Things',line:'Good things get around.',image:'/images/van-dublin-ad.webp',className:'goodthings'}),
 coffeeclub:Object.freeze({name:'Coffee Club',line:'Your daily fix. Out in the world.',image:'/images/van-dublin-takeover.webp',className:'coffeeclub'})
});
const keys=['brand','schema','step','transferred','wallet'];
export function experienceWallet(value){
 if(typeof value!=='string')return null;
 if(/^0x[0-9a-f]{40}$/i.test(value))return value.toLowerCase();
 return value.length>=2&&value.length<=64&&/^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$/.test(value)?value:null;
}
export function initialExperience(wallet){
 const owner=experienceWallet(wallet);if(!owner)throw new Error('Connect your wallet to start the example.');
 return {schema:EXPERIENCE_VERSION,wallet:owner,brand:'goodthings',step:0,transferred:false};
}
export function validExperience(value,wallet){
 return !!value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join(',')===keys.join(',')&&value.schema===EXPERIENCE_VERSION&&value.wallet===experienceWallet(wallet)&&value.wallet!==null&&Object.hasOwn(EXPERIENCE_BRANDS,value.brand)&&Number.isInteger(value.step)&&value.step>=0&&value.step<=EXPERIENCE_STEPS&&typeof value.transferred==='boolean'&&(!value.transferred||value.step>=3);
}
export const experienceStorageKey=wallet=>{const owner=experienceWallet(wallet);if(!owner)throw new Error('Connect a wallet first.');return 'everywhere-interactive-example-v'+EXPERIENCE_VERSION+':'+owner;};
export function loadExperience(storage,wallet){
 const fresh=initialExperience(wallet);let raw;
 try{raw=storage?.getItem(experienceStorageKey(wallet));}catch{return {state:fresh,source:'unavailable'};}
 if(!storage)return {state:fresh,source:'unavailable'};
 if(raw===null||raw===undefined)return {state:fresh,source:'empty'};
 let value;try{value=JSON.parse(raw);}catch{}
 return validExperience(value,wallet)?{state:value,source:'saved'}:{state:fresh,source:'reset'};
}
export function saveExperience(storage,state){
 if(!validExperience(state,state?.wallet))throw new Error('The saved example is invalid. Restart it to continue.');
 try{if(!storage)return false;storage.setItem(experienceStorageKey(state.wallet),JSON.stringify(state));return true;}catch{return false;}
}
export function transitionExperience(state,action,value){
 if(!validExperience(state,state?.wallet))throw new Error('The saved example is invalid. Restart it to continue.');
 if(action==='restart')return initialExperience(state.wallet);
 if(action==='brand'){
  if(state.step!==0||!Object.hasOwn(EXPERIENCE_BRANDS,value))throw new Error('Choose a prepared brand before booking.');
  return {...state,brand:value};
 }
 if(action==='transfer'){
  if(state.step!==3||state.transferred)throw new Error('Creative control can move once, before artwork is approved.');
  return {...state,transferred:true};
 }
 const required={book:0,takeover:1,close:2,fulfill:3,settle:4,claim:5};
 if(!Object.hasOwn(required,action)||state.step!==required[action])throw new Error('Continue with the current step in your example.');
 return {...state,step:state.step+1};
}
export function experienceLedger(state){
 if(!validExperience(state,state?.wallet))throw new Error('An intact example is required to show its ledger.');
 const booked=state.step>=1,taken=state.step>=2,settled=state.step>=5,paid=state.step===6;
 return {
  received:!booked?0:taken?30000:10000,
  escrow:paid?0:!booked?0:taken?30000:10000,
  firstPaidIn:booked?10000:0,challengerPaidIn:taken?20000:0,
  ownerPending:booked&&!settled?10000:0,ownerAvailable:settled&&!paid?10000:0,ownerPaid:paid?10000:0,
  firstRefundAvailable:taken&&!paid?10000:0,firstRefundPaid:paid?10000:0,
  firstRewardConditional:taken&&!settled?10000:0,firstRewardAvailable:settled&&!paid?10000:0,firstRewardPaid:paid?10000:0,
  withdrawn:paid?30000:0,
  ownerBeneficiary:'space-owner',refundBeneficiary:'first-advertiser',rewardBeneficiary:'first-advertiser'
 };
}
export function experienceActors(state){
 if(!validExperience(state,state?.wallet))throw new Error('An intact example is required.');
 const first=EXPERIENCE_BRANDS[state.brand],challenger=EXPERIENCE_BRANDS[state.brand==='goodthings'?'coffeeclub':'goodthings'];
 return {first,challenger,holder:state.step===0?null:state.step===1?first:challenger,creativeController:state.step<3?null:state.transferred?'Creative studio':challenger.name,nftMinted:state.step>=3,artworkLocked:state.step>=4,outcome:state.step>=5?'success':'open'};
}
