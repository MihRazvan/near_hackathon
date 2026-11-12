import { walletCsp } from './wallet-csp.mjs';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT } from './config.mjs';
import { assert, walletId, text, hashObject } from './core.mjs';

const MIME={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.json':'application/json','.woff2':'font/woff2','.ico':'image/x-icon','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
export function productAssetName(pathname){
 if(pathname.startsWith('/assets/')){
  assert(/^\/assets\/[A-Za-z0-9_.-]+$/.test(pathname),'NOT_FOUND','Asset not found',404);return pathname.slice(1);
 }
 if(/^\/(?:fonts\/[A-Za-z0-9_-]+\.(?:woff2|txt)|images\/(?:team-tests\/)?[A-Za-z0-9_-]+\.(?:webp|jpg|png)|images\/team-tests\/prompts\.json|favicon\.svg|ASSETS\.md)$/.test(pathname))return pathname.slice(1);
 if(pathname.startsWith('/images/')||pathname.startsWith('/fonts/'))return null;
 return extname(pathname)?null:'index.html';
}
export class Product {
 constructor({store,chain,marketplace,config,reads,walletRequests,personalAI,supportService,now=Date.now}){Object.assign(this,{store,chain,marketplace,config,reads,walletRequests,personalAI,supportService,now});this.publicSnapshots=new Map();this.snapshotLoads=new Map();this.snapshotGeneration=0;}
 async publicSnapshot(contractId){
  const prior=this.publicSnapshots.get(contractId);if(prior&&this.now()-prior.loadedAt<5000)return structuredClone(prior.snapshot);
  const generation=this.snapshotGeneration;let load=this.snapshotLoads.get(contractId);
  if(!load||load.generation!==generation){load={generation};load.promise=(async()=>{
   try{const snapshot=await this.chain.snapshot(contractId,[]);
    if(this.snapshotGeneration===generation){this.publicSnapshots.delete(contractId);this.publicSnapshots.set(contractId,{snapshot,loadedAt:this.now()});
     if(this.publicSnapshots.size>500)this.publicSnapshots.delete(this.publicSnapshots.keys().next().value);}
    return snapshot;
   }finally{if(this.snapshotLoads.get(contractId)===load)this.snapshotLoads.delete(contractId);}
  })();this.snapshotLoads.set(contractId,load);}
  return structuredClone(await load.promise);
 }
 invalidate(){this.snapshotGeneration++;this.publicSnapshots.clear();}
 async serve(request,response,url){
  if(!['GET','HEAD'].includes(request.method)||url.pathname.startsWith('/api/')||url.pathname.startsWith('/lab'))return false;
  const root=resolve(ROOT,'prototype/dist'),name=productAssetName(url.pathname);if(!name)return false;
  let bytes;try{bytes=await readFile(resolve(root,name));}catch(error){if(error.code==='ENOENT')return false;throw error;}
  const nonce=randomBytes(24).toString('base64');
  if(name==='index.html')bytes=Buffer.from(bytes.toString().replace('</head>',`<meta name="everywhere-backend" content="connected"><meta name="lab-csp-nonce" content="${nonce}"></head>`));
  response.writeHead(200,{'Content-Type':name==='index.html'?'text/html; charset=utf-8':MIME[extname(name)]??'application/octet-stream','Cache-Control':name==='index.html'?'no-store':name.startsWith('assets/')?'public, max-age=31536000, immutable':'public, max-age=86400',
   'Content-Security-Policy':walletCsp(nonce)});
  response.end(request.method==='HEAD'?undefined:bytes);return true;
 }
 async catalog(actor){
  const sales=this.marketplace.browse(),snapshots=[],unavailable=[],ids=[...new Set(sales.flatMap(s=>s.spots.map(p=>p.contractId)))];
  // Coalesce public reads across visitors. Transaction preparation always uses fresh chain reads.
  const queue=[...ids];await Promise.all(Array.from({length:Math.min(8,queue.length)},async()=>{while(queue.length){const contractId=queue.shift();try{
   const s=await this.publicSnapshot(contractId);
   if(actor){
    // Read only this visitor's credit at the same finalized block as the public state.
    if(this.reads?.view&&s.blockHash)s.credits={[actor]:await this.reads.view(s.receiverId??s.accountId,'get_credit',{...(s.offerId?{offer_id:s.offerId}:{}),account_id:actor},{header:{hash:s.blockHash,height:s.blockHeight}})};
    else s.credits=(await this.chain.snapshot(contractId,[actor])).credits;
   }
   snapshots.push(s);
  }catch(error){if(['UNKNOWN_ACCOUNT','PENDING_WITHDRAWAL','RPC_UNAVAILABLE','STALE_BLOCK'].includes(error.code))unavailable.push({contractId,code:error.code});else throw error;}
  }}));
  const owners=[...new Set(sales.map(s=>s.owner))].map(wallet=>{const profile=this.store.get('profile',wallet);return {wallet,name:profile?.displayName??wallet,brand:profile?.brand??''};});
  return {sales,snapshots,owners,unavailable,time:new Date(this.now()).toISOString()};
 }
 async workspace(wallet){
  const actor=walletId(wallet),catalog=await this.catalog(actor);
  // Listing snapshots are public; private messages, drafts and financial plans remain wallet-scoped.
  const dashboard=this.marketplace.dashboard(actor),arbiterSales=catalog.sales.filter(s=>s.arbiterId===actor);
  if(this.config.production)dashboard.assets=dashboard.assets.map(({photoDataUrl,...asset})=>({...asset,...(photoDataUrl?{photoUrl:'/api/assets/'+encodeURIComponent(asset.id)+'/photo?version='+asset.version}:{})}));
  const contracts=new Set([...dashboard.sales,...arbiterSales].flatMap(s=>s.spots.map(p=>p.contractId).filter(Boolean)));
  for(const b of dashboard.bookings)contracts.add(b.contractId);
  for(const s of catalog.snapshots)if(s.rights.current_owner_id===actor||s.state.nominated_recipient===actor||s.state.holder?.account_id===actor)contracts.add(s.accountId);
  const bookings=[...dashboard.bookings,...dashboard.incomingBookings];
  const relatedBookings=new Set(bookings.map(b=>b.id));
  return {...catalog,wallet:actor,profile:this.store.get('profile',actor),dashboard,arbiterSales,ai:{available:this.personalAI?.availability(actor)??false},
   placements:catalog.snapshots.filter(s=>s.rights.current_owner_id===actor||s.state.nominated_recipient===actor||s.mode==='hub'&&s.state.holder?.account_id===actor),
   media:this.store.list('media',actor),requests:this.walletRequests.list(actor),
   intents:this.store.list('intent',actor).map(({plan,...r})=>({...r,context:plan.context,expiresAt:plan.expiresAt})),
   nativePlans:this.store.list('native-plan',actor),publicationPlans:this.store.list('publication-plan',actor),
   provisionPlans:this.store.list('provision-plan',actor),
   issues:this.store.list('issue').filter(i=>i.owner===actor||catalog.snapshots.some(s=>s.accountId===i.contractId&&[s.state.seller_id,s.state.arbiter_id].includes(actor))),
   messages:this.store.list('message').filter(m=>relatedBookings.has(m.bookingId)),
   placementMessages:this.store.list('placement-message').filter(m=>catalog.snapshots.some(s=>s.accountId===m.contractId&&[s.state.seller_id,s.state.holder?.account_id,s.rights.current_owner_id,s.state.nominated_recipient].includes(actor))),
   support:this.store.list('support',actor).map(ticket=>this.supportService?this.supportService.read(actor,ticket.id):ticket),supportAdmin:this.supportService?.isAdmin(actor)??false,supportQueue:this.supportService?.isAdmin(actor)?this.supportService.queue(actor):[],saved:this.store.list('saved',actor),
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
