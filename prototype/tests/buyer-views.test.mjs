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
 Object.assign(live,{config:{production:true,sandbox:false},session:{wallet,kind:'evm'},catalog:{time:new Date(now).toISOString(),sales:[sale],snapshots:[snapshot],owners:[]},balances:{intentsUsdc:'0',baseUsdc:'1000000'},data:{dashboard:{bookings:[],campaigns:[],incomingBookings:[],sales:[]},placements:[],saved:[],requests:[],intents:[],routes:[]}});
 return {sale,snapshot};
}
test('marketplace hides stale bookable prices and preserves campaign choice through listing navigation',()=>{
 const {snapshot}=setup();location.search='?campaign=brand';let html=publicView({id:'P02'});assert.match(html,/name="campaign" value="brand"/);assert.match(html,/campaign=brand/);assert.match(html,/0\.01 USDC/);assert.match(html,/href="\/explore\?campaign=brand&amp;type=van"/);
 snapshot.state.cutoff_ns=ns(now-1);html=publicView({id:'P02'});assert.doesNotMatch(html,/0\.01 USDC/);assert.match(html,/No spaces match/);
 html=publicView({id:'P03',params:{slug:'asset'}});assert.doesNotMatch(html,/Book this spot/);assert.doesNotMatch(html,/0\.01 USDC/);
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
