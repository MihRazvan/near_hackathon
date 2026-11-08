import {initialState,PERSONAS} from './seed.mjs';
const KEY='everywhere-experience-v1';
let current;
try{current=JSON.parse(localStorage.getItem(KEY));}catch{}
if(!current||current.version!==1)current=initialState();
export const state=current;
export const person=()=>({...PERSONAS[state.persona]??PERSONAS.visitor,...state.profiles?.[state.persona]});
export const asset=id=>state.assets.find(x=>x.id===id);
export const sale=id=>state.sales.find(x=>x.id===id);
export const booking=id=>state.bookings.find(x=>x.id===id);
export const ownerAssets=()=>state.assets.filter(x=>x.ownerId===(person().ownerId??person().id));
export const myBookings=()=>state.bookings.filter(x=>x.buyerId===person().id);
export const myCampaigns=()=>state.campaigns.filter(x=>x.buyerId===person().id);
export const effectiveTakeover=(s,p)=>p.rule==='on'||(p.rule!=='off'&&s.takeovers);
export const currentBooking=(s,p)=>state.bookings.find(x=>x.saleId===s.id&&x.spotId===p.id&&!['displaced','cancelled'].includes(x.status));
export const priceFor=(s,p)=>{const b=currentBooking(s,p);return b&&effectiveTakeover(s,p)?Math.ceil(b.amount*1.5*100)/100:p.price;};
export function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{window.dispatchEvent(new CustomEvent('app:toast',{detail:'Browser storage is full. This session still works; reset the sample data to clear uploaded images.'}));}}
export function update(fn,{render=true}={}){fn(state);persist();if(render)window.dispatchEvent(new Event('app:changed'));}
export function reset(){Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,initialState());persist();window.dispatchEvent(new Event('app:changed'));}
export function navigate(path){history.pushState({},'',path);window.dispatchEvent(new Event('app:navigate'));}
export const toast=text=>window.dispatchEvent(new CustomEvent('app:toast',{detail:text}));
export const uid=prefix=>`${prefix}-${crypto.randomUUID().slice(0,8)}`;
export function log(text){state.activity.unshift({text,time:'Just now'});}
export function notice(title,text,href){state.notifications.unshift({id:uid('notice'),title,text,href,read:false});}
export function requireSignIn(next){if(person().id!=='visitor')return true;navigate('/sign-in?next='+encodeURIComponent(next??location.pathname+location.search));return false;}
export function simulateBooking({saleId,spotId,campaignId,buyerId=person().id,brand=person().brand,paymentId}){
  if(paymentId){const existing=state.bookings.find(b=>b.paymentId===paymentId);if(existing)return existing;}
  const s=sale(saleId),p=s?.layout.find(x=>x.id===spotId);if(!s||!p||s.phase!=='open')throw new Error('This sale is no longer open. Choose another spot.');
  const old=currentBooking(s,p);if(old?.buyerId===buyerId)throw new Error('This wallet already holds this placement.');
  if(old&&!effectiveTakeover(s,p))throw new Error('This fixed booking is already taken.');
  const amount=priceFor(s,p);
  if(old){old.status='displaced';state.credits.push({id:uid('credit'),buyerId:old.buyerId,bookingId:old.id,principal:old.amount,conditional:Math.round(old.amount*.1*100)/100,claimed:false});notice('Your spot was taken over',`${old.brand} · ${asset(s.assetId).title}`,'/buy/placements/'+old.id);}
  const b={id:uid('booking'),saleId,spotId,buyerId,campaignId,brand,amount,status:effectiveTakeover(s,p)?'provisional':'booked',artwork:'missing',proof:'missing',pass:'not-due',paymentId};state.bookings.push(b);log(`${brand} ${old?'took over':'booked'} ${p.name}`);notice('Placement confirmed',`${p.name} · ${asset(s.assetId).title}`,'/buy/placements/'+b.id);return b;
}
