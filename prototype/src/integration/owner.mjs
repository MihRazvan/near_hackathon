import { live,rawAsset,sale,snapshot,booking,usdc,byNs,dateTime } from './runtime.mjs';
import { esc,link,badge,card,empty,heading,act,select,form,input,textArea,check,submit,hidden,scene,scheduleSummary,evidence,bookingTable,unavailable,signedOut,own,notice,table,artifactLink } from './ui.mjs';
import { defaultOwnerSchedule,ownerCampaignStage,ownerTotals,ownerCanUploadProof } from './owner-state.mjs';

const now=()=>Date.parse(live.catalog?.time??new Date().toISOString());
const development=()=>live.config?.sandbox||live.config?.developmentWallets?.length>0;
const fulfillmentUrl=(offer,contract)=>'/host/sales/'+offer.id+'/fulfillment?contract='+encodeURIComponent(contract);
const publicUrl=offer=>'/spaces/'+offer.assetId+'?sale='+offer.id;
const localTime=value=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const snapshots=()=>live.catalog?.snapshots??[];
function steps(current){return `<div class="card-tags" aria-label="Listing progress">${['Describe your space','Review surfaces','Publish a campaign'].map((name,i)=>badge((i<current?'✓ ':i+1+'. ')+name)).join('')}</div>`;}
function stageAction(offer,contract,stage){
 if(stage.action==='listing')return link(publicUrl(offer),'View listing','button primary');
 if(stage.action==='earnings')return link('/host/earnings','View earnings','button primary');
 if(stage.action==='new-sale')return link('/host/sales/new?asset='+offer.assetId,'Create another campaign','button primary');
 if(stage.action==='support')return link('/support/new?contract='+encodeURIComponent(contract),'Request a review','button primary');
 if(stage.action==='message')return link('/inbox/'+encodeURIComponent(contract),'Message advertiser','button primary');
 if(stage.action==='refresh')return act('refresh','Refresh status');
 return link(fulfillmentUrl(offer,contract),stage.key==='review-artwork'?'Review artwork':stage.key==='installation'?'Add installation evidence':'Manage delivery','button primary');
}
function campaignNext(offer,spot){const s=snapshot(spot.contractId),stage=ownerCampaignStage(s,now());return card(stage.title,`<p>${esc(stage.description)}</p>${stageAction(offer,spot.contractId,stage)}`);}
function ownerRecord(s){return `<details><summary>Payment and ownership record</summary>${evidence(s)}</details>`;}
function unavailableUpdates(){return live.catalog?.unavailable?.length?notice('Some payments are updating.','Balances and campaign status will refresh after the current transaction confirms.') : '';}

export function assetEditor(a){
 const selected=new URLSearchParams(location.search).get('spot')??a.spots[0]?.id,reviewing=location.pathname.endsWith('/review');
 return heading('YOUR SPACES',a.title,'Outline the surfaces you can offer, then set a campaign period and price.')+steps(1)+
 form('asset-edit',hidden('id',a.id)+hidden('version',a.version)+hidden('next',reviewing?'campaign':'space')+`<div class="split"><div>${scene(a,selected,true)}<p class="tiny muted">Drag a panel to move it. Drag its corner to resize it. Confirm the real measurements before printing.</p></div>${card('Space details',input('title','Listing name',a.title,'text','required maxlength="100"')+input('city','City or operating area',a.city,'text','required maxlength="100"')+select('assetType','Type of space',[['car','Car'],['van','Van'],['bike','Bike'],['motorcycle','Motorcycle'],['truck','Truck'],['other','Other']],a.assetType)+textArea('description','What should advertisers know?',a.description,'required'))}</div>`+
 `<div class="section-heading"><div><h2>Advertising surfaces</h2><p class="muted">Each surface can have its own price and takeover rule.</p></div>${act('add-spot','Add a surface',`data-id="${a.id}"`)}</div><div class="connected-spots">${a.spots.map(p=>spotEditor(p,a.spots.length)).join('')}</div>`+
 check('reviewed','I have reviewed these surfaces and will confirm their physical measurements.',false)+submit(reviewing?'Save & continue':'Save space & spot layout'));
}
function spotEditor(p,count){return card(esc(p.name),`<div class="grid three">${input('name:'+p.id,'Surface name',p.name,'text','required')}${select('side:'+p.id,'View',[['left','Left'],['right','Right'],['rear','Rear'],['front','Front'],['top','Top']],p.side)}${input('price:'+p.id,'Starting price · USDC',(Number(p.suggestedPriceCents)/100).toFixed(2),'number','min="0.01" step="0.01" required')}</div><details><summary>Fine-tune position and size</summary><div class="grid four">${['x','y','width','height'].map(k=>input(k+':'+p.id,k==='x'?'Left · %':k==='y'?'Top · %':k==='width'?'Width · %':'Height · %',(p.box[k]*100).toFixed(2),'number','min="0" max="100" step="0.01" required')).join('')}</div></details>${count>1?act('remove-spot','Remove surface',`data-id="${p.id}"`,'button small'):''}`);}

