import './style.css';
import { navigate,toast } from '../store.mjs';
import { live,initialize,currentPerson,rawAsset } from './runtime.mjs';
import { publicView } from './public.mjs';
import { ownerView } from './owner.mjs';
import { buyerView } from './buyer.mjs';
import { accountView,sharedView,opsView,testingView } from './shared.mjs';
import { actions,forms,assetFields } from './actions.mjs';
import { esc,link,act,notice,heading,empty } from './ui.mjs';
import { captureView } from './capture.mjs';

export { live,currentPerson };
export async function initializeConnected(){await initialize();}
export function topbar(){
 if(!live.config||live.config.production)return '';
 const pending=live.data?.requests?.filter(r=>!['confirmed','failed','rejected'].includes(r.status)).length??0;
 return `<div class="prototype-bar connected-topbar"><span class="prototype-label"><i class="prototype-dot"></i><strong>${!live.config?'CONNECTING NETWORK…':live.config.sandbox?'LOCAL NEAR SANDBOX':'NEAR MAINNET · REAL FUNDS'}</strong><span class="reset-label">${live.config?.sandbox?'VALUELESS TEST TOKENS · REAL TRANSACTIONS':'CONNECTED PRODUCT'}</span></span><div class="prototype-tools">${link('/settings/wallets',live.session?'Switch wallet':'Connect wallet','text-link')}${link('/account/recovery',pending?'Recover '+pending+' request'+(pending===1?'':'s'):'Account recovery','text-link')}${live.config?.sandbox?link('/_testing','Test controls','text-link'):''}${act('refresh','Refresh state','','button small')}</div></div>`;
}
export function renderConnected(r){
 if(!live.config)return heading('EVERYWHERE','Connecting your workspace.','Preparing the marketplace and your saved account.')+(live.error?notice('Connection interrupted',esc(live.error)+' '+act('reload-workspace','Retry connection')):'');
 let body;
 if(r.scope==='global')body=globalView(r);
 else if(r.id==='T01'&&!live.config.production)body=testingView();
 else if(['O04','O05'].includes(r.id))body=captureView(r);
 else if(r.scope==='public')body=publicView(r);
 else if(r.scope==='account')body=accountView(r);
 else if(r.scope==='owner')body=ownerView(r);
 else if(r.scope==='buyer')body=buyerView(r);
 else if(r.scope==='shared')body=sharedView(r);
 else if(r.scope==='ops')body=opsView(r);
 if(!body)body=empty('This destination is unavailable.','Choose a published space or open your own workspace.',link('/explore','Explore spaces','button primary'));
 const unavailable=live.error?`<div id="connected-notice" class="notice orange" role="status">${esc(live.error)}</div>`:live.busy&&live.progress?`<div id="connected-notice" class="notice" role="status">${esc(live.progress)}</div>`:'<div id="connected-notice" class="notice" role="status" hidden></div>';
 return unavailable+body;
}

