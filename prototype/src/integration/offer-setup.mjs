import {privateListingPhotos,publishVehiclePhotos} from './view-publication.mjs';
import {listingProgress} from './listing-progress.mjs';
import {vehicleEditor} from './vehicle-editor.mjs';
import {live,api,rawAsset,refresh,nativeUnits,sale} from './runtime.mjs';
import {publicationCapacity} from './publication-capacity.mjs';
import {navigate,toast} from '../store.mjs';
import {esc,heading,form,hidden,input,textArea,check,select,submit,act,link,notice} from './ui.mjs';
import {defaultOwnerSchedule} from './owner-state.mjs';
import {campaignSchedule} from './checkout-state.mjs';
import {isTeamTest} from './campaign-kind.mjs';
import {actions} from './actions.mjs';
const storageKey=id=>'everywhere-offer:'+live.session.wallet+':'+id;
function saved(id){try{return JSON.parse(localStorage.getItem(storageKey(id)))??{};}catch{return {};}}
const localTime=value=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export function compactOffer(asset){
 const memo=saved(asset.id),schedule=defaultOwnerSchedule(Date.parse(live.catalog?.time??new Date().toISOString())),test=isTeamTest(asset);
 return listingProgress(3)+heading('','Set your listing.','Choose when advertisers can use your spots and set one price for the full campaign.',link('/host/assets/'+asset.id+'/review','Back to spots','button quiet'))+
 form('quick-offer',hidden('assetId',asset.id)+`<div class="offer-setup"><section class="offer-fields"><h2>Where & when</h2>${input('city','City or operating area',memo.city??(asset.city==='Location to confirm'?'':asset.city),'text','required maxlength="100" placeholder="Bucharest"')}<div class="grid two">${input('serviceStart','Advertising starts',memo.serviceStart??localTime(schedule.serviceStart),'datetime-local','required')}${input('serviceEnd','Advertising ends',memo.serviceEnd??localTime(schedule.serviceEnd),'datetime-local','required')}</div><details class="offer-timing"><summary>Booking window & production deadlines</summary>${input('biddingClose','Bookings close',memo.biddingClose??localTime(schedule.biddingClose),'datetime-local','required')}<p class="tiny muted">Bookings close before printing. Artwork is due halfway between booking close and installation. Installation is due when advertising starts; issue review ends one day after advertising ends.</p></details><div class="offer-spot-heading"><h2>Prices for your spots</h2><p>${test?'Demo prices use real USDC. No physical delivery.':'Include printing and installation in every price.'}</p></div>${check('takeoverDefault','Allow takeovers until bookings close',memo.takeoverDefault??true)}<p class="tiny muted">A new advertiser can replace a reservation before printing. The previous advertiser keeps their refund and any earned reward.</p>${asset.spots.map((p,i)=>`<div class="offer-price"><div class="offer-price-name"><span>${i+1}</span><strong>${esc(p.name)}</strong></div>${input('price:'+p.id,'Full campaign price · USDC',memo['price:'+p.id]??(Number(p.suggestedPriceCents)/100).toFixed(2),'number','required min="0.01" step="0.01"')}<details><summary>Takeover setting</summary>${select('rule:'+p.id,'Takeover rule',[['inherit','Use listing setting'],['on','Allow takeovers'],['off','Fixed reservation']],memo['rule:'+p.id]??'inherit')}</details></div>`).join('')}<details class="offer-rules"><summary>Advertising rules</summary>${textArea('rules','What advertising can you accept?',memo.rules??(test?'Team-run test. No physical advertising delivery. Payments use real USDC; generated artwork and delivery evidence are synthetic.':'No misleading or unsafe advertising. Keep windows, lights, number plates and sensors clear. Printing and installation are included. Artwork is reviewed before production.'),'required maxlength="3000"')}</details></section><aside class="offer-review"><h2>Your listing preview</h2>${vehicleEditor(asset,null,{interactive:false})}<h3>${esc(asset.title)}</h3><p>${asset.spots.length} independently bookable ${asset.spots.length===1?'spot':'spots'}.</p>${privateListingPhotos(asset).length?check('publicCover','Publish these vehicle photos on public IPFS with the listing.',!!memo.publicCover):''}${check('reviewed',test?'I understand this team test uses real payments and provides no physical advertising.':'I can offer these surfaces, have reviewed their layout, and will arrange printing and installation.',false)}<p data-publication-capacity role="status">Checking publication availability...</p>${submit('Review & publish')}${act('save-quick-offer','Save listing draft','','button')}<p class="tiny muted">Your wallet approves publication. The final advertiser receives a placement NFT when bookings close.</p></aside></div>`);
}
function cents(value){const s=String(value);if(!/^(0|[1-9][0-9]*)(\.\d{1,2})?$/.test(s))throw new Error('Enter prices in whole USDC cents.');const [a,b='']=s.split('.');const n=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));if(n<=0n)throw new Error('Each price must be at least 0.01 USDC.');return n.toString();}
export async function saveOffer(data,{publish=false}={}){
 const wallet=live.session.wallet,id=String(data.get('assetId'));let asset=rawAsset(id);if(!asset)throw new Error('Reopen your saved vehicle.');
 if(publish&&!data.has('reviewed'))throw new Error('Review the surfaces and delivery responsibilities before publishing.');
 const city=String(data.get('city')??'').trim();if(!city)throw new Error('Enter the city or area where the vehicle operates.');
 const schedule=campaignSchedule(Object.fromEntries(['biddingClose','serviceStart','serviceEnd'].map(k=>[k,String(data.get(k))]))),memo=saved(id),requestId=memo.requestId??crypto.randomUUID();
 const spots=asset.spots.map(p=>({id:p.id,priceCents:cents(data.get('price:'+p.id)),...(data.get('rule:'+p.id)==='inherit'?{}:{takeoverEnabled:data.get('rule:'+p.id)==='on'})}));
 const guard=()=>{if(live.session?.wallet!==wallet)throw new Error('The connected wallet changed. Reopen this draft with its owner wallet.');};
 let capacity;if(publish)try{capacity=await publicationCapacity({force:true,background:false});}catch{}
 const sponsored=capacity?.mode==='hub'&&capacity.sponsoredSlots>=spots.length,canPublish=!wallet.startsWith('0x')||sponsored;
 if(publish&&canPublish)asset=await publishVehiclePhotos(asset,{acknowledged:data.has('publicCover'),wallet});
 if(city!==asset.city){asset=await api('assets/'+id,{version:asset.version,asset:{...asset,city}},{method:'PATCH'});}
 guard();const payload={assetId:id,title:asset.title+' · campaign',arbiterId:live.config.defaultArbiter,takeoverDefault:data.has('takeoverDefault'),rules:String(data.get('rules')),spots,schedule};
 localStorage.setItem(storageKey(id),JSON.stringify({...Object.fromEntries(data),requestId}));
 let existing;try{existing=await api('sale-requests/'+requestId);}catch(e){if(e.status!==404)throw e;}
 guard();let result;
 if(existing?.status==='published'){navigate('/host/sales/'+existing.id);return;}
 if(existing)result=await api('sales/'+existing.id,{version:existing.version,sale:payload},{method:'PATCH'});else result=await api('sales',{...payload,requestId});
 guard();await refresh({local:true,render:false});navigate('/host/sales/'+result.id);
 if(publish){if(!canPublish)throw new Error('Your campaign draft is saved. Complimentary publication is currently full. You can return when sponsorship is available or use a NEAR wallet with its own deposit.');await actions.publish({dataset:{id:result.id}});}else toast('Campaign draft saved. Publish it when you are ready.');
}
export function mountOffer(){
 const f=document.querySelector('form[data-live-form="quick-offer"]');if(!f)return;const wallet=live.session.wallet,asset=rawAsset(f.elements.namedItem('assetId').value);
 f.addEventListener('input',()=>{const memo=saved(asset.id),data=new FormData(f);localStorage.setItem(storageKey(asset.id),JSON.stringify({...memo,...Object.fromEntries(data),takeoverDefault:data.has('takeoverDefault'),publicCover:data.has('publicCover')}));});
 void publicationCapacity().then(c=>{if(!f.isConnected||live.session?.wallet!==wallet)return;const enough=c.sponsoredSlots>=asset.spots.length,el=f.querySelector('[data-publication-capacity]');el.textContent=enough?'Complimentary publication is available for these placements.':c.paidAvailable?(c.reservePerSpot?'Publication deposit: '+nativeUnits(BigInt(c.reservePerSpot??'0')*BigInt(asset.spots.length))+' NEAR, plus wallet fees. Unused reserves can return after settlement.':'Your wallet review will show the publication deposit and fees.'):'Complimentary publication is currently full. Save your draft and return when space is available.';if(!enough&&!c.paidAvailable){const b=f.querySelector('button[type="submit"]');b.disabled=true;b.textContent='Publication currently full';}}).catch(()=>{if(f.isConnected)f.querySelector('[data-publication-capacity]').textContent='Publication availability could not be checked. Your draft can still be saved.';});
}
