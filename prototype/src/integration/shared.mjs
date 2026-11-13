import { live,nativeUnits,allSales,sale,snapshot,allBookings,booking,usdc,byNs,dateTime } from './runtime.mjs';
import { esc,link,badge,card,empty,heading,act,select,form,input,textArea,check,submit,hidden,evidence,unavailable,signedOut,notice,table,transaction,short } from './ui.mjs';
import { artifactFields } from './owner.mjs';
import {originalRetryAvailable} from './recovery-state.mjs';
import { bookingConversationAllowed,verifiedMediaFor,supportAdministrator } from './workspace-actions.mjs';

export function accountView(r){
 if(r.id==='A01'||r.id==='S06')return walletView(r.id==='A01');
 if(r.id==='A03')return recoveryView();
 if(r.id==='S05'){if(!live.session)return signedOut();return brandLibrary();}
 if(r.id==='S07'){if(!live.session)return signedOut();return notificationSettings();}
 if(r.id==='A02'||r.id==='S04'||r.id==='S08'){
  if(!live.session)return signedOut();const p=live.data?.profile??{};
  if(r.id==='S08')return heading('ACCOUNT / DOCUMENTS','Your booking records.','Receipts belong to the wallet that made the booking.')+table(['Reference','Principal',''],(live.data?.dashboard.bookings??[]).map(b=>[short(b.id),usdc(b.amount),link('/receipts/'+b.id,'View receipt','button small')]));
  return heading('ACCOUNT / PROFILE','Your profile.','Your details stay with your connected wallet.')+card('Your details',profileDetails());
 }
 return null;
}

export function profileDetails(){
 const p=live.data?.profile??{};
 return form('profile',input('displayName','Display name',p.displayName??live.session.wallet,'text','required maxlength="100"')+input('brand','Brand or business',p.brand??'','text','maxlength="100"')+input('city','City',p.city??'','text','maxlength="100"')+submit('Save profile'));
}
export function brandAssets(){return brandLibrary(false);}

function mediaUrl(uri){return /^ipfs:\/\/baf[a-z2-7]{30,120}$/.test(uri??'')?uri.replace('ipfs://','https://gateway.pinata.cloud/ipfs/'):null;}
function brandLibrary(withHeading=true){
 const media=verifiedMediaFor(live.data?.media,live.session.wallet),max=(live.config?.mediaMaxBytes??1000000)/1000000;
 return (withHeading?heading('YOUR BRAND','Keep your creative ready for the next campaign.','Verified public uploads from this wallet can be reused when submitting artwork.'):'')+
  card('Add a brand asset',form('brand-upload',input('file','Image or document','','file','required accept="image/png,image/jpeg,application/pdf"')+`<p class="tiny muted">PNG, JPEG or PDF, up to ${esc(max)} MB. Keep original artwork quality. Uploaded files are public.</p>`+check('public','I have permission to publish this content and understand it will be public.')+submit('Upload brand asset')))+
  card('Your verified uploads',media.length?`<div class="grid three">${media.map(m=>{const image=['image/png','image/jpeg'].includes(m.mime),url=mediaUrl(m.uri);return `<article class="panel">${image?`<img src="${esc(url)}" alt="Your verified brand image" loading="lazy" style="width:100%;height:160px;object-fit:contain">`:`<p>${m.mime==='application/pdf'?'PDF document':'Public document'}</p>`}<p><strong>${image?'Image':'Document'}</strong> · ${esc(dateTime(m.createdAt))}</p><p class="tiny">${esc(m.mime)} · ${esc(m.bytes)} bytes</p><p><a href="${esc(url)}" class="text-link" target="_blank" rel="noopener noreferrer">Open upload ↗</a></p><details><summary>Public content reference</summary><code>${esc(m.uri)}</code></details></article>`;}).join('')}</div>`:empty('Your brand library starts here.','Upload a logo or creative file to reuse it across your placements.'));
}
function notificationSettings(){return heading('ACCOUNT / NOTIFICATIONS','Choose your in-app notifications.','Control whether account activity appears in your notifications feed.')+card('Activity notifications',form('notification-preferences',check('notifications','Show account and booking activity in my notifications',live.data?.profile?.notifications!==false)+submit('Save notification preferences')));}
const placementAccess=(s,wallet)=>[s.state.seller_id,s.state.holder?.account_id,s.rights.current_owner_id,s.state.nominated_recipient].includes(wallet);
function messageRows(messages){return messages.map(m=>`<article class="connected-record"><strong>${esc(short(m.owner))}</strong><p>${esc(m.text)}</p><small>${esc(dateTime(m.createdAt))}</small></article>`).join('')||'<p>No messages yet.</p>';}
function supportCase(ticket){
 const admin=supportAdministrator(live),messages=Array.isArray(ticket.messages)?ticket.messages:[{owner:ticket.owner,role:'user',message:ticket.message,createdAt:ticket.createdAt}];
 return heading('SUPPORT / REQUEST',ticket.subject,'Reply here to keep your support conversation together.',admin?link('/ops','Support queue','button'):link('/support/new','Your support requests','button'))+
  card('Support conversation',`<p>${badge(ticket.status)}</p>${messages.map(m=>`<article class="connected-record"><strong>${m.role==='admin'?'Support team':esc(short(m.owner))}</strong><p>${esc(m.message)}</p><small>${esc(dateTime(m.createdAt))}</small></article>`).join('')}`)+
  card('Reply or update this case',form('support-reply',hidden('ticketId',ticket.id)+hidden('version',ticket.version)+textArea('message','Reply','','maxlength="2000" placeholder="Add a message for this conversation"')+select('status','Case status',[['open','Open'],['closed','Closed']],ticket.status)+submit('Update support case')));
}
function supportQueue(){return card('Support requests',`<p>Support conversations are separate from signed campaign issue decisions.</p>${table(['Subject','From','Status',''],(live.data.supportQueue??[]).map(t=>[esc(t.subject),esc(short(t.owner)),badge(t.status),link('/support/cases/'+encodeURIComponent(t.id),'Open support case','button small')]))}`);}