function globalView(r){
 if(r.id==='G02')return empty('This page belongs to another account.','Connect an authorized wallet or return to your workspace.',link('/settings/wallets','Choose a wallet','button primary'));
 if(r.id==='G03')return empty('We could not load this page.','Your saved listings and payment records are retained. Try again in a moment.',act('reload-workspace','Try again','','button primary')+' '+link('/help','Get help'));
 return empty('This page could not be found.','The link may have changed. Find a space or return to your existing campaigns.',link('/explore','Explore spaces','button primary')+' '+link('/buy','Your campaigns'));
}
export async function handleAction(target,event){
 const action=actions[target.dataset.liveAction];if(!action)throw new Error('This action is unavailable.');return action(target,event);
}
export async function handleForm(form){const handler=forms[form.dataset.liveForm];if(!handler)throw new Error('This form is unavailable.');return handler(new FormData(form),form);}
export function legacyAction(target,r){
 if(target.dataset.action==='select-spot'){
  if(live.dragJustHappened)return;
  if(['O06','O07','O08'].includes(r.id)){
   const form=document.querySelector('form[data-live-form="asset-edit"]');if(form){const a=rawAsset(r.params.id);if(!a)return;const base=live.assetEdit?.id===a.id?live.assetEdit:a;live.assetEdit={...base,...assetFields(new FormData(form),base)};}
   navigate('/host/assets/'+r.params.id+'/spots?spot='+encodeURIComponent(target.dataset.id));
  }else if(r.id==='P03'){const query=new URLSearchParams(location.search);query.set('spot',target.dataset.id);navigate(location.pathname+'?'+query);}
  return;
 }
 toast('This action is unavailable. Refresh the page and try again.');
}
export function mountConnected(r){
 const providers=document.querySelector('form[data-live-form="connect-evm"] select');
 if(providers){const old=providers.value;providers.innerHTML=live.providers.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')||'<option value="">No injected EVM wallet detected</option>';if(live.providers.some(p=>p.id===old))providers.value=old;}
 document.querySelectorAll('form[data-live-form]').forEach(form=>form.addEventListener('input',()=>form.dataset.dirty='true'));
 if(!['O06','O07','O08'].includes(r.id))return;
 const asset=rawAsset(r.params.id),form=document.querySelector('form[data-live-form="asset-edit"]'),svg=document.querySelector('[data-editor-canvas]');
 if(!asset||!form||!svg)return;
 let drag;
 const point=event=>{const b=svg.getBoundingClientRect();return {x:(event.clientX-b.left)/b.width,y:(event.clientY-b.top)/b.height};};
 svg.addEventListener('pointerdown',event=>{
  const group=event.target.closest('[data-spot]');if(!group)return;const id=group.dataset.spot,base=live.assetEdit?.id===asset.id?live.assetEdit:asset;
  const values=assetFields(new FormData(form),base),spot=values.spots.find(p=>p.id===id);if(!spot)return;
  event.preventDefault();drag={id,group,start:point(event),box:{...spot.box},resize:event.target.classList.contains('resize-handle'),moved:false};svg.setPointerCapture(event.pointerId);
 });
 svg.addEventListener('pointermove',event=>{
  if(!drag)return;const p=point(event),dx=p.x-drag.start.x,dy=p.y-drag.start.y,b={...drag.box};
  if(Math.abs(dx)+Math.abs(dy)<.002)return;drag.moved=true;
  if(drag.resize){b.width=Math.max(.03,Math.min(1-b.x,b.width+dx));b.height=Math.max(.03,Math.min(1-b.y,b.height+dy));}
  else{b.x=Math.max(0,Math.min(1-b.width,b.x+dx));b.y=Math.max(0,Math.min(1-b.height,b.y+dy));}
  for(const k of ['x','y','width','height'])form.elements.namedItem(k+':'+drag.id).value=(b[k]*100).toFixed(2);
  const rect=drag.group.querySelector('rect');for(const[k,v]of Object.entries({x:b.x*960,y:b.y*480,width:b.width*960,height:b.height*480}))rect.setAttribute(k,v);
  const text=drag.group.querySelector('text');text.setAttribute('x',(b.x+b.width/2)*960);text.setAttribute('y',(b.y+b.height/2)*480+5);
  const handle=drag.group.querySelector('.resize-handle');if(handle){handle.setAttribute('x',(b.x+b.width)*960-8);handle.setAttribute('y',(b.y+b.height)*480-8);}form.dataset.dirty='true';
 });
 svg.addEventListener('pointerup',()=>{if(drag?.moved){live.dragJustHappened=true;setTimeout(()=>live.dragJustHappened=false,200);}drag=null;});
}
window.addEventListener('app:walletproviders',()=>{if(live.config?.production&&['/sign-in','/settings/wallets'].includes(location.pathname))window.dispatchEvent(new Event('app:changed'));else if(document.querySelector('form[data-live-form="connect-evm"]'))mountConnected({id:'A01'});});
