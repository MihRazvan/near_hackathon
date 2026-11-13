import test from 'node:test';
import assert from 'node:assert/strict';

const storage=new Map();
globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.location={origin:'http://localhost',pathname:'/sign-in',search:''};
globalThis.window=new EventTarget();window.CustomEvent=CustomEvent;
window.history={pushState(_state,_title,path){const u=new URL(path,location.origin);Object.assign(location,{pathname:u.pathname,search:u.search});}};
globalThis.document={querySelector:()=>null,activeElement:null};
const {live,api,refresh,refreshBalances,noteWorkspaceMutation,connect,disconnect}=await import('../src/integration/runtime.mjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const workspace=(wallet,chainPending=false,patch={})=>({wallet,chainPending,sales:[],snapshots:[],owners:[],unavailable:[],time:new Date().toISOString(),profile:{displayName:wallet},placements:[],issues:[],placementMessages:[],dashboard:{assets:[],sales:[],bookings:[],campaigns:[],incomingBookings:[]},...patch});
const response=value=>Response.json(value);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const promptly=promise=>Promise.race([promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('An unrelated read blocked this action')),1000);timer.unref();})]);
function reset(session=null){storage.clear();Object.assign(live,{config:{production:true,network:'sandbox'},publicAiAvailable:false,session,sessionReady:true,data:null,balances:null,catalog:{sales:[],snapshots:[],owners:[]},catalogLoading:true,error:null,chainError:null,providers:[],logoutPending:null,busy:false});Object.assign(location,{pathname:'/sign-in',search:''});}

test('connect and disconnect complete while public, balance and previous-account reads are still held',async()=>{
 reset();const publicGate=deferred(),fullGate=deferred(),balanceGate=deferred(),wallet='0x1111111111111111111111111111111111111111',calls=[];
 live.wallets={connectEvm:async()=>wallet,signEvm:async()=> 'public-test-signature'};
 globalThis.fetch=async(path,options)=>{
  calls.push(path);
  if(path==='/api/catalog')return response(await publicGate.promise);
  if(path==='/api/auth/challenge')return response({id:'challenge',message:'Sign in'});
  if(path==='/api/auth/verify')return response({wallet});
  if(path==='/api/workspace?local=1')return response(workspace(wallet,true));
  if(path==='/api/workspace')return response(await fullGate.promise);
  if(path==='/api/wallet/balances')return response(await balanceGate.promise);
  if(path==='/api/auth/logout'){assert.equal(options.method,'POST');return response({ok:true});}
  throw Error('Unexpected request '+path);
 };
 const original=refresh({render:false});await promptly(connect('evm','injected'));
 assert.equal(live.session.wallet,wallet);assert.equal(live.data.wallet,wallet);assert.equal(live.data.chainPending,true);assert.equal(location.pathname,'/buy');
 assert(calls.includes('/api/workspace'));assert(calls.includes('/api/wallet/balances'));
 publicGate.resolve({sales:[],snapshots:[],owners:[]});await original;
 assert.equal(live.data.wallet,wallet,'anonymous response must not overwrite the authenticated workspace');
 await promptly(disconnect());assert.equal(live.session,null);assert.equal(live.data,null);assert.equal(live.balances,null);assert.equal(location.pathname,'/');
 fullGate.resolve(workspace(wallet,false,{profile:{displayName:'Previous account secret'}}));balanceGate.resolve({intentsUsdc:'999999'});await settle();await settle();
 assert.equal(live.session,null);assert.equal(live.data,null);assert.equal(live.balances,null,'late private balance must not return after logout');
});

