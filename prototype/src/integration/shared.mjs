import { live,nativeUnits,allSales,sale,snapshot,allBookings,booking,usdc,byNs,dateTime } from './runtime.mjs';
import { esc,link,badge,card,empty,heading,act,select,form,input,textArea,check,submit,hidden,evidence,unavailable,signedOut,notice,table,transaction,short } from './ui.mjs';
import { artifactFields } from './owner.mjs';

export function accountView(r){
 if(r.id==='A01'||r.id==='S06')return walletView(r.id==='A01');
 if(r.id==='A03')return recoveryView();
 if(r.id==='A02'||r.id==='S04'||r.id==='S05'||r.id==='S07'||r.id==='S08'){
  if(!live.session)return signedOut();const p=live.data?.profile??{};
  if(r.id==='S08')return heading('ACCOUNT / DOCUMENTS','Your booking records.','Receipts belong to the wallet that made the booking.')+table(['Reference','Principal',''],(live.data?.dashboard.bookings??[]).map(b=>[short(b.id),usdc(b.amount),link('/receipts/'+b.id,'View receipt','button small')]));
  return heading('ACCOUNT / PROFILE','Make this workspace yours.','Profile preferences are stored with your verified wallet.')+
   card('Your profile',form('profile',input('displayName','Display name',p.displayName??live.session.wallet,'text','required maxlength="100"')+input('brand','Brand or business',p.brand??'','text','maxlength="100"')+
    input('city','City',p.city??'')+select('defaultWorkspace','Default workspace',[['buyer','Buy advertising'],['owner','List advertising spaces']],p.defaultWorkspace??'buyer')+check('notifications','Show account notifications',p.notifications!==false)+submit('Save profile')));
 }
 return null;
}
export function walletView(signIn=false){
 const connected=live.session;
 return heading('YOUR ACCOUNT',signIn?'Connect your wallet.':'Your wallet, your workspace.','Sign in with a wallet. Every purchase and on-chain action needs its own approval.')+
  `<div class="split">${card(connected?'Connected account':'Choose a wallet',connected?`<p><code>${esc(connected.wallet)}</code></p><p>Network: ${esc(live.config.network)}</p>${live.balances?.near?`<p>NEAR for gas: ${nativeUnits(live.balances.near)} NEAR</p>`:live.balances?.baseEth?`<p>Base gas balance: ${nativeUnits(live.balances.baseEth,18)} ETH</p>`:''}<p>Intents balance: ${usdc(live.balances?.intentsUsdc)}</p><div class="actions">${act('disconnect','Disconnect wallet')}${link('/account/recovery','Recover pending requests')}</div>`:
   '<p>Choose a wallet below to verify ownership of your account.</p>')}
  ${card('Browser wallets',form('connect-evm',select('provider','EVM wallet app',live.providers.length?live.providers.map(p=>[p.id,p.name]):[['','No injected EVM wallet detected']])+submit('Connect EVM wallet'))+
   (!live.config.sandbox?`<div style="margin-top:20px">${act('connect-near','Connect NEAR wallet · Meteor','','button primary')}</div>`:'<p class="tiny muted">You can use an installed EVM wallet to sign on this local test ledger. No Base funds or gas are needed in Sandbox.</p>'))}</div>`+
  (live.config.developmentWallets?.length?card('Funded development identities',`<p>These identities use real mainnet funds. Every payment requires a separate review. Recovery keys remain on this computer.</p>${form('connect-funded',select('wallet','Funded wallet',live.config.developmentWallets.map(w=>[w.address,w.label+' · '+short(w.address)]),live.session?.wallet)+submit('Connect funded wallet'))}`):'')+
  (live.config.sandbox?card('Local test identities',`<p>These six identities hold valueless test tokens and use real signatures and chain transactions.</p>${form('connect-test',select('wallet','Test wallet',live.config.wallets.map(w=>[w.address,w.label+' · '+short(w.address)]),live.session?.wallet??live.config.wallets[0].address)+submit('Connect test wallet'))}${link('/_testing','Open local test controls','text-link')}`):'')+
  card('Keep control of your funds.',`<p>This page accepts wallet signatures and transaction receipts. It has no seed phrase or personal private-key input.</p>${link('/buy/money','View balances & withdrawals')}`);
}
function recoveryView(){
 if(!live.session)return signedOut();const pending=live.data?.requests??[];
 return heading('ACCOUNT / RECOVERY','Pick up the original request.','Reconnect the account that started an action. An unknown response does not authorize a second transfer.',act('recover-all','Reconcile original requests','','button primary'))+
  card('Wallet requests',pending.length?pending.map(r=>`<article class="connected-record"><div class="row"><strong>${esc(r.kind)}</strong>${badge(r.status)}</div><p class="tiny">${esc(r.id)}</p>${transaction(r.transactionHash)}
   ${!['rejected','confirmed','failed'].includes(r.status)?form('recover-request',hidden('id',r.id)+input('hash','Original NEAR transaction hash, if your wallet returned one',r.transactionHash??'')+submit('Verify original request')):''}${r.status==='requested'&&!r.dispatched?act('cancel-unsent-request','Cancel unopened request',`data-id="${r.id}"`,'button small'):''}${r.kind==='intent'&&!['confirmed','failed','rejected'].includes(r.status)?act('resume-intent','Resume original signature',`data-id="${r.id}"`,'button small'):''}${r.errorCode?`<p>${esc(r.errorCode)}</p>`:''}</article>`).join(''):'<p>No wallet requests yet.</p>')+
  (live.fundingRecords?.length?card('Original Base funding requests',live.fundingRecords.map(r=>`<article class="connected-record"><strong>${usdc(r.quotedInput)} Base USDC</strong>${badge(r.phase)}${transaction(r.transactionHash)}${r.phase==='wallet-review'?act('cancel-unsent-funding','Cancel unopened Base request',`data-id="${r.id}"`,'button small'):''}${!['cancelled','confirmed','failed'].includes(r.phase)?form('recover-funding',hidden('id',r.id)+input('hash','Original Base transaction hash',r.transactionHash??'')+submit('Verify original funding')):''}</article>`).join('')):'')+
  card('Payout transactions',(live.data.operations??[]).filter(o=>o.id.startsWith('wallet-claim-')).map(o=>`<article class="connected-record">${badge(o.phase)}${transaction(o.transaction_hash)}${!['confirmed','failed'].includes(o.phase)?act('reconcile-operation','Check original payout',`data-id="${o.id}"`,'button small'):''}</article>`).join('')||'<p>No payout transactions yet.</p>')+
  card('Unsent bookings',table(['Booking','State',''],(live.data?.dashboard.bookings??[]).filter(b=>b.status==='prepared').map(b=>[short(b.id),badge(b.status),link('/payments/'+b.id,'Open booking','button small')])))+
  (live.config.sandbox?link('/_testing','Local interruption and clock controls','text-link'):'');
}
export function sharedView(r){
 const account=accountView(r);if(account)return account;
 if(!live.session)return signedOut();
 if(r.id==='S01'){
  const threads=(live.catalog?.snapshots??[]).filter(s=>[s.state.seller_id,s.state.holder?.account_id,s.rights.current_owner_id,s.state.nominated_recipient].includes(live.session.wallet));
  return heading('WORKSPACE / INBOX','Keep the campaign moving.','Conversations are available only to the current campaign participants.')+card('Placement conversations',table(['Campaign',''],threads.map(s=>[esc(sale(s.campaign.terms.sale_id)?.title??s.accountId),link('/inbox/'+s.accountId,'Open conversation','button small')])));
 }
 if(r.id==='S02'){
  const b=booking(r.params.threadId),contract=b?.contractId??r.params.threadId,s=snapshot(contract);if(!s)return unavailable('Conversation not found.');
  const messages=(live.data.placementMessages??[]).filter(m=>m.contractId===contract);
  return heading('WORKSPACE / CONVERSATION',sale(s.campaign.terms.sale_id)?.title??'Placement conversation','Messages are persisted for the campaign participants.')+
   card('Conversation',messages.map(m=>`<article class="connected-record"><strong>${esc(short(m.owner))}</strong><p>${esc(m.text)}</p><small>${esc(dateTime(m.createdAt))}</small></article>`).join('')||'<p>No messages yet.</p>')+
   card('Send a message',form('message',hidden('contractId',contract)+textArea('message','Message','','required maxlength="2000"')+submit('Send message')));
 }
 if(r.id==='S03')return heading('WORKSPACE / ACTIVITY','Your account activity.','Recorded account and booking events.')+card('Recent activity',(live.data.events??[]).map(e=>`<article class="connected-record"><strong>${esc(e.kind.replaceAll('_',' '))}</strong><p>${esc(e.entity_id)}</p><small>${esc(dateTime(e.created_at))}</small></article>`).join('')||'<p>No new account events.</p>');
 if(r.id==='S09'){
  const q=new URLSearchParams(location.search),b=booking(q.get('booking')),contract=q.get('contract')??b?.contractId;
  return heading('WORKSPACE / SUPPORT',contract?'Request a campaign issue review.':'How can we help?','Issue requests are recorded first. The campaign’s separate arbiter signs any on-chain decision.')+
   card(contract?'Campaign issue':'Support request',contract?form('issue',hidden('contractId',contract)+textArea('reason','What needs review?','','required maxlength="2000"')+artifactFields(live.data.media.filter(m=>m.status==='verified'),'Describe the public issue evidence.')+submit('Submit issue for review')):
    form('support',input('subject','Subject','','text','required maxlength="150"')+textArea('message','Message','','required maxlength="3000"')+submit('Save support request')));
 }
 if(r.id==='S10'){
  const issue=live.data.issues.find(i=>i.id===r.params.id),ticket=live.data.support.find(i=>i.id===r.params.id);
  if(issue){const s=snapshot(issue.contractId),decision=s?.campaign.issues[issue.id];return heading('SUPPORT / CASE','Your campaign issue.','The request and the arbiter’s decision are separate records.')+card('Case',`<p>${esc(issue.reason)}</p>${badge(decision?decision.open?'Issue open':'Resolved':'Awaiting arbiter')}<p>Case reference: ${esc(issue.id)}</p><p>${esc(issue.evidenceSha256)}</p>${link('/buy/placements/'+issue.contractId,'Placement workspace')}`);}
  return ticket?heading('SUPPORT / REQUEST',ticket.subject,'Saved support request.')+card('Request',`<p>${esc(ticket.message)}</p>${badge(ticket.status)}`):unavailable('Support case not found.');
 }
 return null;
}
export function opsView(r){
 if(!live.session)return signedOut();const values=live.data.arbiterSales??[];
 if(!values.length)return heading('CAMPAIGN OPERATIONS','No campaigns name this wallet as arbiter.','Connect a campaign’s named NEAR arbiter to review its issues and finalize its outcome.',link('/settings/wallets','Choose a wallet'));
 if(r.id==='M01'||r.id==='M05')return heading('CAMPAIGN OPERATIONS','Review what happened.','Only this wallet’s assigned campaigns are available for decisions.')+
  card('Assigned campaigns',table(['Campaign','Spots',''],values.map(s=>[esc(s.title),String(s.spots.length),link('/ops/listings/'+s.id,'Review campaign','button small')])))+
  card('Issue queue',table(['Case','Status',''],live.data.issues.filter(i=>values.some(s=>s.spots.some(p=>p.contractId===i.contractId))).map(i=>[esc(i.reason),badge(snapshot(i.contractId)?.campaign.issues[i.id]?.open?'open':'awaiting review'),link('/ops/cases/'+i.id,'Review issue','button small')])));
 if(r.id==='M02'){
  const s=values.find(s=>s.id===r.params.id);if(!s)return unavailable();
  return heading('OPERATIONS / CAMPAIGN',s.title,'Review evidence and resolve cases before finalizing the campaign.')+
   s.spots.map(p=>{const snap=snapshot(p.contractId);return snap?`<div class="split">${evidence(snap)}${card('Campaign outcome',`<p>Successful settlement is available after ${esc(byNs(snap.state.refund_end_ns))} with locked artwork, installation evidence and resolved issues.</p><div class="actions">${act('finalize-success','Finalize successful campaign',`data-contract="${p.contractId}"`,'button primary')}${act('finalize-failure','Finalize failed campaign',`data-contract="${p.contractId}"`)}</div>`)}</div>`:'';}).join('');
 }
 if(r.id==='M03'){
  const issue=live.data.issues.find(i=>i.id===r.params.id),snap=issue&&snapshot(issue.contractId);if(!issue||snap?.state.arbiter_id!==live.session.wallet)return unavailable();
  const decision=snap.campaign.issues[issue.id];
  return heading('OPERATIONS / ISSUE','Review the campaign evidence.','Your signed decision controls the campaign’s settlement gate.')+
   `<div class="split">${card('Issue request',`<p>${esc(issue.reason)}</p><p>Requested by ${esc(issue.owner)}</p>${badge(decision?decision.open?'open':'resolved':'awaiting review')}`)}${card('Record your decision',form('issue-decision',hidden('caseId',issue.id)+hidden('contractId',issue.contractId)+select('decision','Decision',[['open','Open an issue and block success'],['close','Resolve after reviewing evidence']],decision?.open?'close':'open')+artifactFields(live.data.media.filter(m=>m.status==='verified'),'Describe your review evidence.')+submit('Review & sign issue decision')))}</div>`+evidence(snap);
 }
 if(r.id==='M04')return heading('OPERATIONS / PAYMENTS','Original-wallet reconciliation.','Payments are reconciled by their original payer. Campaign operations cannot redirect a buyer’s funds.',link('/account/recovery','Open this wallet’s recovery records'));
 return null;
}
export function testingView(){
 if(!live.config.sandbox)return unavailable('Local test controls are unavailable on mainnet.');if(!live.session)return signedOut();
 const values=allSales().filter(s=>[s.owner,s.arbiterId].includes(live.session.wallet));
 return heading('LOCAL TESTING','Test real actions without real money.','These controls affect the local NEAR Sandbox only. The product’s normal actions still use signatures and finalized receipts.')+
  card('Advance a campaign stage',form('advance-clock',select('saleId','Campaign',values.map(s=>[s.id,s.title]))+select('stage','Advance to',[['biddingClose','After bidding closes'],['reviewEnd','After service & issue review']])+submit('Advance local chain')))+
  card('Test interrupted responses',`<p>Enable this, then perform one native transaction. The original receipt will remain recoverable after a reload.</p>${act('lose-response',live.loseNextResponse?'Interruption enabled':'Interrupt next transaction response')}`)+
  card('Restart the local API',`<p>The chain, signed-in session and request journal are retained.</p>${act('restart-api','Restart API & retain chain')}`)+
  link('/buy/money','Open wallet balances','button primary')+' '+link('/account/recovery','Open account recovery','button primary');
}
