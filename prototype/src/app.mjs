import './style.css';
import './identity.css';
import './workspace-identity.css';
import './record.css';
import './placement-nft.css';
import './listing.css';
import './vehicle-setup.css';
import { handleRecordAction } from './integration/record.mjs';
import { wordmark, outwardArrow } from './brand.mjs';
import { live, currentPerson, initializeConnected, renderConnected, topbar, handleAction, handleForm, legacyAction, mountConnected } from './integration/index.mjs';
import { run } from './integration/runtime.mjs';
import { state, navigate } from './store.mjs';
import { matchRoute, canonicalDestination } from './routes.mjs';
import { siteHeader, accountContext, accountArea } from './shell.mjs';
import './marketplace-account.css';
import './marketplace.css';
import './experience-flow.css';
import './story.css';
import './kinetic.css';
import { mountStory } from './story.mjs';
import { closeModal } from './ui.mjs';

const app = document.querySelector('#app');
let currentRoute, toastTimer, startupFailed=false,renderedViewKey=null;
function publicShell(body) {
  return `${topbar()}${siteHeader({session:live.session,area:accountArea(currentRoute??{scope:'public'}),publicPage:location.pathname==='/'})}<main class="public-main" id="main">${body}</main><footer class="site-footer"><div class="footer-giant" aria-hidden="true">${wordmark}</div><a href="/" class="brand">${wordmark}</a><div class="footer-mission">Advertise on everything.<br>Starting with vehicles. Going everywhere.</div><nav aria-label="Footer"><a href="/help">Help</a><a href="/policies/terms">Terms</a><a href="/policies/privacy">Privacy</a><a href="/ASSETS.md" target="_blank" rel="noopener">Credits</a></nav><div class="footer-bottom"><span>Book space on a vehicle.</span><span>Built on NEAR</span></div></footer>`;
}
function workspaceShell(body) {
  return `${topbar()}${siteHeader({session:live.session,area:accountArea(currentRoute)})}<div class="workspace marketplace-workspace"><div class="workspace-main">${accountContext(currentRoute)}<main class="workspace-content" id="main">${body}</main></div></div>`;
}
function render() {
  const canonical=canonicalDestination(location.pathname+location.search+location.hash);
  if(canonical!==location.pathname+location.search+location.hash)history.replaceState(null,'',canonical);
  currentRoute=location.pathname==='/_testing'&&live.config&&!live.config.production?{id:'T01',title:'Local testing',scope:'shared',params:{}}:matchRoute(location.pathname);
  state.connectedPerson=currentPerson();
  // Render public content as soon as configuration is available. Private views
  // still wait for session restoration and their wallet-scoped workspace.
  const publicReady=live.config&&(['public','global'].includes(currentRoute.scope)||currentRoute.id==='O05');
  const signedOutReady=live.config&&live.sessionReady&&!live.session;
  const workspaceReady=live.config&&live.sessionReady&&live.session&&live.data;
  if(!publicReady&&!signedOutReady&&!workspaceReady){
    const failed=startupFailed||!!live.error;
    if(failed){
      const startup=document.querySelector('#startup');
      startup?.setAttribute('aria-busy','false');
      const content=startup?.querySelector('.startup-content');
      if(content)content.innerHTML=`<img class="startup-mark" src="/favicon.svg" width="64" height="64" alt=""><h1 class="startup-name">Let\'s try that again<span>.</span></h1><p class="startup-copy" role="alert">We couldn\'t open Everywhere. Check your connection and try again.</p><button type="button" class="startup-retry" data-startup-retry>Try again</button>`;
    }
    if(!document.querySelector('#startup'))app.innerHTML=publicShell(`<section class="market-invitation" ${failed?'role="alert"':'role="status" aria-busy="true"'}><div><h1 class="empty-title">${failed?'Your workspace could not load.':'Opening your workspace.'}</h1><p>${failed?'Your saved progress is retained. Try again to reconnect.':'Your account and saved campaigns are loading.'}</p></div>${failed?'<button type="button" class="button primary" data-startup-retry>Try again</button>':''}</section>`);
    return;
  }
  let body=renderConnected(currentRoute);
  if(!body.includes('<h1'))body=body.replace('<h2>','<h1 tabindex="-1" class="empty-title">').replace('</h2>','</h1>');
  document.body.dataset.route=currentRoute.id;
  document.body.dataset.scope=currentRoute.scope;
  document.title=`${currentRoute.title} · Everywhere`;
  // Public and authentication pages remain useful without a signed-in account.
  const viewKey=location.pathname+location.search+location.hash+'|'+(live.session?.wallet??'');
  const disclosures=renderedViewKey===viewKey?[...app.querySelectorAll('details[id]')].map(el=>[el.id,el.open]):[];
  app.innerHTML=['public','account','global'].includes(currentRoute.scope)||currentRoute.id==='O05'||!live.session?publicShell(body):workspaceShell(body,currentRoute.scope);
  for(const [id,open]of disclosures){const detail=document.getElementById(id);if(detail?.tagName==='DETAILS')detail.open=open;}
  if(renderedViewKey!==viewKey&&location.hash){try{const detail=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(detail?.tagName==='DETAILS')detail.open=true;}catch{}}
  renderedViewKey=viewKey;
  mountConnected(currentRoute);
  mountStory(currentRoute);
}
document.addEventListener('click',async event=>{
  if(!event.target?.closest)return;
  if(event.target.closest('[data-startup-retry]')){location.reload();return;}
  const preview=event.target.closest('[data-preview-toggle]');
  if(preview){const figure=preview.closest('.street-preview'),blank=figure.classList.toggle('is-blank');figure.querySelector('[data-preview-ad]')?.setAttribute('aria-hidden',String(blank));figure.querySelector('[data-preview-original]')?.setAttribute('aria-hidden',String(!blank));preview.setAttribute('aria-pressed',String(!blank));preview.innerHTML=(blank?'Preview a campaign':'See the blank canvas')+outwardArrow;return;}
  const record=event.target.closest('[data-record-action]');
  if(record){event.preventDefault();await handleRecordAction(record);return;}
  const action=event.target.closest('[data-live-action]');
  if(action){event.preventDefault();await run(()=>handleAction(action,event));return;}
  const generic=event.target.closest('[data-action]');
  if(generic){event.preventDefault();if(generic.dataset.action==='close-modal')closeModal();else await run(()=>legacyAction(generic,currentRoute));return;}
  const a=event.target.closest('a[href]');
  if(!a||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||a.hasAttribute('download')||a.getAttribute('target')&&a.getAttribute('target')!=='_self')return;
  const url=new URL(a.getAttribute('href'),location.href);
  if(url.origin!==location.origin||!/^https?:$/.test(url.protocol)||(url.hash&&url.pathname===location.pathname&&url.search===location.search))return;
  if(a.hasAttribute('data-placement-select')&&url.pathname===location.pathname){
    event.preventDefault();const position=window.scrollY;history.pushState(null,'',url.pathname+url.search);render();window.scrollTo(0,position);
    document.querySelector('.placement-choice[aria-current="true"]')?.focus({preventScroll:true});return;
  }
  event.preventDefault();navigate(url.pathname+url.search+url.hash);
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!form.matches('form[data-live-form]'))return;
  event.preventDefault();await run(()=>handleForm(form));
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.dataset.salePicker)navigate(`/spaces/${encodeURIComponent(el.dataset.salePicker)}?sale=${encodeURIComponent(el.value)}`);
});
document.addEventListener('keydown',event=>{
  if(['Enter',' '].includes(event.key)&&event.target.matches('.spot-shape[role="button"]')){event.preventDefault();event.target.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));}
});
window.addEventListener('popstate',()=>{render();document.querySelector('h1')?.focus({preventScroll:true});});
function renderUpdate(){
  // A background availability update must not erase a search being typed.
  if(currentRoute?.scope==='public'&&document.activeElement?.matches('input,textarea,select'))return;
  render();
}
window.addEventListener('app:changed',renderUpdate);
function focusDestination(){
  let target;try{target=location.hash&&document.getElementById(decodeURIComponent(location.hash.slice(1)));}catch{}
  if(target){if(target.tagName==='DETAILS')target.open=true;target.scrollIntoView();}
  else window.scrollTo(0,0);
  document.querySelector('h1')?.focus({preventScroll:true});
}
window.addEventListener('app:navigate',()=>{closeModal();render();focusDestination();});
window.addEventListener('app:toast',event=>{
  const t=document.querySelector('#toast');t.textContent=event.detail;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),5000);
});
render();
try{await initializeConnected();if(!live.catalog||live.session&&!live.data&&!live.busy)throw new Error('Marketplace could not be loaded');}catch(error){live.error=error.message;startupFailed=true;}
renderUpdate();
if(location.hash&&!document.activeElement?.matches('input,textarea,select'))focusDestination();
