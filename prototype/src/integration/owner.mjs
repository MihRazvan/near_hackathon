import {listingProgress} from './listing-progress.mjs';
import {editorToolbar,spotInspector} from './spot-workspace.mjs';
import {ownerDashboard} from './dashboard.mjs';
import {privateListingPhotos} from './view-publication.mjs';
import {activePhotoView,editorViews} from './vehicle-views.mjs';
import {vehicleEditor} from './vehicle-editor.mjs';
import {startVehicleView,editorTools,restoredAsset} from './onboarding.mjs';
import {compactOffer} from './offer-setup.mjs';
import {isTeamTest,campaignNotice} from './campaign-kind.mjs';
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
 if(stage.action==='earnings')return link('/host#earnings','View earnings','button primary');
 if(stage.action==='new-sale')return link('/host/sales/new?asset='+offer.assetId,'Create another campaign','button primary');
 if(stage.action==='support')return link('/support/new?contract='+encodeURIComponent(contract),'Request a review','button primary');
 if(stage.action==='message')return link('/inbox/'+encodeURIComponent(contract),'Message advertiser','button primary');
 if(stage.action==='refresh')return act('refresh','Refresh status');
 return link(fulfillmentUrl(offer,contract),stage.key==='review-artwork'?'Review artwork':stage.key==='installation'?'Add installation evidence':'Manage delivery','button primary');
}
function campaignNext(offer,spot){const s=snapshot(spot.contractId),stage=ownerCampaignStage(s,now());return card(stage.title,`<p>${esc(stage.description)}</p>${stageAction(offer,spot.contractId,stage)}${s?.mode==='hub'&&s.state.outcome==='open'&&s.state.round==='0'&&!s.state.holder?`<details><summary>Manage availability</summary><p>Close this unbooked spot if it is no longer available. No advertiser has paid for it.</p>${act('cancel-empty','Close unbooked spot',`data-contract="${spot.contractId}"`,'button small')}</details>`:''}${s?.mode==='hub'&&s.state.outcome!=='open'&&s.state.total_received===s.state.total_withdrawn&&s.state.total_pending==='0'&&!s.state.storage_reclaimed&&s.state.storage_funder===live.session.wallet?`<details><summary>Listing storage deposit</summary><p>Campaign payments are complete. Return any unused listing deposit to the wallet that paid it.</p>${act('reclaim-storage','Return unused deposit',`data-contract="${spot.contractId}"`,'button small')}</details>`:''}`);}
function ownerRecord(s){return `<details><summary>Payment and ownership record</summary>${evidence(s)}</details>`;}
function unavailableUpdates(){return live.catalog?.unavailable?.length?notice('Some payments are updating.','Balances and campaign status will refresh after the current transaction confirms.') : '';}

export function assetEditor(a){
 a=restoredAsset(a);live.assetEdit=a;
 const aiWorking=live.aiPending===a.id,pending=aiWorking&&live.aiReplacing,preview=live.aiReferencePreview?.assetId===a.id?{...a,photoDataUrl:live.aiReferencePreview.imageDataUrl,imageProvenance:'ai-generated'}:a;
 const query=new URLSearchParams(location.search),requested=query.get('spot'),view=activePhotoView(a,requested,query.get('view')),selected=a.spots.some(p=>p.id===requested)?requested:a.spots.find(p=>(p.photoViewId??'main')===view.id)?.id,reviewing=location.pathname.endsWith('/review');
 const details=input('title','Listing name',a.title,'text','required maxlength="100"')+input('city','City or operating area',a.city,'text','required maxlength="100"')+select('assetType','Type of space',[['car','Car'],['van','Van'],['bike','Bike'],['motorcycle','Motorcycle'],['truck','Truck'],['other','Other']],a.assetType)+textArea('description','What should advertisers know?',a.description,'required');
 const next=reviewing?'Continue to dates & prices':'Save layout';
 return (reviewing?listingProgress(2):'')+form('asset-edit',hidden('id',a.id)+hidden('version',a.version)+hidden('next',reviewing?'campaign':'space')+`<fieldset class="vehicle-edit-fields" ${aiWorking?'disabled':''}><header class="spot-editor-heading"><div><h1 tabindex="-1">Edit your spots.</h1><p>${esc(a.title)} · Click a spot to select it. Drag to place it on the vehicle.</p></div><button type="submit" class="button primary" data-editor-continue data-label="${next}" ${a.spots.length?'':'disabled'}>${a.spots.length?next:'Add a spot to continue'}</button></header><div class="vehicle-edit-layout"><section class="spot-canvas-workspace">${editorViews(a,view.id)}${editorToolbar()}${vehicleEditor(preview,selected,{interactive:!pending,spots:!pending,processing:pending,view:view.id})}<p class="spot-canvas-help" data-editor-help>Drag to move · Handles to resize · Delete to remove</p>${editorTools(a)}</section><aside class="vehicle-panel-settings">${spotInspector(a,selected)}<details class="vehicle-listing-details"><summary>Vehicle details</summary>${details}</details></aside></div><footer class="spot-editor-footer"><p class="tiny muted">Changes save automatically. ${reviewing?'Next: campaign dates and prices.':''}</p></footer><span class="sr-only" role="status" aria-live="polite" data-editor-announcement></span></fieldset>`);

}

