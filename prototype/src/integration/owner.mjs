import { live,rawAsset,allSales,sale,snapshot,allBookings,booking,usdc,byNs,dateTime } from './runtime.mjs';
import { esc,link,badge,card,empty,heading,act,select,form,input,textArea,check,submit,hidden,scene,scheduleSummary,evidence,bookingTable,unavailable,signedOut,own,notice,table } from './ui.mjs';

export function assetEditor(a){
 const selected=new URLSearchParams(location.search).get('spot')??a.spots[0]?.id;
 return heading('OWNER / YOUR SPACE',a.title,'Review the physical surfaces and save your editable inventory.',link('/host/sales/new?asset='+a.id,'Create a sale','button primary'))+
 form('asset-edit',hidden('id',a.id)+hidden('version',a.version)+`<div class="split"><div>${scene(a,selected,true)}<p class="tiny muted">Drag a panel or its corner to adjust it. Positions are approximate; confirm measurements before production.</p></div>${card('Asset details',input('title','Asset title',a.title,'text','required maxlength="100"')+input('city','City',a.city,'text','required')+select('assetType','Type',[['car','Car'],['van','Van'],['bike','Bike'],['motorcycle','Motorcycle'],['truck','Truck'],['other','Other']],a.assetType)+textArea('description','Description',a.description,'required'))}</div>`+
 `<div class="section-heading"><h2>Advertising spots</h2>${act('add-spot','Add a spot',`data-id="${a.id}"`)}</div><div class="connected-spots">${a.spots.map(p=>spotEditor(p,a.spots.length)).join('')}</div>`+
 check('reviewed','I reviewed the surfaces and will confirm physical measurements before production.',false)+submit('Save space & spot layout'));
}
function spotEditor(p,count){return card(esc(p.name),`<div class="grid three">${input('name:'+p.id,'Spot name',p.name,'text','required')}${select('side:'+p.id,'Vehicle view',[['left','Left'],['right','Right'],['rear','Rear'],['front','Front'],['top','Top']],p.side)}${input('price:'+p.id,'Suggested price · USDC',(Number(p.suggestedPriceCents)/100).toFixed(2),'number','min="0.01" step="0.01" required')}</div><div class="grid four">${['x','y','width','height'].map(k=>input(k+':'+p.id,k==='x'?'Left · %':k==='y'?'Top · %':k==='width'?'Width · %':'Height · %',(p.box[k]*100).toFixed(2),'number','min="0" max="100" step="0.01" required')).join('')}</div>${count>1?act('remove-spot','Remove this spot',`data-id="${p.id}"`,'button small'):''}`);}
function localTime(value){const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
export function saleEditor(existing){
 const assets=live.data.dashboard.assets,q=new URLSearchParams(location.search),a=rawAsset(existing?.assetId??q.get('asset'))??assets[0];
 if(!a)return empty('Create a space first.','Save a vehicle and its advertising surfaces before creating a campaign sale.',link('/host/assets/new','Create a space','button primary'));
 const base=Date.parse(live.catalog.time),times={biddingClose:30,artworkDue:60,installationDue:90,serviceStart:90,serviceEnd:110,reviewEnd:120};
 const schedule=existing?.schedule??Object.fromEntries(Object.entries(times).map(([key,min])=>[key,new Date(base+min*60000).toISOString()]));
 const arbiter=existing?.arbiterId??live.config.defaultArbiter??live.config.wallets.find(w=>w.label==='Arbiter')?.address??'';
 const selected=existing?.spots??a.spots.map(p=>({id:p.id,priceCents:live.config.sandbox?'10':p.suggestedPriceCents}));
 return heading('OWNER / CAMPAIGN SALE',existing?'Edit your draft sale.':'Create a campaign sale.','Set the period, all-in price and advertising rules before publishing.')+
 form('sale-edit',hidden('id',existing?.id??'')+hidden('version',existing?.version??'')+hidden('assetId',a.id)+
 `<div class="split">${card('Campaign details',input('title','Sale title',existing?.title??a.title+' · next campaign','text','required maxlength="100"')+
 `<p>Vehicle: <strong>${esc(a.title)}</strong></p>`+input('arbiterId','Issue-review NEAR account',arbiter,'text','required')+check('takeoverDefault','Enable takeovers by default',existing?.takeoverDefault??true))}
 ${card('Campaign dates',`<div class="grid two">${Object.entries({biddingClose:'Bidding ends',artworkDue:'Artwork due',installationDue:'Installation due',serviceStart:'Service starts',serviceEnd:'Service ends',reviewEnd:'Issue review ends'}).map(([key,label])=>input(key,label,localTime(schedule[key]),'datetime-local','required')).join('')}</div>${live.config.sandbox?act('quick-dates','Use quick test dates')+' '+act('relaxed-dates','Use relaxed test dates'):live.config.developmentWallets?.length?act('mainnet-test-dates','Use 35-minute test dates'):''}`)}</div>`+
 card('Price & takeover rules',`<p>Every spot price includes printing and installation for the full campaign period.</p>${selected.map(p=>{const spot=a.spots.find(x=>x.id===p.id);return `<div class="grid three"><strong>${esc(spot?.name??p.id)}</strong>${input('price:'+p.id,'All-in price · USDC',(Number(p.priceCents)/100).toFixed(2),'number','min="0.01" step="0.01" required')}${select('rule:'+p.id,'Takeovers',[['inherit','Use sale default'],['on','Enabled'],['off','Fixed booking']],p.takeoverEnabled===undefined?'inherit':p.takeoverEnabled?'on':'off')}</div>`;}).join('')}`)+
 card('Content rules',textArea('rules','Allowed advertising & production requirements',existing?.rules??'No misleading or unsafe advertising. Keep glazing, lights, licence plates and sensors clear. Owner arranges printing and installation; artwork requires approval.','required maxlength="3000"'))+
 submit('Save sale draft'));
}
export function ownerView(r){
 if(!live.session)return signedOut();
 const d=live.data?.dashboard;if(!d)return empty('Loading your workspace.','Your private records are being loaded.');
 if(live.session.wallet.startsWith('0x'))return heading('SPACE OWNER','Connect your NEAR owner wallet.','Buyer payments can use an EVM wallet. Listings and physical fulfillment are controlled by the owner’s NEAR account.',link('/settings/wallets','Switch wallet','button primary'));
 if(r.id==='O01')return heading('OWNER WORKSPACE','Put your everyday space to work.','Create advertising inventory, publish campaigns and manage delivery.',link('/host/assets/new','List a space','button primary'))+
 `<div class="stats">${[['Spaces',d.assets.length],['Published sales',d.sales.filter(s=>s.status==='published').length],['Bookings',d.incomingBookings.filter(b=>b.accepted).length]].map(([label,n])=>`<div class="stat"><span>${label}</span><strong>${n}</strong></div>`).join('')}</div>`+
 card('Your campaigns',salesTable(d.sales))+card('Recent bookings',bookingTable(d.incomingBookings,{owner:true}));
 if(r.id==='O02')return heading('OWNER / SPACES','Your advertising inventory.','Vehicles and surfaces you control.',link('/host/assets/new','Add a space','button primary'))+
 (d.assets.length?`<div class="asset-grid">${d.assets.map(a=>card(esc(a.title),scene(a)+`<p>${esc(a.city)} · ${a.spots.length} spots</p>${link('/host/assets/'+a.id,'Open space','button primary')}`)).join('')}</div>`:empty('Your first space starts here.','Describe a vehicle or upload a photo and review its surfaces.',link('/host/assets/new','Create your first space','button primary')));
 if(r.id==='O03')return heading('OWNER / CREATE A SPACE','Turn a vehicle into your next opportunity.','Describe it, add an optional photo, then review the proposed advertising panels.',act('start-capture','Capture from another device'))+
 form('asset-create',`<div class="split">${card('Your vehicle',input('title','Asset title','','text','required maxlength="100"')+input('city','City','Bucharest','text','required')+select('assetType','Vehicle type',[['van','Van'],['car','Car'],['bike','Bike'],['motorcycle','Motorcycle'],['truck','Truck'],['other','Other']],'van')+textArea('description','Describe the vehicle and useful advertising surfaces','','required placeholder="A blue delivery van with a flat rear panel…"'))}
 ${card('How would you like to start?',select('method','Drafting method',[['ai','Suggest spots with AI'],['manual','Create one editable spot manually']],'ai')+input('photo','Optional vehicle photo · PNG or JPEG, up to 2 MB','','file','accept="image/png,image/jpeg"')+(live.capturePhoto?'<p>Your private captured photo is attached to this draft.</p>':'')+check('publicCover','Publish this photo as the listing cover. Use a photo up to 1 MB for public storage.')+notice('You stay in control.','Generated positions are editable suggestions. They do not verify ownership, dimensions or delivery.'))}</div>${submit('Create editable space')}`);
 if(['O06','O07','O08'].includes(r.id)){const a=rawAsset(r.params.id);if(!a||!own(a))return unavailable('Space not found in this wallet.');return assetEditor(live.assetEdit?.id===a.id?live.assetEdit:a);}
 if(['O04','O05'].includes(r.id))return heading('OWNER / CAPTURE','Add a vehicle photo.','Upload a photo from this device to begin an editable asset draft.')+link('/host/assets/new','Continue with photo or description','button primary');
 if(r.id==='O09')return heading('OWNER / SALES','Every campaign, in one place.','Create different sale periods from the same reusable inventory.',link('/host/sales/new','Create sale','button primary'))+card('Your sales',salesTable(d.sales));
 if(r.id==='O10')return saleEditor();
 if(r.id==='O11'){const s=sale(r.params.id);if(s?.owner!==live.session.wallet)return unavailable();return s.status==='draft'?saleEditor(s):heading('PUBLISHED TERMS','This campaign’s agreed terms are published.','Create another sale period to offer a new price, schedule or layout.',link('/host/sales/new?asset='+s.assetId,'Create another sale'));}
 if(r.id==='O12'){
  const s=sale(r.params.id);if(s?.owner!==live.session.wallet)return unavailable();const a=rawAsset(s.assetId),plans=live.data.publicationPlans.filter(p=>p.plan.saleId===s.id);
  return heading('OWNER / SALE',s.title,s.status==='published'?'Published campaign and original booking records.':'Review the dates, prices and rules before publishing.',
   s.status==='draft'?act('publish','Review & publish sale',`data-id="${s.id}"`,'button primary'):link('/spaces/'+s.assetId+'?sale='+s.id,'View public listing','button primary'))+
   `<div class="split">${card('Campaign period',scheduleSummary(s))}${card('Published rules',`<p>${esc(s.rules)}</p><p>Printing & installation included.</p>${badge(s.status)}${s.status==='draft'?link('/host/sales/'+s.id+'/edit','Edit draft','button small'):''}`)}</div>`+
   card('Spots',`<div class="grid two">${s.spots.map(p=>{const snap=snapshot(p.contractId);return card(esc(a?.spots.find(x=>x.id===p.id)?.name??p.id),`<p>${usdc(snap?.state.next_price??String(BigInt(p.priceCents)*10000n))} · ${p.takeoverEnabled?'Takeovers enabled':'Fixed booking'}</p>${snap?badge(snap.state.outcome)+`<p>Round ${snap.state.round}</p>${link('/host/sales/'+s.id+'/fulfillment?contract='+p.contractId,'Manage artwork & delivery','button primary')}`:'Not published yet'}`);}).join('')}</div>`)+
   (plans.length?card('Publication requests',plans.map(p=>`<p>${esc(p.plan.spotId)} · ${badge(p.status)} ${p.transactionHash?`<code>${esc(p.transactionHash)}</code>`:''}</p>`).join('')):'')+
   (live.data.provisionPlans?.filter(p=>p.plan.saleId===s.id).length?card('Recoverable publication',live.data.provisionPlans.filter(p=>p.plan.saleId===s.id).map(p=>`<article class="connected-record">${badge(p.status)}<p>${(Number(p.plan.collateralPerSpot)/1e24).toFixed(2)} NEAR collateral per spot · recovery keys retained locally.</p>${p.errorCode?`<p>${esc(p.errorCode)}</p>`:''}${p.assessment?.blocks?.length?`<pre>${esc(JSON.stringify(p.assessment.blocks,null,2))}</pre>`:''}${['waiting-original-receipt','needs-recovery','processing','budget-blocked'].includes(p.status)?act('resume-publication','Resume original publication',`data-id="${p.id}"`,'button small'):''}</article>`).join('')):'')+
   card('Bookings',bookingTable(d.incomingBookings.filter(b=>b.saleId===s.id),{owner:true}));
 }
 if(r.id==='O13')return heading('OWNER / BOOKINGS','Manage every placement.','Current and displaced bookings remain separate records.')+card('Incoming bookings',bookingTable(d.incomingBookings,{owner:true}));
 if(['O14','O15','O16'].includes(r.id)){
  const b=r.id==='O16'?null:booking(r.params.id),s=b?sale(b.saleId):sale(r.params.id);if(s?.owner!==live.session.wallet)return unavailable();
  const contractId=b?.contractId??new URLSearchParams(location.search).get('contract')??s.spots[0]?.contractId,snap=snapshot(contractId);
  if(!snap)return empty('Waiting for confirmed campaign state.','Refresh this page after the current transaction has settled.',act('refresh','Refresh state'));
  const media=live.data.media.filter(m=>m.status==='verified');
  return heading('OWNER / FULFILLMENT',s.title,'Review the exact artwork revision, approve it, then arrange printing and installation.')+
   `<div class="split"><div>${evidence(snap)}${card('Production artwork',snap.rights.proposal?`<p>Revision ${snap.rights.revision} · submitted by ${esc(snap.rights.proposal.submitted_by)}</p><p>${esc(snap.rights.proposal.artifact_uri)}</p>${!snap.state.artwork_locked?act('lock-artwork','Approve & lock this artwork',`data-contract="${contractId}" data-revision="${snap.rights.revision}"`,'button primary'):badge('Artwork locked')}`:'The current placement NFT owner has not submitted artwork.')}</div>`+
   `<div>${card('Installation proof',snap.campaign.delivery_proof?`<p>${badge('Installation proof recorded')}</p><p>Your installation evidence is already linked to this campaign.</p>`:form('delivery-proof',hidden('contractId',contractId)+artifactFields(media,'Describe the installation and its evidence.')+submit('Submit installation proof')))}
   ${b?card('Talk to the buyer',link('/inbox/'+b.id,'Open booking conversation')):''}${card('Issues',`<p>${snap.campaign.open_issues} open on-chain issues.</p>${link('/support/new?contract='+contractId,'Request issue review')}`)}</div></div>`;
 }
 if(r.id==='O17')return heading('OWNER / CALENDAR','Know what is available.','Published campaign periods for your inventory.')+card('Campaign schedule',salesTable(d.sales));
 if(r.id==='O18')return heading('OWNER / ANALYTICS','A clear view of your inventory.','Financial activity comes from campaign records. Exposure and distance are not measured yet.')+card('Campaign activity',salesTable(d.sales));
 if(['O19','O20'].includes(r.id))return earnings(r.params.id);
 return null;
}
export function artifactFields(media,placeholder='Describe this public artifact.'){
 return `<p class="tiny muted">Reuse a verified upload, paste its IPFS link, upload a file, or enter text below.</p>`+select('mediaId','Use an existing verified artifact',[['','Upload a new artifact'],...media.map(m=>[m.id,m.uri])])+
 input('artifactUri','Paste an existing verified IPFS link (optional)','','text','placeholder="ipfs://baf…"')+
 input('file','Public artifact · PNG, JPEG, PDF, JSON or text, up to 1 MB','','file','accept="image/png,image/jpeg,application/pdf,application/json,text/plain"')+
 textArea('notes','Artifact description · creates a text artifact when no file or link is selected','',`placeholder="${esc(placeholder)}"`)+check('public','I intend to publish this artifact to public IPFS storage.');
}
function salesTable(values){return table(['Sale','State','Bidding ends','Service period',''],values.map(s=>[esc(s.title),badge(s.status),esc(dateTime(s.schedule.biddingClose)),esc(dateTime(s.schedule.serviceStart))+' — '+esc(dateTime(s.schedule.serviceEnd)),link('/host/sales/'+s.id,'Open ↗','text-link')]));}
export function earnings(id){
 const values=(live.catalog?.snapshots??[]).filter(s=>s.state.seller_id===live.session.wallet);
 return heading('OWNER / EARNINGS','Your earnings, accounted for.','Claim eligible USDC after service and review. You can withdraw your own Intents balance into your NEAR wallet.',link('/buy/money','Wallet balances & withdrawals','button primary'))+
 card('Campaign earnings',table(['Campaign','Outcome','Available','Held',''],values.map(s=>{const c=s.credits[live.session.wallet];return [esc(sale(s.campaign.terms.sale_id)?.title??s.accountId),badge(s.state.outcome),usdc(c?.available),s.state.outcome==='open'?usdc(s.state.potential_seller_revenue):usdc('0'),c?.available!=='0'?act('claim','Claim earnings',`data-contract="${s.accountId}"`,'button small'):'—'];})))+
 card('Payout records',live.data.operations.filter(o=>o.id.startsWith('wallet-claim-')).map(o=>`<p>${badge(o.phase)} <code>${esc(o.transaction_hash??o.id)}</code></p>`).join('')||'<p>No payout request is recorded for this wallet yet.</p>');
}
