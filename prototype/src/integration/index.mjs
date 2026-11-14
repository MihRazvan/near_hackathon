import './style.css';
import {mountSetupPreview} from './setup-preview.mjs';
import {mountCreationHints} from './listing-progress.mjs';
import {mountOffer} from './offer-setup.mjs';
import {mountSpotWorkspace,unmountSpotWorkspace} from './spot-workspace.mjs';
import {mountOnboarding} from './onboarding.mjs';
import { navigate,toast } from '../store.mjs';
import { live,initialize,currentPerson } from './runtime.mjs';
import { publicView } from './public.mjs';
import { ownerView } from './owner.mjs';
import { buyerView,mountCheckout } from './buyer.mjs';
import { accountView,sharedView,opsView,testingView } from './shared.mjs';
import { actions,forms } from './actions.mjs';
import { esc,link,act,notice,heading,empty } from './ui.mjs';
import { captureView,mountCapture } from './capture.mjs';
import { campaignRecordView,mountCampaignRecord } from './record.mjs';
import {mountArtworkSelection} from './artwork-media.mjs';
import {verifiedMediaFor} from './workspace-actions.mjs';
import {mountAdPreview} from './ad-preview.mjs';

export { live,currentPerson };
export async function initializeConnected(){await initialize();}
export function topbar(){
 if(!live.config||live.config.production)return '';
 const pending=live.data?.requests?.filter(r=>!['confirmed','failed','rejected'].includes(r.status)).length??0;
 return `<div class="prototype-bar connected-topbar"><span class="prototype-label"><i class="prototype-dot"></i><strong>${!live.config?'CONNECTING NETWORK…':live.config.sandbox?'LOCAL NEAR SANDBOX':'NEAR MAINNET · REAL FUNDS'}</strong><span class="reset-label">${live.config?.sandbox?'VALUELESS TEST TOKENS · REAL TRANSACTIONS':'CONNECTED PRODUCT'}</span></span><div class="prototype-tools">${link('/settings/wallets',live.session?'Switch wallet':'Connect wallet','text-link')}${link('/account/recovery',pending?'Recover '+pending+' request'+(pending===1?'':'s'):'Account recovery','text-link')}${live.config?.sandbox?link('/_testing','Test controls','text-link'):''}${act('refresh','Refresh state','','button small')}</div></div>`;
}
export function renderConnected(r){
 if(!live.config)return '';
 let body;
 if(r.id==='P10')body=campaignRecordView(r.params.id);
 else if(r.scope==='global')body=globalView(r);
 else if(r.id==='T01'&&!live.config.production)body=testingView();
 else if(['O04','O05'].includes(r.id))body=captureView(r);
 else if(r.scope==='public')body=publicView(r);
 else if(r.scope==='account')body=accountView(r);
 else if(r.scope==='owner')body=ownerView(r);
 else if(r.scope==='buyer')body=buyerView(r);
 else if(r.scope==='shared')body=sharedView(r);
 else if(r.scope==='ops')body=opsView(r);
 // Account/draft data is available immediately. Financial and fulfillment views
 // wait for this wallet's verified live state, never an invented zero balance.
 const query=new URLSearchParams(location.search),chainConversation=r.id==='S02'&&!['bookings','incomingBookings'].some(key=>live.data?.dashboard?.[key]?.some(b=>b.id===r.params.threadId)),chainIssue=r.id==='S09'&&(query.has('contract')||query.has('booking'))||r.id==='S10'&&live.data?.issues?.some(i=>i.id===r.params.id);
 if(live.session&&((live.data?.chainPending&&(['B06','B07','B08','B09','B11','B12','O14','O15','O16','O19','O20'].includes(r.id)||r.scope==='ops'||chainConversation||chainIssue))||(['B06','B11'].includes(r.id)&&!live.balances))){
  const failed=live.chainError||live.balanceError;
  body=empty(failed?'Campaign status is unavailable.':'Checking your live campaign status.',failed?'Your account and drafts are available. Retry the status check before continuing.':'Your account is connected. Current placements and balances are loading.',act('refresh','Refresh status','','button primary'));
 }
 if(!body)body=empty('This destination is unavailable.','Choose a published space or open your own workspace.',link('/explore','Explore spaces','button primary'));
 const unavailable=live.error?`<div id="connected-notice" class="notice orange" role="status">${esc(live.error)}</div>`:live.busy&&live.progress?`<div id="connected-notice" class="notice" role="status">${esc(live.progress)}</div>`:'<div id="connected-notice" class="notice" role="status" hidden></div>';
 const pending=live.session&&live.data?.chainPending&&!live.error&&!['O03','O06','O07','O08'].includes(r.id)?'<p class="tiny muted" role="status">Live campaign status is updating. You can work on your drafts meanwhile.</p>':'';
 return unavailable+pending+body;
}

function globalView(r){
 if(r.id==='G02')return empty('This page belongs to another account.','Connect an authorized wallet or return to your workspace.',link('/settings/wallets','Choose a wallet','button primary'));
 if(r.id==='G03')return empty('We could not load this page.','Your saved listings and payment records are retained. Try again in a moment.',act('reload-workspace','Try again','','button primary')+' '+link('/help','Get help'));
 return empty('This page could not be found.','The link may have changed. Find a space or return to your existing campaigns.',link('/explore','Explore spaces','button primary')+' '+link('/profile','Your campaigns'));
}
export async function handleAction(target,event){
 const action=actions[target.dataset.liveAction];if(!action)throw new Error('This action is unavailable.');return action(target,event);
}
export async function handleForm(form){const handler=forms[form.dataset.liveForm];if(!handler)throw new Error('This form is unavailable.');return handler(new FormData(form),form);}
export function legacyAction(target,r){
 if(target.dataset.action==='select-spot'){
  if(live.dragJustHappened)return;
  if(r.id==='P03'){const query=new URLSearchParams(location.search);query.set('spot',target.dataset.id);navigate(location.pathname+'?'+query);}
  return;
 }
 toast('This action is unavailable. Refresh the page and try again.');
}
export function mountConnected(r){
 unmountSpotWorkspace();mountSetupPreview();
 mountOnboarding(r);mountCapture(r);mountOffer();mountCreationHints();mountCheckout();mountArtworkSelection(verifiedMediaFor(live.data?.media,live.session?.wallet));mountAdPreview();
 if(r.id==='P10')mountCampaignRecord(r.params.id);
 const providers=document.querySelector('form[data-live-form="connect-evm"] select');
 if(providers){const old=providers.value;providers.innerHTML=live.providers.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')||'<option value="">No injected EVM wallet detected</option>';if(live.providers.some(p=>p.id===old))providers.value=old;}
 document.querySelectorAll('form[data-live-form]').forEach(form=>form.addEventListener('input',()=>form.dataset.dirty='true'));
 if(!['O06','O07','O08'].includes(r.id))return;
 const form=document.querySelector('form[data-live-form="asset-edit"]');
 if(form)mountSpotWorkspace(form);
}

window.addEventListener('app:walletproviders',()=>{if(live.config?.production&&['/sign-in','/settings/wallets'].includes(location.pathname))window.dispatchEvent(new Event('app:changed'));else if(document.querySelector('form[data-live-form="connect-evm"]'))mountConnected({id:'A01'});});
