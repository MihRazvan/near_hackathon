import { ExternalWallets } from '/lab/wallets.js';
const $=id=>document.getElementById(id),json=value=>JSON.stringify(value,null,2);
const s={config:null,session:null,data:null,booking:null,busy:false,selectedSale:null,selectedContract:null};
const wallets=new ExternalWallets(changed=>{renderProviders();if(changed&&s.session?.kind==='evm'){s.session=null;sessionStorage.removeItem('everywhere-lab-session');notice('Wallet account changed. Reconnect to authenticate the new account.');render();}});
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function log(message){const li=document.createElement('li');li.textContent=new Date().toLocaleTimeString()+' · '+message;$('activity').prepend(li);}
async function api(path,body,method=body===undefined?'GET':'POST'){
 const response=await fetch('/api/'+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(s.session?{Authorization:'Bearer '+s.session.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const value=await response.json();if(!response.ok){const e=new Error(value.error?.message??'Request failed');e.code=value.error?.code;e.status=response.status;throw e;}return value;
}
function select(id,items,preferred){const e=$(id),old=preferred??e.value;e.replaceChildren();for(const [value,label] of items){const option=document.createElement('option');option.value=value;option.textContent=label;e.append(option);}if(items.some(([value])=>value===old))e.value=old;}
function renderProviders(){select('evm-wallet',wallets.list().map(p=>[p.id,p.name]));}
function sale(){return [...(s.data?.dashboard.sales??[]),...(s.data?.sales??[])].find(x=>x.id===$('sale').value);}
function snapshot(){return s.data?.snapshots.find(x=>x.accountId===$('contract').value);}
function tab(name){document.querySelectorAll('[data-panel]').forEach(e=>e.hidden=e.dataset.panel!==name);document.querySelectorAll('[data-tab]').forEach(e=>e.classList.toggle('active',e.dataset.tab===name));}
function cents(amount){return (Number(amount??0)/1e6).toFixed(6)+' USDC';}
function stat(parent,label,value){const row=document.createElement('div');row.className='stat';const span=document.createElement('span'),b=document.createElement('b');span.textContent=label;b.textContent=String(value??'—');row.append(span,b);parent.append(row);}
function records(id,rows,describe){const parent=$(id);parent.replaceChildren();for(const row of rows){const p=document.createElement('div');p.className='record';p.textContent=describe(row);parent.append(p);}}
function render(){
 $('active-wallet').textContent=s.session?s.session.wallet:'Disconnected';
 if(!s.data)return;
 const d=s.data,all=[...d.dashboard.sales,...d.sales.filter(a=>!d.dashboard.sales.some(b=>b.id===a.id))];
 select('asset',d.dashboard.assets.map(a=>[a.id,a.title]));
 select('sale',all.map(a=>[a.id,a.title+' · '+a.status]),s.selectedSale);s.selectedSale=$('sale').value;
 const selected=sale();select('contract',(selected?.spots??[]).filter(p=>p.contractId).map(p=>[p.contractId,p.id+' · '+p.contractId]),s.selectedContract);s.selectedContract=$('contract').value;
 select('media',d.media.map(m=>[m.id,m.status+' · '+m.uri]));
 const bookings=[...d.dashboard.bookings,...d.dashboard.incomingBookings.filter(a=>!d.dashboard.bookings.some(b=>b.id===a.id))];
 select('issue-booking',bookings.map(b=>[b.id,b.status+' · '+b.id]));
 select('issue',d.issues.filter(i=>i.contractId===$('contract').value).map(i=>[i.id,i.reason]));
 select('recovery-request',d.requests.filter(r=>!['rejected','confirmed','failed'].includes(r.status)).map(r=>[r.id,r.kind+' · '+r.status+' · '+r.planId.slice(0,12)]));
 records('requests',d.requests,r=>r.kind+' · '+r.status+' · '+r.id+(r.transactionHash?' · '+r.transactionHash:''));
 records('bookings',bookings,b=>b.status+' · '+cents(b.amount)+' · '+b.id);
 const snap=snapshot();$('summary').replaceChildren();$('credit').replaceChildren();
 if(snap){
  const state=snap.state,rights=snap.rights,credit=snap.credits[s.session.wallet];
  stat($('summary'),'Outcome',state.outcome);stat($('summary'),'Round',state.round);stat($('summary'),'Next price',cents(state.next_price));
  stat($('summary'),'Final payer',state.holder?.account_id);stat($('summary'),'NFT owner',rights.current_owner_id);stat($('summary'),'Artwork revision',rights.revision);
  stat($('summary'),'Artwork locked',state.artwork_locked);stat($('summary'),'Installation proof',Boolean(snap.campaign.delivery_proof));stat($('summary'),'Open issues',snap.campaign.open_issues);
  stat($('summary'),'Escrow balance',cents(snap.escrowBalance));stat($('summary'),'Finalized block',snap.blockHeight);
  if(credit){stat($('credit'),'Available original credit',cents(credit.available));stat($('credit'),'Conditional takeover reward',cents(credit.conditional_bonus));}
  $('campaign-state').textContent='Round '+state.round+' · '+state.outcome+' · bidding closes '+new Date(Number(BigInt(state.cutoff_ns)/1000000n)).toLocaleString()+' · test chain time '+new Date(d.time).toLocaleString();
  $('nft-state').textContent='Current NFT owner: '+(rights.current_owner_id??'not minted')+' · final payer: '+(state.holder?.account_id??'none');
  $('snapshot').textContent=json(snap);
 }else{$('snapshot').textContent='No verified campaign selected.';$('campaign-state').textContent=selected?.status==='draft'?'Draft sale · review and publish from the owner wallet.':'No published campaign selected.';}
 $('booking-review').textContent=s.booking?'Prepared '+cents(s.booking.amount)+' for '+s.booking.owner+' · '+s.booking.id:'No booking prepared.';
 $('publication-note').textContent=s.config.factory?'Factory: '+s.config.factory+'. Creates a keyless campaign per spot. Native collateral is retained by those accounts.':'Owner publication awaits a qualified factory for this network.';
 $('payout-note').textContent='Credits are paid to the original wallet’s Intents balance. NFT ownership does not redirect payouts.';
}
async function refresh(){
 if(!s.session){render();return;}
 s.data=await api('lab-state');render();
 try{const b=await api('wallet/balances');$('balances').textContent='Intents: '+cents(b.intentsUsdc)+(b.baseUsdc?' · Base: '+cents(b.baseUsdc):'')+(b.nearUsdc!==undefined?' · NEAR wallet: '+cents(b.nearUsdc):'');}catch(e){$('balances').textContent='Balance query: '+e.message;}
}
async function run(fn){if(s.busy)return;s.busy=true;notice('Preparing request…');document.querySelectorAll('button[data-action]').forEach(e=>e.disabled=true);
 try{await fn();}catch(e){notice(e.code===4001?'Request rejected. No transaction was sent.':e.message,true);log(e.code===4001?'Wallet request rejected':e.message);}
 finally{s.busy=false;document.querySelectorAll('button[data-action]').forEach(e=>e.disabled=false);}}
function review(title,details){$('review-title').textContent=title;$('review-wallet').textContent='Signer: '+s.session.wallet+' · '+s.config.network;$('review-details').textContent=typeof details==='string'?details:json(details);
 const dialog=$('review');dialog.returnValue='';dialog.showModal();return new Promise((resolve,reject)=>dialog.addEventListener('close',()=>{
  if(dialog.returnValue==='approve')resolve();else{const e=new Error('Wallet request rejected');e.code=4001;reject(e);}
 },{once:true}));}
async function connect(kind,address){
 s.booking=null;s.session=null;s.data=null;sessionStorage.removeItem('everywhere-lab-session');
 const challenge=await api('auth/challenge',{wallet:address});let signed;
 if(kind==='test'){
  // Local test identities have a visible approval step; their keys never enter this page.
  const temporary={wallet:address};s.session=temporary;
  try{await review('Sign in with the local test wallet',challenge.message);signed=await api('lab-wallet/sign-in',{challengeId:challenge.id,wallet:address});}finally{s.session=null;}
 }else if(kind==='evm')signed={challengeId:challenge.id,signature:await wallets.signEvm(challenge.message,address)};
 else signed={challengeId:challenge.id,...await wallets.signNear(challenge,address,s.config.network)};
 const session=await api('auth/verify',signed);s.session={...session,kind};sessionStorage.setItem('everywhere-lab-session',json(s.session));
 await refresh();notice('Connected '+session.wallet+'. Every transfer or state change still needs approval.');log('Connected '+session.wallet);
}
async function walletRequest(kind,plan,title,perform){
 const actor=s.session.wallet,r=await api('wallet-requests',{kind,planId:plan.planId});
 if(r.status!=='requested'||!r.dispatchAllowed)throw new Error('Original request needs reconciliation. Open Recovery; another send was not started.');
 try{await review(title,plan.message??plan.transaction??plan);}catch(e){if(e.code===4001)await api('wallet-requests/'+r.id+'/reject',{code:4001});throw e;}
 if(s.session?.wallet!==actor)throw new Error('Wallet changed; reconnect the original account to recover its request');
 let result;
 try{result=await perform(r);}catch(e){if(e.code===4001)await api('wallet-requests/'+r.id+'/reject',{code:4001});throw e;}
 if(s.session?.wallet!==actor)throw new Error('Wallet changed; reconnect the original account to recover its request');
 if(s.config.sandbox&&kind!=='intent'&&$('lose-response').checked){$('lose-response').checked=false;throw new Error('Simulated lost wallet response. The original hash is saved. Reload, reconnect, then use Recovery.');}
 const final=await api('wallet-requests/'+r.id+'/reconcile',kind!=='intent'&&result?.transactionHash?{transactionHash:result.transactionHash}:{});
 log(title+' · '+final.status+(final.transactionHash?' · '+final.transactionHash:''));return final;
}
async function sendNativePlan(kind,plan,title){
 return walletRequest(kind,plan,title,async r=>{
  if(s.session.kind==='test')return api('lab-wallet/send',{requestId:r.id});
  if(s.session.kind!=='near')throw new Error('Connect the NEAR account that owns this action');
  return wallets.sendNear(plan.transaction,s.config.network);
 });
}
async function signIntent(plan,title,submit){
 return walletRequest('intent',plan,title,async r=>{
  const signature=s.session.kind==='test'?(await api('lab-wallet/intent-sign',{planId:plan.planId,requestId:r.id})).signature:await wallets.signEvm(plan.message,s.session.wallet);
  return submit(signature);
 });
}
async function native(kind,extra={}){
 const contractId=$('contract').value;if(!contractId)throw new Error('Select a published spot first');
 const plan=await api('native-actions',{contractId,kind,...extra});
 await sendNativePlan('native',plan,kind.replaceAll('-',' '));await refresh();notice('Wallet action recorded. Check its finalized state and receipt.');
}
function schedule(){return Object.fromEntries(['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map(key=>[key,new Date($(key).value).toISOString()]));}
function fillDates(time){const base=Date.parse(time),minutes=s.config.sandbox?[3,8,12,12,14,16]:[30,60,90,90,110,120];for(const [i,key]of ['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].entries())$(key).value=new Date(base+minutes[i]*60000).toISOString();}
async function advance(stage){await api('lab-clock',{saleId:$('sale').value,stage});notice('Advancing the local chain; checking actual finalized timestamps…');
 for(let i=0;i<300;i++){await new Promise(r=>setTimeout(r,1200));const result=await api('lab-clock');if(result.status==='complete'){await refresh();notice('Local chain advanced beyond '+stage+'.');return;}if(result.status==='failed')throw new Error('Local clock advance failed. Retry to resume from the current block.');}
 throw new Error('Local clock is still advancing. Refresh before continuing.');}
function tokenAmount(){const value=$('withdraw-amount').value;if(!/^\d+(\.\d{1,6})?$/.test(value))throw new Error('Use at most six USDC decimals');const [whole,fraction='']=value.split('.');return (BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))).toString();}
async function tokenAction(kind){
 if(kind==='withdraw-native'&&s.session.wallet.startsWith('0x')){
  const plan=await api('withdrawal-intent',{amount:tokenAmount(),recipientId:$('withdraw-recipient').value});
  await signIntent(plan,'Withdraw Intents USDC to '+$('withdraw-recipient').value,signature=>api('intents/'+plan.planId+'/relay',{signature}));
 }else{
  const plan=await api('token-actions',{kind,...(kind==='token-storage'?{}:{amount:tokenAmount()})});await sendNativePlan('native',plan,kind.replaceAll('-',' '));
 }
 await refresh();notice('Token action recorded. Check the finalized wallet balances.');
}
const handlers={
 refresh:async()=>{await refresh();notice('Finalized state refreshed.');},
 'connect-test':()=>connect('test',$('test-wallet').value),
 'connect-evm':async()=>connect('evm',await wallets.connectEvm($('evm-wallet').value)),
 'connect-near':async()=>connect('near',await wallets.connectNear(s.config.network)),
 disconnect:async()=>{if(s.session)await api('auth/logout',{});s.session=null;s.data=null;s.booking=null;sessionStorage.removeItem('everywhere-lab-session');$('active-wallet').textContent='Disconnected';$('balances').textContent='';notice('Disconnected. Pending requests remain attached to their original account.');},
 'ai-draft':async()=>{const photo=$('vehicle-photo').files[0];let imageDataUrl;
  if(photo){if(photo.size>2000000||!['image/png','image/jpeg'].includes(photo.type))throw new Error('Use a PNG or JPEG up to 2 MB');
   imageDataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read vehicle photo'));reader.readAsDataURL(photo);});}
  const result=await api('ai/draft',{prompt:$('description').value,...(imageDataUrl?{imageDataUrl}:{})});$('asset-title').value=result.draft.title;$('asset-type').value=result.draft.assetType;$('description').value=result.draft.description;$('spots').value=json(result.draft.spots);s.assumptions=result.draft.assumptions;$('ai-assumptions').textContent=s.assumptions.join(' ');notice('AI suggestions loaded. Review positions and measurements before saving.');log('AI draft · '+result.model);},
 'save-asset':async()=>{const asset=await api('assets',{title:$('asset-title').value,description:$('description').value,assetType:$('asset-type').value,city:$('city').value,spots:JSON.parse($('spots').value),assumptions:s.assumptions??[]});await refresh();$('asset').value=asset.id;fillDates(s.data.time);notice('Asset draft saved. Edit sale dates and rules before publishing.');},
 'save-sale':async()=>{const asset=s.data.dashboard.assets.find(a=>a.id===$('asset').value);if(!asset)throw new Error('Save or select an asset first');const overrides=JSON.parse($('spot-overrides').value);
  const value=await api('sales',{assetId:asset.id,title:$('sale-title').value,arbiterId:$('arbiter').value,schedule:schedule(),takeoverDefault:$('takeovers').checked,
   spots:asset.spots.map(p=>({id:p.id,priceCents:String($('price').value),...(overrides[p.id]??{})})),rules:$('rules').value});s.selectedSale=value.id;await refresh();notice('Sale draft saved. Publication will require an owner wallet transaction for each spot.');},
 publish:async()=>{const result=await api('sales/'+$('sale').value+'/prepare-publish',{});for(const p of result.plans){if(p.status==='confirmed')continue;await sendNativePlan('publication',p.plan,'Publish spot '+p.plan.spotId);}await refresh();notice('Publication requests recorded. Confirmed spots appear in browsing.');},
 faucet:async()=>{const result=await api('lab-wallet/faucet',{});log('Local faucet · '+result.transactionHash);await refresh();notice('Funded with 0.25 valueless test USDC. This faucet does not move Base funds.');},
 'prepare-booking':async()=>{const value=sale(),spot=value?.spots.find(p=>p.contractId===$('contract').value);if(!spot)throw new Error('Select a published spot');
  if(s.booking?.status==='prepared')throw new Error('Sign or cancel the earlier prepared booking first');
  const amount=$('buyer-budget').value;if(!/^\d+(\.\d{1,6})?$/.test(amount))throw new Error('Use a USDC amount with at most six decimals');
  const [whole,fraction='']=amount.split('.'),budget=(BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))).toString();
  const campaign=await api('campaigns',{name:$('buyer-campaign').value,budgetMicroUsdc:budget});s.booking=await api('bookings',{campaignId:campaign.id,saleId:value.id,spotId:spot.id});await refresh();notice('Booking prepared at '+cents(s.booking.amount)+'. Review before signing.');},
 'sign-booking':async()=>{if(!s.booking||s.booking.owner!==s.session.wallet)throw new Error('Prepare a booking using the current wallet');const plan=await api('intents/'+s.booking.planId);
  await signIntent(plan,'Book placement for '+cents(s.booking.amount),signature=>api('bookings/'+s.booking.id+'/submit',{signature}));s.booking=await api('bookings/'+s.booking.id);await refresh();notice('Booking request recorded. Accepted purchases show their exact chain round.');},
 'cancel-booking':async()=>{if(!s.booking)throw new Error('No unsent booking selected');await api('bookings/'+s.booking.id+'/cancel',{});s.booking=null;await refresh();notice('Unsent booking cancelled.');},
 'advance-bidding':()=>advance('biddingClose'),
 nominate:async()=>{const plan=await api('nomination',{contractId:$('contract').value,recipientId:$('recipient').value});await signIntent(plan,'Nominate final NFT recipient',signature=>api('intents/'+plan.planId+'/relay',{signature}));await refresh();notice('Nomination submitted. Connect the recipient to accept it.');},
 'accept-nomination':()=>native('accept-nomination'),mint:()=>native('mint'),transfer:()=>native('transfer',{receiverId:$('transferee').value}),
 upload:async()=>{if(!$('public-artifact').checked)throw new Error('Confirm this artifact is intended for public IPFS storage');const file=$('artifact-file').files[0],bytes=file?new Uint8Array(await file.arrayBuffer()):new TextEncoder().encode($('artifact-text').value);
  let binary='';for(const b of bytes)binary+=String.fromCharCode(b);const m=await api('media',{base64:btoa(binary),mime:file?.type||'text/plain',publicContentAcknowledged:true});await refresh();$('media').value=m.id;notice('Public artifact retrieved and its hash verified.');log('Verified '+m.uri);},
 artwork:()=>native('artwork',{mediaId:$('media').value}),
 'lock-artwork':()=>native('lock-artwork',{expectedRevision:snapshot()?.rights.revision}),
 'delivery-proof':()=>native('delivery-proof',{mediaId:$('media').value}),
 'raise-issue':async()=>{await api('bookings/'+$('issue-booking').value+'/issues',{reason:$('issue-reason').value,mediaId:$('media').value});await refresh();notice('Issue review requested. An arbiter must sign to open the on-chain issue.');},
 'open-issue':()=>native('issue-decision',{caseId:$('issue').value,open:true,mediaId:$('media').value}),
 'close-issue':()=>native('issue-decision',{caseId:$('issue').value,open:false,mediaId:$('media').value}),
 'advance-review':()=>advance('reviewEnd'),
 'finalize-success':()=>native('finalize-success'),'finalize-failure':()=>native('finalize-failure'),
 'token-storage':()=>tokenAction('token-storage'),'withdraw-native':()=>tokenAction('withdraw-native'),'deposit-intents':()=>tokenAction('deposit-intents'),
 claim:async()=>{const op=await api('claims',{contractId:$('contract').value});log('Claim · '+op.phase+(op.transactionHash?' · '+op.transactionHash:''));
  for(let i=0;i<25;i++){await new Promise(r=>setTimeout(r,300));try{await refresh();if(!snapshot()?.credits[s.session.wallet]?.available||snapshot().credits[s.session.wallet].available==='0')break;}catch(e){if(e.code!=='PENDING_WITHDRAWAL')throw e;}}
  notice('Claim reconciled. Check available credit and the original wallet’s Intents balance.');},
 recover:async()=>{const requests=await api('wallet-requests');for(const r of requests.filter(r=>!['rejected','confirmed','failed'].includes(r.status))){const result=await api('wallet-requests/'+r.id+'/reconcile',{});log('Recovered '+r.kind+' · '+result.status+(result.transactionHash?' · '+result.transactionHash:''));}await refresh();notice('Original requests reconciled. Unknown results remain pending; no new transfers were made.');},
 'attach-hash':async()=>{await api('wallet-requests/'+$('recovery-request').value+'/reconcile',{transactionHash:$('recovery-hash').value.trim()});await refresh();notice('Original transaction hash checked against the prepared wallet action.');},
 'restart-api':async()=>{await api('lab-restart',{});notice('Restarting the local API; chain and journal are retained…');await new Promise(r=>setTimeout(r,800));
  for(let i=0;i<60;i++){try{await api('health');await refresh();notice('API restarted. Reconcile the original requests using the saved journal.');return;}catch{await new Promise(r=>setTimeout(r,500));}}
  throw new Error('API restart is still pending. Reload this page.');}
};
document.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.dataset.tab)tab(button.dataset.tab);if(button?.dataset.action)run(async()=>{const action=button.dataset.action;if(!s.session&&!['connect-test','connect-evm','connect-near','refresh','disconnect'].includes(action))throw new Error('Connect a wallet first');await handlers[action]();});});
$('sale').addEventListener('change',()=>{s.selectedSale=$('sale').value;s.selectedContract=null;s.booking=null;render();});
$('contract').addEventListener('change',()=>{s.selectedContract=$('contract').value;s.booking=null;render();});
for(const [key,label]of Object.entries({biddingClose:'Bidding closes · ISO timestamp',artworkDue:'Artwork due',installationDue:'Installation due',serviceStart:'Service starts',serviceEnd:'Service ends',reviewEnd:'Review ends'})){const e=document.createElement('label');e.textContent=label;const input=document.createElement('input');input.id=key;input.type='text';e.append(input);$('dates').append(e);}
await run(async()=>{s.config=await api('lab-config');$('network').textContent=s.config.network.toUpperCase()+(s.config.sandbox?' · VALUELESS TEST TOKENS':' · REAL FUNDS');$('mode').textContent=s.config.walletMode;
 $('connect-test').hidden=!s.config.sandbox;$('test-wallet').parentElement.hidden=!s.config.sandbox;$('connect-near').hidden=s.config.sandbox;$('faucet').hidden=!s.config.sandbox;
 document.querySelectorAll('.sandbox-only').forEach(e=>e.hidden=!s.config.sandbox);select('test-wallet',s.config.wallets.map(w=>[w.address,w.label+' · '+w.address]));fillDates(s.config.time);
 try{const stored=JSON.parse(sessionStorage.getItem('everywhere-lab-session'));if(stored?.token&&stored?.wallet)s.session=stored;}catch{}
 if(s.session){try{await refresh();notice('Session restored. Reconcile pending requests before starting another action.');}catch(e){if(e.status===401){s.session=null;sessionStorage.removeItem('everywhere-lab-session');}else throw e;}}
 renderProviders();tab('owner');});
