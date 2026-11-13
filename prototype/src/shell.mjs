import {entryHref} from './integration/entry-context.mjs';
import { wordmark } from './brand.mjs';
import { esc, icon, link, short } from './ui.mjs';

export function accountArea(route) {
 if(route.scope==='owner')return 'dashboard';
 if(['buyer','shared','ops'].includes(route.scope)||route.id==='A03')return 'profile';
 return 'marketplace';
}
export function siteHeader({session,area='marketplace',publicPage=false}={}) {
 const item=(url,title,key)=>`<a href="${url}" ${!publicPage&&area===key?'aria-current="page"':''}>${title}</a>`;
 const navigation=item('/explore','Marketplace','marketplace')+item('/host','Dashboard','dashboard')+(session?item('/profile','Profile','profile'):'');
 const account=session?`<a href="/settings/wallets" class="wallet-label" aria-label="Manage wallet ${esc(short(session.wallet))}">${icon('wallet')}<span>${esc(short(session.wallet))}</span></a>`:link('/sign-in','Sign in','text-link');
 return `<header class="site-header marketplace-header"><a class="brand" href="/" aria-label="Everywhere home">${wordmark}</a><nav class="site-nav" aria-label="Main navigation">${navigation}</nav><div class="header-end">${!session?link(entryHref('/host/assets/new',session),'List a space '+icon('plus'),'button small'):''}${account}</div></header><nav class="mobile-nav-links" aria-label="Mobile navigation">${navigation}</nav>`;
}
export function accountContext(route) {
 const area=accountArea(route),root=area==='dashboard'?'/host':'/profile',title=area==='dashboard'?'Dashboard':'Profile';
 if(route.id==='O01'||route.id==='B01')return '';
 const review=route.scope==='ops';
 return `<div class="account-context"><a href="${review?'/ops':root}">${icon('chevron')}${review?'Campaign review':title}</a><span>${esc(route.title)}</span></div>`;
}
