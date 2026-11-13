import {saveOffer} from './offer-setup.mjs';
import {onboardingActions,onboardingForms,saveEditor,rememberUndo,useCapturedPhoto} from './onboarding.mjs';
import {assetFields} from './asset-fields.mjs';
export {assetFields} from './asset-fields.mjs';
import {isTeamTest} from './campaign-kind.mjs';
import { navigate,toast } from '../store.mjs';
import { live,api,refresh,refreshBalances,connect,disconnect,review,nativePlan,intentPlan,nativeAction,poll,sale,snapshot,allSales,booking,rawAsset,amount,fileData,upload,rerender,nativeUnits,ensureSigningWallet } from './runtime.mjs';
import { fundingAmount,campaignSchedule } from './checkout-state.mjs';
import { photoData } from './photos.mjs';
import {verifyOriginalIntent} from './recovery-state.mjs';
import { workspaceForms } from './workspace-actions.mjs';
import {affectedContracts} from './workspace-refresh.mjs';

const cents=value=>{const n=BigInt(amount(String(value)));if(n%10000n)throw new Error('Spot prices must use whole USDC cents.');return (n/10000n).toString();};
const currentForm=()=>document.querySelector('form[data-live-form="asset-edit"]');

async function artifact(data){const selected=data.get('mediaId'),uri=String(data.get('artifactUri')??'').trim();
 if(uri&&(selected||data.get('file')?.size))throw new Error('Use one artifact source at a time. Remove the IPFS link to select or upload a file.');
 if(selected)return selected;if(uri)return (await api('media/import',{uri,publicContentAcknowledged:data.has('public')})).id;
 const m=await upload(data.get('file'),{text:String(data.get('notes')??''),acknowledged:data.has('public')});return m.id;}