test('a foreground refresh supersedes an older background read and ignores its late response',async()=>{
 const session={wallet:'owner.near'};reset(session);const gate=deferred();let requests=0,oldSignal;
 globalThis.fetch=async(path,options)=>{
  if(path==='/api/wallet/balances')return response({intentsUsdc:'1'});
  assert.equal(path,'/api/workspace');requests++;
  if(requests===1){oldSignal=options.signal;return response(await gate.promise);}
  return response(workspace(session.wallet,false,{profile:{displayName:'Current'}}));
 };
 const old=refresh({background:true,render:false});await settle();await promptly(refresh({render:false}));
 assert.equal(oldSignal.aborted,true);assert.equal(live.data.profile.displayName,'Current');
 gate.resolve(workspace(session.wallet,false,{profile:{displayName:'Obsolete'}}));await old;
 assert.equal(live.data.profile.displayName,'Current');
});

test('draft refresh needs no chain or balance read and preserves this session\'s verified rights and credits',async()=>{
 const session={wallet:'owner.near'};reset(session);const snapshots=[{accountId:'offer',credits:{'owner.near':{available:'10000'}}}];
 live.catalog.snapshots=snapshots;live.data=workspace(session.wallet,false,{placements:[{accountId:'offer'}],placementMessages:[{id:'known-message'}]});
 const calls=[];globalThis.fetch=async path=>{calls.push(path);assert.equal(path,'/api/workspace?local=1');return response(workspace(session.wallet,true,{profile:{displayName:'Edited'}}));};
 await refresh({local:true,render:false});assert.deepEqual(calls,['/api/workspace?local=1']);assert.equal(live.data.profile.displayName,'Edited');assert.equal(live.data.chainPending,false);
 assert.equal(live.catalog.snapshots,snapshots);assert.equal(live.data.placements[0].accountId,'offer');assert.equal(live.data.placementMessages[0].id,'known-message');
});

