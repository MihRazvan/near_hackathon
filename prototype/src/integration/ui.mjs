import { esc, link, badge, card, vehicle, empty, short, heading as designHeading, table } from '../ui.mjs';
import { live, assetView, snapshot, usdc, dateTime, byNs, sale, allSales, rawAsset } from './runtime.mjs';
export { esc,link,badge,card,empty,short,table };
export const heading=(eyebrow,title,description='',action='')=>designHeading(esc(eyebrow),title,esc(description),action);
export const act=(name,label,attrs='',cls='button')=>`<button type="button" class="${cls}" data-live-action="${name}" ${attrs}>${label}</button>`;
export const input=(name,label,value='',type='text',extra='')=>`<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
export const textArea=(name,label,value='',extra='')=>`<label class="field"><span>${label}</span><textarea name="${name}" rows="4" ${extra}>${esc(value)}</textarea></label>`;
export const select=(name,label,items,value='',extra='')=>`<label class="field"><span>${label}</span><select name="${name}" ${extra}>${items.map(([id,title])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;
export const check=(name,label,checked=false)=>`<label class="check-row"><input type="checkbox" name="${name}" ${checked?'checked':''}> ${label}</label>`;
export const submit=label=>`<button type="submit" class="button primary">${label}</button>`;
export const form=(name,body,attrs='')=>`<form data-live-form="${name}" ${attrs}>${body}</form>`;
export const hidden=(name,value)=>`<input type="hidden" name="${name}" value="${esc(value)}">`;
export const notice=(title,body,tone='')=>`<div class="notice ${tone}"><div><strong>${title}</strong><p>${body}</p></div></div>`;
export const transaction=(hash,network='near')=>hash?`<code class="connected-hash">${esc(hash)}</code>`:'Awaiting wallet approval';
export const scene=(asset,selected='',editor=false)=>vehicle(assetView(asset),{large:true,editor:true,selected,interactive:true,spots:true});
export const own=asset=>asset?.owner===live.session?.wallet;
export const signedOut=()=>empty('Connect a wallet to continue.','Your listings, placements and money records belong to the account you sign in with.',link('/sign-in?next='+encodeURIComponent(location.pathname+location.search),'Connect wallet','button primary'));
export function unavailable(title='This record is unavailable.'){return empty(title,'Choose a published space or open a record belonging to your connected wallet.',link('/explore','Explore spaces'));}
export function spotState(spot){
 const s=snapshot(spot.contractId),now=Date.parse(live.catalog?.time??new Date().toISOString());
 return {snapshot:s,closed:!s||s.state.outcome!=='open'||BigInt(s.state.cutoff_ns)<=BigInt(now)*1000000n,
  booked:!!s?.state.holder,takeover:spot.takeoverEnabled,price:s?.state.next_price??String(BigInt(spot.priceCents)*10000n)};
}
export function saleCards(values){return values.length?`<div class="asset-grid">${values.map(s=>{
 const a=s.publication?.manifest.asset??rawAsset(s.assetId);if(!a)return '';
 const prices=s.spots.map(p=>spotState(p)),available=prices.filter(p=>!p.closed&&(!p.booked||p.takeover));
 return `<article class="asset-card"><a class="card-visual" href="/spaces/${s.assetId}?sale=${s.id}">${vehicle(assetView(a),{spots:false})}</a><div class="asset-card-body"><span class="tiny muted">${esc(a.city)} · ${esc(a.assetType)}</span><h3>${link('/spaces/'+s.assetId+'?sale='+s.id,esc(a.title),'text-link')}</h3><p>${esc(s.title)}</p><div class="card-tags">${badge(available.length+' available')}${badge(s.spots.some(p=>p.takeoverEnabled)?'Takeovers':'Fixed')}</div><div class="card-price"><strong>${available.length?usdc(available.reduce((m,p)=>BigInt(p.price)<BigInt(m)?p.price:m,available[0].price)):'Bidding closed'}</strong><small>Printing & installation included</small></div></div></article>`;
 }).join('')}</div>`:empty('The marketplace is ready for its first space.','Publish a vehicle and a campaign period to make it available here.',link('/host/assets/new','List a space','button primary'));}
export function scheduleSummary(s){return `<dl class="data-list">${[['Bidding ends',s.schedule.biddingClose],['Artwork due',s.schedule.artworkDue],['Installation due',s.schedule.installationDue],['Service starts',s.schedule.serviceStart],['Service ends',s.schedule.serviceEnd],['Review ends',s.schedule.reviewEnd]].map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(dateTime(v))}</dd></div>`).join('')}</dl>`;}
export function evidence(s){return card('Verified campaign state',`<dl class="data-list">${[['Outcome',s.state.outcome],['Purchase round',s.state.round],['Final payer',short(s.state.holder?.account_id??'Not booked')],['NFT owner',short(s.rights.current_owner_id??'Not issued')],['Artwork',s.state.artwork_locked?'Locked revision '+s.rights.revision:s.rights.proposal?'Revision '+s.rights.revision:'Not submitted'],['Installation proof',s.campaign.delivery_proof?'Submitted':'Not submitted'],['Open issues',s.campaign.open_issues],['Escrow balance',usdc(s.escrowBalance)]].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${s.rights.proposal?`<p>Artwork: ${artifactLink(s.rights.proposal.artifact_uri)}</p>`:''}${s.campaign.delivery_proof?`<p>Installation: ${artifactLink(s.campaign.delivery_proof.artifact_uri)}</p>`:''}<details><summary>Chain receipt details</summary><p class="tiny muted">Finalized block ${s.blockHeight} · ${esc(s.blockHash)}</p></details>`);}
export function bookingTable(rows,{owner=false}={}){return table(['Placement','Status','Principal','Campaign',''],rows.map(b=>{
 const s=sale(b.saleId),snap=snapshot(b.contractId);let status=b.status;
 if(b.accepted&&snap){if(snap.state.outcome==='failure')status='cancelled';else if(snap.state.holder?.account_id!==b.owner)status='outbid';else if(snap.state.outcome==='success')status='completed';}
 return [esc(s?.title??b.contractId),badge(status),usdc(b.amount),esc(live.data?.dashboard.campaigns.find(c=>c.id===b.campaignId)?.name??short(b.owner)),link((owner?'/host/bookings/':'/buy/placements/')+b.id,'Open ↗','text-link')];}));}

export function artifactLink(uri){return typeof uri==='string'&&/^ipfs:\/\/baf[a-z2-7]+$/.test(uri)?`<a href="${esc(uri.replace('ipfs://','https://gateway.pinata.cloud/ipfs/'))}" target="_blank" rel="noopener noreferrer" class="text-link">Open verified artifact ↗</a>`:esc(uri??'');}