async function refreshSale(id){
 await refresh({local:true,render:false});
 const contracts=sale(id)?.spots.map(s=>s.contractId).filter(Boolean)??[];
 if(contracts.length)await refresh({contracts});else rerender();
}
async function confirmAction(contractId,kind,extra={}){const result=await nativeAction(contractId,kind,extra);await refresh({contracts:[contractId]});toast(result?.status==='confirmed'?'Your campaign is updated.':'Your request is recorded. Confirmation is still being checked.');}
async function recoverOne(r){
 const hash=sessionStorage.getItem('everywhere-wallet-hash:'+r.id);
 return api('wallet-requests/'+r.id+'/reconcile',hash&&r.kind!=='intent'?{transactionHash:hash}:{});
}
async function refreshRecovered(requests){
 const wallet=live.session?.wallet;await refresh({local:true,render:false});
 if(!wallet||live.session?.wallet!==wallet)throw new Error('Reconnect the wallet that started this recovery.');
 const contracts=affectedContracts(live.data,requests,live.catalog?.sales);
 for(let i=0;i<contracts.length;i+=20)await refresh({contracts:contracts.slice(i,i+20),render:false});
 if(!contracts.length)await refreshBalances({render:false});rerender();
}
function localDate(value){const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
async function payBooking(id){
 const b=booking(id);if(!b||b.owner!==live.session.wallet)throw new Error('Open a booking belonging to this wallet.');let request;
 if(live.session.wallet.startsWith('0x'))request=await intentPlan(await api('intents/'+b.planId),'Pay '+(Number(b.amount)/1e6).toFixed(2)+' USDC for this placement');
 else request=await nativePlan(await api('bookings/'+b.id+'/native-plan',{}),'Pay for this placement from your NEAR wallet');
 const deadline=performance.now()+20000;
 for(let i=0;i<20&&performance.now()<deadline;i++){if(request?.id&&!['confirmed','failed'].includes(request.status))request=await api('wallet-requests/'+request.id+'/reconcile',{});await refresh({local:true,render:false});
  if(['accepted','rejected','failed'].includes(booking(b.id)?.status))break;await new Promise(r=>setTimeout(r,300));}
 if(booking(b.id)?.accepted)await refresh({contracts:[b.contractId],render:false});
 rerender();toast(booking(b.id)?.accepted?'Your placement is confirmed.':'Your payment is recorded. We are checking its original receipt.');
}
async function prepareBooking(data,{pay=live.config.production}={}){
 if(!data.has('rules'))throw new Error('Agree to the published rules before booking.');
 if(isTeamTest(sale(String(data.get('saleId'))))&&!data.has('testCampaignAcknowledged'))throw new Error('Acknowledge that this team test uses real USDC with no physical delivery.');
 let campaignId=String(data.get('campaignId'));
 if(!campaignId){campaignId=(await api('campaigns',{name:String(data.get('name')),budgetMicroUsdc:amount(data.get('budget'))})).id;
  // Keep this campaign selected after wallet rejection, without creating duplicates.
  const field=document.querySelector('form[data-live-form="prepare-booking"] [name="campaignId"]');
  if(field){const option=document.createElement('option');option.value=campaignId;option.textContent=String(data.get('name'));field.append(option);field.value=campaignId;}}
 const b=await api('bookings',{campaignId,saleId:String(data.get('saleId')),spotId:String(data.get('spotId')),testCampaignAcknowledged:data.has('testCampaignAcknowledged')});
 if(data.get('expectedAmount')&&String(data.get('expectedAmount'))!==b.amount){await api('bookings/'+b.id+'/cancel',{});await refresh({contracts:[b.contractId],render:false});navigate('/checkout/'+b.saleId+'?spot='+b.spotId+'&campaign='+encodeURIComponent(campaignId));throw new Error('The price changed while you were booking. Review the updated price before paying.');}
 await refresh({local:true,render:false});navigate('/payments/'+b.id);if(pay)await payBooking(b.id);return b;
}
async function ensureUsdcStorage(){
 await refreshBalances({render:false});if(live.balances?.tokenStorageRegistered)return;
 await nativePlan(await api('token-actions',{kind:'token-storage'}),'Set up USDC in your wallet');
 if(!await poll(()=>live.balances?.tokenStorageRegistered))throw new Error('Your USDC registration is still being confirmed. Return here before withdrawing.');
}
async function claimCredit(contractId){
 const result=await api('claims',{contractId}),deadline=performance.now()+30000;
 for(let i=0;i<25&&performance.now()<deadline;i++){if(result.id)await api('operations/'+result.id).catch(error=>{if(error.status!==404)throw error;});
  try{await refresh({contracts:[contractId],render:false});if(snapshot(contractId)?.credits[live.session.wallet]?.available==='0')break;}catch(error){if(error.code!=='PENDING_WITHDRAWAL')throw error;}
  await new Promise(r=>setTimeout(r,300));}
 if(snapshot(contractId)?.credits[live.session.wallet]?.available!=='0')throw new Error('Your original claim is still being confirmed. Check its status before withdrawing.');
 return result;
}
export const actions={
 ...onboardingActions,
 'save-quick-offer':async el=>{const f=el.closest('form');if(f.reportValidity())return saveOffer(new FormData(f));},
 'reload-workspace':()=>location.reload(),
 refresh:async()=>{await refresh();toast('Confirmed state refreshed.');},disconnect,
 'connect-near':()=>connect('near'),
 'connect-evm':el=>connect('evm',el.dataset.id),
 'copy-capture-link':async el=>{await navigator.clipboard.writeText(el.dataset.url);toast('Camera link copied. Open it on your phone.');},
 'fund-and-book':async el=>{
  const form=el.closest('form');if(!form.reportValidity())return;const data=new FormData(form);
  if(!data.has('rules'))throw new Error('Agree to the published rules before booking.');
 if(isTeamTest(sale(String(data.get('saleId'))))&&!data.has('testCampaignAcknowledged'))throw new Error('Acknowledge that this team test uses real USDC with no physical delivery.');
  const offer=sale(String(data.get('saleId'))),spot=offer?.spots.find(p=>p.id===String(data.get('spotId'))),price=snapshot(spot?.contractId)?.state.next_price;
  if(!price||live.balances?.intentsUsdc===undefined)throw new Error('Refresh this space and your balance before booking.');
  const wallet=live.session.wallet,available=BigInt(live.balances.intentsUsdc);
  if(available<BigInt(price)){
   if(wallet.startsWith('0x')){
    await ensureSigningWallet();const q=await api('routes',{direction:'fund',amount:fundingAmount(price,available),dry:false});
    live.fundQuote=q;rerender();
    // Review the exact route cost before the Base wallet opens. Continue from the balance page.
    const next='/checkout/'+offer.id+'?spot='+spot.id+(data.get('campaignId')?'&campaign='+encodeURIComponent(data.get('campaignId')):'');
    sessionStorage.setItem('everywhere-checkout-draft',JSON.stringify({wallet,saleId:offer.id,spotId:spot.id,name:data.get('name'),budget:data.get('budget'),campaignId:data.get('campaignId')}));
    navigate('/buy/money?next='+encodeURIComponent(next));toast('Your funding quote is ready. Approve the exact cost, then return to your booking.');return;
   }
   const needed=(BigInt(price)-available).toString();
   if(BigInt(live.balances.nearUsdc??0)<BigInt(needed)){navigate('/buy/money?next='+encodeURIComponent(location.pathname+location.search));throw new Error('Add USDC to your connected wallet before booking.');}
   await nativePlan(await api('token-actions',{kind:'deposit-intents',amount:needed}),'Add the USDC needed for this booking');
   if(!await poll(()=>BigInt(live.balances?.intentsUsdc??0)>=BigInt(price)))throw new Error('Your funding is still being confirmed. Return to this booking when your balance updates.');
  }
  if(live.session?.wallet!==wallet)throw new Error('Your wallet changed. Reopen this booking with the original account.');
  await prepareBooking(data,{pay:true});
 },
 'start-capture':async()=>{const r=await api('captures',{});sessionStorage.setItem('everywhere-capture-link:'+r.id,r.uploadUrl);await refresh({local:true,render:false});navigate('/host/capture/'+r.id);},
 'use-capture':async el=>useCapturedPhoto(el.dataset.id),
 'save-sale':async el=>{if(!live.session){navigate('/sign-in?next='+encodeURIComponent(location.pathname+location.search));return;}
  const old=live.data.saved.find(s=>s.saleId===el.dataset.id);await api('saved',{saleId:el.dataset.id,saved:!old?.saved});await refresh({local:true});toast(old?.saved?'Space removed from shortlist.':'Space saved.');},
 'add-spot':()=>{
  const form=currentForm(),data=new FormData(form),a=rawAsset(data.get('id')),base=live.assetEdit?.id===a.id?live.assetEdit:a;
  const draft={...base,...assetFields(data,base)};draft.spots.push({id:'spot-'+crypto.randomUUID().slice(0,8),name:'New panel',side:'left',box:{x:.3,y:.4,width:.25,height:.2},suggestedPriceCents:'10',confidence:'low',requiresMeasurement:true,dimensionsCm:null});
  rememberUndo(base);live.assetEdit=draft;rerender();queueMicrotask(()=>currentForm()?.dispatchEvent(new Event('input',{bubbles:true})));
 },
 'remove-spot':el=>{const form=currentForm(),data=new FormData(form),a=rawAsset(data.get('id')),base=live.assetEdit?.id===a.id?live.assetEdit:a;
  if(base.spots.length<=1)throw new Error('Keep at least one advertising surface.');rememberUndo(base);live.assetEdit={...base,...assetFields(data,base)};live.assetEdit.spots=live.assetEdit.spots.filter(p=>p.id!==el.dataset.id);rerender();queueMicrotask(()=>currentForm()?.dispatchEvent(new Event('input',{bubbles:true})));},
 'mainnet-test-dates':()=>setDates([10,20,25,25,30,35]),'quick-dates':()=>setDates([3,8,12,12,14,16]),'relaxed-dates':()=>setDates([30,60,90,90,110,120]),
 publish:async el=>{
  const result=await api('sales/'+el.dataset.id+'/publication-options',{});
  if(result.mode==='recoverable'){
   await review('Publish with recoverable NEAR collateral',{spots:result.plan.spots.map(p=>({spotId:p.spotId,contractId:p.contractId})),collateralNEAR:nativeUnits(result.plan.collateralPerSpot),...result.assessment});
   const started=await api('provision-plans/'+result.id+'/start',{reviewed:true});
   if(started.status==='budget-blocked')throw new Error('Publication exceeds the current local execution limits. No new transaction was sent. Review Account recovery for the exact funding assessment.');
   const deadline=performance.now()+30000;
   for(let i=0;i<100&&performance.now()<deadline;i++){await new Promise(r=>setTimeout(r,500));const status=await api('provision-plans/'+result.id);if(status.status==='needs-recovery')throw new Error('Original publication needs recovery: '+status.errorCode+'. Review its retained account before continuing.');if(['published','waiting-original-receipt'].includes(status.status))break;}
   await refreshSale(el.dataset.id);toast(sale(el.dataset.id)?.status==='published'?'Your sale is published.':'Publication is recorded. Resume the original plan from this sale to reconcile its transactions.');return;
  }
  for(const record of result.plans){if(record.status==='confirmed')continue;await nativePlan(record.plan,'Publish advertising spot '+record.plan.spotId);}
  await refreshSale(el.dataset.id);toast(sale(el.dataset.id)?.status==='published'?'Your sale is published.':'Publication is pending. Recover the original requests to continue.');
 },
 'cancel-unsent-request':async el=>{await api('wallet-requests/'+el.dataset.id+'/cancel-unsent',{});await refresh({local:true});toast('The unopened request was cancelled.');},
 'cancel-unsent-funding':async el=>{await api('wallet-funding/'+el.dataset.id+'/cancel-unsent',{});await refresh({local:true});toast('The unopened Base request was cancelled.');},
 'resume-intent':async el=>{await ensureSigningWallet();const r=await api('wallet-requests/'+el.dataset.id+'/resume-intent',{});if(r.status==='rejected'){const plan=await verifyOriginalIntent(await api('intents/'+r.planId),r);await intentPlan(plan,'Retry your original payment with the same amount and nonce');}await refreshRecovered([r]);toast('Your original request has been checked.');},
 'resume-publication':async el=>{await api('provision-plans/'+el.dataset.id+'/start',{reviewed:true});await refresh({local:true});toast('The original publication plan is being reconciled. No replacement account was created.');},
 'pay-booking':el=>payBooking(el.dataset.id),
 'cancel-booking':async el=>{await api('bookings/'+el.dataset.id+'/cancel',{});await refresh({local:true});toast('Unsent booking cancelled.');},
 faucet:async()=>{const r=await api('lab-wallet/faucet',{});if(r.status!=='confirmed')throw new Error('The original faucet transaction is pending. Reconcile it before trying another wallet.');await refresh();toast('This wallet\'s test funding is confirmed.');},
 'lock-artwork':el=>confirmAction(el.dataset.contract,'lock-artwork',{expectedRevision:el.dataset.revision}),
 'cancel-empty':el=>confirmAction(el.dataset.contract,'cancel-empty'),
 'reclaim-storage':el=>confirmAction(el.dataset.contract,'reclaim-storage'),
 'open-issue':el=>confirmAction(el.dataset.contract,'open-issue',{caseId:el.dataset.id}),
 'accept-nomination':el=>confirmAction(el.dataset.contract,'accept-nomination'),
 mint:el=>confirmAction(el.dataset.contract,'mint'),
 claim:async el=>{const result=await claimCredit(el.dataset.contract);rerender();toast(result.phase==='no-available-credit'?'No new credit to claim.':'Your credit is available in your spending balance.');},
 'owner-payout':async el=>{
  const wallet=live.session.wallet,contracts=el.dataset.contract?[el.dataset.contract]:live.catalog.snapshots.filter(s=>s.state.seller_id===wallet&&BigInt(s.credits?.[wallet]?.available??0)>0n).map(s=>s.accountId);
  const total=contracts.reduce((sum,id)=>sum+BigInt(snapshot(id)?.credits?.[wallet]?.available??0),0n);
  if(!total)throw new Error('There are no new campaign earnings to withdraw.');
  for(const id of contracts)await claimCredit(id);
  if(live.session?.wallet!==wallet)throw new Error('Reconnect the original wallet to finish withdrawing.');
  if(wallet.startsWith('0x')){navigate('/buy/money');if(total<150000n){toast('Your earnings are in your balance. You can withdraw to Base when the current routing minimum is met.');return;}live.exitQuote=await api('routes',{direction:'exit',amount:total.toString(),dry:false});rerender();toast('Your withdrawal quote is ready. Confirm delivery to your Base wallet.');return;}
  await ensureUsdcStorage();await nativePlan(await api('token-actions',{kind:'withdraw-native',amount:total.toString()}),'Withdraw your campaign earnings');await refreshBalances();toast('Your earnings withdrawal is recorded.');
 },
 'register-storage':async()=>{await nativePlan(await api('token-actions',{kind:'token-storage'}),'Register this wallet for native USDC');await refreshBalances();toast('Native USDC storage registration recorded.');},
 'reconcile-operation':async el=>{await api('operations/'+el.dataset.id);await refresh({local:true});toast('Original payout transaction checked.');},
 'recover-all':async()=>{
  const requests=live.data.requests.filter(r=>!['confirmed','failed','rejected'].includes(r.status));
  for(const r of requests)await recoverOne(r);
  for(const r of live.fundingRecords??[])if(!['confirmed','failed','cancelled'].includes(r.phase))await api('wallet-funding/'+r.id+'/reconcile',{});
  await refreshRecovered(requests);toast('Original requests checked. Unknown outcomes remain pending.');
 },
 'finalize-success':el=>confirmAction(el.dataset.contract,'finalize-success'),
 'finalize-failure':el=>confirmAction(el.dataset.contract,'finalize-failure'),
 'lose-response':()=>{live.loseNextResponse=!live.loseNextResponse;rerender();},
 'restart-api':async()=>{
  await api('lab-restart',{});await new Promise(r=>setTimeout(r,800));
  for(let i=0;i<60;i++){try{await api('health');await refresh();toast('API restarted. Original records and chain retained.');return;}catch{await new Promise(r=>setTimeout(r,500));}}
  throw new Error('The local API is restarting. Reload this page to recover.');
 },
 'fund-route':async el=>{
  await ensureSigningWallet();
  const session=live.session;if(!['evm','funded'].includes(session.kind))throw new Error('Reconnect the Base wallet app before funding.');
  const r=await api('wallet-funding',{routeId:el.dataset.id});if(!r.dispatchAllowed){navigate('/account/recovery');throw new Error('Recover the original funding request before starting another transfer.');}
  try{
   await review('Fund your original wallet from Base',{sendMicroUsdc:r.quotedInput,receiveMicroUsdc:r.quotedOutput,expiresAt:r.expiresAt,transaction:r.transaction});
   if(session.kind==='evm')await live.wallets.ensureBase(session.wallet);await api('wallet-funding/'+r.id+'/dispatch',{}, {session});
   const hash=session.kind==='funded'?(await api('funded-wallet/send-base',{operationId:r.id},{session})).transactionHash:await live.wallets.sendBase(r.transaction);sessionStorage.setItem('everywhere-base-hash:'+r.id,hash);
   await api('wallet-funding/'+r.id+'/reconcile',{transactionHash:hash},{session});
  }catch(error){if(error.code===4001)await api('wallet-funding/'+r.id+'/reject',{code:4001},{session});throw error;}
  live.fundQuote=null;await refreshBalances();await refresh({local:true});toast('Original Base transfer recorded. Wait for finality and the actual Intents balance before buying.');
 },
 'exit-route':async el=>{const plan=await api('exit-intent',{routeId:el.dataset.id});await intentPlan(plan,'Return your Intents USDC to your original Base wallet');live.exitQuote=null;await refreshBalances();await refresh({local:true});toast('Return request recorded. Verify destination delivery in the route history.');},
 'check-route':async el=>{live.routeResult=await api('routes/'+el.dataset.id+(el.dataset.direction==='exit'?'/reconcile':''));rerender();},
};
function setDates(minutes){const form=document.querySelector('form[data-live-form="sale-edit"]'),base=Date.parse(live.catalog.time);
 ['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].forEach((key,i)=>form.elements.namedItem(key).value=localDate(base+minutes[i]*60000));if(form.elements.namedItem('customMilestones'))form.elements.namedItem('customMilestones').checked=true;form.dataset.dirty='true';}
export const forms={
 ...onboardingForms,
 'quick-offer':data=>saveOffer(data,{publish:true}),
 ...workspaceForms,
 'connect-funded':data=>connect('funded',String(data.get('wallet'))),
 'connect-test':data=>connect('test',String(data.get('wallet'))),'connect-evm':data=>connect('evm',String(data.get('provider'))),
 search:data=>navigate('/explore?'+new URLSearchParams({city:data.get('city'),type:data.get('type')})),
 profile:async data=>{await api('profile',{displayName:String(data.get('displayName')),brand:String(data.get('brand')),city:String(data.get('city')),notifications:data.has('notifications'),defaultWorkspace:data.get('defaultWorkspace')},{method:'PATCH'});await refresh({local:true});toast('Profile saved to this wallet.');},
 'asset-create':async data=>{
  const photo=data.get('photo'),photoDataUrl=await photoData(photo)??live.capturePhoto;let draft;
  if(data.get('method')==='ai'){const r=await api('ai/draft',{prompt:String(data.get('title'))+'. '+String(data.get('description')),...(photoDataUrl?{imageDataUrl:photoDataUrl}:{})});draft=r.draft;}
  else draft={assetType:data.get('assetType'),description:String(data.get('description')),assumptions:['Owner-created layout; confirm physical measurements.'],spots:[{id:'spot-1',name:'Advertising panel',side:'left',box:{x:.3,y:.4,width:.3,height:.2},suggestedPriceCents:'10',confidence:'low'}]};
  let coverMediaId;if(data.has('publicCover')){if(!photoDataUrl)throw new Error('Choose a photo before publishing a listing cover.');coverMediaId=(await api('media',{base64:photoDataUrl.split(',')[1],mime:photoDataUrl.slice(5,photoDataUrl.indexOf(';')),publicContentAcknowledged:true})).id;}
  const asset=await api('assets',{...draft,title:String(data.get('title')),city:String(data.get('city')),source:data.get('method')==='ai'?'ai':'manual',campaignType:data.get('campaignType')==='team-test'?'team-test':'physical',imageProvenance:data.has('aiGeneratedImage')?'ai-generated':'owner-photo',...(photoDataUrl?{photoDataUrl}:{}),...(coverMediaId?{coverMediaId}:{})});
  await refresh({local:true,render:false});live.assetEdit=null;live.capturePhoto=null;navigate('/host/assets/'+asset.id+'/review');toast('Editable space saved. Review every surface before publishing.');
 },
 'asset-edit':async data=>{
  const a=rawAsset(data.get('id')),base=live.assetEdit?.id===a.id?live.assetEdit:a;
  await saveEditor(data);live.assetEdit=null;await refresh({local:true,render:false});navigate(data.get('next')==='campaign'?'/host/sales/new?asset='+a.id:'/host/assets/'+a.id);toast('Space and advertising surfaces saved.');
 },
 'sale-edit':async data=>{
  const a=rawAsset(data.get('assetId')),existing=data.get('id')?sale(data.get('id')):null;
  const spots=(existing?.spots??a.spots).map(p=>({id:p.id,priceCents:cents(data.get('price:'+p.id)),...(data.get('rule:'+p.id)==='inherit'?{}:{takeoverEnabled:data.get('rule:'+p.id)==='on'})}));
  const payload={assetId:a.id,title:String(data.get('title')),arbiterId:String(data.get('arbiterId')),takeoverDefault:data.has('takeoverDefault'),rules:String(data.get('rules')),spots,
   schedule:campaignSchedule(Object.fromEntries(['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map(key=>[key,String(data.get(key))])),{custom:data.has('customMilestones')})};
  const result=existing?await api('sales/'+existing.id,{version:Number(data.get('version')),sale:payload},{method:'PATCH'}):await api('sales',payload);
  await refresh({local:true,render:false});navigate('/host/sales/'+result.id);toast('Sale draft saved. Review & publish when ready.');
 },
 'campaign-create':async data=>{const c=await api('campaigns',{name:String(data.get('name')),budgetMicroUsdc:amount(data.get('budget'))});await refresh({local:true,render:false});navigate('/buy/campaigns/'+c.id);},
 'prepare-booking':data=>prepareBooking(data),
 nomination:async data=>{const plan=await api('nomination',{contractId:String(data.get('contractId')),recipientId:String(data.get('recipientId'))});const r=await intentPlan(plan,'Nominate your final placement NFT recipient');
  for(let i=0;i<20;i++){await api('wallet-requests/'+r.id+'/reconcile',{});await refresh({contracts:[String(data.get('contractId'))],render:false});if(snapshot(data.get('contractId'))?.state.nominated_recipient===data.get('recipientId'))break;await new Promise(r=>setTimeout(r,300));}rerender();},
 'nft-transfer':async data=>{
  const creative=data.get('purpose')==='creative-control';
  if(creative&&!data.has('transferAcknowledged'))throw new Error('Confirm that the recipient will control this placement\'s creative.');
  await confirmAction(String(data.get('contractId')),'transfer',{receiverId:String(data.get('receiverId')).trim(),...(creative?{purpose:'creative-control',controlAcknowledged:true,expectedController:String(data.get('expectedController')),expectedRevision:String(data.get('expectedRevision'))}:{})});
 },
 artwork:async data=>{const mediaId=await artifact(data);await confirmAction(String(data.get('contractId')),'artwork',{mediaId});},
 'delivery-proof':async data=>{const mediaId=await artifact(data);await confirmAction(String(data.get('contractId')),'delivery-proof',{mediaId});},
 issue:async data=>{const contractId=String(data.get('contractId')),mediaId=await artifact(data),issue=await api('placements/'+contractId+'/issues',{reason:String(data.get('reason')),mediaId});
  await refresh({local:true,render:false});navigate('/support/cases/'+issue.id);
  if(snapshot(contractId)?.mode==='hub')await confirmAction(contractId,'open-issue',{caseId:issue.id});
 },
 'issue-decision':async data=>{const mediaId=await artifact(data);await confirmAction(String(data.get('contractId')),'issue-decision',{caseId:String(data.get('caseId')),open:data.get('decision')==='open',mediaId});},
 support:async data=>{const ticket=await api('support',{subject:String(data.get('subject')),message:String(data.get('message'))});await refresh({local:true,render:false});navigate('/support/cases/'+ticket.id);},
 message:async data=>{const wallet=live.session.wallet,id=String(data.get('contractId')),messages=await api('placements/'+id+'/messages',{message:String(data.get('message'))});if(live.session?.wallet!==wallet)throw new Error('Your wallet changed. Reopen the conversation.');live.data.placementMessages=[...(live.data.placementMessages??[]).filter(m=>m.contractId!==id),...messages];rerender();toast('Message saved to this placement conversation.');},
 'withdraw-native':async data=>{
  if(BigInt(amount(data.get('amount')))>BigInt(live.balances?.intentsUsdc??0))throw new Error('Choose an amount within your available balance.');
  if(live.session.wallet.startsWith('0x')){const plan=await api('withdrawal-intent',{recipientId:String(data.get('recipientId')),amount:amount(data.get('amount'))});await intentPlan(plan,'Withdraw USDC to the selected NEAR account');}
  else {await ensureUsdcStorage();await nativePlan(await api('token-actions',{kind:'withdraw-native',amount:amount(data.get('amount'))}),'Withdraw your USDC into your NEAR wallet');}await refreshBalances();await refresh({local:true});
 },
 'deposit-intents':async data=>{await nativePlan(await api('token-actions',{kind:'deposit-intents',amount:amount(data.get('amount'))}),'Deposit native USDC into your own Intents balance');await refreshBalances();await refresh({local:true});},
 'fund-quote':async data=>{live.fundQuote=await api('routes',{direction:'fund',amount:amount(data.get('amount')),dry:false});rerender();},
 'exit-quote':async data=>{live.exitQuote=await api('routes',{direction:'exit',amount:amount(data.get('amount')),dry:false});rerender();},
 'recover-request':async data=>{const request=await api('wallet-requests/'+data.get('id')+'/reconcile',data.get('hash')?{transactionHash:String(data.get('hash')).trim()}:{});await refreshRecovered([request]);toast('The original request was checked against its signed plan.');},
 'recover-funding':async data=>{await api('wallet-funding/'+data.get('id')+'/reconcile',data.get('hash')?{transactionHash:String(data.get('hash')).trim()}:{});await refreshBalances();await refresh({local:true});toast('Original Base funding receipt checked.');},
 'advance-clock':async data=>{
  await api('lab-clock',{saleId:String(data.get('saleId')),stage:String(data.get('stage'))});
  const notice=document.querySelector('#connected-notice');if(notice){notice.hidden=false;notice.textContent='Advancing the local chain and checking finalized timestamps…';}
  for(let i=0;i<300;i++){await new Promise(r=>setTimeout(r,1200));const result=await api('lab-clock');if(result.status==='complete'){await refresh();toast('Local campaign clock advanced.');return;}if(result.status==='failed')throw new Error('The clock advance needs recovery. Retry from the original test control.');}
  throw new Error('The local clock is still advancing. Refresh its status before continuing.');
 },
 'capture-photo':async data=>{const imageDataUrl=await photoData(data.get('photo'));if(!imageDataUrl)throw new Error('Choose a vehicle photo first.');await api('captures/'+data.get('session')+'/photo',{token:String(data.get('token')),imageDataUrl});live.captureSaved=String(data.get('session'));rerender();toast('Vehicle photo saved for the owner workspace.');},
};
