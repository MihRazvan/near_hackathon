import {listingAsset} from './reference-images.mjs';
import {listingView} from './listing-view.mjs';
import {listingPlacements,groupedListings} from './listing-groups.mjs';
import { live,sale,snapshot,usdc } from './runtime.mjs';
import { esc,link,card,empty,heading,select,input,submit,unavailable,act } from './ui.mjs';
import {listingAvailability,micro} from './buyer-state.mjs';
import { homeView, categoryLinks } from './marketing.mjs';
import {isTeamTest} from './campaign-kind.mjs';
import {marketCard} from './market-card.mjs';
const clock=()=>Date.parse(live.catalog?.time)||Date.now();
const assetFor=listingAsset;
const stateFor=(offer,spot)=>listingAvailability(spot,snapshot(spot.contractId),clock());
const placements=offer=>listingPlacements(offer,live.catalog?.sales??[]);
const availablePlacements=offer=>placements(offer).filter(e=>stateFor(e.sale,e.spot).available);
const availableSpots=offer=>availablePlacements(offer).map(e=>e.spot);
const checking=offer=>placements(offer).some(e=>stateFor(e.sale,e.spot).kind==='checking'&&(!Number.isFinite(Date.parse(e.sale.schedule?.biddingClose))||Date.parse(e.sale.schedule.biddingClose)>clock()));
const catalogStatus=()=>`<div class="market-invitation" role="status" ${live.catalogLoading?'aria-busy="true"':''}><div><h3>${live.catalogLoading?'Loading available spaces.':'Spaces could not load.'}</h3><p>${live.catalogLoading?'You can explore the site while availability is checked.':'Try again to check current availability.'}</p></div>${live.catalogLoading?'':act('refresh','Try again','','button primary')}</div>`;
const campaignQuery=()=>new URLSearchParams(location.search).get('campaign');
const campaignInput=()=>campaignQuery()?`<input type="hidden" name="campaign" value="${esc(campaignQuery())}">`:'';
const spaceUrl=(offer,spot)=>'/spaces/'+encodeURIComponent(offer.assetId)+'?sale='+encodeURIComponent(offer.id)+(spot?'&spot='+encodeURIComponent(spot.id):'')+(campaignQuery()?'&campaign='+encodeURIComponent(campaignQuery()):'');
function offerCards(offers,mode="all"){
 if(!offers.length)return '';
 return `<div class="asset-grid market-grid">${offers.map(offer=>{
  const asset=assetFor(offer);if(!asset)return '';
  const available=availablePlacements(offer),matching=mode==='all'?available:available.filter(e=>stateFor(e.sale,e.spot).kind===(mode==='open'?'available':'takeover')),chosen=matching.reduce((a,b)=>!a||micro(stateFor(b.sale,b.spot).price)<micro(stateFor(a.sale,a.spot).price)?b:a,null),price=chosen?stateFor(chosen.sale,chosen.spot).price:null;
  const members=placements(offer),completed=members.every(e=>snapshot(e.spot.contractId)?.state.outcome==='success'),minted=members.some(e=>snapshot(e.spot.contractId)?.state.nft_minted),delivered=members.some(e=>snapshot(e.spot.contractId)?.campaign.delivery_proof);
  const closedStatus=checking(offer)?live.catalogLoading?'Checking availability':'Availability unavailable':completed?'Campaign complete':delivered?'Delivery recorded':minted?'Placement NFT issued':'Booking closed';
  const takeovers=available.filter(e=>stateFor(e.sale,e.spot).kind==='takeover'),open=available.length-takeovers.length;
  const date=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value)):'';
  const period=offer.schedule?.serviceStart&&offer.schedule?.serviceEnd?date(offer.schedule.serviceStart)+' – '+date(offer.schedule.serviceEnd):'';
  const spotState=available.length?(takeovers.length?`${takeovers.length} takeover${takeovers.length===1?'':'s'} available${open?' · '+open+' open':''}`:'Open for reservations'):'';
  return marketCard({asset,period,spotState,href:chosen?spaceUrl(chosen.sale,chosen.spot):checking(offer)?spaceUrl(offer):'/records/'+encodeURIComponent(offer.id),price:price?usdc(price):null,priceLabel:mode==='takeover'?'Takeover from':mode==='open'?'Reserve from':'From',status:closedStatus,count:members.length,demo:isTeamTest(offer)||asset.imageProvenance==='ai-generated',action:available.length||checking(offer)?'View spots':'View record'});
 }).join('')}</div>`;
}
function searchForm(q=new URLSearchParams()){
 return `<form action="/explore" method="get" class="search-bar marketplace-search">${campaignInput()}<input type="hidden" name="booking" value="${esc(q.get('booking')??'all')}"><input type="hidden" name="type" value="${esc(q.get('type')??'')}">${input('q','Where will your ad go?',q.get('q')??q.get('city')??'','search','placeholder="Search a city or vehicle"')}<details class="market-filters"><summary>Filters</summary><div class="market-filter-fields">${select('availability','Campaigns',[['available','Available to book'],['all','Include past campaigns']],q.get('availability')??'available')}${select('sort','Sort by',[['newest','Recently listed'],['price','Price: low to high']],q.get('sort')??'newest')}${submit('Apply filters')}${link('/explore','Clear filters','text-link')}</div></details>${submit('Find spaces')}</form>`;
}
export function publicView(r){
 const q=new URLSearchParams(location.search),all=live.catalog?.sales??[],sales=groupedListings(all,s=>s.spots.some(p=>stateFor(s,p).available));
 if(r.id==='P01'){
  const rank=s=>availableSpots(s).length?(s.spots.some(p=>snapshot(p.contractId)?.state.holder)?1:0):s.spots.every(p=>snapshot(p.contractId)?.state.outcome==='success')?3:2;
  const available=sales.filter(s=>availableSpots(s).length),teamTests=sales.filter(isTeamTest).sort((a,b)=>rank(a)-rank(b));
  const featured=[...teamTests,...sales.filter(s=>!isTeamTest(s)&&(availableSpots(s).length||checking(s)))];
  return homeView({session:live.session,inventory:offerCards(featured.slice(0,4))||(!live.catalog||live.catalogLoading||live.error?catalogStatus():''),teamTests:teamTests.length>0,availableCount:available.length,publishedCount:live.catalogLoading?0:sales.length});
 }
 if(r.id==='P02'){
  const term=(q.get('q')??q.get('city')??'').trim().toLowerCase(),type=q.get('type')??'',all=q.get('availability')==='all',sort=q.get('sort')??'newest',mode=['open','takeover'].includes(q.get('booking'))?q.get('booking'):'all';
  const matches=sales.filter(s=>{const a=assetFor(s),owner=live.catalog?.owners?.find(o=>o.wallet===s.owner);return a&&(!term||[a.title,a.description,a.city,s.title,owner?.name,owner?.brand].some(v=>String(v??'').toLowerCase().includes(term)))&&(!type||a.assetType===type)&&(all||availableSpots(s).length||checking(s));});
  let values=matches.filter(s=>mode==='all'||availablePlacements(s).some(e=>stateFor(e.sale,e.spot).kind===(mode==='open'?'available':'takeover')));
  if(sort==='price')values.sort((a,b)=>{const cheapest=s=>availableSpots(s).map(p=>micro(stateFor(s,p).price)).reduce((a,b)=>a<b?a:b,10n**30n);const x=cheapest(a),y=cheapest(b);return x<y?-1:x>y?1:0;});else values=[...values].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const modes=`<nav class="market-booking-modes" aria-label="Booking type">${[['all','All spaces'],['open','Open spots'],['takeover','Takeovers']].map(([id,label])=>{const next=new URLSearchParams(q);next.set('booking',id);return `<a href="/explore?${esc(next.toString())}" ${mode===id?'aria-current="page"':''}>${label}</a>`;}).join('')}</nav>`;
  return `<section class="marketplace-page"><div class="marketplace-heading"><h1 tabindex="-1">Find your next spot.</h1><p>Choose a vehicle and a panel for your ad.</p></div>`+searchForm(q)+categoryLinks(type)+modes+
   `<p class="market-results">${values.length} ${values.length===1?'vehicle':'vehicles'}${term?' matching your search':''}</p>`+
   (values.length?offerCards(values,mode):!live.catalog||live.catalogLoading?catalogStatus():matches.some(checking)?empty('Availability unavailable.','Retry to check whether these vehicles have open spots or takeovers.',act('refresh','Check availability','','button primary')):empty('No spaces match just yet.','Try another area or include past campaigns to see more inventory.',link('/explore?availability=all','Browse all campaigns','button primary')))+'</section>';
 }
 if(r.id==='P03'){
  const offer=sale(q.get('sale'))??sales.find(s=>s.assetId===r.params.slug&&availableSpots(s).length)??sales.find(s=>s.assetId===r.params.slug);if(!offer||offer.status!=='published')return !live.catalog||live.catalogLoading?catalogStatus():unavailable('This campaign is unavailable.');
  return listingView(offer,all,q);
 }
 if(r.id==='P04'){
  const values=sales.filter(s=>s.owner===r.params.slug),owner=live.catalog?.owners?.find(o=>o.wallet===r.params.slug);
  if(!owner&&!values.length)return !live.catalog||live.catalogLoading?catalogStatus():unavailable('Space owner not found.');
  return heading('SPACE OWNER',owner?.name??'Independent space owner',owner?.brand??'Advertising inventory from an independent owner.')+(values.length?offerCards(values,mode):empty('No published campaigns yet.','This owner\'s spaces will appear here when they publish a campaign.',link('/explore','Explore spaces')));
 }
 if(r.id==='P07')return heading('HELP','Help with your campaign.','Find answers about booking, artwork, takeovers and payouts.')+`<div class="grid two">${Object.entries(articles).map(([slug,a])=>card(a.title,`<p>${a.summary}</p>${link('/help/'+slug,'Read guide','text-link')}`)).join('')}</div>`+card('Need help with a campaign?',`<p>Open your placement to contact the owner or request an issue review.</p>${link('/support/new','Contact support','button primary')}`);
 if(r.id==='P08'){
  const a=articles[r.params.article];return a?heading('HELP',a.title,a.summary)+card('',a.body.map(p=>`<p>${p}</p>`).join(''))+link('/help','Back to help'):unavailable('This help article is unavailable.');
 }
 if(r.id==='P09'){
  const a=policies[r.params.policy]??articles[r.params.policy==='refunds'?'refunds':r.params.policy==='takeovers'?'takeovers':r.params.policy==='content'?'artwork':'payments'];return heading('PLATFORM GUIDELINES',a.title,a.summary)+card('',a.body.map(p=>`<p>${p}</p>`).join(''))+card('The published offer comes first.','<p>Each listing specifies its dates, price, takeover setting and advertising requirements. Read these before booking.</p>');
 }
 return null;
}
const articles={
 takeovers:{title:'How takeovers work',summary:'A new advertiser can replace a booking before production.',body:['Owners choose whether each spot allows takeovers. The current price and booking deadline are displayed before payment.','When a takeover succeeds, the previous advertiser\'s principal becomes claimable by the wallet that paid it. Any conditional reward becomes available only if the campaign settles successfully.','Takeovers close before the final artwork is printed or installed. Campaign periods remain fixed.']},
 payments:{title:'Payments and your balance',summary:'Book in USDC and approve the exact amount in your wallet.',body:['Every advertised price covers the campaign period, printing and installation. Wallet network or funding-route costs are shown separately when applicable.','You can add spending funds from a supported wallet, use your available balance for bookings, and withdraw available funds back to your wallet.','If a payment result is unclear, open Account recovery to check the original transaction. An uncertain result should be checked before another payment is started.']},
 artwork:{title:'Artwork and installation',summary:'From your design to the owner\'s installation evidence.',body:['The final placement controller submits artwork after booking closes. Upload a design or enter the ad copy for the owner to review. Submitted files and text are stored publicly.','The owner approves and locks an exact artwork revision before arranging printing and installation. Contact the owner about changes before it is locked.','The owner submits installation evidence. Location and delivery information are supplied by the owner; the platform does not independently measure impressions or verify physical installation.']},
 refunds:{title:'Refunds and payouts',summary:'Your payment rights stay with the wallet that paid.',body:['A displaced advertiser can claim their available principal refund. A conditional takeover reward is separate and depends on successful completion.','If a campaign is cancelled, the final advertiser\'s refundable principal becomes available and conditional rewards are cancelled.','Owner earnings become available after the service period and issue review finish. Open issues must be resolved before successful settlement. A placement NFT transfer does not transfer anyone\'s refund or earnings.']}
};

const policies={
 privacy:{title:'Your wallet and public content',summary:'Know what becomes public before you book or upload.',body:['Wallet addresses, payments and placement records are visible on public blockchain networks. Disconnecting a wallet does not remove those records.','Submitted artwork, ad copy and installation evidence are stored on public IPFS. Do not upload private, confidential or personally sensitive content. Public copies may remain accessible after a campaign ends.','Your wallet approves sign-in and payment requests. Review the account, amount and destination shown by your wallet before approving.']},
 terms:{title:'Booking and delivery guidelines',summary:'Clear campaign dates, owner rules and payment rights.',body:['Advertisers book under the published campaign dates, advertising rules, price and takeover setting. The spot price includes printing and installation arranged by the space owner.','Space owners are responsible for having permission to offer the surface and arrange the agreed installation. Advertisers are responsible for having permission to use their submitted content.','A placement receipt records the final advertising right for the stated campaign. It does not transfer ownership of the vehicle or surface. Payment, refund and earnings rights stay with their original wallets.','Review installation evidence and raise campaign issues before the published issue-review deadline. Funds become available according to the campaign\'s final outcome.']}
};
