import { live,allSales,sale,snapshot,allBookings,booking,usdc,dateTime,byNs,rawAsset } from './runtime.mjs';
import { esc,link,badge,card,empty,heading,act,select,form,input,textArea,check,submit,hidden,scene,scheduleSummary,spotState,evidence,bookingTable,unavailable,signedOut,notice,table,transaction,short } from './ui.mjs';
import { artifactFields } from './owner.mjs';

export function placement(id){const b=booking(id),s=b?snapshot(b.contractId):live.data?.placements.find(s=>s.accountId===id);return {b,s,sale:sale(b?.saleId??s?.campaign.terms.sale_id)};}
export function buyerView(r){
 if(!live.session)return signedOut();const d=live.data?.dashboard;if(!d)return empty('Loading your workspace.','Your campaigns are being loaded.');
 if(r.id==='B01')return heading('BUYER WORKSPACE','Your brand, out in the world.','Browse spaces, book a campaign and follow its progress.',link('/explore','Explore spaces','button primary'))+
  `<div class="stats">${[['Campaigns',d.campaigns.length],['Accepted bookings',d.bookings.filter(b=>b.accepted).length],['Placement NFTs',live.data.placements.filter(s=>s.rights.current_owner_id===live.session.wallet).length]].map(([label,n])=>`<div class="stat"><span>${label}</span><strong>${n}</strong></div>`).join('')}</div>`+
  card('Your placements',bookingTable(d.bookings))+nftCards();
 if(['B02','B04'].includes(r.id)){
  if(r.id==='B04'){const c=d.campaigns.find(c=>c.id===r.params.id);if(!c)return unavailable();return heading('BUYER / CAMPAIGN',c.name,'One campaign can book spaces across different owners.',link('/explore?campaign='+c.id,'Find more spaces','button primary'))+
   card('Campaign budget',`<p>${usdc(c.budgetMicroUsdc)} principal commitment limit.</p>`)+card('Campaign placements',bookingTable(d.bookings.filter(b=>b.campaignId===c.id)));}
  return heading('BUYER / CAMPAIGNS','Build a campaign across the city.','One budget can cover multiple vehicles and owners.',link('/buy/campaigns/new','Create campaign','button primary'))+
   card('Your campaigns',table(['Campaign','Budget','State',''],d.campaigns.map(c=>[esc(c.name),usdc(c.budgetMicroUsdc),badge(c.status),link('/buy/campaigns/'+c.id,'Open ↗','text-link')])));
 }
 if(r.id==='B03')return heading('BUYER / NEW CAMPAIGN','Give your campaign a home.','Create its principal budget, then choose one or more spaces.')+
  card('Campaign details',form('campaign-create',input('name','Campaign name','','text','required maxlength="100"')+input('budget','Principal budget · USDC','1.00','number','min="0.01" step="0.01" required')+submit('Create campaign')));
 if(r.id==='B05'){const ids=new Set(live.data.saved.filter(s=>s.saved).map(s=>s.saleId));return heading('BUYER / SAVED','Your shortlist.','Spaces saved by this wallet.')+table(['Space',''],allSales().filter(s=>ids.has(s.id)).map(s=>[esc(s.title),link('/spaces/'+s.assetId+'?sale='+s.id,'View space','button small')]));}
 if(r.id==='B06'){
  const s=sale(r.params.intentId),p=s?.spots.find(p=>p.id===new URLSearchParams(location.search).get('spot'))??s?.spots[0];if(!s||!p)return unavailable();const info=spotState(p),a=s.publication.manifest.asset;
  return heading('CHECKOUT',info.booked?'Take over this placement.':'Make this spot yours.','Book under the published rules. Artwork is reviewed after booking.')+
   `<div class="split">${card(esc(a.title),`<p>${esc(a.spots.find(x=>x.id===p.id)?.name??p.id)} · ${esc(a.city)}</p><h2>${usdc(info.price)}</h2><p>Printing & installation included.</p>${scheduleSummary(s)}<p>${esc(s.rules)}</p>`)}
   ${card('Your campaign',info.closed||info.booked&&!p.takeoverEnabled?notice('This spot is unavailable.','Refresh the listing to choose an available period.'):
    form('prepare-booking',hidden('saleId',s.id)+hidden('spotId',p.id)+select('campaignId','Use a campaign',[['','Create a new campaign'],...d.campaigns.filter(c=>c.status==='active').map(c=>[c.id,c.name])],new URLSearchParams(location.search).get('campaign')??'')+
    input('name','New campaign name','My city campaign')+input('budget','New campaign budget · USDC','1.00','number','min="0.01" step="0.01"')+
    `<p>Your Intents balance: <strong>${usdc(live.balances?.intentsUsdc)}</strong></p>${link('/buy/money','Add funds or view your balance','text-link')}`+
    check('rules','I agree to the published campaign dates, content rules and takeover setting.')+submit('Continue to payment review')))}</div>`;
 }
 if(r.id==='B07'){
  const b=booking(r.params.id);if(!b)return requestProgress(r.params.id);
  const request=live.data.requests.find(r=>r.planId===b.planId||r.planId===b.nativePlanId),snap=snapshot(b.contractId),intent=live.data.intents.find(i=>i.id===b.planId);
  const accepted=b.accepted===true,expired=intent?.expiresAt&&Date.parse(intent.expiresAt)<=Date.parse(live.catalog.time);
  return heading('PAYMENT',accepted?'Your placement is confirmed.':'Review your booking payment.','This page tracks one original booking and its actual transaction.')+
   `<div class="split">${card('Booking details',`<p>${esc(sale(b.saleId)?.title??b.contractId)}</p><h2>${usdc(b.amount)}</h2><p>${badge(b.status)}</p><p>Payer: <code>${esc(b.owner)}</code></p><p>${request?.transactionHash?transaction(request.transactionHash):'Your wallet has not supplied a transaction receipt yet.'}</p>`)}
   ${card('Next step',accepted?link('/buy/placements/'+b.id,'Open placement workspace','button primary'):
    b.status==='prepared'?(request&&!['rejected','failed'].includes(request.status)?link('/account/recovery','Recover original request','button primary'):
     expired?notice('This unsigned quote has expired.','Cancel this unsent booking, then prepare a fresh price from the listing.'):act('pay-booking','Review & pay',`data-id="${b.id}"`,'button primary'))+' '+act('cancel-booking','Cancel unsent booking',`data-id="${b.id}"`):
    ['failed','rejected','cancelled-before-send'].includes(b.status)?link('/checkout/'+b.saleId+'?spot='+b.spotId,'Prepare a fresh booking','button primary'):
    link('/account/recovery','Check original transaction','button primary'))}</div>`;
 }
 if(['B08','B09'].includes(r.id)){
  const {b,s,sale:offer}=placement(r.params.id);if(!s)return unavailable('Placement not available to this wallet.');
  const owner=s.rights.current_owner_id===live.session.wallet,nominee=s.state.nominated_recipient===live.session.wallet,finalPayer=s.state.holder?.account_id===live.session.wallet;
  const closed=s.rights.bidding_closed;
  const media=live.data.media.filter(m=>m.status==='verified');
  return heading('BUYER / PLACEMENT',offer?.title??s.accountId,'Follow the original booking, final placement right and delivery evidence.',b?link('/receipts/'+b.id,'View receipt'):link('/buy','Buyer overview'))+
   `<div class="split"><div>${evidence(s)}${card('Placement NFT',s.state.nft_minted?`<p>Owner: <code>${esc(s.rights.current_owner_id)}</code></p>${owner?form('nft-transfer',hidden('contractId',s.accountId)+input('receiverId','Transfer artwork control to a NEAR account','','text','required')+submit('Review NFT transfer')):''}`:
    !closed?'<p>The final placement NFT becomes available after bidding ends.</p>':
    `<p>The final payer receives the placement right. Money claims remain with their original creditors.</p>${finalPayer&&live.session.wallet.startsWith('0x')?form('nomination',hidden('contractId',s.accountId)+input('recipientId','NEAR account for your placement NFT',s.state.nominated_recipient??live.config.developmentWallets?.find(w=>w.label==='NFT controller')?.address??'','text','required')+submit('Nominate NFT recipient')):''}
    ${nominee&&!s.state.nomination_accepted?act('accept-nomination','Accept NFT nomination',`data-contract="${s.accountId}"`,'button primary'):''}
    ${(!s.state.holder?.account_id.startsWith('0x')&&finalPayer||s.state.nomination_accepted&&nominee)?act('mint','Mint final placement NFT',`data-contract="${s.accountId}"`,'button primary'):''}`)}
   ${b?card('Booking conversation',link('/inbox/'+b.id,'Message the space owner')):''}</div>
   <div>${card('Your artwork',owner&&!s.state.artwork_locked&&s.rights.active?form('artwork',hidden('contractId',s.accountId)+artifactFields(media,'Describe the advertisement you are submitting.')+submit('Submit artwork for review')):
    `<p>${s.state.artwork_locked?'The production artwork is locked.':owner?'Artwork submission is closed for this campaign.':'Connect the current NFT owner to submit artwork.'}</p>${s.rights.proposal?`<p>Revision ${s.rights.revision} · ${esc(s.rights.proposal.artifact_uri)}</p>`:''}`)}
   ${card('Installation & service',s.campaign.delivery_proof?`<p>Installation evidence submitted by the seller.</p><p>${esc(s.campaign.delivery_proof.artifact_uri)}</p>`:'The seller will submit installation proof after locking the artwork.')}
   ${b?card('Need an issue reviewed?',link('/support/new?booking='+b.id,'Request issue review')):''}</div></div>`;
 }
 if(['B11','B12'].includes(r.id))return moneyView(r.params.id);
 if(r.id==='B10'){const c=d.campaigns.find(c=>c.id===r.params.id);return heading('CAMPAIGN / REPORT',c?.name??'Campaign report','Financial and delivery records from the campaign. Exposure is not measured yet.')+card('Placements',bookingTable(d.bookings.filter(b=>b.campaignId===r.params.id)));}
 if(r.id==='B13'){const b=booking(r.params.id);if(!b)return unavailable();return heading('BOOKING / RECEIPT',sale(b.saleId)?.title??'Placement receipt','This record belongs to the original payer.')+card('Receipt',`<dl class="data-list"><div><dt>Reference</dt><dd>${esc(b.id)}</dd></div><div><dt>Payer</dt><dd>${esc(b.owner)}</dd></div><div><dt>Principal</dt><dd>${usdc(b.amount)}</dd></div><div><dt>Status</dt><dd>${badge(b.status)}</dd></div><div><dt>Contract</dt><dd><code>${esc(b.contractId)}</code></dd></div></dl>${link('/buy/placements/'+b.id,'Open placement')}`);}
 return null;
}
function nftCards(){return live.data.placements.length?card('Placement rights controlled by this wallet',live.data.placements.map(s=>`<p>${badge(s.state.nft_minted?'NFT owned':'Nomination pending')} ${link('/buy/placements/'+s.accountId,esc(sale(s.campaign.terms.sale_id)?.title??s.accountId),'text-link')}</p>`).join('')):'';}
export function requestProgress(id){const r=live.data.requests.find(r=>r.id===id);return r?heading('WALLET / REQUEST','Your original wallet request.','Recover this action using its saved transaction, rather than starting another payment.')+card('Request',`<p>${badge(r.status)}</p>${transaction(r.transactionHash)}<p>${link('/account/recovery','Open recovery','button primary')}</p>`):unavailable('Payment record not found.');}
export function moneyView(routeId){
 const balances=live.balances??{},credits=(live.catalog?.snapshots??[]).filter(s=>s.credits[live.session.wallet]&&s.credits[live.session.wallet].available!=='0'||s.credits[live.session.wallet]?.conditional_bonus!=='0'&&s.credits[live.session.wallet]?.conditional_bonus!==undefined);
 const evm=live.session.wallet.startsWith('0x');
 return heading('WALLET / MONEY','Your funds, in your wallet.','Principal refunds, conditional rewards and owner earnings remain separate. Withdraw only the balance available to this account.')+
 `<div class="stats"><div class="stat"><span>Intents USDC</span><strong>${usdc(balances.intentsUsdc)}</strong><small>Available in your signing account</small></div><div class="stat"><span>${evm?'Base USDC':'Native NEAR USDC'}</span><strong>${usdc(evm?balances.baseUsdc:balances.nearUsdc)}</strong><small>${live.config.sandbox&&evm?'No Base funds are used on this test chain':'Outside the campaign escrow'}</small></div></div>`+
 `${live.config.sandbox?card('Local test funds',`<p>Load 0.25 valueless test USDC once for this wallet. The tokens use the actual local Intents ledger.</p>${act('faucet','Load test USDC','','button primary')}`):evm?card('Add USDC from Base',form('fund-quote',input('amount','USDC to receive in Intents','0.15','number','min="0.15" max="0.29" step="0.01" required')+submit('Get Base funding quote'))):''}`+
 `${live.fundQuote?card('Funding quote',`<p>Send ${usdc(live.fundQuote.response.quote.amountIn)} native Base USDC to receive ${usdc(live.fundQuote.response.quote.amountOut)} in Intents. Base gas is additional.</p><p>Both the destination and refund wallet are ${esc(live.fundQuote.wallet)}.</p>${act('fund-route','Review in Base wallet',`data-id="${live.fundQuote.planId}"`,'button primary')}`):''}`+
 card('Original-wallet campaign credits',table(['Campaign','Available','Conditional reward',''],credits.map(s=>{const c=s.credits[live.session.wallet];return [esc(sale(s.campaign.terms.sale_id)?.title??s.accountId),usdc(c.available),usdc(c.conditional_bonus),c.available!=='0'?act('claim','Claim available USDC',`data-contract="${s.accountId}"`,'button small'):'Held until successful settlement'];})))+
 `<div class="grid two">${card('Withdraw to a NEAR wallet',form('withdraw-native',input('amount','USDC amount','0.01','number','min="0.000001" step="0.000001" required')+(evm?input('recipientId','Registered NEAR recipient','','text','required'):`<p>Destination: ${esc(live.session.wallet)}</p>`)+submit('Review native USDC withdrawal'))+
  (!evm?`<p class="tiny muted">Register token storage once before your first native withdrawal.</p>${balances.tokenStorageRegistered?badge('USDC storage registered'):act('register-storage','Register USDC storage')}`:''))}
 ${!evm?card('Deposit native USDC into Intents',form('deposit-intents',input('amount','USDC amount','0.01','number','min="0.000001" step="0.000001" required')+submit('Review USDC deposit'))):
  !live.config.sandbox?card('Return USDC to Base',form('exit-quote',input('amount','Intents USDC to return','0.10','number','min="0.01" step="0.01" required')+submit('Get return quote'))):card('Native withdrawals are available.',`<p>You can redeem test USDC into a registered local NEAR account. Base bridging is only offered on mainnet.</p>`)}</div>`+
 `${live.exitQuote?card('Return quote',`<p>Return ${usdc(live.exitQuote.request.amount)} from Intents. Minimum delivered to your Base wallet: ${usdc(live.exitQuote.response.quote.minAmountOut)}.</p>${act('exit-route','Review return to Base',`data-id="${live.exitQuote.planId}"`,'button primary')}`):''}`+
 card('Funding & return records',table(['Route','Direction','Amount',''],live.data.routes.map(row=>[short(row.id),row.plan.direction,usdc(row.plan.request.amount),act('check-route','Check delivery',`data-id="${row.id}" data-direction="${row.plan.direction}"`,'button small')])))+
 (live.routeResult?card('Route verification',`<p>${esc(JSON.stringify(live.routeResult))}</p>`):'');
}
