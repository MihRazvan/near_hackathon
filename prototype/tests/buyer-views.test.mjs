import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingStatus} from '../src/integration/buyer-state.mjs';
globalThis.document={querySelector:()=>null};
globalThis.location={pathname:'/explore',search:''};
const {live}=await import('../src/integration/runtime.mjs');
const {publicView}=await import('../src/integration/public.mjs');
const {buyerView}=await import('../src/integration/buyer.mjs');
const now=1800000000000,ns=ms=>(BigInt(ms)*1000000n).toString(),wallet='0x1111111111111111111111111111111111111111';
test('buying the same spot again does not reactivate an older outbid booking',()=>{
 const snapshot={state:{outcome:'success',holder:{account_id:wallet},round:'3'}};
 assert.equal(bookingStatus({accepted:true,owner:wallet,status:'outbid'},snapshot),'outbid');
 assert.equal(bookingStatus({accepted:true,owner:wallet,status:'accepted',purchaseRound:'1'},snapshot),'outbid');
 assert.equal(bookingStatus({accepted:true,owner:wallet,status:'accepted',purchaseRound:'3'},snapshot),'completed');
 snapshot.state.outcome='failure';assert.equal(bookingStatus({accepted:true,owner:wallet,status:'outbid',purchaseRound:'1'},snapshot),'cancelled');
});
function setup(){
 location.search='';const asset={id:'asset',title:'City van',description:'Delivery van',city:'Bucharest',assetType:'van',spots:[{id:'door',name:'Side door',suggestedPriceCents:1,box:{x:.2,y:.2,width:.2,height:.2}}]};
 const sale={id:'sale',assetId:'asset',owner:'owner.near',title:'December campaign',createdAt:new Date(now).toISOString(),status:'published',rules:'No restricted content',publication:{manifest:{asset}},schedule:{biddingClose:new Date(now+60000).toISOString(),serviceStart:new Date(now+120000).toISOString(),serviceEnd:new Date(now+180000).toISOString()},spots:[{id:'door',contractId:'offer',takeoverEnabled:true}]};
 const snapshot={accountId:'offer',state:{outcome:'open',cutoff_ns:ns(now+60000),next_price:'10000',holder:null,nft_minted:false,refund_end_ns:ns(now+240000)},rights:{bidding_closed:false,current_owner_id:null,active:false},campaign:{terms:{sale_id:'sale',artwork_due_ns:ns(now+90000)},delivery_proof:null},credits:{}};
 Object.assign(live,{config:{production:true,sandbox:false},session:{wallet,kind:'evm'},catalogLoading:false,catalog:{time:new Date(now).toISOString(),sales:[sale],snapshots:[snapshot],owners:[]},balances:{intentsUsdc:'0',baseUsdc:'1000000'},data:{dashboard:{bookings:[],campaigns:[],incomingBookings:[],sales:[]},placements:[],saved:[],requests:[],intents:[],routes:[]}});
 return {sale,snapshot};
}
test('generated team tests show real-payment disclosure and acknowledgement at checkout without promising installation',()=>{
 const {sale}=setup();sale.campaignType='team-test';sale.publication.manifest.campaignType='team-test';sale.publication.manifest.asset.imageProvenance='ai-generated';location.search='?spot=door';
 const listing=publicView({id:'P03',params:{slug:'asset'}}),checkout=buyerView({id:'B06',params:{intentId:'sale'}});
 assert.match(checkout,/Team test · AI-generated vehicle/);assert.match(listing,/About this demo/);
 for(const html of [listing,checkout]){assert.match(html,/Payments use real USDC/);assert.doesNotMatch(html,/Printing & installation included|One price for the full campaign, printing/);}
 assert.match(checkout,/name="testCampaignAcknowledged"/);assert.match(checkout,/includes no physical advertising delivery/);
});
test('homepage keeps closed team campaigns visible alongside bookable ones',()=>{
 const {sale,snapshot}=setup();sale.campaignType='team-test';snapshot.state.cutoff_ns=ns(now-1);
 const html=publicView({id:'P01'});assert.match(html,/City van/);assert.match(html,/Find your next spot/);assert.match(html,/Demo/);
});
test('marketplace hides stale bookable prices and preserves campaign choice through listing navigation',()=>{
 const {snapshot}=setup();location.search='?campaign=brand';let html=publicView({id:'P02'});assert.match(html,/name="campaign" value="brand"/);assert.match(html,/campaign=brand/);assert.match(html,/0\.01 USDC/);assert.match(html,/href="\/explore\?campaign=brand&amp;type=van"/);
 snapshot.state.cutoff_ns=ns(now-1);html=publicView({id:'P02'});assert.doesNotMatch(html,/0\.01 USDC/);assert.match(html,/No spaces match/);
 html=publicView({id:'P03',params:{slug:'asset'}});assert.doesNotMatch(html,/(?:Book|Reserve) this (?:spot|placement)/);assert.doesNotMatch(html,/0\.01 USDC/);
});
test('published metadata can be browsed before chain verification without advertising a price or enabling checkout',()=>{
 setup();live.catalog.snapshots=[];live.catalogLoading=true;
 for(const id of ['P01','P02','P03']){
  const html=publicView({id,params:{slug:'asset'}});
  assert.match(html,/City van/);assert.match(html,/Checking availability/i);
  assert.doesNotMatch(html,/Booking closed|List the first space|No spaces match|0\.01 USDC|href="\/checkout\//);
 }
 live.catalogLoading=false;
 assert.match(publicView({id:'P02'}),/Availability unavailable/i);
 live.catalog=null;live.catalogLoading=true;
 assert.match(publicView({id:'P01'}),/Loading available spaces/);
 assert.doesNotMatch(publicView({id:'P01'}),/List the first space/);
});
test('checkout funds the exact chosen spot while existing holdings cannot be purchased twice',()=>{
 const {snapshot}=setup();location.search='?spot=door';let html=buyerView({id:'B06',params:{intentId:'sale'}});assert.match(html,/data-live-action="fund-and-book" data-sale="sale" data-spot="door"/);assert.match(html,/data-live-form="prepare-booking"/);
 snapshot.state.holder={account_id:wallet};html=buyerView({id:'B06',params:{intentId:'sale'}});assert.match(html,/You already have this spot/);assert.doesNotMatch(html,/fund-and-book/);
});
test('production artwork uses the same EVM payer and never exposes manual nomination',()=>{
 const {snapshot}=setup();snapshot.state.holder={account_id:wallet};snapshot.rights.bidding_closed=true;live.data.placements=[snapshot];
 const html=buyerView({id:'B08',params:{id:'offer'}});assert.match(html,/data-live-form="artwork"/);assert.doesNotMatch(html,/Nominate NFT recipient|Accept NFT nomination|Mint final placement NFT/);assert.match(html,/handled automatically/);
});
test('pending payments never invite another transfer after quote expiry',()=>{
 setup();live.data.dashboard.bookings=[{id:'booking',contractId:'offer',saleId:'sale',spotId:'door',owner:wallet,amount:'10000',planId:'plan',accepted:false,status:'prepared'}];live.data.requests=[{planId:'plan',status:'submitted',createdAt:new Date(now).toISOString()}];live.data.intents=[{id:'plan',expiresAt:new Date(now-1).toISOString()}];
 const html=buyerView({id:'B07',params:{id:'booking'}});assert.match(html,/payment is being checked/);assert.doesNotMatch(html,/data-live-action="pay-booking"/);assert.doesNotMatch(html,/data-live-action="cancel-booking"/);
});
test('a proven prebroadcast failure offers original-signature recovery on payment and account pages only',async()=>{
 setup();const {accountView}=await import('../src/integration/shared.mjs');
 live.data.dashboard.bookings=[{id:'booking',owner:wallet,contractId:'offer',saleId:'sale',spotId:'door',amount:'10000',planId:'original-plan',status:'failed',accepted:false}];
 const request={id:'original-request',owner:wallet,planId:'original-plan',kind:'intent',status:'failed',errorCode:'RPC_UNAVAILABLE',canRetryOriginal:true,createdAt:new Date(now).toISOString()};live.data.requests=[request];
 let payment=buyerView({id:'B07',params:{id:'booking'}});assert.match(payment,/data-live-action="resume-intent" data-id="original-request"/);assert.match(payment,/Retry original signature/);assert.doesNotMatch(payment,/Try with the current price/);
 assert.match(accountView({id:'A03'}),/Retry original signature/);
 request.canRetryOriginal=false;payment=buyerView({id:'B07',params:{id:'booking'}});assert.doesNotMatch(payment,/Retry original signature/);assert.doesNotMatch(accountView({id:'A03'}),/Retry original signature/);
 request.canRetryOriginal=true;request.transactionHash='original-hash';assert.doesNotMatch(buyerView({id:'B07',params:{id:'booking'}}),/Retry original signature/);assert.doesNotMatch(accountView({id:'A03'}),/Retry original signature/);
});

test('production creative transfer names the current controller and requires explicit consent without moving payment rights',()=>{
 const {snapshot}=setup();snapshot.mode='hub';Object.assign(snapshot.state,{holder:{account_id:'payer.near'},cutoff_ns:ns(now-1),nft_minted:true});Object.assign(snapshot.rights,{bidding_closed:true,active:true,current_owner_id:wallet,revision:'2'});live.data.placements=[snapshot];
 const html=buyerView({id:'B08',params:{id:'offer'}});assert.match(html,/data-live-form="nft-transfer"/);assert.match(html,/name="purpose" value="creative-control"/);assert.match(html,/name="expectedController" value="0x111/);assert.match(html,/name="expectedRevision" value="2"/);assert.match(html,/name="transferAcknowledged" required/);assert.match(html,/NEAR account or EVM address/);assert.match(html,/cannot undo it without the recipient/);assert.match(html,/Refunds, rewards and earnings stay with their original wallets/);assert.match(html,/Your wallet will ask you to sign this transfer/);assert.match(html,/NFT owner/);assert.match(html,/href="\/records\/sale"/);
 snapshot.rights.current_owner_id='new-controller.near';let after=buyerView({id:'B08',params:{id:'offer'}});assert.doesNotMatch(after,/data-live-form="nft-transfer"/);assert.doesNotMatch(after,/data-live-form="artwork"/);assert.match(after,/new-controller\.near/);
 live.session={wallet:'new-controller.near',kind:'near'};after=buyerView({id:'B08',params:{id:'offer'}});assert.match(after,/data-live-form="nft-transfer"/);assert.match(after,/data-live-form="artwork"/);
 snapshot.state.artwork_locked=true;after=buyerView({id:'B08',params:{id:'offer'}});assert.doesNotMatch(after,/data-live-form="nft-transfer"/);assert.match(after,/transferring the receipt does not reopen editing/);
});

test('placement preserves its private receipt beside the public campaign record',()=>{
 const {snapshot}=setup();live.data.dashboard.bookings=[{id:'booking',contractId:'offer',saleId:'sale',owner:wallet,accepted:true,status:'accepted'}];snapshot.state.holder={account_id:wallet};
 const html=buyerView({id:'B08',params:{id:'booking'}});assert.match(html,/href="\/receipts\/booking"/);assert.match(html,/href="\/records\/sale"/);
});

test('takeover discovery shows only verified takeover opportunities and preserves the buyer campaign',()=>{
 const {snapshot}=setup();snapshot.state.holder={account_id:'other.near'};location.search='?booking=takeover&campaign=brand';
 let html=publicView({id:'P02'});assert.match(html,/City van/);assert.match(html,/1 takeover available/);assert.match(html,/booking=takeover/);assert.match(html,/campaign=brand/);
 snapshot.state.holder=null;html=publicView({id:'P02'});assert.match(html,/No spaces match/);assert.doesNotMatch(html,/0\.01 USDC/);
 location.search='?booking=open';assert.match(publicView({id:'P02'}),/City van/);
 live.catalog.snapshots=[];live.catalogLoading=true;assert.doesNotMatch(publicView({id:'P02'}),/0\.01 USDC|href="\/checkout\//);
 live.catalogLoading=false;const unavailable=publicView({id:'P02'});assert.match(unavailable,/Availability unavailable/);assert.doesNotMatch(unavailable,/No spaces match/);
});

test('listing preserves the exact selected spot through sign-in and directs its holder to management',()=>{
 const {snapshot}=setup();location.search='?spot=door&campaign=brand';live.session=null;
 let html=publicView({id:'P03',params:{slug:'asset'}});
 assert.match(html,/Reserve for 0\.01 USDC/);
 assert.match(html,/href="\/sign-in\?next=%2Fcheckout%2Fsale%3Fspot%3Ddoor%26campaign%3Dbrand"/);
 snapshot.state.holder={account_id:wallet};live.session={wallet};
 live.data.dashboard.bookings=[{id:'old',contractId:'offer',accepted:true,status:'outbid'},{id:'current',contractId:'offer',accepted:true,status:'accepted'}];
 html=publicView({id:'P03',params:{slug:'asset'}});
 assert.match(html,/href="\/profile\/placements\/current"/);assert.match(html,/Manage your placement/);
 assert.doesNotMatch(html,/Take over for|href="\/checkout\//);
});

test('compact checkout retains the quote, campaign choice and required financial acknowledgements',()=>{
 const {sale,snapshot}=setup();sale.campaignType='team-test';location.search='?spot=door&campaign=brand';
 live.balances.intentsUsdc='1000000';live.data.dashboard.campaigns=[{id:'brand',name:'Studio campaign',status:'active'}];
 const html=buyerView({id:'B06',params:{intentId:'sale'}});
 assert.match(html,/name="expectedAmount" value="10000"/);assert.match(html,/name="spotId" value="door"/);
 assert.match(html,/<option value="brand" selected>/);assert.match(html,/<details class="checkout-campaign"><summary>Campaign: Studio campaign/);
 assert.match(html,/name="rules"/);assert.match(html,/name="testCampaignAcknowledged"/);assert.doesNotMatch(html,/name="(?:rules|testCampaignAcknowledged)"[^>]*checked/);
 assert.match(html,/Full schedule &amp; advertising rules|Full schedule & advertising rules/);
 assert.match(html,/data-live-form="prepare-booking"/);
 snapshot.state.next_price='75000000';live.balances.intentsUsdc='100000000';live.data.dashboard.campaigns=[];const highPrice=buyerView({id:'B06',params:{intentId:'sale'}});assert.match(highPrice,/name="budget" type="number" value="75.000000"/);
});

test('unsettled takeover rewards remain separate from claimable credit in placement and balance views',()=>{
 const {snapshot}=setup();snapshot.credits[wallet]={available:'10000',conditional_bonus:'10000'};
 live.data.placements=[snapshot];
 const placement=buyerView({id:'B08',params:{id:'offer'}}),money=buyerView({id:'B11',params:{}});
 assert.match(placement,/Available to claim: <strong>0\.01 USDC/);
 assert.match(placement,/Reward pending completion: <strong>0\.01 USDC/);
 assert.match(placement,/only if the campaign settles successfully/);
 assert.match(money,/Available to claim/);assert.match(money,/Reward pending completion/);
 assert.doesNotMatch(placement,/Available to claim: <strong>0\.02 USDC/);
});

test('a takeover-filtered vehicle quotes and opens its takeover spot rather than a cheaper open panel',()=>{
 const {sale,snapshot}=setup();
 sale.publication.manifest.asset.spots.push({id:'rear',name:'Rear panel',box:{x:.5,y:.3,width:.2,height:.2}});
 sale.spots.push({id:'rear',contractId:'rear-offer',takeoverEnabled:true});
 live.catalog.snapshots.push({...snapshot,accountId:'rear-offer',state:{...snapshot.state,next_price:'20000',holder:{account_id:'previous.near'}}});
 location.search='?booking=takeover&campaign=brand';
 const html=publicView({id:'P02'});
 assert.match(html,/Takeover from/);assert.match(html,/0\.02 USDC/);assert.doesNotMatch(html,/0\.01 USDC/);
 assert.match(html,/href="\/spaces\/asset\?sale=sale&amp;spot=rear&amp;campaign=brand"/);
 location.search='?booking=open';const open=publicView({id:'P02'});
 assert.match(open,/0\.01 USDC/);assert.match(open,/spot=door/);
});