export function walletView(signIn=false){
 if(live.config.production)return productionWalletView(signIn);
 const connected=live.session;
 return heading('YOUR ACCOUNT',signIn?'Connect your wallet.':'Your wallet.','Sign in with a wallet. Every purchase and on-chain action needs its own approval.')+
  `<div class="split">${card(connected?'Connected account':'Choose a wallet',connected?`<p><code>${esc(connected.wallet)}</code></p><p>Network: ${esc(live.config.network)}</p>${live.balances?.near?`<p>NEAR for gas: ${nativeUnits(live.balances.near)} NEAR</p>`:live.balances?.baseEth?`<p>Base gas balance: ${nativeUnits(live.balances.baseEth,18)} ETH</p>`:''}<p>Intents balance: ${live.balances?usdc(live.balances.intentsUsdc):live.balanceError?'Unavailable':'Checking...'}</p><div class="actions">${act('disconnect','Disconnect wallet')}${link('/account/recovery','Recover pending requests')}</div>`:
   '<p>Choose a wallet below to verify ownership of your account.</p>')}
  ${card('Browser wallets',form('connect-evm',select('provider','EVM wallet app',live.providers.length?live.providers.map(p=>[p.id,p.name]):[['','No injected EVM wallet detected']])+submit('Connect EVM wallet'))+
   (!live.config.sandbox?`<div style="margin-top:20px">${act('connect-near','Connect NEAR wallet · Meteor','','button primary')}</div>`:'<p class="tiny muted">You can use an installed EVM wallet to sign on this local test ledger. No Base funds or gas are needed in Sandbox.</p>'))}</div>`+
  (live.config.developmentWallets?.length?card('Funded development identities',`<p>These identities use real mainnet funds. Every payment requires a separate review. Recovery keys remain on this computer.</p>${form('connect-funded',select('wallet','Funded wallet',live.config.developmentWallets.map(w=>[w.address,w.label+' · '+short(w.address)]),live.session?.wallet)+submit('Connect funded wallet'))}`):'')+
  (live.config.sandbox?card('Local test identities',`<p>These six identities hold valueless test tokens and use real signatures and chain transactions.</p>${form('connect-test',select('wallet','Test wallet',live.config.wallets.map(w=>[w.address,w.label+' · '+short(w.address)]),live.session?.wallet??live.config.wallets[0].address)+submit('Connect test wallet'))}${link('/_testing','Open local test controls','text-link')}`):'')+
  card('Keep control of your funds.',`<p>This page accepts wallet signatures and transaction receipts. It has no seed phrase or personal private-key input.</p>${link('/profile/balance','View balances & withdrawals')}`);
}
function productionWalletView(signIn){
 const session=live.session,next=new URLSearchParams(location.search).get('next'),safeNext=next?.startsWith('/')&&!next.startsWith('//')?next:live.data?.profile?.defaultWorkspace==='owner'?'/host':'/profile';
 const experience=signIn&&safeNext==='/experience';
 const providers=live.providers.map(p=>act('connect-evm','Connect '+esc(p.name),`data-id="${esc(p.id)}"`,'button primary')).join(' ');
 return heading(experience?'YOUR NEXT MOVE':'YOUR ACCOUNT',experience?'Sign in to try a takeover.':signIn?'Welcome to Everywhere.':'Your connected wallet.',experience?'Try the interactive takeover in about two minutes. No token balance needed.':'Sign in with your wallet. Each payment needs your approval.')+
  `<div class="split">${card(session?'You\'re connected':'Choose your wallet',session?`<p><strong>${esc(live.data?.profile?.displayName??short(session.wallet))}</strong></p><p class="tiny"><code>${esc(session.wallet)}</code></p><p>Available balance: <strong>${live.balances?usdc(live.balances.intentsUsdc):live.balanceError?'Unavailable':'Checking...'}</strong></p><div class="actions">${link(safeNext,'Continue','button primary')}${act('disconnect','Disconnect')}</div><p>${link('/profile/balance','Manage funds & withdrawals','text-link')}</p>`:'<p>Use the same wallet to manage your advertising or list your own spaces. Signing in does not move money.</p>')}
  ${card(session?'Use a different wallet':'Connect a wallet',`<div class="stack">${providers||'<p>No browser wallet detected. Open this page in a browser with your wallet enabled.</p>'}${act('connect-near','Connect NEAR wallet · Meteor','','button')}</div><p class="tiny muted">Base wallets such as Rabby and MetaMask can pay in USDC. Your account and campaign records follow the wallet you connect.</p>`)}</div>`+
  `<p class="tiny muted">We never ask for a seed phrase or private key. ${link('/account/recovery','Need help with a payment?','text-link')}</p>`;
}
function recoveryView(){
 if(!live.session)return signedOut();const pending=live.data?.requests??[];
 return heading('ACCOUNT / RECOVERY','Pick up the original request.','Reconnect the account that started an action. An unknown response does not authorize a second transfer.',act('recover-all','Reconcile original requests','','button primary'))+
  card('Wallet requests',pending.length?pending.map(r=>`<article class="connected-record"><div class="row"><strong>${esc(r.kind)}</strong>${badge(r.status)}</div><p class="tiny">${esc(r.id)}</p>${transaction(r.transactionHash)}
   ${!['rejected','confirmed','failed'].includes(r.status)?form('recover-request',hidden('id',r.id)+input('hash','Original NEAR transaction hash, if your wallet returned one',r.transactionHash??'')+submit('Verify original request')):''}${r.status==='requested'&&!r.dispatched?act('cancel-unsent-request','Cancel unopened request',`data-id="${r.id}"`,'button small'):''}${originalRetryAvailable(r)?'<p>The connection failed before a transaction was created. You can approve the exact original request again.</p>'+act('resume-intent','Retry original signature',`data-id="${r.id}"`,'button primary'):r.kind==='intent'&&!r.transactionHash&&!['confirmed','failed','rejected'].includes(r.status)?act('resume-intent','Resume original signature',`data-id="${r.id}"`,'button small'):''}${r.errorCode?`<p>${esc(r.errorCode)}</p>`:''}</article>`).join(''):'<p>No wallet requests yet.</p>')+
  (live.fundingRecords?.length?card('Original Base funding requests',live.fundingRecords.map(r=>`<article class="connected-record"><strong>${usdc(r.quotedInput)} Base USDC</strong>${badge(r.phase)}${transaction(r.transactionHash)}${r.phase==='wallet-review'?act('cancel-unsent-funding','Cancel unopened Base request',`data-id="${r.id}"`,'button small'):''}${!['cancelled','confirmed','failed'].includes(r.phase)?form('recover-funding',hidden('id',r.id)+input('hash','Original Base transaction hash',r.transactionHash??'')+submit('Verify original funding')):''}</article>`).join('')):'')+
  card('Payout transactions',(live.data.operations??[]).filter(o=>o.id.startsWith('wallet-claim-')).map(o=>`<article class="connected-record">${badge(o.phase)}${transaction(o.transaction_hash)}${!['confirmed','failed'].includes(o.phase)?act('reconcile-operation','Check original payout',`data-id="${o.id}"`,'button small'):''}</article>`).join('')||'<p>No payout transactions yet.</p>')+
  card('Unsent bookings',table(['Booking','State',''],(live.data?.dashboard.bookings??[]).filter(b=>b.status==='prepared').map(b=>[short(b.id),badge(b.status),link('/payments/'+b.id,'Open booking','button small')])))+
  (live.config.sandbox?link('/_testing','Local interruption and clock controls','text-link'):'');
}
export function sharedView(r){
 const account=accountView(r);if(account)return account;
 if(!live.session)return signedOut();
 if(r.id==='S01'){
  const wallet=live.session.wallet,bookings=allBookings().filter(b=>bookingConversationAllowed(b,wallet)),threads=(live.catalog?.snapshots??[]).filter(s=>placementAccess(s,wallet));
  return heading('WORKSPACE / INBOX','Your campaign conversations.','Booking conversations stay with the original buyer and space owner, including after a takeover.')+
   card('Booking conversations',table(['Booking','With','Status',''],bookings.map(b=>[esc(sale(b.saleId)?.title??'Your booking'),esc(short(wallet===b.owner?b.sellerId:b.owner)),badge(b.status==='outbid'?'Taken over':b.status),link('/inbox/'+encodeURIComponent(b.id),'Open booking conversation','button small')])))+
   card('Artwork & delivery conversations',`<p>These conversations follow the current placement roles.</p>${table(['Placement',''],threads.map(s=>[esc(sale(s.campaign.terms.sale_id)?.title??s.accountId),link('/inbox/'+encodeURIComponent(s.accountId),'Open artwork conversation','button small')]))}`);
 }
 if(r.id==='S02'){
  const wallet=live.session.wallet,b=booking(r.params.threadId);
  if(b){
   if(!bookingConversationAllowed(b,wallet))return unavailable('Booking conversation not found.');
   const messages=(live.data.messages??[]).filter(m=>m.bookingId===b.id&&[b.owner,b.sellerId].includes(m.owner));
   return heading('BOOKING / CONVERSATION',sale(b.saleId)?.title??'Your booking','Private to the original buyer and the space owner. This conversation remains available after a takeover.')+
    card('Booking conversation',messageRows(messages))+card('Send a message',form('booking-message',hidden('bookingId',b.id)+textArea('message','Message','','required maxlength="2000"')+submit('Send message')));
  }
  const s=snapshot(r.params.threadId);if(!s||!placementAccess(s,wallet))return unavailable('Artwork conversation not found.');
  const messages=(live.data.placementMessages??[]).filter(m=>m.contractId===s.accountId);
  return heading('ARTWORK / CONVERSATION',sale(s.campaign.terms.sale_id)?.title??'Placement conversation','Available to the current space owner, advertiser and placement controller.')+
   card('Artwork & delivery conversation',messageRows(messages))+card('Send a message',form('message',hidden('contractId',s.accountId)+textArea('message','Message','','required maxlength="2000"')+submit('Send message')));
 }
 if(r.id==='S03'){
  if(live.data.profile?.notifications===false)return heading('WORKSPACE / NOTIFICATIONS','Your notifications are paused.','Turn on in-app notifications to see account activity here.',link('/settings/notifications','Notification settings','button primary'));
  return heading('WORKSPACE / ACTIVITY','Your account activity.','Recorded account and booking events.',link('/settings/notifications','Notification settings','button'))+card('Recent activity',(live.data.events??[]).map(e=>`<article class="connected-record"><strong>${esc(e.kind.replaceAll('_',' '))}</strong><p>${esc(e.entity_id)}</p><small>${esc(dateTime(e.created_at))}</small></article>`).join('')||'<p>No new account events.</p>');
 }
 if(r.id==='S09'){
  const q=new URLSearchParams(location.search),b=booking(q.get('booking')),contract=q.get('contract')??b?.contractId;
  return heading('WORKSPACE / SUPPORT',contract?'Request a campaign issue review.':'How can we help?',snapshot(contract)?.mode==='hub'?'Describe the issue and add evidence. Confirm the issue in your wallet before the review deadline to hold campaign settlement.':'Issue requests are recorded first. The campaign\'s separate arbiter signs any on-chain decision.')+
   card(contract?'Campaign issue':'Support request',contract?form('issue',hidden('contractId',contract)+textArea('reason','What needs review?','','required maxlength="2000"')+artifactFields(live.data.media.filter(m=>m.status==='verified'),'Describe the public issue evidence.')+submit('Submit issue for review')):
    form('support',input('subject','Subject','','text','required maxlength="150"')+textArea('message','Message','','required maxlength="3000"')+submit('Save support request')))+(!contract?card('Your support requests',table(['Subject','Status',''],(live.data.support??[]).filter(t=>t.owner===live.session.wallet).map(t=>[esc(t.subject),badge(t.status),link('/support/cases/'+encodeURIComponent(t.id),'Open conversation','button small')]))):'');
 }
 if(r.id==='S10'){
  const issue=(live.data.issues??[]).find(i=>i.id===r.params.id),ticket=[...(live.data.support??[]),...(supportAdministrator(live)?live.data.supportQueue??[]:[])].find(i=>i.id===r.params.id);
  if(issue){const s=snapshot(issue.contractId),decision=s?.campaign.issues[issue.id],needsSignature=s?.mode==='hub'&&!decision&&issue.owner===live.session.wallet&&s.state.outcome==='open'&&BigInt(s.state.refund_end_ns)>BigInt(Date.now())*1000000n;
   return heading('SUPPORT / CASE','Your campaign issue.',s?.mode==='hub'?'A confirmed open issue holds settlement until the campaign reviewer resolves it.':'The request and the arbiter\'s decision are separate records.')+card('Case',`<p>${esc(issue.reason)}</p>${badge(decision?decision.open?'Issue open':'Resolved':s?.mode==='hub'?'Awaiting wallet confirmation':'Awaiting arbiter')}${needsSignature?`<p>Confirm this issue in your wallet before the review deadline. Saving evidence alone does not hold settlement.</p>${act('open-issue','Confirm issue',`data-contract="${esc(issue.contractId)}" data-id="${esc(issue.id)}"`,'button primary')}`:''}<p>Case reference: ${esc(issue.id)}</p>${link('/profile/placements/'+issue.contractId,'Placement workspace')}`);}
  return ticket&&(ticket.owner===live.session.wallet||supportAdministrator(live))?supportCase(ticket):unavailable('Support case not found.');
 }
 return null;
}
export function opsView(r){
 if(!live.session)return signedOut();const values=live.data.arbiterSales??[];
 if(!values.length&&!supportAdministrator(live))return heading('CAMPAIGN OPERATIONS','No campaigns name this wallet as arbiter.','Connect a campaign\'s named NEAR arbiter to review its issues and finalize its outcome.',link('/settings/wallets','Choose a wallet'));
 if(r.id==='M01'||r.id==='M05')return heading('CAMPAIGN OPERATIONS','Review what happened.','Review assigned campaigns and support conversations.')+
  (supportAdministrator(live)?supportQueue():'')+
  card('Assigned campaigns',table(['Campaign','Spots',''],values.map(s=>[esc(s.title),String(s.spots.length),link('/ops/listings/'+s.id,'Review campaign','button small')])))+
  card('Issue queue',table(['Case','Status',''],live.data.issues.filter(i=>values.some(s=>s.spots.some(p=>p.contractId===i.contractId))).map(i=>[esc(i.reason),badge(snapshot(i.contractId)?.campaign.issues[i.id]?.open?'open':'awaiting review'),link('/ops/cases/'+i.id,'Review issue','button small')])));
 if(r.id==='M02'){
  const s=values.find(s=>s.id===r.params.id);if(!s)return unavailable();
  return heading('OPERATIONS / CAMPAIGN',s.title,'Review evidence and resolve cases before finalizing the campaign.')+
   s.spots.map(p=>{const snap=snapshot(p.contractId);return snap?`<div class="split">${evidence(snap)}${card('Campaign outcome',snap.state.outcome!=='open'?`<p>${badge(snap.state.outcome==='success'?'Campaign settled successfully':'Campaign settled as failed')}</p><p>The original creditors can claim their available funds. Finalization is complete.</p>${link('/settings/wallets','Switch wallet to claim funds','button primary')}`:`<p>Successful settlement is available after ${esc(byNs(snap.state.refund_end_ns))} with locked artwork, installation evidence and resolved issues.</p><div class="actions">${act('finalize-success','Finalize successful campaign',`data-contract="${p.contractId}"`,'button primary')}${act('finalize-failure','Finalize failed campaign',`data-contract="${p.contractId}"`)}</div>`)}</div>`:'';}).join('');
 }
 if(r.id==='M03'){
  const issue=live.data.issues.find(i=>i.id===r.params.id),snap=issue&&snapshot(issue.contractId);if(!issue||snap?.state.arbiter_id!==live.session.wallet)return unavailable();
  const decision=snap.campaign.issues[issue.id];
  return heading('OPERATIONS / ISSUE','Review the campaign evidence.','Your signed decision controls the campaign\'s settlement gate.')+
   `<div class="split">${card('Issue request',`<p>${esc(issue.reason)}</p><p>Requested by ${esc(issue.owner)}</p>${badge(decision?decision.open?'open':'resolved':'awaiting review')}`)}${card('Record your decision',form('issue-decision',hidden('caseId',issue.id)+hidden('contractId',issue.contractId)+select('decision','Decision',[['open','Open an issue and block success'],['close','Resolve after reviewing evidence']],decision?.open?'close':'open')+artifactFields(live.data.media.filter(m=>m.status==='verified'),'Describe your review evidence.')+submit('Review & sign issue decision')))}</div>`+evidence(snap);
 }
 if(r.id==='M04')return heading('OPERATIONS / PAYMENTS','Recover a payment.','Payments are reconciled by their original payer. Campaign operations cannot redirect a buyer\'s funds.',link('/account/recovery','Open this wallet\'s recovery records'));
 return null;
}
export function testingView(){
 if(!live.config.sandbox)return unavailable('Local test controls are unavailable on mainnet.');if(!live.session)return signedOut();
 const values=allSales().filter(s=>[s.owner,s.arbiterId].includes(live.session.wallet));
 return heading('LOCAL TESTING','Test real actions without real money.','These controls affect the local NEAR Sandbox only. The product\'s normal actions still use signatures and finalized receipts.')+
  card('Advance a campaign stage',form('advance-clock',select('saleId','Campaign',values.map(s=>[s.id,s.title]))+select('stage','Advance to',[['biddingClose','After bidding closes'],['reviewEnd','After service & issue review']])+submit('Advance local chain')))+
  card('Test interrupted responses',`<p>Enable this, then perform one native transaction. The original receipt will remain recoverable after a reload.</p>${act('lose-response',live.loseNextResponse?'Interruption enabled':'Interrupt next transaction response')}`)+
  card('Restart the local API',`<p>The chain, signed-in session and request journal are retained.</p>${act('restart-api','Restart API & retain chain')}`)+
  link('/profile/balance','Open wallet balances','button primary')+' '+link('/account/recovery','Open account recovery','button primary');
}
