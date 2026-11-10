import { state, navigate, toast } from '../store.mjs';
import { esc, short } from '../ui.mjs';

const KEY='everywhere-connected-session-v1';
export const live={enabled:true,config:null,data:null,session:null,catalog:null,
 balances:null,busy:false,error:null,draft:null,selectedSpot:null,providers:[],review:null,refreshing:null};
const changed=()=>window.dispatchEvent(new Event('app:changed'));
export const amount=value=>{const s=String(value);if(!/^(0|[1-9][0-9]*)(\.\d{1,6})?$/.test(s))throw new Error('Enter a USDC amount with up to six decimal places.');const [whole,fraction='']=s.split('.');return (BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))).toString();};
export const nativeUnits=(value,decimals=24)=>{const n=BigInt(value??0),scale=10n**BigInt(decimals),fraction=(n%scale).toString().padStart(decimals,'0').slice(0,6).replace(/0+$/,'');return (n/scale).toString()+(fraction?'.'+fraction:'');};
export const dollars=value=>Number(value??0)/1e6;
export const usdc=value=>dollars(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})+' USDC';
export const dateTime=value=>value?new Date(value).toLocaleString(): 'Not set';
export const byNs=value=>value?dateTime(Number(BigInt(value)/1000000n)):'Not set';
export function currentPerson(){
 if(!live.session)return {id:'visitor',name:'Visitor',role:'public',wallet:'',brand:''};
 const name=live.data?.profile?.displayName;
 return {id:live.session.wallet,ownerId:live.session.wallet,wallet:live.session.wallet,
  name:name&&name!==live.session.wallet?name:short(live.session.wallet),brand:live.data?.profile?.brand??'',role:location.pathname.startsWith('/host')?'owner':location.pathname.startsWith('/ops')?'ops':'buyer'};
}
export async function api(path,body,{method=body===undefined?'GET':'POST',session=live.session}={}){
 const response=await fetch('/api/'+path,{method,credentials:'include',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(session?.token?{Authorization:'Bearer '+session.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 let value;try{value=await response.json();}catch{throw new Error('The service is temporarily unavailable. Your saved progress and transaction records are retained.');}
 if(!response.ok){const error=new Error(value.error?.message??'The request could not be completed.');error.code=value.error?.code;error.status=response.status;throw error;}return value;
}
export async function refresh({render=true}={}){
 if(live.refreshing)return live.refreshing;
 live.refreshing=(async()=>{
  try{
   if(live.session){live.data=await api('workspace');live.catalog={sales:live.data.sales,snapshots:live.data.snapshots,owners:live.data.owners,time:live.data.time,unavailable:live.data.unavailable};
    try{live.balances=await api('wallet/balances');}catch(error){live.balanceError=error.message;}
    if(live.config?.network==='mainnet'&&live.session.wallet.startsWith('0x'))live.fundingRecords=await api('wallet-funding');}
   else{live.catalog=await api('catalog');live.data=null;live.balances=null;}
  }catch(error){if(error.status===401){live.session=null;live.data=null;sessionStorage.removeItem(KEY);}live.error=error.message;throw error;}
  finally{live.refreshing=null;if(render)changed();}
 })();return live.refreshing;
}
export async function initialize(){
 live.config=await api('config');
 const { ExternalWallets }=await import(/* @vite-ignore */ '/wallets.js');
 live.wallets=new ExternalWallets(changedAccount=>{
  live.providers=live.wallets?.list()??[];
  window.dispatchEvent(new Event('app:walletproviders'));
  if(changedAccount&&live.session?.kind==='evm'){live.logoutPending=api('auth/logout',{}).catch(()=>{});live.session=null;live.data=null;live.balances=null;sessionStorage.removeItem(KEY);toast('Wallet account changed. Connect the new account to continue.');changed();}
 });
 live.providers=live.wallets.list();
 let stored;try{stored=JSON.parse(sessionStorage.getItem(KEY));}catch{}
 if(live.config.production){
  try{const session=await api('auth/session');live.session={...session,kind:stored?.wallet===session.wallet?stored.kind:session.wallet.startsWith('0x')?'evm':'near',providerId:stored?.wallet===session.wallet?stored.providerId:null};}catch(error){if(error.status!==401)throw error;}
 }else if(stored?.token&&stored?.wallet)live.session=stored;
 try{await refresh({render:false});}catch{}
 state.connectedPerson=currentPerson();
 setInterval(()=>{if(!live.busy&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input,textarea,select')
  &&!document.querySelector('form[data-dirty="true"]'))void refresh().catch(()=>{});},12000);
}
export function signInRequired(){if(live.session)return true;navigate('/sign-in?next='+encodeURIComponent(location.pathname+location.search));return false;}
export function review(title,details,{wallet=live.session?.wallet??'',rejectLabel='Reject request',approveLabel='Continue'}={}){
 if(live.config?.production)return Promise.resolve();
 const dialog=document.createElement('dialog');dialog.className='connected-review';
 dialog.innerHTML=`<form method="dialog"><header><div><div class="eyebrow">${esc(live.config.network)} · wallet review</div><h2>${esc(title)}</h2></div></header><div class="modal-body"><p>Account: <strong>${esc(wallet)}</strong></p><pre class="transaction-review">${esc(typeof details==='string'?details:JSON.stringify(details,null,2))}</pre><div class="actions"><button value="reject" class="button">${esc(rejectLabel)}</button><button value="approve" class="button primary">${esc(approveLabel)}</button></div></div></form>`;
 document.body.append(dialog);dialog.showModal();
 return new Promise((resolve,reject)=>dialog.addEventListener('close',()=>{const approved=dialog.returnValue==='approve';dialog.remove();
  if(approved)resolve();else{const error=new Error('Wallet request rejected. No transaction was sent.');error.code=4001;reject(error);}}, {once:true}));
}
export async function connect(kind,value){
 await live.logoutPending;
 const previous=live.session;live.session=null;live.data=null;live.balances=null;sessionStorage.removeItem(KEY);
 live.assetEdit=null;live.fundQuote=null;live.exitQuote=null;changed();
 let wallet=value;
 if(kind==='evm')wallet=await live.wallets.connectEvm(value);
 if(kind==='near')wallet=await live.wallets.connectNear(live.config.network);
 const challenge=await api('auth/challenge',{wallet});let signed;
 if(kind==='test'||kind==='funded'){await review(kind==='test'?'Connect test wallet':'Connect funded development wallet',challenge.message,{wallet,approveLabel:kind==='test'?'Connect test wallet':'Connect funded wallet'});signed=await api(kind==='test'?'lab-wallet/sign-in':'funded-wallet/sign-in',{wallet,challengeId:challenge.id});}
 else if(kind==='evm')signed={challengeId:challenge.id,signature:await live.wallets.signEvm(challenge.message,wallet)};
 else signed={challengeId:challenge.id,...await live.wallets.signNear(challenge,wallet,live.config.network)};
 live.session={...await api('auth/verify',signed),kind,providerId:kind==='evm'?value:null};sessionStorage.setItem(KEY,JSON.stringify(live.session));
 if(previous?.token&&previous.wallet!==wallet){/* Existing original-wallet requests remain in the server journal. */}
 await refresh({render:false});toast('Connected '+short(live.session.wallet));
 const next=new URLSearchParams(location.search).get('next');navigate(next?.startsWith('/')&&!next.startsWith('//')?next:live.data?.profile?.defaultWorkspace==='owner'?'/host':'/buy');
}
export async function disconnect(){if(live.session)await api('auth/logout',{});live.session=null;live.data=null;live.balances=null;sessionStorage.removeItem(KEY);await refresh({render:false});navigate('/');}
export async function run(callback){
 if(live.busy)return;live.busy=true;document.body.classList.add('connected-busy');
 document.querySelectorAll('[data-live-action],form[data-live-form] button').forEach(e=>e.disabled=true);
 try{await callback();live.error=null;}catch(error){live.error=error.message;toast(error.message);console.warn('Connected request:',error.code??'REQUEST_FAILED');}
 finally{live.busy=false;document.body.classList.remove('connected-busy');document.querySelectorAll('[data-live-action],form[data-live-form] button').forEach(e=>e.disabled=false);
  if(live.error){const el=document.querySelector('#connected-notice');if(el){el.hidden=false;el.textContent=live.error;el.classList.add('orange');}}else{const el=document.querySelector('#connected-notice');if(el){el.hidden=true;el.classList.remove('orange');}}}
}
export async function walletRequest(kind,plan,title,perform){
 await ensureSigningWallet();
 const session=live.session,r=await api('wallet-requests',{kind,planId:plan.planId});
 if(!r.dispatchAllowed)throw new Error('The original request needs recovery. Reconnect its wallet and open Account recovery.');
 try{await review(title,plan.message??plan.transaction??plan);}catch(error){if(error.code===4001)await api('wallet-requests/'+r.id+'/reject',{code:4001},{session});throw error;}
 if(live.session?.wallet!==session.wallet)throw new Error('The connected wallet changed. Recover the original request before continuing.');
 await api('wallet-requests/'+r.id+'/dispatch',{}, {session});
 try{
  const result=await perform(r,session);
  if(kind!=='intent'){
   if(!result?.transactionHash)throw new Error('The wallet returned no transaction hash. Recover the original request; do not send again.');
   sessionStorage.setItem('everywhere-wallet-hash:'+r.id,result.transactionHash);
   if(live.config.sandbox&&live.loseNextResponse){live.loseNextResponse=false;throw new Error('Test response interrupted. The original hash is saved; reload or restart the API and open Account recovery.');}
   const confirmed=await api('wallet-requests/'+r.id+'/reconcile',{transactionHash:result.transactionHash},{session});
   if(confirmed.status==='failed')throw new Error('The original transaction failed on chain. Its receipt is retained in Account recovery.');return confirmed;
  }
  return result;
 }catch(error){if(error.code===4001)await api('wallet-requests/'+r.id+'/reject',{code:4001},{session});throw error;}
}
export async function ensureSigningWallet(){
 const session=live.session;if(!session)throw new Error('Connect your wallet to continue.');
 if(session.kind==='evm'&&!live.wallets.provider){
  const providerId=session.providerId??(live.providers.length===1?live.providers[0].id:null);
  if(!providerId){navigate('/sign-in?next='+encodeURIComponent(location.pathname+location.search));throw new Error('Choose your wallet app to continue with this account.');}
  const address=await live.wallets.connectEvm(providerId);
  if(address!==session.wallet)throw new Error('Your wallet selected a different account. Reconnect the account that started this request.');
 }
 if(session.kind==='near'&&!live.wallets.native){
  const address=await live.wallets.connectNear(live.config.network);
  if(address!==session.wallet)throw new Error('Your wallet selected a different account. Reconnect the original account to continue.');
 }
}
export async function nativePlan(plan,title){
 if(plan.type==='intent'&&plan.intent)return intentPlan(plan.intent,title);
 if(plan.type==='intent'||(!plan.transaction&&plan.message))return intentPlan(plan,title);
 return walletRequest(['create_campaign','create_offer'].includes(plan.transaction.actions[0].params.methodName)?'publication':'native',plan,title,async(r,session)=>{
  if(session.kind==='test')return api('lab-wallet/send',{requestId:r.id},{session});
  if(session.kind==='funded')return api('funded-wallet/send-native',{requestId:r.id},{session});
  if(session.kind!=='near')throw new Error('Connect the NEAR wallet that owns this action.');
  return live.wallets.sendNear(plan.transaction,live.config.network);
 });
}
export async function intentPlan(plan,title){
 return walletRequest('intent',plan,title,async(r,session)=>{
  const signature=['test','funded'].includes(session.kind)?(await api(session.kind==='test'?'lab-wallet/intent-sign':'funded-wallet/sign-intent',{requestId:r.id,planId:plan.planId},{session})).signature:
   await live.wallets.signEvm(plan.message,session.wallet);
  if(live.session?.wallet!==session.wallet)throw new Error('Wallet changed during signing. The signature was not submitted.');
  return api('wallet-requests/'+r.id+'/submit',{signature},{session});
 });
}
export async function nativeAction(contractId,kind,extra={}){const plan=await api('native-actions',{contractId,kind,...extra});return nativePlan(plan,kind.replaceAll('-',' '));}
export async function poll(predicate,{attempts=25}={}){for(let i=0;i<attempts;i++){await refresh({render:false});if(predicate())return true;await new Promise(r=>setTimeout(r,400));}return false;}
export function allSales(){const own=live.data?.dashboard?.sales??[];return [...own,...(live.catalog?.sales??[]).filter(s=>!own.some(o=>o.id===s.id))];}
export function sale(id){return allSales().find(s=>s.id===id);}
export function snapshot(id){return live.catalog?.snapshots.find(s=>s.accountId===id);}
export function allBookings(){const d=live.data?.dashboard;return d?[...d.bookings,...d.incomingBookings.filter(b=>!d.bookings.some(a=>a.id===b.id))]:[];}
export function booking(id){return allBookings().find(b=>b.id===id);}
export function rawAsset(id){return live.data?.dashboard.assets.find(a=>a.id===id)??allSales().find(s=>s.assetId===id)?.publication?.manifest.asset;}
export function assetView(a){return {...a,type:a.assetType==='motorcycle'?'moto':a.assetType,model:a.title,area:a.city,color:'#c8d6cc',
 activity:'Exposure has not been measured',photos:a.photoDataUrl?[a.photoDataUrl]:a.coverUri?.match(/^ipfs:\/\/baf[a-z2-7]+$/)?[a.coverUri.replace('ipfs://','https://gateway.pinata.cloud/ipfs/')]:[],spots:a.spots.map(p=>({...p,x:p.box.x*960,y:p.box.y*480,w:p.box.width*960,h:p.box.height*480,price:Number(p.suggestedPriceCents)/100}))};}
export async function fileData(file,{max=2000000}={}){if(!file?.size)return null;if(file.size>max)throw new Error('This file exceeds the upload limit.');
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read the selected file.'));reader.readAsDataURL(file);});}
export async function upload(file,{text,acknowledged=false}={}){
 if(!acknowledged)throw new Error('Confirm that this artifact is intended for public storage.');
 let base64,mime;if(file?.size){const data=await fileData(file,{max:1000000});base64=data.split(',')[1];mime=file.type||'application/octet-stream';}
 else{const bytes=new TextEncoder().encode(text??'');let binary='';for(const b of bytes)binary+=String.fromCharCode(b);base64=btoa(binary);mime='text/plain';}
 return api('media',{base64,mime,publicContentAcknowledged:true});
}
export function rerender(){state.connectedPerson=currentPerson();changed();}