export function saleEditor(existing){
 const assets=live.data.dashboard.assets,q=new URLSearchParams(location.search),a=rawAsset(existing?.assetId??q.get('asset'))??assets[0];
 if(!a)return empty('Start with your space.','Add a vehicle or another surface before setting up a campaign.',link('/host/assets/new','Add a space','button primary'));
 const schedule=existing?.schedule??defaultOwnerSchedule(now()),arbiter=existing?.arbiterId??live.config.defaultArbiter??live.config.wallets?.find(w=>w.label==='Arbiter')?.address??'';
 const selected=existing?.spots??a.spots.map(p=>({id:p.id,priceCents:live.config.sandbox?'10':p.suggestedPriceCents}));
 const expired=Date.parse(schedule.biddingClose)<=now();
 return heading('LIST YOUR SPACE',existing?'Finish your campaign.':'Make room for your next advertiser.','Choose your campaign period, all-in prices, and advertising rules.')+steps(2)+
 (expired?notice('Update the campaign dates.','The booking deadline has passed. Choose a future period before publishing.'):'')+
 form('sale-edit',hidden('id',existing?.id??'')+hidden('version',existing?.version??'')+hidden('assetId',a.id)+
 `<div class="split">${card('Campaign details',input('title','Campaign title',existing?.title??a.title+' · next campaign','text','required maxlength="100"')+`<p>Space: <strong>${esc(a.title)}</strong></p>`+
 (arbiter?hidden('arbiterId',arbiter):notice('Listing setup is temporarily unavailable.','The platform’s campaign-review account is being configured. Your draft can be saved once setup is complete.'))+
 (development()?`<details><summary>Development review account</summary>${input('arbiterId','Issue-review NEAR account',arbiter,'text',arbiter?'disabled':'required')}</details>`:'')+
 check('takeoverDefault','Allow advertisers to take over a booked surface before bookings close',existing?.takeoverDefault??true)+`<p class="tiny muted">Takeovers finish before printing. The previous advertiser keeps their refund and any earned reward.</p>`)}
 ${card('Campaign period',`<dl class="data-list">${[['Bookings close',schedule.biddingClose],['Advertising starts',schedule.serviceStart],['Advertising ends',schedule.serviceEnd]].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(dateTime(value))}</dd></div>`).join('')}</dl><details ${expired?'open':''}><summary>Change dates and production deadlines</summary><p class="tiny muted">Leave enough time after bookings close to review artwork, print, and install the final advertisement.</p><div class="grid two">${Object.entries({biddingClose:'Bookings close',artworkDue:'Advertiser artwork due',installationDue:'Installation target',serviceStart:'Advertising starts',serviceEnd:'Advertising ends',reviewEnd:'Issue review ends'}).map(([key,label])=>input(key,label,localTime(schedule[key]),'datetime-local','required')).join('')}</div>${check('customMilestones','Keep my custom artwork, installation and review deadlines',!!existing)}</details>${live.config.sandbox?act('quick-dates','Use quick test dates')+' '+act('relaxed-dates','Use relaxed test dates'):development()?act('mainnet-test-dates','Use 35-minute test dates'):''}`)}</div>`+
 card('Your prices',`<p>Include printing and installation in the price for the full campaign period.</p>${selected.map(p=>{const spot=a.spots.find(x=>x.id===p.id);return `<div class="grid three"><strong>${esc(spot?.name??p.id)}</strong>${input('price:'+p.id,'All-in price · USDC',(Number(p.priceCents)/100).toFixed(2),'number','min="0.01" step="0.01" required')}${select('rule:'+p.id,'Takeover rule',[['inherit','Use campaign setting'],['on','Allow takeovers'],['off','Fixed booking']],p.takeoverEnabled===undefined?'inherit':p.takeoverEnabled?'on':'off')}</div>`;}).join('')}`)+
 card('Advertising rules',textArea('rules','What advertising can this space accept?',existing?.rules??'No misleading or unsafe advertising. Keep windows, lights, number plates and sensors clear. Printing and installation are included. Artwork is reviewed before production.','required maxlength="3000"'))+
 (arbiter||development()?submit('Save sale draft'):'<button type="submit" class="button primary" disabled>Listing setup unavailable</button>'));
}

export function ownerView(r){
 if(!live.session)return signedOut();const d=live.data?.dashboard;if(!d)return empty('Loading your workspace.','Your spaces and campaigns will appear here shortly.');
 if(live.session.wallet.startsWith('0x')&&!(live.config?.production&&live.config.publicationMode==='hub'))return heading('LIST YOUR SPACE','Connect your listing wallet.','Owners currently use a NEAR wallet to approve listings and manage delivery.',link('/settings/wallets?next='+encodeURIComponent(location.pathname),'Connect owner wallet','button primary'));
 const totals=ownerTotals(snapshots(),live.session.wallet);
 if(r.id==='O01')return heading('OWNER WORKSPACE','Everyday space. New possibilities.','Manage your inventory, keep campaigns moving, and follow your earnings.',link('/host/assets/new','List a space','button primary'))+
 `<div class="stats">${[['Your spaces',d.assets.length],['Booked campaigns',totals.booked],['Available earnings',usdc(totals.available)]].map(([label,value])=>`<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`+unavailableUpdates()+
 (d.sales.length?card('Keep things moving',salesTable(d.sales)):empty('Your first listing starts here.','Describe a car, bike, van or another advertising surface. You can adjust every panel before publishing.',link('/host/assets/new','Add your first space','button primary')))+
 (d.incomingBookings.length?card('Recent bookings',bookingTable(d.incomingBookings,{owner:true})):'');
 if(r.id==='O02')return heading('YOUR SPACES','Your advertising inventory.','Reuse the same space for different campaign periods.',link('/host/assets/new','Add a space','button primary'))+
 (d.assets.length?`<div class="asset-grid">${d.assets.map(a=>card(esc(a.title),scene(a)+`<p>${esc(a.city)} · ${a.spots.length} advertising ${a.spots.length===1?'surface':'surfaces'}</p><div class="actions">${link('/host/assets/'+a.id,'Edit space','button primary')}${link('/host/sales/new?asset='+a.id,'Create campaign','button')}</div>`)).join('')}</div>`:empty('What space could you offer?','Add a photo or describe your vehicle to start shaping its advertising surfaces.',link('/host/assets/new','Add a space','button primary')));
 if(r.id==='O03')return createSpace();
 if(['O06','O07','O08'].includes(r.id)){const a=rawAsset(r.params.id);return a&&own(a)?assetEditor(live.assetEdit?.id===a.id?live.assetEdit:a):unavailable('This space is not in your workspace.');}
 if(['O09','O17'].includes(r.id))return heading('YOUR CAMPAIGNS',r.id==='O17'?'Your campaign calendar.':'Every campaign, in one place.','Published dates reserve your surfaces for the agreed campaign period.',link('/host/sales/new','Create campaign','button primary'))+card('Campaigns',salesTable(d.sales));
 if(r.id==='O10')return saleEditor();
 if(r.id==='O11'){const s=sale(r.params.id);if(s?.owner!==live.session.wallet)return unavailable();return s.status==='draft'?saleEditor(s):heading('PUBLISHED CAMPAIGN','Your campaign terms are confirmed.','Create a new campaign period to offer different dates or prices.',link('/host/sales/new?asset='+s.assetId,'Create another campaign','button primary'));}
 if(r.id==='O12')return saleWorkspace(sale(r.params.id),d);
 if(['O14','O15','O16'].includes(r.id))return fulfillment(r);
 if(r.id==='O13')return heading('YOUR BOOKINGS','Keep every advertiser in view.','Each booking remains linked to the advertiser who paid for it.')+card('Bookings',bookingTable(d.incomingBookings,{owner:true}));
 if(r.id==='O18')return heading('YOUR PERFORMANCE','A clear view of your inventory.','Campaign earnings and bookings come from confirmed records.')+`<div class="stats">${[['Completed campaigns',totals.completed],['Earned to date',usdc(totals.earned)],['Upcoming earnings',usdc(totals.held)]].map(([label,value])=>`<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`+notice('Exposure reporting is coming later.','Distance, views and impressions are not currently measured.')+card('Campaign activity',salesTable(d.sales));
 if(['O19','O20'].includes(r.id))return earnings();
 return null;
}
function createSpace(){const ai=live.config.aiAvailable!==false;return heading('LIST YOUR SPACE','Turn a vehicle into a new opportunity.','Add a photo or a description. Review the surfaces, set your campaign, and publish.',act('start-capture','Use your phone camera'))+steps(0)+
 form('asset-create',`<div class="split">${card('Tell us about your space',input('title','Listing name','','text','required maxlength="100" placeholder="My city delivery van"')+input('city','City or operating area','','text','required placeholder="Where will people see it?"')+select('assetType','Type of space',[['van','Van'],['car','Car'],['bike','Bike'],['motorcycle','Motorcycle'],['truck','Truck'],['other','Other']],'van')+textArea('description','Describe the space and its advertising surfaces','','required placeholder="A blue delivery van with flat side panels. It operates around the city every weekday."'))}
 ${card('Build your layout',select('method','How would you like to start?',ai?[['ai','Suggest surfaces from my description or photo'],['manual','Start with one surface and edit it myself']]:[['manual','Start with one surface and edit it myself']],ai?'ai':'manual')+input('photo','Photo · PNG or JPEG, up to 2 MB','','file','accept="image/png,image/jpeg"')+(live.capturePhoto?'<p>Your camera photo is attached.</p>':'')+check('publicCover','Use this photo as the public listing cover (up to 1 MB).')+`<p class="tiny muted">Reference photos stay private unless you choose to publish a cover. You can change the suggested surfaces before anything goes live.</p>`)}</div>${submit('Create editable space')}`);}
function saleWorkspace(s,d){
 if(s?.owner!==live.session.wallet)return unavailable();const a=rawAsset(s.assetId),draft=s.status==='draft',plans=live.data.publicationPlans?.filter(p=>p.plan.saleId===s.id)??[],provisions=live.data.provisionPlans?.filter(p=>p.plan.saleId===s.id)??[];
 const started=plans.some(p=>p.transactionHash)||provisions.some(p=>p.approvedAt),pending=plans.some(p=>p.status==='submitted')||provisions.some(p=>['processing','waiting-original-receipt','needs-recovery','budget-blocked'].includes(p.status));
 return heading('YOUR CAMPAIGN',s.title,draft?'Your campaign is saved. Check the details, then make it available to advertisers.':'Manage your advertiser, delivery and earnings in one place.',draft?(!pending?act('publish','Publish campaign',`data-id="${s.id}"`,'button primary'):''):link(publicUrl(s),'View public listing','button primary'))+
 (draft?(pending?card('Publishing your campaign',`<p>Your progress is saved. Confirm the original publication before starting another.</p>${provisions.filter(p=>['waiting-original-receipt','needs-recovery','processing','budget-blocked'].includes(p.status)).map(p=>act('resume-publication','Continue publishing',`data-id="${p.id}"`,'button primary')).join('')}${act('refresh','Refresh status')}`):notice('Ready when you are.','Publishing makes the dates, prices and advertising rules visible to buyers. Confirm the details before continuing.')):s.spots.map(p=>campaignNext(s,p)).join(''))+
 `<div class="split">${card('Campaign dates',scheduleSummary(s))}${card('Advertising rules',`<p>${esc(s.rules)}</p><p>Printing and installation are included.</p>${draft&&!started?link('/host/sales/'+s.id+'/edit','Edit campaign','button'):''}`)}</div>`+
 card('Advertising surfaces',`<div class="grid two">${s.spots.map(p=>{const snap=snapshot(p.contractId),stage=ownerCampaignStage(snap,now());return card(esc(a?.spots.find(x=>x.id===p.id)?.name??p.id),`<strong>${usdc(snap?.state.next_price??String(BigInt(p.priceCents)*10000n))}</strong><p>${p.takeoverEnabled?'Takeovers accepted until bookings close':'One advertiser for this campaign period'}</p>${draft?badge('Draft'):badge(stage.title)+`<p>${link(fulfillmentUrl(s,p.contractId),'Manage artwork & delivery','text-link')}</p>`}`);}).join('')}</div>`)+
 (plans.length&&draft?card('Publication progress',`<p>${plans.filter(p=>p.status==='confirmed').length} of ${plans.length} surfaces confirmed.</p>${act('refresh','Refresh status')}`):'')+
 (development()&&provisions.length?`<details><summary>Development publication details</summary>${provisions.map(p=>`<p>${badge(p.status)} · ${(Number(p.plan.collateralPerSpot)/1e24).toFixed(2)} NEAR collateral per surface.</p>`).join('')}</details>`:'')+
 (d.incomingBookings.some(b=>b.saleId===s.id)?card('Bookings',bookingTable(d.incomingBookings.filter(b=>b.saleId===s.id),{owner:true})):!draft?card('Your next advertiser',`<p>Share your public listing so advertisers can book a surface for this campaign.</p>${link(publicUrl(s),'Open your listing','button')}`):'');
}
function fulfillment(r){
 const b=r.id==='O16'?null:booking(r.params.id),offer=b?sale(b.saleId):sale(r.params.id);if(offer?.owner!==live.session.wallet)return unavailable();
 const contract=b?.contractId??new URLSearchParams(location.search).get('contract')??offer.spots[0]?.contractId,s=snapshot(contract);
 if(!s)return empty('Updating your campaign.','Your latest payment and delivery records are being confirmed.',act('refresh','Refresh status'));
 const stage=ownerCampaignStage(s,now()),media=live.data.media.filter(m=>m.status==='verified'),settled=s.state.outcome!=='open';
 const artwork=s.rights.proposal,canApprove=artwork&&s.rights.active&&!s.state.artwork_locked&&!settled;
 return heading('CAMPAIGN DELIVERY',offer.title,'Review the final advertisement, arrange installation, and keep the evidence together.',link('/host/sales/'+offer.id,'Campaign overview','button'))+
 card(stage.title,`<p>${esc(stage.description)}</p>${stage.action==='fulfillment'?'':stageAction(offer,contract,stage)}`)+
 `<div class="split"><div>${card('Advertiser artwork',artwork?`<p>Artwork version ${esc(s.rights.revision)}</p><p>${artifactLink(artwork.artifact_uri)}</p>${canApprove?`<p>Check the design, dimensions and production requirements. Approval locks this version for printing.</p>${act('lock-artwork','Approve & lock this artwork',`data-contract="${esc(contract)}" data-revision="${esc(s.rights.revision)}"`,'button primary')}`:s.state.artwork_locked?badge('Approved for production'):notice('Artwork review is closed.','Request a review if the campaign needs help.')}`:`<p>The advertiser’s artwork will appear here after bookings close. Use the conversation to coordinate production.</p>`)}
 ${card('Keep in touch',link('/inbox/'+encodeURIComponent(contract),'Message advertiser','button'))}</div>
 <div>${card('Installation evidence',installationContent(s,media,contract,settled))}
 ${!settled?card('Need help with this campaign?',`<p>${Number(s.campaign.open_issues??0)?'A campaign issue is being reviewed.':'Request a review if delivery, artwork or the campaign period needs attention.'}</p>${link('/support/new?contract='+encodeURIComponent(contract),'Request a review','button')}`):''}</div></div>`+ownerRecord(s);
}
function installationContent(s,media,contract,settled){
 if(s.campaign.delivery_proof)return `<p>${badge('Installation proof recorded')}</p><p>Your evidence is attached to the approved artwork version.</p><p>${artifactLink(s.campaign.delivery_proof.artifact_uri)}</p>`;
 if(ownerCanUploadProof(s,now()))return form('delivery-proof',hidden('contractId',contract)+`<p>Add photos or a description showing the approved advertisement in place.</p>`+artifactFields(media,'Describe the installed advertisement, location and supporting evidence.')+submit('Submit installation proof'));
 return `<p>${settled?'This campaign is closed.':!s.state.artwork_locked?'Approve the advertiser’s artwork before adding installation evidence.':'The installation-evidence window has closed. Request a review to resolve the campaign.'}</p>`;
}
export function artifactFields(media,placeholder='Describe this public artifact.'){
 return `<p class="tiny muted">Choose a previous upload, add a file, paste a verified link, or enter a description. Files and descriptions used as campaign evidence are public.</p>`+
 select('mediaId','Previous upload',[['','Create or add new evidence'],...media.map((m,i)=>[m.id,(m.mime?.startsWith('image/')?'Image':m.mime==='application/pdf'?'PDF':'Document')+' '+(i+1)+' · '+m.uri.slice(-12)])])+
 input('file','Evidence file · image, PDF, JSON or text, up to 1 MB','','file','accept="image/png,image/jpeg,application/pdf,application/json,text/plain"')+
 textArea('notes','Description','',`placeholder="${esc(placeholder)}"`)+
 `<details><summary>Use an existing public link</summary>${input('artifactUri','Verified IPFS link','','text','placeholder="ipfs://baf…"')}</details>`+
 check('public','I agree to make this evidence publicly available.');
}
function salesTable(values){return values.length?table(['Campaign','Status','Bookings close','Campaign period',''],values.map(s=>{const stages=s.spots.filter(p=>p.contractId).map(p=>ownerCampaignStage(snapshot(p.contractId),now()).title),status=s.status==='draft'?'Draft':stages[0]??'Updating';return [esc(s.title),badge(status),esc(dateTime(s.schedule.biddingClose)),esc(dateTime(s.schedule.serviceStart))+' – '+esc(dateTime(s.schedule.serviceEnd)),link('/host/sales/'+s.id,'Open campaign','button small')];})):empty('No campaigns yet.','Choose a space and offer your first advertising period.',link('/host/sales/new','Create campaign','button primary'));}
export function earnings(){
 const values=snapshots().filter(s=>s.state.seller_id===live.session.wallet),totals=ownerTotals(values,live.session.wallet);
 return heading('YOUR EARNINGS','Know what you’ve earned.','Campaign earnings become available after service, issue review and confirmed settlement.',link('/buy/money','Withdraw funds','button primary'))+
 `<div class="stats">${[['Available to claim',usdc(totals.available)],['Upcoming earnings',usdc(totals.held)],['Earned to date',usdc(totals.earned)]].map(([label,value])=>`<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`+unavailableUpdates()+
 (values.length?card('Campaign earnings',table(['Campaign','Status','Available','Upcoming',''],values.map(s=>{const c=s.credits?.[live.session.wallet],available=BigInt(c?.available??'0'),stage=ownerCampaignStage(s,now());return [esc(sale(s.campaign.terms.sale_id)?.title??'Campaign'),badge(stage.title),usdc(c?.available),s.state.outcome==='open'?usdc(s.state.potential_seller_revenue):usdc('0'),available>0n?act('claim','Claim earnings',`data-contract="${s.accountId}"`,'button small'):s.state.outcome==='success'?'Paid to your balance':s.state.outcome==='failure'?'Campaign cancelled':'Available after settlement'];}))) :empty('Your earnings will appear here.','Publish your first campaign to start accepting bookings.',link('/host/assets','View your spaces','button primary')))+
 card('Withdraw your available funds',`<p>Claimed earnings move to your account balance. Withdraw them to your connected wallet from Money & credits.</p>${link('/buy/money','Open Money & credits','button primary')}`)+
 `<details><summary>Payment history</summary>${live.data.operations.filter(o=>o.id.startsWith('wallet-claim-')).map(o=>`<p>${badge(o.phase==='confirmed'?'Paid':o.phase==='failed'?'Needs attention':'Processing')} <code>${esc(o.transaction_hash??o.id)}</code></p>`).join('')||'<p>No payout requests yet.</p>'}</details>`;
}
