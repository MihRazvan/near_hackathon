import {isTeamTest,deliveryLabel,campaignNotice} from './campaign-kind.mjs';
import { live,allSales,sale,snapshot,booking,usdc,dateTime,byNs } from './runtime.mjs';
import { esc,link,badge,card,empty,heading,act,select,form,input,textArea,check,submit,hidden,scene,scheduleSummary,evidence,unavailable,signedOut,notice,table,transaction,short,artifactLink } from './ui.mjs';
import { verifiedMediaFor } from './workspace-actions.mjs';
import {placementNft,placementNftPhase} from './placement-nft.mjs';
import {originalRetryAvailable} from './recovery-state.mjs';
import {micro,millis,listingAvailability,bookingStatus,latestWalletRequest,paymentState,creditSnapshots,placementProgress,canTransferCreativeControl} from './buyer-state.mjs';
const clock=()=>Date.parse(live.catalog?.time)||Date.now();
const production=()=>live.config?.production===true||live.config?.publicationMode==='hub';
const availableBalance=()=>live.balances?.intentsUsdc;
const moneyLink=next=>'/buy/money'+(next?'?next='+encodeURIComponent(next):'');
export function placement(id){const b=booking(id),s=b?snapshot(b.contractId):live.data?.placements?.find(s=>s.accountId===id);return {b,s,sale:sale(b?.saleId??s?.campaign.terms.sale_id)};}
function placementsTable(rows){
 return rows.length?table(['Placement','Status','Paid',''],rows.map(b=>{const offer=sale(b.saleId),state=bookingStatus(b,snapshot(b.contractId));return [link('/buy/placements/'+b.id,esc(offer?.title??'Campaign placement'),'text-link'),badge(state==='outbid'?'Taken over':state),usdc(b.amount),link('/buy/placements/'+b.id,'Open placement','button small')];})):empty('Your next campaign starts with a space.','Book a spot to keep its artwork, delivery and payments together here.',link('/explore','Find a space','button primary'));
}
function walletReceipt(hash){return hash?`<details><summary>Payment reference</summary>${transaction(hash)}</details>`:'';}
function artworkFields(){
 const media=verifiedMediaFor(live.data?.media,live.session?.wallet);
 return (media.length?select('mediaId','Reuse a verified upload',[['','Upload a new file or enter ad copy'],...media.map(m=>[m.id,(m.mime?.startsWith('image/')?'Image':'Document')+' · '+(m.sha256?.slice(0,8)??short(m.id))])]):'')+input('file','Artwork file (optional)','','file','accept="image/png,image/jpeg,application/pdf"')+
  textArea('notes','Ad copy or instructions','','placeholder="Enter your ad copy, or add instructions for the owner alongside your file." maxlength="10000"')+
  `<p class="tiny muted">PNG, JPEG or PDF, up to ${(live.config?.mediaMaxBytes??1000000)/1000000} MB. Your submitted artwork and ad copy are public.</p>`+check('public','I have permission to use this content and understand it will be public.');
}
export function buyerView(r){
 if(!live.session)return signedOut();const d=live.data?.dashboard;if(!d)return empty('Opening your workspace.','Your campaigns and payments are being loaded.');
 if(r.id==='B01'){
  const active=d.bookings.filter(b=>b.accepted&&snapshot(b.contractId)?.state.holder?.account_id===live.session.wallet&&snapshot(b.contractId)?.state.outcome==='open');
  const actionable=(live.data.placements??[]).filter(s=>['accept','mint','artwork','artwork-review'].includes(placementProgress(s,live.session.wallet,clock(),{automaticReceipt:production()}).key));
  return heading('ADVERTISER WORKSPACE','Your advertising workspace.','Manage your booked spaces and artwork.',link('/explore','Find a space','button primary'))+
   `<div class="stats">${[['Campaigns',d.campaigns.length],['Current placements',active.length],['Needs your attention',actionable.length]].map(([label,n])=>`<div class="stat"><span>${label}</span><strong>${n}</strong></div>`).join('')}</div>`+
   (actionable.length?card('Your next steps',actionable.map(s=>{const progress=placementProgress(s,live.session.wallet,clock(),{automaticReceipt:production()});return `<article class="connected-record"><h3>${esc(sale(s.campaign.terms.sale_id)?.title??'Your placement')}</h3><p>${esc(progress.title)}</p>${link('/buy/placements/'+s.accountId,'Continue','button primary')}</article>`;}).join('')):'')+
   card('Your bookings',placementsTable(d.bookings))+receiptCards();
 }
 if(['B02','B04'].includes(r.id)){
  if(r.id==='B04'){const campaign=d.campaigns.find(c=>c.id===r.params.id);if(!campaign)return unavailable('This campaign is not in your workspace.');return heading('YOUR CAMPAIGN',campaign.name,'Keep bookings across different spaces and owners together.',link('/explore?campaign='+campaign.id,'Add another space','button primary'))+
   card('Campaign spending limit',`<p>${usdc(campaign.budgetMicroUsdc)}</p><p class="tiny muted">This limits the total value of bookings in this campaign. You approve and pay for each spot separately.</p>`)+card('Your placements',placementsTable(d.bookings.filter(b=>b.campaignId===campaign.id)));}
  return heading('YOUR CAMPAIGNS','Build a campaign across the city.','Group several spaces under one campaign and follow every placement.',link('/buy/campaigns/new','Create campaign','button primary'))+
   (d.campaigns.length?card('Campaigns',table(['Campaign','Spending limit','Status',''],d.campaigns.map(c=>[esc(c.name),usdc(c.budgetMicroUsdc),badge(c.status),link('/buy/campaigns/'+c.id,'Open campaign','button small')]))):empty('Start with your first space.','You can create a campaign as you book, or give it a name now.',link('/explore','Find a space','button primary')));
 }
 if(r.id==='B03')return heading('NEW CAMPAIGN','Create a campaign.','Name your campaign and set the most you want to commit to bookings.')+
  card('Campaign details',form('campaign-create',input('name','Campaign name','','text','required maxlength="100"')+input('budget','Spending limit · USDC','50.00','number','min="0.01" step="0.01" required')+'<p class="tiny muted">Creating a campaign does not charge your wallet. You approve a payment only when booking a space.</p>'+submit('Create campaign')));
 if(r.id==='B05'){
  const ids=new Set((live.data.saved??[]).filter(s=>s.saved).map(s=>s.saleId)),values=allSales().filter(s=>ids.has(s.id));
  return heading('YOUR SHORTLIST','Your saved spaces.','Spaces saved by your connected wallet.')+(values.length?table(['Space',''],values.map(s=>[esc(s.publication?.manifest.asset.title??s.title),link('/spaces/'+s.assetId+'?sale='+s.id,'View space','button small')])):empty('Nothing saved yet.','Tap Save space on a listing to compare it here later.',link('/explore','Explore spaces','button primary')));
 }
 if(r.id==='B06')return checkout(r,d);
 if(r.id==='B07')return payment(r);
 if(['B08','B09'].includes(r.id))return placementView(r);
 if(['B11','B12'].includes(r.id))return moneyView(r.params.id);
 if(r.id==='B10'){
  const campaign=d.campaigns.find(c=>c.id===r.params.id);if(!campaign)return unavailable('Campaign not found.');return heading('CAMPAIGN REPORT',campaign.name,'Booking and delivery records for this campaign.')+card('Placements',placementsTable(d.bookings.filter(b=>b.campaignId===campaign.id)))+card('About exposure data','<p>Impressions, routes and distance are not independently measured. Review the owner\'s installation evidence and your agreed campaign dates.</p>');
 }
 if(r.id==='B13'){
  const b=booking(r.params.id);if(!b)return unavailable('Receipt not found.');return heading('PAYMENT RECEIPT',sale(b.saleId)?.title??'Your placement','A record of the payment made by this wallet.')+
   card('Receipt',`<dl class="data-list"><div><dt>Amount paid</dt><dd>${usdc(b.amount)}</dd></div><div><dt>Status</dt><dd>${badge(bookingStatus(b,snapshot(b.contractId)))}</dd></div><div><dt>Paid by</dt><dd>${esc(short(b.owner))}</dd></div><div><dt>Booking reference</dt><dd><code>${esc(b.id)}</code></dd></div></dl>${link('/buy/placements/'+b.id,'Open placement','button primary')}`);
 }
 return null;
}
function checkout(r,d){
 const offer=sale(r.params.intentId),q=new URLSearchParams(location.search),spot=offer?.spots.find(p=>p.id===q.get('spot'))??offer?.spots[0];if(!offer||!spot)return unavailable('This spot is unavailable.');
 const chain=snapshot(spot.contractId),info=listingAvailability(spot,chain,clock()),asset=offer.publication.manifest.asset,next='/checkout/'+offer.id+'?spot='+spot.id;
 const campaigns=d.campaigns.filter(c=>c.status==='active'),selected=campaigns.find(c=>c.id===q.get('campaign'))??campaigns.at(-1),balance=availableBalance(),needsFunding=balance!==undefined&&micro(balance)<micro(info.price),alreadyHolding=chain?.state.holder?.account_id===live.session.wallet;
 let bookingForm;
 if(alreadyHolding){const existing=d.bookings.find(b=>b.contractId===spot.contractId&&b.accepted);bookingForm=notice('You already have this spot.','Manage the artwork and progress from your placement workspace.')+(existing?link('/buy/placements/'+existing.id,'Open your placement','button primary'):link('/buy','Open your workspace','button primary'));}
 else if(!info.available)bookingForm=notice(info.kind==='checking'?'Checking this spot.':'This spot is no longer available.',info.kind==='checking'?'Refresh to get the latest booking state.':'Choose another surface or campaign period.')+(info.kind==='checking'?act('refresh','Check availability','','button primary'):link('/explore','Find another space','button primary'));
 else bookingForm=form('prepare-booking',hidden('saleId',offer.id)+hidden('spotId',spot.id)+hidden('expectedAmount',info.price)+select('campaignId','Campaign',[['','Create a new campaign'],...campaigns.map(c=>[c.id,c.name])],selected?.id??'')+
  `<details ${selected?'':'open'}><summary>New campaign details</summary>${input('name','Campaign name',asset.title+' campaign','text','maxlength="100"')}${input('budget','Campaign spending limit · USDC','50.00','number','min="0.01" step="0.01"')}<p class="tiny muted">A limit for bookings in this campaign. This amount is not charged.</p></details>`+
  (live.balanceError?notice('Your balance is temporarily unavailable.','Refresh your balance before booking.')+act('refresh','Refresh balance'):`<p>Available balance: <strong>${usdc(balance)}</strong></p>`)+
  (needsFunding?notice('Add funds to book this space.',`This booking costs ${usdc(info.price)}. You need ${usdc(micro(info.price)-micro(balance))} more in your spending balance.`):'')+
  check('rules','I agree to the published dates, advertising rules and takeover setting.')+
  (isTeamTest(offer)?check('testCampaignAcknowledged','I understand this uses real USDC and includes no physical advertising delivery.'):'')+
  (needsFunding?act('fund-and-book','Add funds & book',`data-sale="${offer.id}" data-spot="${spot.id}"`,'button primary'):balance===undefined?act('refresh','Check balance to continue','','button primary'):submit(info.kind==='takeover'?'Continue with takeover':'Continue with booking'))+
  link(moneyLink(next),'Manage your balance','text-link'));
 return heading('BOOK YOUR SPACE',info.kind==='takeover'?'Take over this spot.':'Book this spot.',isTeamTest(offer)?'A nominal USDC payment for this team test.':'One price for the full campaign, printing and installation.')+campaignNotice(offer)+
  `<div class="split">${card(esc(asset.title),`<p>${esc(asset.spots.find(p=>p.id===spot.id)?.name??spot.id)} · ${esc(asset.city)}</p>${info.price?`<h2>${usdc(info.price)}</h2>`:''}<p>${deliveryLabel(offer)}.</p>${scheduleSummary(offer)}<details><summary>Advertising rules</summary><p>${esc(offer.rules)}</p></details>${spot.takeoverEnabled?notice('Takeovers are enabled.','Your booking can be replaced until booking closes. Your original payment becomes refundable if another advertiser takes over.'):'<p>This is a fixed booking. Another advertiser cannot take it over.</p>'}`)}${card('Complete your booking',bookingForm)}</div>`;
}
function payment(r){
 const b=booking(r.params.id);if(!b)return requestProgress(r.params.id);
 const request=latestWalletRequest(live.data.requests,[b.planId,b.nativePlanId]),intent=live.data.intents.find(i=>i.id===b.planId),status=paymentState(b,request,intent?.expiresAt,clock());
 const offer=sale(b.saleId),state=bookingStatus(b,snapshot(b.contractId));
 let title='Confirm your booking.',next;
 if(status==='confirmed'){title=state==='outbid'?'This booking was taken over.':'Your placement is confirmed.';next=link('/buy/placements/'+b.id,'Open your placement','button primary');}
 else if(status==='pending'){title='Your payment is being checked.';next=notice('Keep this booking open.','We are checking the original payment. You can safely return here without starting another transfer.')+act('refresh','Check payment status','','button primary')+' '+link('/account/recovery','Payment help','text-link');}
 else if(status==='expired'){title='Your price needs a refresh.';next=notice('This unpaid quote has expired.','Cancel it below, then return to the space for its current price.')+act('cancel-booking','Cancel unpaid booking',`data-id="${b.id}"`,'button primary');}
 else if(status==='retry'&&originalRetryAvailable(request)){title='Retry your original payment.';next=notice('The connection failed before a transaction was created.','Approve the same payment again with its original amount and nonce. No replacement booking is needed.')+act('resume-intent','Retry original signature',`data-id="${request.id}"`,'button primary');}
 else if(status==='retry'){title='This booking was not completed.';next=link('/checkout/'+b.saleId+'?spot='+b.spotId,'Try with the current price','button primary');}
 else next=act('pay-booking','Pay '+usdc(b.amount),`data-id="${b.id}"`,'button primary')+' '+act('cancel-booking','Cancel booking',`data-id="${b.id}"`);
 return heading('YOUR BOOKING',title,status==='confirmed'?'Your workspace keeps the artwork, delivery and payments together.':'Your wallet will show the exact payment before you approve.')+
  `<div class="split">${card('Booking details',`<h3>${esc(offer?.title??'Advertising placement')}</h3><h2>${usdc(b.amount)}</h2><p>${deliveryLabel(offer)}.</p><p>${badge(state)}</p>${offer?scheduleSummary(offer):''}${walletReceipt(request?.transactionHash)}`)}${card('Next step',next)}</div>`;
}
function receiptCards(){
 const placements=live.data.placements??[];if(!placements.length)return '';
 return card('Your placement NFTs',placements.map(s=>`<article class="connected-record"><h3>${link('/buy/placements/'+s.accountId,esc(sale(s.campaign.terms.sale_id)?.title??'Your placement'),'text-link')}</h3>${badge(s.state.nft_minted?'Placement NFT ready':'NFT pending booking close')}${link('/buy/placements/'+s.accountId,'Open placement','button small')}</article>`).join(''));
}
function placementReceipt(s){
 const wallet=live.session.wallet,controller=s.rights.artwork_controller_id??s.rights.current_owner_id,transfer=canTransferCreativeControl(s,wallet,clock()),minted=s.state.nft_minted===true;
 const offer=sale(s.campaign.terms.sale_id),surface=offer?.publication?.manifest.asset.spots?.find(p=>p.id===s.campaign.terms.spot_id)?.name??offer?.title??'Campaign placement';
 const phase=placementNftPhase({minted,active:s.rights.active,locked:s.rights.locked||s.state.artwork_locked,outcome:s.state.outcome});
 return placementNft({surface,owner:minted?s.rights.current_owner_id:undefined,controller:minted?controller:undefined,originalPayer:s.rights.original_payer_id??s.state.holder?.account_id,tokenId:minted?s.rights.token_id??s.accountId:undefined,revision:s.rights.proposal?.revision,network:live.config.network,phase})+
  `<div class="placement-nft-tools">${transfer?`<details><summary>Transfer creative control</summary><p>Transfer this placement NFT to another wallet so it can submit or replace artwork until the owner approves it or the artwork deadline passes.</p><p>Check the recipient carefully. Returning control requires the recipient to transfer it back.</p>${form('nft-transfer',hidden('contractId',s.accountId)+hidden('purpose','creative-control')+hidden('expectedController',wallet)+hidden('expectedRevision',s.rights.revision??'0')+input('receiverId','Recipient wallet · NEAR account or EVM address','','text','required maxlength="64" autocomplete="off" spellcheck="false"')+'<label class="check-row"><input type="checkbox" name="transferAcknowledged" required> I understand this transfers creative control and I cannot undo it without the recipient.</label>'+submit('Transfer creative control'))}<p class="tiny muted">Your wallet will ask you to sign this transfer. No campaign funds move with it. Artwork editing still closes if the owner approves it or the deadline passes before confirmation.</p></details>`:minted?'<p class="tiny muted">Creative control can be transferred by the NFT owner while artwork submissions are open. Once artwork is approved or its deadline passes, transferring the receipt does not reopen editing.</p>':'<p class="tiny muted">Your final placement NFT is handled automatically after booking closes.</p>'}</div>`;
}

