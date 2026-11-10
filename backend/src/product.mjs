import { walletCsp } from './wallet-csp.mjs';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT } from './config.mjs';
import { assert, walletId, text, hashObject } from './core.mjs';

const MIME={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
export class Product {
 constructor({store,chain,marketplace,config,reads,walletRequests,now=Date.now}){Object.assign(this,{store,chain,marketplace,config,reads,walletRequests,now});}
 async serve(request,response,url){
  if(!['GET','HEAD'].includes(request.method)||url.pathname.startsWith('/api/')||url.pathname.startsWith('/lab'))return false;
  const root=resolve(ROOT,'prototype/dist');let name='index.html';
  if(url.pathname.startsWith('/assets/')){
   assert(/^\/assets\/[A-Za-z0-9_.-]+$/.test(url.pathname),'NOT_FOUND','Asset not found',404);name=url.pathname.slice(1);
  }else if(extname(url.pathname))return false;
  let bytes;try{bytes=await readFile(resolve(root,name));}catch(error){if(error.code==='ENOENT')return false;throw error;}
  const nonce=randomBytes(24).toString('base64');
  if(name==='index.html')bytes=Buffer.from(bytes.toString().replace('</head>',`<meta name="everywhere-backend" content="connected"><meta name="lab-csp-nonce" content="${nonce}"></head>`));
  response.writeHead(200,{'Content-Type':name==='index.html'?'text/html; charset=utf-8':MIME[extname(name)]??'application/octet-stream',
   'Content-Security-Policy':walletCsp(nonce)});
  response.end(request.method==='HEAD'?undefined:bytes);return true;
 }
 async catalog(actor){
  const sales=this.marketplace.browse(),snapshots=[],unavailable=[];
  for(const s of sales)for(const spot of s.spots){try{snapshots.push(await this.chain.snapshot(spot.contractId,actor?[actor]:[]));}
   catch(error){if(['UNKNOWN_ACCOUNT','PENDING_WITHDRAWAL'].includes(error.code))unavailable.push({contractId:spot.contractId,code:error.code});else throw error;}}
  const owners=[...new Set(sales.map(s=>s.owner))].map(wallet=>{const profile=this.store.get('profile',wallet);return {wallet,name:profile?.displayName??wallet,brand:profile?.brand??''};});
  return {sales,snapshots,owners,unavailable,time:new Date(this.now()).toISOString()};
 }
 async workspace(wallet){
  const actor=walletId(wallet),catalog=await this.catalog(actor);
  // Listing snapshots are public; private messages, drafts and financial plans remain wallet-scoped.
  const dashboard=this.marketplace.dashboard(actor),arbiterSales=catalog.sales.filter(s=>s.arbiterId===actor);
  const contracts=new Set([...dashboard.sales,...arbiterSales].flatMap(s=>s.spots.map(p=>p.contractId).filter(Boolean)));
  for(const b of dashboard.bookings)contracts.add(b.contractId);
  for(const s of catalog.snapshots)if(s.rights.current_owner_id===actor||s.state.nominated_recipient===actor)contracts.add(s.accountId);
  const bookings=[...dashboard.bookings,...dashboard.incomingBookings];
  const relatedBookings=new Set(bookings.map(b=>b.id));
  return {...catalog,wallet:actor,profile:this.store.get('profile',actor),dashboard,arbiterSales,
   placements:catalog.snapshots.filter(s=>s.rights.current_owner_id===actor||s.state.nominated_recipient===actor),
   media:this.store.list('media',actor),requests:this.walletRequests.list(actor),
   intents:this.store.list('intent',actor).map(({plan,...r})=>({...r,context:plan.context,expiresAt:plan.expiresAt})),
   nativePlans:this.store.list('native-plan',actor),publicationPlans:this.store.list('publication-plan',actor),
   provisionPlans:this.store.list('provision-plan',actor),
   issues:this.store.list('issue').filter(i=>i.owner===actor||catalog.snapshots.some(s=>s.accountId===i.contractId&&[s.state.seller_id,s.state.arbiter_id].includes(actor))),
   messages:this.store.list('message').filter(m=>relatedBookings.has(m.bookingId)),
   placementMessages:this.store.list('placement-message').filter(m=>catalog.snapshots.some(s=>s.accountId===m.contractId&&[s.state.seller_id,s.state.holder?.account_id,s.rights.current_owner_id,s.state.nominated_recipient].includes(actor))),
   support:this.store.list('support',actor),saved:this.store.list('saved',actor),
   captures:this.store.list('capture',actor).map(({imageDataUrl,tokenHash,...s})=>s),
   routes:this.store.list('route',actor),routeResults:this.store.list('route-result',actor),
   operations:this.store.db.prepare("SELECT id,kind,phase,transaction_hash FROM operations WHERE scope=? OR (id LIKE 'wallet-claim-%' AND kind='near' AND json_extract(plan,'$.actions[0].method')='release_credit' AND json_extract(plan,'$.actions[0].args.account_id')=?) ORDER BY created_at DESC LIMIT 30").all(actor,actor),
   arbiter:arbiterSales.length>0,events:this.store.db.prepare('SELECT kind,entity_id,data,created_at FROM events WHERE actor=? ORDER BY seq DESC LIMIT 50').all(actor)};
 }
 profile(wallet,input){
  const actor=walletId(wallet),row=this.store.get('profile',actor),data={displayName:text(input.displayName,'display name',100),
   brand:typeof input.brand==='string'?input.brand.trim().slice(0,100):'',city:typeof input.city==='string'?input.city.trim().slice(0,100):'',
   notifications:input.notifications!==false,defaultWorkspace:input.defaultWorkspace==='owner'?'owner':'buyer'};
  assert(row,'PROFILE_REQUIRED','Sign in before updating a profile');return this.store.update('profile',actor,actor,row.version,data);
 }
 save(wallet,{saleId,saved}){
  const actor=walletId(wallet);this.marketplace.sale(saleId);const id=hashObject({actor,saleId}),row=this.store.get('saved',id);
  assert(typeof saved==='boolean','INVALID_SAVED','Choose whether to save this sale',400);
  if(row)return this.store.update('saved',id,actor,row.version,{saleId,saved});return this.store.insert('saved',id,actor,{saleId,saved});
 }
 support(wallet,input){const actor=walletId(wallet);return this.store.insert('support',randomBytes(16).toString('hex'),actor,
  {subject:text(input.subject,'subject',150),message:text(input.message,'message',3000),status:'open',createdAt:new Date().toISOString()});}
}