test('background refresh updates state without destroying a dirty editor',async()=>{
 const session={wallet:'owner.near'};reset(session);let renders=0;const changed=()=>renders++;window.addEventListener('app:changed',changed);
 document.querySelector=selector=>selector==='form[data-dirty="true"]'?{}:null;
 globalThis.fetch=async path=>response(path==='/api/workspace'?workspace(session.wallet):{intentsUsdc:'10000'});
 try{await refresh({background:true});assert.equal(live.data.wallet,session.wallet);assert.equal(renders,0);}finally{document.querySelector=()=>null;window.removeEventListener('app:changed',changed);}
});
test('a delayed full refresh hydrates rights without reverting a newer profile or draft version',async()=>{
 const session={wallet:'owner.near'};reset(session);const gate=deferred();
 globalThis.fetch=async path=>{
  if(path==='/api/wallet/balances')return response({intentsUsdc:'1'});
  if(path==='/api/workspace?local=1')return response(workspace(session.wallet,true,{profile:{displayName:'New profile'},dashboard:{assets:[{id:'asset',version:3}]}}));
  return response(await gate.promise);
 };
 const full=refresh({render:false});await refresh({local:true,render:false});
 gate.resolve(workspace(session.wallet,false,{profile:{displayName:'Old profile'},placements:[{accountId:'verified-right'}],dashboard:{assets:[{id:'asset',version:2}]}}));await full;
 assert.equal(live.data.chainPending,false);assert.equal(live.data.profile.displayName,'New profile');assert.equal(live.data.dashboard.assets[0].version,3);assert.equal(live.data.placements[0].accountId,'verified-right');
});
test('an unavailable initial account read publishes a recoverable error instead of leaving an invisible wait',async()=>{
 reset({wallet:'owner.near'});let renders=0;const changed=()=>renders++;window.addEventListener('app:changed',changed);
 globalThis.fetch=async()=>Response.json({error:{message:'Service temporarily unavailable'}},{status:503});
 try{await assert.rejects(refresh({local:true,render:false}),/Service temporarily unavailable/);assert.equal(live.data,null);assert.equal(live.session.wallet,'owner.near');assert.equal(renders,1);assert.match(live.error,/temporarily unavailable/);}finally{window.removeEventListener('app:changed',changed);}
});
test('USDC registration and funding polls need only the connected wallet balance',async()=>{
 const session={wallet:'owner.near'};reset(session);const data=workspace(session.wallet);live.data=data;const calls=[];
 globalThis.fetch=async path=>{calls.push(path);assert.equal(path,'/api/wallet/balances');return response({wallet:session.wallet,intentsUsdc:'10000',tokenStorageRegistered:true});};
 await refreshBalances({render:false});assert.deepEqual(calls,['/api/wallet/balances']);assert.equal(live.data,data);assert.equal(live.balances.tokenStorageRegistered,true);
});
test('an action completion requests its own placement rather than the whole marketplace',async()=>{
 const session={wallet:'owner.near'};reset(session);live.data=workspace(session.wallet);const calls=[];
 globalThis.fetch=async path=>{calls.push(path);return response(path.startsWith('/api/workspace?')?workspace(session.wallet,false,{scopedContracts:['offer'],sales:[{spots:[{contractId:'offer'}]}],snapshots:[{accountId:'offer'}]}):{intentsUsdc:'0'});};
 await refresh({contracts:['offer'],render:false});assert(calls.includes('/api/workspace?contract=offer'));assert(!calls.includes('/api/workspace'));assert.equal(live.catalog.snapshots[0].accountId,'offer');
});
test('stalled reads have a retryable timeout while a signed write never gets a read deadline or automatic retry',async()=>{
 reset();let calls=0;
 globalThis.fetch=async(_path,options)=>{calls++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));};
 const keepAlive=setTimeout(()=>{},1000);
 try{await assert.rejects(api('workspace',undefined,{timeoutMs:5}),{code:'READ_TIMEOUT'});assert.equal(calls,1);}finally{clearTimeout(keepAlive);}
 globalThis.fetch=async(_path,options)=>{calls++;assert.equal(options.signal,undefined);return response({status:'recorded'});};
 assert.equal((await api('intents/original/relay',{signature:'test-public-signature'},{timeoutMs:1})).status,'recorded');assert.equal(calls,2);
});
test('a new photo draft acknowledged while chain reads are pending survives an older workspace response',async()=>{
 const session={wallet:'owner.near'};reset(session);live.data=workspace(session.wallet,true);const gate=deferred();
 globalThis.fetch=async path=>response(path==='/api/workspace'?await gate.promise:{intentsUsdc:'0'});
 const pending=refresh({background:true,render:false});live.data.dashboard.assets.push({id:'new-photo',version:1});noteWorkspaceMutation();
 gate.resolve(workspace(session.wallet));await pending;assert.equal(live.data.dashboard.assets[0].id,'new-photo');assert.equal(live.data.chainPending,false);
});
test('a price-change retry refreshes the quoted placement before returning to checkout and never opens a payment',async()=>{
 const session={wallet:'owner.near'};reset(session);const sale={id:'sale',spots:[{id:'door',contractId:'offer'}]};live.data=workspace(session.wallet);live.catalog.sales=[sale];const calls=[];
 globalThis.fetch=async path=>{
  calls.push(path);
  if(path==='/api/bookings')return response({id:'quote',contractId:'offer',amount:'20000',saleId:'sale',spotId:'door'});
  if(path==='/api/bookings/quote/cancel')return response({status:'cancelled'});
  if(path==='/api/workspace?contract=offer')return response(workspace(session.wallet,false,{sales:[sale],scopedContracts:['offer'],snapshots:[{accountId:'offer',state:{next_price:'20000'}}]}));
  if(path==='/api/wallet/balances')return response({intentsUsdc:'100000'});
  throw Error('Unexpected request '+path);
 };
 const {forms}=await import('../src/integration/actions.mjs');const data=new FormData();for(const [k,v]of Object.entries({saleId:'sale',spotId:'door',campaignId:'existing-campaign',rules:'on',expectedAmount:'10000'}))data.set(k,v);
 await assert.rejects(forms['prepare-booking'](data),/price changed/);assert(calls.includes('/api/workspace?contract=offer'));assert.equal(live.catalog.snapshots[0].state.next_price,'20000');assert.equal(location.pathname,'/checkout/sale');assert(!calls.some(p=>p.includes('wallet-requests')||p.includes('/relay')));
});