export function saleEditor(existing){
 const assets=live.data.dashboard.assets,q=new URLSearchParams(location.search),a=rawAsset(existing?.assetId??q.get('asset'))??assets[0];
 if(!a)return empty('Start with your space.','Add a vehicle or another surface before setting up a campaign.',link('/host/assets/new','Add a space','button primary'));
 if(!a.spots.length)return empty('Add a spot first.','Your vehicle draft is saved. Add an advertising spot before choosing campaign dates.',link('/host/assets/'+a.id+'/review','Edit spots','button primary'));
 if(!existing&&!new URLSearchParams(location.search).has('advanced'))return compactOffer(a);
 const schedule=existing?.schedule??defaultOwnerSchedule(now()),arbiter=existing?.arbiterId??live.config.defaultArbiter??live.config.wallets?.find(w=>w.label==='Arbiter')?.address??'';
 const selected=existing?.spots??a.spots.map(p=>({id:p.id,priceCents:live.config.sandbox?'10':p.suggestedPriceCents}));
 const expired=Date.parse(schedule.biddingClose)<=now();
 return heading('LIST YOUR SPACE',existing?'Finish your campaign.':'Set up your campaign.','Choose your campaign period, all-in prices, and advertising rules.')+campaignNotice(existing??a)+steps(2)+
 (expired?notice('Update the campaign dates.','The booking deadline has passed. Choose a future period before publishing.'):'')+
 form('sale-edit',hidden('id',existing?.id??'')+hidden('version',existing?.version??'')+hidden('assetId',a.id)+
 `<div class="split">${card('Campaign details',input('title','Campaign title',existing?.title??a.title+' · next campaign','text','required maxlength="100"')+`<p>Space: <strong>${esc(a.title)}</strong></p>`+
 (arbiter?hidden('arbiterId',arbiter):notice('Listing setup is temporarily unavailable.','The platform\'s campaign-review account is being configured. Your draft can be saved once setup is complete.'))+
 (development()?`<details><summary>Development review account</summary>${input('arbiterId','Issue-review NEAR account',arbiter,'text',arbiter?'disabled':'required')}</details>`:'')+
 check('takeoverDefault','Allow advertisers to take over a booked surface before bookings close',existing?.takeoverDefault??true)+`<p class="tiny muted">Takeovers finish before printing. The previous advertiser keeps their refund and any earned reward.</p>`)}
 ${card('Campaign period',`<dl class="data-list">${[['Bookings close',schedule.biddingClose],['Advertising starts',schedule.serviceStart],['Advertising ends',schedule.serviceEnd]].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(dateTime(value))}</dd></div>`).join('')}</dl><details ${expired?'open':''}><summary>Change dates and production deadlines</summary><p class="tiny muted">Leave enough time after bookings close to review artwork, print, and install the final advertisement.</p><div class="grid two">${Object.entries({biddingClose:'Bookings close',artworkDue:'Advertiser artwork due',installationDue:'Installation target',serviceStart:'Advertising starts',serviceEnd:'Advertising ends',reviewEnd:'Issue review ends'}).map(([key,label])=>input(key,label,localTime(schedule[key]),'datetime-local','required')).join('')}</div>${check('customMilestones','Keep my custom artwork, installation and review deadlines',!!existing)}</details>${live.config.sandbox?act('quick-dates','Use quick test dates')+' '+act('relaxed-dates','Use relaxed test dates'):development()?act('mainnet-test-dates','Use 35-minute test dates'):''}`)}</div>`+
 card('Your prices',`<p>${isTeamTest(a)?'Use a nominal USDC price for this team test. Physical printing and installation are excluded.':'Include printing and installation in the price for the full campaign period.'}</p>${selected.map(p=>{const spot=a.spots.find(x=>x.id===p.id);return `<div class="grid three"><strong>${esc(spot?.name??p.id)}</strong>${input('price:'+p.id,'All-in price · USDC',(Number(p.priceCents)/100).toFixed(2),'number','min="0.01" step="0.01" required')}${select('rule:'+p.id,'Takeover rule',[['inherit','Use campaign setting'],['on','Allow takeovers'],['off','Fixed booking']],p.takeoverEnabled===undefined?'inherit':p.takeoverEnabled?'on':'off')}</div>`;}).join('')}`)+
 card('Advertising rules',textArea('rules','What advertising can this space accept?',existing?.rules??(isTeamTest(a)?'Team-run mainnet test with real USDC and an AI-generated reference vehicle. Artwork and delivery evidence are synthetic. No physical advertising will be delivered. Refunds and payouts follow the published on-chain rules.':'No misleading or unsafe advertising. Keep windows, lights, number plates and sensors clear. Printing and installation are included. Artwork is reviewed before production.'),'required maxlength="3000"'))+
 (arbiter||development()?submit('Save campaign draft'):'<button type="submit" class="button primary" disabled>Listing setup unavailable</button>'));
}

export function ownerView(r){
 if(!live.session)return signedOut();const d=live.data?.dashboard;if(!d)return empty('Loading your workspace.','Your spaces and campaigns will appear here shortly.');
 if(live.session.wallet===live.config?.defaultArbiter)return heading('CAMPAIGN REVIEW ACCOUNT','Use a separate listing wallet.','This account reviews campaign issues. Connect another wallet to publish your own advertising spaces.',link('/settings/wallets?next='+encodeURIComponent(location.pathname),'Choose a listing wallet','button primary'));
 if(live.session.wallet.startsWith('0x')&&live.config?.publicationMode!=='hub')return heading('LIST YOUR SPACE','Connect your listing wallet.','Owners currently use a NEAR wallet to approve listings and manage delivery.',link('/settings/wallets?next='+encodeURIComponent(location.pathname),'Connect owner wallet','button primary'));
 const totals=ownerTotals(snapshots(),live.session.wallet);
 if(r.id==='O01')return ownerDashboard({nextAction:stageAction,earnings});
 if(r.id==='O03')return startVehicleView();
 if(['O06','O07','O08'].includes(r.id)){const a=rawAsset(r.params.id);return a&&own(a)?assetEditor(live.assetEdit?.id===a.id?live.assetEdit:a):unavailable('This space is not in your workspace.');}
 if(r.id==='O10')return saleEditor();
 if(r.id==='O11'){const s=sale(r.params.id);if(s?.owner!==live.session.wallet)return unavailable();return s.status==='draft'?saleEditor(s):heading('PUBLISHED CAMPAIGN','Your campaign terms are confirmed.','Create a new campaign period to offer different dates or prices.',link('/host/sales/new?asset='+s.assetId,'Create another campaign','button primary'));}
 if(r.id==='O12')return saleWorkspace(sale(r.params.id),d);
 if(['O14','O15','O16'].includes(r.id))return fulfillment(r);
 return null;
}

function saleWorkspace(s,d){
 if(s?.owner!==live.session.wallet)return unavailable();const a=rawAsset(s.assetId),draft=s.status==='draft',plans=live.data.publicationPlans?.filter(p=>p.plan.saleId===s.id)??[],provisions=live.data.provisionPlans?.filter(p=>p.plan.saleId===s.id)??[];
 const needsPhotos=draft&&a&&privateListingPhotos(a).length&&![...plans,...provisions].some(p=>p.plan.saleVersion===s.version);
 const missingPhoto=!draft&&!s.publication?.manifest.asset.coverUri&&!s.presentation&&(a?.photoUrl||a?.photoDataUrl);
 const started=plans.some(p=>p.transactionHash)||provisions.some(p=>p.approvedAt),pending=plans.some(p=>p.status==='submitted')||provisions.some(p=>['processing','waiting-original-receipt','needs-recovery','budget-blocked'].includes(p.status));
 return heading('YOUR CAMPAIGN',s.title,draft?'Your campaign is saved. Check the details, then make it available to advertisers.':'Manage this campaign and its delivery.',draft?(!pending&&!needsPhotos?act('publish','Publish campaign',`data-id="${s.id}"`,'button primary'):''):link(publicUrl(s),'View public listing','button primary')+' '+link('/records/'+encodeURIComponent(s.id),'Public campaign record','button'))+
 (missingPhoto?card('Add your vehicle photo',`<p>This listing was published without its photo. Add the photo from your saved vehicle.</p>${check('listingPhotoAcknowledged','Publish this vehicle photo on public IPFS with the listing.')}${act('add-listing-photo','Add photo to listing',`data-id="${s.id}"`,'button primary')}`):'')+
 (draft?(pending?card('Publishing your campaign',`<p>Your progress is saved. Confirm the original publication before starting another.</p>${provisions.filter(p=>['waiting-original-receipt','needs-recovery','processing','budget-blocked'].includes(p.status)).map(p=>act('resume-publication','Continue publishing',`data-id="${p.id}"`,'button primary')).join('')}${act('refresh','Refresh status')}`):needsPhotos?card('Publish your listing photos',check('publishPhotos','Publish these vehicle photos on public IPFS with the listing.')+act('publish','Publish campaign',`data-id="${s.id}"`,'button primary')):notice('Ready when you are.','Publishing makes the dates, prices and advertising rules visible to buyers. Confirm the details before continuing.')):s.spots.map(p=>campaignNext(s,p)).join(''))+
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
 return heading('CAMPAIGN DELIVERY',offer.title,'Review the final advertisement, arrange installation, and keep the evidence together.',link('/host/sales/'+offer.id,'Campaign overview','button'))+campaignNotice(offer)+
 card(stage.title,`<p>${esc(stage.description)}</p>${stage.action==='fulfillment'?'':stageAction(offer,contract,stage)}`)+
 `<div class="split"><div>${card('Advertiser artwork',artwork?`<p>Artwork version ${esc(s.rights.revision)}</p><p>${artifactLink(artwork.artifact_uri)}</p>${canApprove?`<p>Check the design, dimensions and production requirements. Approval locks this version for printing.</p>${act('lock-artwork','Approve & lock this artwork',`data-contract="${esc(contract)}" data-revision="${esc(s.rights.revision)}"`,'button primary')}`:s.state.artwork_locked?badge('Approved for production'):notice('Artwork review is closed.','Request a review if the campaign needs help.')}`:`<p>The advertiser\'s artwork will appear here after bookings close. Use the conversation to coordinate production.</p>`)}
 ${card('Keep in touch',link('/inbox/'+encodeURIComponent(contract),'Message advertiser','button'))}</div>
 <div>${card('Installation evidence',installationContent(s,media,contract,settled))}
 ${!settled?card('Need help with this campaign?',`<p>${Number(s.campaign.open_issues??0)?'A campaign issue is being reviewed.':'Request a review if delivery, artwork or the campaign period needs attention.'}</p>${link('/support/new?contract='+encodeURIComponent(contract),'Request a review','button')}`):''}</div></div>`+ownerRecord(s);
}
function installationContent(s,media,contract,settled){
 if(s.campaign.delivery_proof)return `<p>${badge('Installation proof recorded')}</p><p>Your evidence is attached to the approved artwork version.</p><p>${artifactLink(s.campaign.delivery_proof.artifact_uri)}</p>`;
 if(ownerCanUploadProof(s,now()))return form('delivery-proof',hidden('contractId',contract)+`<p>${isTeamTest(sale(s.campaign.terms.sale_id))?'Describe the synthetic delivery rehearsal and label all generated evidence.':'Add photos or a description showing the approved advertisement in place.'}</p>`+artifactFields(media,'Describe the installed advertisement, location and supporting evidence.')+submit('Submit installation proof'));
 return `<p>${settled?'This campaign is closed.':!s.state.artwork_locked?'Approve the advertiser\'s artwork before adding installation evidence.':'The installation-evidence window has closed. Request a review to resolve the campaign.'}</p>`;
}
export function artifactFields(media,placeholder='Describe this public artifact.'){
 return `<p class="tiny muted">Choose a previous upload, add a file, paste a verified link, or enter a description. Files and descriptions used as campaign evidence are public.</p>`+
 select('mediaId','Previous upload',[['','Create or add new evidence'],...media.map((m,i)=>[m.id,(m.mime?.startsWith('image/')?'Image':m.mime==='application/pdf'?'PDF':'Document')+' '+(i+1)+' · '+m.uri.slice(-12)])])+
 input('file',`Evidence file · image, PDF, JSON or text, up to ${(live.config?.mediaMaxBytes??1000000)/1000000} MB`,'','file','accept="image/png,image/jpeg,application/pdf,application/json,text/plain"')+
 textArea('notes','Description','',`placeholder="${esc(placeholder)}"`)+
 `<details><summary>Use an existing public link</summary>${input('artifactUri','Verified IPFS link','','text','placeholder="ipfs://baf…"')}</details>`+
 check('public','I agree to make this evidence publicly available.');
}
export function earnings({embedded=false}={}){
 const values=snapshots().filter(s=>s.state.seller_id===live.session.wallet),totals=ownerTotals(values,live.session.wallet);
 const payout=BigInt(totals.available)>0n?act('owner-payout','Collect & withdraw earnings','','button primary'):link('/profile/balance','Withdraw funds','button');
 return (embedded?`<p>Available after service, issue review and settlement.</p><div class="actions">${payout}</div>`:heading('','Your campaign earnings.','Campaign earnings become available after service, issue review and confirmed settlement.',payout))+
 `<div class="stats">${[['Available to claim',usdc(totals.available)],['Upcoming earnings',usdc(totals.held)],['Earned to date',usdc(totals.earned)]].map(([label,value])=>`<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`+unavailableUpdates()+
 (values.length?card('Campaign earnings',table(['Campaign','Status','Available','Upcoming',''],values.map(s=>{const c=s.credits?.[live.session.wallet],available=BigInt(c?.available??'0'),stage=ownerCampaignStage(s,now());return [esc(sale(s.campaign.terms.sale_id)?.title??'Campaign'),badge(stage.title),usdc(c?.available),s.state.outcome==='open'?usdc(s.state.potential_seller_revenue):usdc('0'),available>0n?act('claim','Claim earnings',`data-contract="${s.accountId}"`,'button small'):s.state.outcome==='success'?'Paid to your balance':s.state.outcome==='failure'?'Campaign cancelled':'Available after settlement'];}))) :empty('Your earnings will appear here.','Publish your first campaign to start accepting bookings.',link('/host#vehicles','View your spaces','button primary')))+
 card('Withdraw your available funds',`<p>Claimed earnings move to your account balance. Withdraw them to your connected wallet from your profile balance.</p>${link('/profile/balance','Balance & refunds','button primary')}`)+
 `<details><summary>Payment history</summary>${live.data.operations.filter(o=>o.id.startsWith('wallet-claim-')).map(o=>`<p>${badge(o.phase==='confirmed'?'Paid':o.phase==='failed'?'Needs attention':'Processing')} <code>${esc(o.transaction_hash??o.id)}</code></p>`).join('')||'<p>No payout requests yet.</p>'}</details>`;
}
