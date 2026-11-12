import './style.css';
import './identity.css';
import './workspace-identity.css';
import './experience.css';
import './record.css';
import './placement-nft.css';
import { handleExperienceAction } from './integration/experience.mjs';
import { handleRecordAction } from './integration/record.mjs';
import { wordmark, outwardArrow } from './brand.mjs';
import { live, currentPerson, initializeConnected, renderConnected, topbar, handleAction, handleForm, legacyAction, mountConnected } from './integration/index.mjs';
import { run } from './integration/runtime.mjs';
import { state, person, navigate, toast } from './store.mjs';
import { matchRoute } from './routes.mjs';
import { icon, esc, short, link, closeModal } from './ui.mjs';

const app = document.querySelector('#app');
let currentRoute, toastTimer, initialized=false, startupFailed=false;
const navs = {
  buyer: [['/buy','Overview','grid'],['/buy/campaigns','Campaigns','file'],['/buy/saved','Saved spaces','heart'],['/settings/workspace?tab=brand','Brand assets','upload'],['/buy/money','Money & credits','wallet']],
  owner: [['/host','Overview','grid'],['/host/assets','My spaces','car'],['/host/sales','Campaigns','file'],['/host/bookings','Bookings','shield'],['/host/calendar','Calendar','calendar'],['/host/analytics','Performance','chart'],['/host/earnings','Earnings','wallet']],
  ops: [['/ops','Review queue','grid'],['/ops/audit','Campaign history','clock']],
};
function active(path) {
  const base = path.split('?')[0];
  return location.pathname === base || (!['/buy','/host','/ops'].includes(base) && location.pathname.startsWith(base + '/'));
}
function navLink([url,title,i]) {
  return `<a href="${esc(url)}" class="${active(url)?'active':''}" ${active(url)?'aria-current="page"':''}>${icon(i)}${esc(title)}</a>`;
}
function publicShell(body) {
  const p=person(),account=live.session?link('/'+(live.data?.profile?.defaultWorkspace==='owner'?'host':'buy'),esc(p.name)+' ↗','text-link public-account-link'):link('/sign-in','Sign in','text-link');
  return `${topbar()}<header class="site-header"><a class="brand" href="/">${wordmark}</a><nav class="site-nav" aria-label="Main navigation"><a href="/explore">Find a space</a><a href="/experience">Try a takeover</a><a href="/host">For space owners</a></nav><div class="header-end">${link('/host/assets/new',`List a space ${icon('plus')}`,'button small')}${account}</div></header><nav class="mobile-nav-links" aria-label="Mobile navigation"><a href="/explore">Explore</a><a href="/experience">Try a takeover</a><a href="/host">List space</a></nav><main class="public-main" id="main">${body}</main><footer class="site-footer"><a href="/" class="brand">${wordmark}</a><div class="footer-mission">Advertise on everything.<br>Starting with vehicles. Going everywhere.</div><nav aria-label="Footer"><a href="/help">Help</a><a href="/policies/terms">Terms</a><a href="/policies/privacy">Privacy</a><a href="/ASSETS.md" target="_blank" rel="noopener">Credits</a></nav><div class="footer-bottom"><span>Book space on a vehicle.</span><span>Built on NEAR</span></div></footer>`;
}
function workspaceShell(body, scope) {
  const role=scope==='owner'?'owner':scope==='ops'?'ops':scope==='shared'&&live.data?.profile?.defaultWorkspace==='owner'?'owner':'buyer';
  const nav=navs[role],p=person(),name=p.name||'Your account',initials=name.split(' ').map(x=>x[0]).slice(0,2).join('');
  const accountNav=[['/inbox','Inbox','mail'],['/notifications','Notifications','bell'],['/settings/profile','Settings','settings']];
  if((live.data?.arbiterSales?.length||live.data?.supportAdmin)&&role!=='ops')accountNav.push(['/ops','Campaign review','shield']);
  const label=role==='owner'?'Owner':role==='ops'?'Campaign review':'Buyer';
  return `${topbar()}<div class="workspace"><aside class="sidebar"><a class="brand" href="/">${wordmark}</a><div class="workspace-switch"><a href="/buy" class="${role==='buyer'?'active':''}">Buy space</a><a href="/host" class="${role==='owner'?'active':''}">List space</a></div><div><div class="nav-section-label">${role==='ops'?'CAMPAIGN OPERATIONS':label.toUpperCase()+' WORKSPACE'}</div><nav aria-label="${label} navigation">${nav.map(navLink).join('')}</nav></div><div><div class="nav-section-label">YOUR ACCOUNT</div><nav aria-label="Account navigation">${accountNav.map(navLink).join('')}</nav></div><div class="sidebar-bottom"><nav><a href="/explore">${icon('arrow')}Explore marketplace</a><a href="/help">${icon('file')}Help & support</a></nav><div class="sidebar-person"><span class="avatar">${esc(initials)}</span><div><strong>${esc(name)}</strong><small>${esc(p.brand||'Your workspace')}</small></div></div></div></aside><div class="workspace-main"><header class="workspace-topbar"><div class="workspace-breadcrumb"><a href="${role==='owner'?'/host':role==='ops'?'/ops':'/buy'}">${label}</a><span>/</span><strong>${esc(currentRoute.title)}</strong></div><div class="actions"><a class="wallet-label" href="/settings/wallets">${icon('wallet')}${esc(short(p.wallet)||'Connect wallet')}</a>${link('/notifications',icon('bell')+'<span class="sr-only">Notifications</span>','icon-button')}${link('/settings/profile','<span class="avatar">'+esc(initials)+'</span><span class="sr-only">Your profile</span>','')}</div></header><nav class="mobile-workspace-nav" aria-label="Workspace navigation">${[...nav,['/buy','Buy','grid'],['/host','List','car'],['/settings/wallets','Wallet','wallet']].map(navLink).join('')}</nav><main class="workspace-content" id="main">${body}</main></div></div>`;
}
function render() {
  if(!initialized){
    if(startupFailed){
      const startup=document.querySelector('#startup');
      startup?.setAttribute('aria-busy','false');
      const content=startup?.querySelector('.startup-content');
      if(content)content.innerHTML=`<img class="startup-mark" src="/favicon.svg" width="64" height="64" alt=""><h1 class="startup-name">Let\'s try that again<span>.</span></h1><p class="startup-copy" role="alert">We couldn\'t open Everywhere. Check your connection and try again.</p><button type="button" class="startup-retry" data-startup-retry>Try again</button>`;
    }
    return;
  }
  state.connectedPerson=currentPerson();
  currentRoute=location.pathname==='/_testing'&&live.config&&!live.config.production?{id:'T01',title:'Local testing',scope:'shared',params:{}}:matchRoute(location.pathname);
  let body=renderConnected(currentRoute);
  if(!body.includes('<h1'))body=body.replace('<h2>','<h1 tabindex="-1" class="empty-title">').replace('</h2>','</h1>');
  document.body.dataset.route=currentRoute.id;
  document.body.dataset.scope=currentRoute.scope;
  document.title=`${currentRoute.title} · Everywhere`;
  // Public and authentication pages remain useful without a signed-in account.
  app.innerHTML=['public','account','global'].includes(currentRoute.scope)||currentRoute.id==='O05'||!live.session?publicShell(body):workspaceShell(body,currentRoute.scope);
  mountConnected(currentRoute);
}
document.addEventListener('click',async event=>{
  if(!event.target?.closest)return;
  if(event.target.closest('[data-startup-retry]')){location.reload();return;}
  const preview=event.target.closest('[data-preview-toggle]');
  if(preview){const figure=preview.closest('.street-preview'),blank=figure.classList.toggle('is-blank');figure.querySelector('[data-preview-ad]')?.setAttribute('aria-hidden',String(blank));figure.querySelector('[data-preview-original]')?.setAttribute('aria-hidden',String(!blank));preview.setAttribute('aria-pressed',String(!blank));preview.innerHTML=(blank?'Preview a campaign':'See the blank canvas')+outwardArrow;return;}
  const example=event.target.closest('[data-experience-action]');
  if(example){event.preventDefault();handleExperienceAction(example,live);return;}
  const record=event.target.closest('[data-record-action]');
  if(record){event.preventDefault();await handleRecordAction(record);return;}
  const action=event.target.closest('[data-live-action]');
  if(action){event.preventDefault();await run(()=>handleAction(action,event));return;}
  const generic=event.target.closest('[data-action]');
  if(generic){event.preventDefault();if(generic.dataset.action==='close-modal')closeModal();else await run(()=>legacyAction(generic,currentRoute));return;}
  const a=event.target.closest('a[href]');
  if(!a||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||a.hasAttribute('download')||a.target&&a.target!=='_self')return;
  const url=new URL(a.href,location.href);
  if(url.origin!==location.origin||!/^https?:$/.test(url.protocol)||(url.hash&&url.pathname===location.pathname&&url.search===location.search))return;
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
window.addEventListener('app:changed',render);
window.addEventListener('app:navigate',()=>{closeModal();render();window.scrollTo(0,0);document.querySelector('h1')?.focus({preventScroll:true});});
window.addEventListener('app:toast',event=>{
  const t=document.querySelector('#toast');t.textContent=event.detail;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),5000);
});
render();
try{await initializeConnected();if(!live.catalog)throw new Error('Marketplace could not be loaded');initialized=true;}catch(error){live.error=error.message;startupFailed=true;}
render();