function placementView(r){
 const {b,s,sale:offer}=placement(r.params.id);if(!s)return unavailable('This placement is unavailable to your wallet.');
 const wallet=live.session.wallet,owner=(s.rights.artwork_controller_id??s.rights.current_owner_id)===wallet,nominee=s.state.nominated_recipient===wallet,finalPayer=s.state.holder?.account_id===wallet,closed=s.rights.bidding_closed;
 const progress=placementProgress(s,wallet,clock(),{automaticReceipt:production()}),artDue=millis(s.campaign.terms.artwork_due_ns),canAutoActivate=production()&&finalPayer&&closed&&!s.state.nft_minted&&s.state.outcome==='open'&&artDue!==null&&clock()<artDue;
 const canArtwork=(owner&&s.rights.active||canAutoActivate)&&!s.state.artwork_locked;
 const credit=s.credits?.[wallet],creditCard=micro(credit?.available)>0n||micro(credit?.conditional_bonus)>0n?card('Your booking funds',`<p>Available to claim: <strong>${usdc(credit.available)}</strong></p>${micro(credit.conditional_bonus)>0n?`<p>Completion reward: ${usdc(credit.conditional_bonus)} · available after successful settlement.</p>`:''}${micro(credit.available)>0n?act('claim','Claim available USDC',`data-contract="${s.accountId}"`,'button primary'):''}${link(moneyLink(),'View your balance','text-link')}`):'';
 let next='';
 if(['outbid','cancelled'].includes(progress.key))next=link(moneyLink(),'View refunds & balance','button primary');
 else if(!production()&&progress.key==='accept')next=act('accept-nomination','Accept NFT nomination',`data-contract="${s.accountId}"`,'button primary');
 else if(!production()&&progress.key==='mint')next=act('mint','Mint final placement NFT',`data-contract="${s.accountId}"`,'button primary');
 else if(!production()&&progress.key==='nominate')next=form('nomination',hidden('contractId',s.accountId)+input('recipientId','NEAR account for your placement NFT',s.state.nominated_recipient??live.config.developmentWallets?.find(w=>w.label==='NFT controller')?.address??'','text','required')+'<p class="tiny muted">Use an account you control. Your original wallet keeps all payment and refund rights.</p>'+submit('Nominate NFT recipient'));
 else if(progress.key==='completed')next=link(b?.campaignId?'/buy/campaigns/'+b.campaignId:'/buy','Your campaign','button primary');
 const progressTitle=canAutoActivate?'Send your artwork.':progress.title,progressText=canAutoActivate?'Your placement receipt is handled automatically with your final booking. Upload your design or enter the ad copy for the owner.':progress.text;
 const artwork=canArtwork?form('artwork',hidden('contractId',s.accountId)+artworkFields()+submit(s.rights.proposal?'Send updated artwork':'Submit artwork for review')):s.rights.proposal?`<p>${s.state.artwork_locked?'The owner approved this artwork for production.':'This artwork revision is recorded for your campaign.'}</p>${artifactLink(s.rights.proposal.artifact_uri)}`:`<p>${!closed?'Artwork submissions open when booking closes.':s.state.outcome==='failure'?'Artwork is no longer needed for this cancelled campaign.':!owner&&!canAutoActivate?'The account controlling this placement can submit artwork.':'Artwork submissions have closed.'}</p>`;
 return heading('YOUR PLACEMENT',offer?.title??'Your advertising placement','Follow your campaign from booking to installation.',(b?link('/receipts/'+b.id,'View receipt','text-link'):link('/buy','Your workspace','text-link'))+(offer?.id?link('/records/'+encodeURIComponent(offer.id),'Public campaign record','text-link'):''))+
  `<div class="split"><div>${card('Your next step',`<h2>${esc(progressTitle)}</h2><p>${esc(progressText)}</p>${next}`)}${placementReceipt(s)}${creditCard}${card('Campaign dates',offer?scheduleSummary(offer):`<p>Booking closes ${esc(byNs(s.state.cutoff_ns))}.</p>`)}${card('Stay in touch',`<p>Coordinate creative, production and delivery with the space owner.</p>${link('/inbox/'+encodeURIComponent(b?.id??s.accountId),'Message the owner','button primary')}${b?link('/support/new?booking='+b.id,'Request issue review','text-link'):''}`)}</div><div>${card('Your artwork',artwork)}${card('Installation & delivery',s.campaign.delivery_proof?`<p>The owner submitted installation evidence for the approved artwork.</p>${artifactLink(s.campaign.delivery_proof.artifact_uri)}`:'<p>The owner will share installation evidence after approving your artwork.</p>')}<details><summary>Payment and campaign details</summary>${evidence(s)}</details></div></div>`;
}
export function requestProgress(id){
 const request=live.data.requests.find(r=>r.id===id);return request?heading('PAYMENT STATUS','Your payment request.','Check the original request before starting another payment.')+card('Status',`<p>${badge(request.status)}</p>${walletReceipt(request.transactionHash)}${link('/account/recovery','Check payment','button primary')}`):unavailable('Payment record not found.');
}
function fundingQuote(){
 const q=live.fundQuote;if(!q)return '';const quote=q.response.quote,fee=micro(quote.amountIn)-micro(quote.amountOut);
 return card('Add funds',`<dl class="data-list"><div><dt>Available to spend</dt><dd>${usdc(quote.amountOut)}</dd></div><div><dt>From your Base wallet</dt><dd>${usdc(quote.amountIn)}</dd></div>${fee>0n?`<div><dt>Routing cost included</dt><dd>${usdc(fee)}</dd></div>`:''}</dl><p class="tiny muted">Base network fees are shown separately by your wallet. The quote expires ${esc(dateTime(q.expiresAt))}.</p>${act('fund-route','Add funds from Base',`data-id="${q.planId}"`,'button primary')}`);
}
export function moneyView(){
 const balances=live.balances??{},wallet=live.session.wallet,evm=wallet.startsWith('0x'),credits=creditSnapshots(live.catalog?.snapshots,wallet),next=new URLSearchParams(location.search).get('next'),safeNext=next?.startsWith('/')&&!next.startsWith('//')?next:null;
 const available=availableBalance(),outside=evm?balances.baseUsdc:balances.nearUsdc;
 const funds=live.config.sandbox?card('Local test funds',`<p>This development chain uses valueless USDC.</p>${act('faucet','Load test USDC','','button primary')}`):evm?card('Add funds',form('fund-quote',input('amount','USDC to add','1.00','number','min="0.15" step="0.01" required')+'<p class="tiny muted">Use native USDC from your Base wallet. The final amount and route cost appear before you approve.</p>'+submit('Get funding quote'))):card('Add wallet USDC',form('deposit-intents',input('amount','USDC to add','1.00','number','min="0.000001" step="0.000001" required')+'<p class="tiny muted">Move USDC from this NEAR wallet into your spending balance.</p>'+submit('Add USDC')));
 const withdrawals=!evm?card('Withdraw to your wallet',form('withdraw-native',input('amount','USDC to withdraw',micro(available)>0n?(Number(available)/1e6).toFixed(6):'0.01','number','min="0.000001" step="0.000001" required')+`<p>To your connected NEAR wallet: ${esc(short(wallet))}</p>`+(!balances.tokenStorageRegistered?'<p class="tiny muted">Your first withdrawal may include a one-time USDC account registration. Any required NEAR deposit is shown before approval.</p>':'')+submit('Withdraw USDC'))):live.config.sandbox?card('Withdraw to a NEAR wallet',form('withdraw-native',input('amount','USDC to withdraw','0.01','number','min="0.000001" step="0.000001" required')+input('recipientId','Registered NEAR recipient','','text','required')+submit('Withdraw USDC'))):card('Withdraw to Base',form('exit-quote',input('amount','USDC to return',micro(available)>=150000n?(Number(available)/1e6).toFixed(6):'0.15','number','min="0.01" step="0.000001" required')+'<p class="tiny muted">Send available funds back to this connected Base wallet. We show the route\'s minimum delivery before you approve.</p>'+submit('Get withdrawal quote')));
 return heading('YOUR BALANCE','Your USDC balance.','Add funds, claim refunds and withdraw available money to your wallet.',safeNext?link(safeNext,'Return to your booking','button primary'):'')+
  (live.balanceError?notice('Your balance is temporarily unavailable.','Refresh to check your latest funds.'):'' )+
  `<div class="stats"><div class="stat"><span>Available to spend</span><strong>${available!==undefined?usdc(available):'Checking…'}</strong><small>Ready for bookings or withdrawal</small></div><div class="stat"><span>${evm?'USDC in your Base wallet':'USDC in your NEAR wallet'}</span><strong>${outside!==undefined?usdc(outside):'Checking…'}</strong><small>Held by your connected wallet</small></div></div>`+
  (credits.length?card('Refunds & campaign credits',table(['Campaign','Available now','On successful completion',''],credits.map(s=>{const c=s.credits[wallet];return [esc(sale(s.campaign.terms.sale_id)?.title??'Campaign credit'),usdc(c.available),usdc(c.conditional_bonus),micro(c.available)>0n?act('claim','Claim available USDC',`data-contract="${s.accountId}"`,'button small'):'Awaiting completion'];}))):'')+
  `<div class="grid two">${funds}${withdrawals}</div>${fundingQuote()}`+
  (evm&&!live.config.sandbox?`<details><summary>Withdraw directly to a NEAR wallet</summary><p>Send USDC to a NEAR account without a Base routing minimum. The recipient must already have USDC storage set up.</p>${form('withdraw-native',input('amount','USDC to send to NEAR','0.01','number','min="0.000001" step="0.000001" required')+input('recipientId','NEAR recipient account','','text','required placeholder="your-account.near"')+submit('Withdraw USDC to NEAR'))}</details>`:'')+
  (!evm&&!balances.tokenStorageRegistered?card('Receive USDC in this wallet',`<p>Set up this NEAR wallet to receive USDC. Your wallet will show the one-time storage deposit before approval.</p>${act('register-storage','Set up USDC in this wallet','','button')}`):'')+
  (live.exitQuote?card('Withdrawal quote',`<p>Withdraw ${usdc(live.exitQuote.request.amount)}. At least <strong>${usdc(live.exitQuote.response.quote.minAmountOut)}</strong> will arrive in your Base wallet.</p><p class="tiny muted">Your wallet must approve this exact request before funds move.</p>${act('exit-route','Withdraw to Base',`data-id="${live.exitQuote.planId}"`,'button primary')}`):'')+
  (live.data.routes?.length?card('Funding & withdrawal history',table(['Activity','Amount',''],[...live.data.routes].reverse().map(row=>[row.plan.direction==='fund'?'Add funds':'Withdraw to Base',usdc(row.plan.request.amount),act('check-route','Check status',`data-id="${row.id}" data-direction="${row.plan.direction}"`,'button small')]))):'')+
  (live.routeResult?card('Transfer status',`<p>${esc(live.routeResult.providerStatus??live.routeResult.status??(live.routeResult.verified?'Delivery verified':'Checking delivery'))}</p><p class="tiny muted">Available balances update after delivery has been verified.</p>`):'')+
  `<details><summary>Wallet and payment details</summary><p>Wallet: <code>${esc(wallet)}</code></p><p>Your spending balance uses USDC in NEAR Intents. Funds outside this balance remain in your connected wallet.</p>${link('/account/recovery','Payment recovery','text-link')}</details>`;
}
